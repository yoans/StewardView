import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import FundsPage from './pages/FundsPage';
import BudgetPage from './pages/BudgetPage';
import BankPage from './pages/BankPage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import GivelifyPage from './pages/GivelifyPage';
import AdminPage from './pages/AdminPage';
import PlatformAdminPage from './pages/PlatformAdminPage';
import { authAPI } from './services/api';

// ── Suspension screen ─────────────────────────────────────
function SuspendedPage() {
  const location = useLocation();
  const reason = new URLSearchParams(location.search).get('reason') || 'subscription_suspended';
  const isCanceled = reason === 'subscription_canceled';
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">{isCanceled ? '📦' : '⏸️'}</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {isCanceled ? 'Subscription Ended' : 'Account Suspended'}
        </h1>
        <p className="text-gray-600 mb-6">
          {isCanceled
            ? 'Your subscription has been canceled. Your data is safely preserved. Contact us to reactivate your account.'
            : 'Your account has been temporarily suspended. Please contact support to restore access.'}
        </p>
        <a href="mailto:support@stewardview.app"
          className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
          Contact Support
        </a>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('sv_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  // Load tenant branding after login
  useEffect(() => {
    if (user && !user.is_platform_admin) {
      authAPI.me().then(res => {
        const t = res.data?.tenant;
        if (t) {
          setTenant(t);
          // Apply tenant brand colors as CSS variables
          if (t.primary_color) document.documentElement.style.setProperty('--color-primary', t.primary_color);
          if (t.accent_color) document.documentElement.style.setProperty('--color-accent', t.accent_color);
          document.title = `${t.name} — Finance`;
        }
      }).catch(() => {});
    }
  }, [user]);

  const handleLogin = (userData, token) => {
    localStorage.setItem('sv_token', token);
    localStorage.setItem('sv_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('sv_token');
    localStorage.removeItem('sv_user');
    setUser(null);
    setTenant(null);
    document.documentElement.style.removeProperty('--color-primary');
    document.documentElement.style.removeProperty('--color-accent');
    document.title = 'StewardView';
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/suspended" element={<SuspendedPage />} />
        <Route path="/login" element={
          user ? <Navigate to="/" /> : <LoginPage onLogin={handleLogin} />
        } />
        {/* Platform super-admin portal (no Layout wrapper) */}
        <Route path="/platform/*" element={
          user?.is_platform_admin ? <PlatformAdminPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" />
        } />
        <Route path="/*" element={
          user ? (
            <Layout user={user} tenant={tenant} onLogout={handleLogout}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage user={user} />} />
                <Route path="/funds" element={<FundsPage user={user} />} />
                <Route path="/budget" element={<BudgetPage user={user} />} />
                <Route path="/bank" element={<BankPage user={user} />} />
                <Route path="/reports" element={<ReportsPage user={user} />} />
                <Route path="/audit" element={<AuditPage />} />
                <Route path="/givelify" element={<GivelifyPage user={user} />} />
                <Route path="/admin" element={<AdminPage user={user} />} />
              </Routes>
            </Layout>
          ) : <Navigate to="/login" />
        } />
      </Routes>
    </Router>
  );
}

export default App;

