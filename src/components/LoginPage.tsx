import { useState } from 'react';

const TOKEN_KEY = 'infinite-canvas.token';
const ADMIN_KEY = 'infinite-canvas.is_admin';
const CREDITS_KEY = 'infinite-canvas.credits';
const NICKNAME_KEY = 'infinite-canvas.nickname';
const AVATAR_KEY = 'infinite-canvas.avatar';
const USERNAME_KEY = 'infinite-canvas.username';

// ── Token 存储：sessionStorage 优先，localStorage 作为「记住我」 ──

function _get(key: string): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

function _set(key: string, value: string, remember: boolean) {
  if (remember) {
    localStorage.setItem(key, value);
  } else {
    sessionStorage.setItem(key, value);
  }
}

function _clear(key: string) {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}

let _remember = !!localStorage.getItem(TOKEN_KEY);

export function getToken(): string | null {
  return _get(TOKEN_KEY);
}

export function isAdmin(): boolean {
  return _get(ADMIN_KEY) === '1';
}

export function getCredits(): number {
  return parseFloat(_get(CREDITS_KEY) || '0');
}

export function setCredits(v: number) {
  _set(CREDITS_KEY, String(v), _remember);
}

export function getUsername(): string {
  return _get(USERNAME_KEY) || '';
}

export function getNickname(): string {
  return _get(NICKNAME_KEY) || '';
}

export function getAvatar(): string {
  return _get(AVATAR_KEY) || '';
}

export function setUserInfo(info: { nickname?: string; avatar?: string; username?: string; credits?: number }) {
  if (info.nickname != null) _set(NICKNAME_KEY, info.nickname, _remember);
  if (info.avatar != null) _set(AVATAR_KEY, info.avatar, _remember);
  if (info.username != null) _set(USERNAME_KEY, info.username, _remember);
  if (info.credits != null) _set(CREDITS_KEY, String(info.credits), _remember);
}

function saveAuth(data: {
  token: string; is_admin: boolean; credits: number;
  username: string; nickname: string; avatar: string;
}, remember: boolean) {
  _remember = remember;
  _set(TOKEN_KEY, data.token, remember);
  _set(ADMIN_KEY, data.is_admin ? '1' : '', remember);
  _set(CREDITS_KEY, String(data.credits ?? 0), remember);
  _set(USERNAME_KEY, data.username, remember);
  _set(NICKNAME_KEY, data.nickname || '', remember);
  _set(AVATAR_KEY, data.avatar || '', remember);
}

export function clearToken() {
  [TOKEN_KEY, ADMIN_KEY, CREDITS_KEY, NICKNAME_KEY, AVATAR_KEY, USERNAME_KEY].forEach(_clear);
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── apiFetch：自动带 token + 401 自动刷新 ──

let _refreshing: Promise<boolean> | null = null;

async function _tryRefresh(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveAuth(data, _remember);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    const t = getToken();
    if (t) headers.set('Authorization', `Bearer ${t}`);
  }

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    // 避免并发刷新
    if (!_refreshing) _refreshing = _tryRefresh().finally(() => { _refreshing = null; });
    const ok = await _refreshing;
    if (ok) {
      // 用新 token 重试
      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set('Authorization', `Bearer ${getToken()!}`);
      return fetch(input, { ...init, headers: retryHeaders });
    }
    // 刷新失败，清 token 触发登录
    clearToken();
    window.dispatchEvent(new Event('auth-expired'));
  }

  return res;
}

// ── 启动时验证 token ──

export async function verifyToken(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setUserInfo(data);
      return true;
    }
    // token 过期，尝试刷新
    const refreshed = await _tryRefresh();
    if (!refreshed) clearToken();
    return refreshed;
  } catch {
    return false;
  }
}

// ── LoginPage 组件 ──

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || '操作失败');
        return;
      }
      saveAuth(data, remember);
      onSuccess();
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-card__title">Infinite Canvas</h1>
        <p className="login-card__subtitle">{isRegister ? '创建账号' : '登录'}</p>
        <input
          className="login-card__input"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="login-card__input"
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="login-card__remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>记住我</span>
        </label>
        {error && <div className="login-card__error">{error}</div>}
        <button className="login-card__btn" type="submit" disabled={loading || !username || !password}>
          {loading ? '请稍候...' : isRegister ? '注册' : '登录'}
        </button>
        <button
          className="login-card__switch"
          type="button"
          onClick={() => { setIsRegister(!isRegister); setError(''); }}
        >
          {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
        </button>
      </form>
    </div>
  );
}
