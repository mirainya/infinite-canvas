import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { getToken, isAdmin } from './components/LoginPage';
import './styles.css';

const AdminLayout = lazy(() => import('./admin/AdminLayout').then((module) => ({ default: module.AdminLayout })));

function AdminGuard() {
  const allowed = Boolean(getToken() && isAdmin());
  useEffect(() => {
    if (!allowed) window.location.replace('/');
  }, [allowed]);
  return allowed ? <AdminLayout /> : null;
}

function RootRoute() {
  return window.location.pathname.startsWith('/admin') ? <AdminGuard /> : <App />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <Suspense fallback={<div className="route-loading">加载中...</div>}>
          <RootRoute />
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
