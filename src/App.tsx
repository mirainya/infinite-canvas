import { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { LoginPage, verifyToken } from './components/LoginPage';
import { isEmbedded } from './embed';
import { listenForOpcAuth, signalAuthExpired, signalReady } from './embedAuth';
import V2Workspace from './v2/V2Workspace';

export default function App() {
  const { authed, checking, login } = useAuth();

  useEffect(() => {
    if (!isEmbedded || authed || checking) return;
    signalAuthExpired();
    signalReady();
    return listenForOpcAuth(async () => {
      if (await verifyToken()) login();
    });
  }, [authed, checking, login]);

  if (checking) return <div className="login-page"><span className="v2-auth-status">验证登录中...</span></div>;
  if (!authed) {
    if (isEmbedded) return <div className="login-page"><span className="v2-auth-status">正在连接账号...</span></div>;
    return <LoginPage onSuccess={login} />;
  }
  return <V2Workspace />;
}
