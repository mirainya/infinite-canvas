import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import { AdminLayout } from './admin/AdminLayout';
import ErrorBoundary from './components/ErrorBoundary';
import { getToken, isAdmin } from './components/LoginPage';
import './styles.css';

function AdminGuard() {
  if (!getToken() || !isAdmin()) return <Navigate to="/" replace />;
  return <AdminLayout />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/*" element={<AdminGuard />} />
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
