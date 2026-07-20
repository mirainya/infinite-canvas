import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { clearToken, getAvatar, getCredits, getNickname, getToken, getUsername, setCredits, setUserInfo, verifyToken } from './auth';
import { apiFetch } from './api';
import { preloadModels } from './components/controls/ModelControl';

type AuthState = {
  authed: boolean;
  checking: boolean;
  credits: number;
  username: string;
  nickname: string;
  avatar: string;
  login: () => void;
  logout: () => void;
  refreshCredits: () => Promise<void>;
  updateProfile: (info: { nickname?: string; avatar?: string }) => void;
};

const AuthContext = createContext<AuthState>(null!);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [checking, setChecking] = useState(() => !!getToken());
  const [credits, setCreditsState] = useState(getCredits);
  const [username, setUsernameState] = useState(getUsername);
  const [nickname, setNicknameState] = useState(getNickname);
  const [avatar, setAvatarState] = useState(getAvatar);

  useEffect(() => {
    if (!authed) return;
    verifyToken().then((ok) => {
      if (!ok) setAuthed(false);
      else {
        setCreditsState(getCredits());
        setUsernameState(getUsername());
        setNicknameState(getNickname());
        setAvatarState(getAvatar());
        preloadModels();
      }
      setChecking(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onExpired = () => { setAuthed(false); };
    window.addEventListener('auth-expired', onExpired);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  const login = useCallback(() => {
    setAuthed(true);
    setCreditsState(getCredits());
    setUsernameState(getUsername());
    setNicknameState(getNickname());
    setAvatarState(getAvatar());
    preloadModels();
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAuthed(false);
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const d = await res.json();
        setCredits(d.credits);
        setCreditsState(d.credits);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const handleCreditsChanged = () => { void refreshCredits(); };
    window.addEventListener('credits-changed', handleCreditsChanged);
    return () => window.removeEventListener('credits-changed', handleCreditsChanged);
  }, [refreshCredits]);

  const updateProfile = useCallback((info: { nickname?: string; avatar?: string }) => {
    setUserInfo(info);
    if (info.nickname != null) setNicknameState(info.nickname);
    if (info.avatar != null) setAvatarState(info.avatar);
  }, []);

  return (
    <AuthContext.Provider value={{ authed, checking, credits, username, nickname, avatar, login, logout, refreshCredits, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
