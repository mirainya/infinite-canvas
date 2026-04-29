import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleHardReset = () => {
    try { localStorage.removeItem('infinite-canvas-snapshot'); } catch { /* noop */ }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', gap: 16, fontFamily: 'system-ui, sans-serif', color: '#e0e0e0', background: '#1a1a2e',
      }}>
        <div style={{ fontSize: 48 }}>🌀</div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>页面出了点问题</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#888', maxWidth: 420, textAlign: 'center' }}>
          {this.state.error?.message || '未知错误'}
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid #444',
              background: '#2a2a3e', color: '#e0e0e0', cursor: 'pointer', fontSize: 14,
            }}
          >
            重试
          </button>
          <button
            type="button"
            onClick={this.handleHardReset}
            style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid #e74c3c',
              background: 'transparent', color: '#e74c3c', cursor: 'pointer', fontSize: 14,
            }}
          >
            清除数据并刷新
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#555' }}>
          如果反复出现，请尝试「清除数据并刷新」
        </p>
      </div>
    );
  }
}

export default ErrorBoundary;
