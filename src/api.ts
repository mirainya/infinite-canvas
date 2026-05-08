import { authHeaders, clearToken, emitAuthExpired } from './auth';

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, ...authHeaders() },
  });
  if (res.status === 401) {
    clearToken();
    emitAuthExpired();
  }
  return res;
}
