import { authHeaders, clearToken, emitAuthExpired, refreshAccessToken } from './auth';

let refreshPromise: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function withAuth(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(authHeaders())) headers.set(key, value);
  return { ...init, headers };
}

// 统一请求封装: 401 时先尝试用 refresh_token 续期重试一次, 仍失败才登出。
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(url, withAuth(init));
  if (res.status === 401) {
    if (await refreshOnce()) {
      res = await fetch(url, withAuth(init));
    }
    if (res.status === 401) {
      clearToken();
      emitAuthExpired();
    }
  }
  return res;
}
