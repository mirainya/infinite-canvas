// 嵌入模式: 当 Infinite Canvas 被作为"画布工作室"嵌入外部容器(如 ai-opc-console 的 iframe)时,
// 通过 URL 参数 ?embed=1 触发, 隐藏自身顶栏等 chrome, 只露画布本体, 避免"框中框"观感。
// 向后兼容: 不带该参数的正常访问完全不受影响。
const KEY = 'ic-embed-mode';

function detect(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('embed');
    if (q === '1') {
      // 显式声明: 记住, 之后 SPA 内刷新/跳转丢了 query 也保持嵌入态
      sessionStorage.setItem(KEY, '1');
      return true;
    }
    if (sessionStorage.getItem(KEY) === '1') return true;
    // 兜底: 处于 iframe 中(非顶层窗口)也视为嵌入
    return window.self !== window.top;
  } catch {
    return false;
  }
}

export const isEmbedded = detect();
