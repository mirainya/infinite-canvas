// 鉴权令牌管理: IC 已归入账号中心(account-center), token 即账号中心 access_token。
// access 短时效(默认2h), 配合 refresh_token 续期; 嵌入 OPC 时由父窗口经 postMessage 注入。
const TOKEN_KEY = 'infinite-canvas.token';            // access_token
const REFRESH_KEY = 'infinite-canvas.refresh';        // refresh_token
const ADMIN_KEY = 'infinite-canvas.is_admin';
const CREDITS_KEY = 'infinite-canvas.credits';
const NICKNAME_KEY = 'infinite-canvas.nickname';
const AVATAR_KEY = 'infinite-canvas.avatar';
const USERNAME_KEY = 'infinite-canvas.username';

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

export function getRefreshToken(): string | null {
  return _get(REFRESH_KEY);
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

// 账号中心登录/注册响应: { access_token, refresh_token, user, is_admin, credits }
export interface AuthData {
  access_token: string;
  refresh_token: string;
  user: { id: number; username: string; nickname?: string; avatar?: string };
  is_admin: boolean;
  credits: number;
}

export function saveAuth(data: AuthData, remember: boolean) {
  _remember = remember;
  _set(TOKEN_KEY, data.access_token, remember);
  _set(REFRESH_KEY, data.refresh_token || '', remember);
  _set(ADMIN_KEY, data.is_admin ? '1' : '', remember);
  _set(CREDITS_KEY, String(data.credits ?? 0), remember);
  _set(USERNAME_KEY, data.user?.username || '', remember);
  _set(NICKNAME_KEY, data.user?.nickname || '', remember);
  _set(AVATAR_KEY, data.user?.avatar || '', remember);
}

// 嵌入模式下父窗口(OPC)经 postMessage 注入令牌时调用。
export function setTokens(accessToken: string, refreshToken: string) {
  _set(TOKEN_KEY, accessToken, _remember);
  if (refreshToken) _set(REFRESH_KEY, refreshToken, _remember);
}

export function clearToken() {
  [TOKEN_KEY, REFRESH_KEY, ADMIN_KEY, CREDITS_KEY, NICKNAME_KEY, AVATAR_KEY, USERNAME_KEY].forEach(_clear);
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// 用 refresh_token 换新的 access_token; 成功返回 true。
export async function refreshAccessToken(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.access_token) return false;
    _set(TOKEN_KEY, data.access_token, _remember);
    return true;
  } catch {
    return false;
  }
}

export async function verifyToken(): Promise<boolean> {
  const t = getToken();
  if (!t) return false;
  try {
    let res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (res.status === 401 && await refreshAccessToken()) {
      res = await fetch('/api/auth/me', { headers: authHeaders() });
    }
    if (!res.ok) { clearToken(); return false; }
    const data = await res.json();
    setUserInfo({ credits: data.credits, nickname: data.nickname, avatar: data.avatar, username: data.username });
    if (data.is_admin != null) _set(ADMIN_KEY, data.is_admin ? '1' : '', _remember);
    return true;
  } catch {
    return false;
  }
}

export function emitAuthExpired() {
  window.dispatchEvent(new Event('auth-expired'));
}
