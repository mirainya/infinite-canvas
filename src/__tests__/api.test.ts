import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { saveAuth } from '../auth';

const authData = {
  access_token: 'access-old',
  refresh_token: 'refresh-token',
  user: { id: 1, username: 'alice' },
  is_admin: false,
  credits: 10,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  saveAuth(authData, false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('refreshes once for concurrent 401 responses and retries both requests', async () => {
    let refreshCalls = 0;
    let protectedCalls = 0;
    let releaseRefresh!: (response: Response) => void;
    const refreshResponse = new Promise<Response>((resolve) => { releaseRefresh = resolve; });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        refreshCalls += 1;
        return refreshResponse;
      }
      protectedCalls += 1;
      const authorization = new Headers(init?.headers).get('Authorization');
      if (protectedCalls <= 2) {
        expect(authorization).toBe('Bearer access-old');
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      expect(authorization).toBe('Bearer access-new');
      return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = apiFetch('/api/protected');
    const second = apiFetch('/api/protected');
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh(new Response('{"access_token":"access-new"}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const responses = await Promise.all([first, second]);
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(4);
  });
});
