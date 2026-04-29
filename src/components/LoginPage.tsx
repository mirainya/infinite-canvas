import { useState } from 'react';

const TOKEN_KEY = 'infinite-canvas.token';
const ADMIN_KEY = 'infinite-canvas.is_admin';
const CREDITS_KEY = 'infinite-canvas.credits';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function setAdmin(v: boolean) {
  localStorage.setItem(ADMIN_KEY, v ? '1' : '');
}

export function isAdmin(): boolean {
  return localStorage.getItem(ADMIN_KEY) === '1';
}

export function getCredits(): number {
  return parseFloat(localStorage.getItem(CREDITS_KEY) || '0');
}

export function setCredits(v: number) {
  localStorage.setItem(CREDITS_KEY, String(v));
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_KEY);
  localStorage.removeItem(CREDITS_KEY);
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      setToken(data.token);
      setAdmin(data.is_admin);
      setCredits(data.credits ?? 0);
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
