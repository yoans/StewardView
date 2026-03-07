import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import FundsPage from './pages/FundsPage';
import BudgetPage from './pages/BudgetPage';
import BankPage from './pages/BankPage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('hrcoc_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('hrcoc_token', token);
    localStorage.setItem('hrcoc_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('hrcoc_token');
    localStorage.removeItem('hrcoc_user');
    setUser(null);
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" /> : <LoginPage onLogin={handleLogin} />
        } />
        <Route path="/*" element={
          user ? (
            <Layout user={user} onLogout={handleLogout}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionsPage user={user} />} />
                <Route path="/funds" element={<FundsPage user={user} />} />
                <Route path="/budget" element={<BudgetPage user={user} />} />
                <Route path="/bank" element={<BankPage user={user} />} />
                <Route path="/reports" element={<ReportsPage user={user} />} />
                <Route path="/audit" element={<AuditPage />} />
              </Routes>
            </Layout>
          ) : <Navigate to="/login" />
        } />
      </Routes>
    </Router>
  );
}

export default App;
