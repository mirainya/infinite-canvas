// 嵌入态 SSO 握手: 被 OPC 以 iframe 嵌入时, 不弹自身登录页,
// 而是等父窗口(OPC)经 postMessage 注入账号中心令牌(IC 与 OPC 共用同一套账号中心 token, 无需换票)。
//
// 协议(与 OPC StudioFrame 约定):
//   1. IC ready 后向父窗口发 { type: 'ic-ready' }
//   2. OPC 回 { type: 'opc-auth', access_token, refresh_token, user }
//   3. token 失效时 IC 发 { type: 'ic-auth-expired' } 请求父窗口重推
//
// 安全: 严格校验 event.origin ∈ 允许的 OPC 源; 只接受白名单来源的消息。
import { setTokens, setUserInfo } from './auth';

// 允许的 OPC 源(父窗口)。生产 + 本地开发。
const ALLOWED_OPC_ORIGINS = [
  'https://console.mirainya.icu',
  'http://localhost:5273',
  'http://localhost:5173',
];

export interface OpcAuthMessage {
  type: 'opc-auth';
  access_token: string;
  refresh_token: string;
  user?: { id: number; username: string; nickname?: string; avatar?: string };
}

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_OPC_ORIGINS.includes(origin);
}

// 通知父窗口: IC 已就绪, 请推送令牌。
export function signalReady() {
  try {
    window.parent?.postMessage({ type: 'ic-ready' }, '*');
  } catch { /* noop */ }
}

// 通知父窗口: 令牌已失效, 请重推。
export function signalAuthExpired() {
  try {
    window.parent?.postMessage({ type: 'ic-auth-expired' }, '*');
  } catch { /* noop */ }
}

// 监听 OPC 推来的令牌; 收到并存好后回调 onAuth。返回取消监听函数。
export function listenForOpcAuth(onAuth: () => void): () => void {
  const handler = (e: MessageEvent) => {
    if (!isAllowedOrigin(e.origin)) return;
    const msg = e.data as OpcAuthMessage;
    if (!msg || msg.type !== 'opc-auth' || !msg.access_token) return;
    setTokens(msg.access_token, msg.refresh_token || '');
    if (msg.user) {
      setUserInfo({
        username: msg.user.username,
        nickname: msg.user.nickname,
        avatar: msg.user.avatar,
      });
    }
    onAuth();
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
