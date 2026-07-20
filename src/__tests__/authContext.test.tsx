import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/controls/ModelControl', () => ({
  preloadModels: vi.fn(),
}));

import { AuthProvider, useAuth } from '../AuthContext';
import { saveAuth } from '../auth';

function Credits() {
  return <span>{useAuth().credits}</span>;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  saveAuth({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    user: { id: 3, username: 'admin' },
    is_admin: true,
    credits: 0,
  }, false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AuthProvider credits', () => {
  it('syncs verified credits and refreshes after a node execution', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      calls += 1;
      const credits = calls === 1 ? 2 : 1;
      return Promise.resolve(new Response(JSON.stringify({
        credits,
        username: 'admin',
        nickname: '',
        avatar: '',
        is_admin: true,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }));

    render(<AuthProvider><Credits /></AuthProvider>);
    expect(await screen.findByText('2')).toBeTruthy();

    window.dispatchEvent(new Event('credits-changed'));
    expect(await screen.findByText('1')).toBeTruthy();
  });
});
