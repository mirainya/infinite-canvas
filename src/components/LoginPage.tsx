import { useState } from 'react';
import { saveAuth } from '../auth';
import '../styles/login.css';

export { getToken, isAdmin, getCredits, setCredits, getUsername, getNickname, getAvatar, setUserInfo, clearToken, authHeaders, verifyToken } from '../auth';
export { apiFetch } from '../api';

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.message || `请求失败 (${res.status})`);
      }
      const data = await res.json();
      saveAuth(data, remember);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <section className="login-intro">
          <span className="login-intro__mark">✦</span>
          <div>
            <h1>Infinite Canvas</h1>
            <p>自由 AI 创作画布</p>
          </div>
        </section>
        <h2 className="login-card__title">{isRegister ? '创建账号' : '登录'}</h2>
        <p className="login-card__subtitle">使用账号中心账户继续</p>
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
