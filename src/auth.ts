const TOKEN_KEY = 'infinite-canvas.token';
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

export function saveAuth(data: {
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

export async function verifyToken(): Promise<boolean> {
  const t = getToken();
  if (!t) return false;
  try {
    const res = await fetch('/api/auth/verify', { headers: authHeaders() });
    if (!res.ok) { clearToken(); return false; }
    const data = await res.json();
    setUserInfo({ credits: data.credits, nickname: data.nickname, avatar: data.avatar });
    return true;
  } catch {
    return false;
  }
}

export function emitAuthExpired() {
  window.dispatchEvent(new Event('auth-expired'));
}
