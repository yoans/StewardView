import React, { useState } from 'react';
import { authAPI } from '../services/api';

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await authAPI.login(email, password);
        onLogin(res.data.user, res.data.token);
      } else {
        if (!name.trim()) { setError('Name is required'); setLoading(false); return; }
        if (password.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return; }
        const res = await authAPI.signup({ email, password, name });
        onLogin(res.data.user, res.data.token);
      }
    } catch (err) {
      setError(err.response?.data?.error || (mode === 'login' ? 'Login failed' : 'Signup failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <span className="text-5xl">⛪</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">HRCOC Finance</h1>
          <p className="text-gray-500 text-sm mt-1">Church Finance Transparency System</p>
        </div>

        {/* Toggle Login / Sign Up */}
        <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'login' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}
            onClick={() => { setMode('login'); setError(''); }}
          >Sign In</button>
          <button
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'signup' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}
            onClick={() => { setMode('signup'); setError(''); }}
          >Sign Up</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
          )}

          {mode === 'signup' && (
            <div>
              <label className="label">Full Name</label>
              <input
                type="text" className="input" value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name" required
              />
            </div>
          )}

          <div>
            <label className="label">Email</label>
            <input
              type="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hrcoc.org" required
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password" className="input" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        {mode === 'signup' && (
          <p className="mt-4 text-xs text-center text-gray-500">
            New accounts are created as viewers. An admin will set your access level.
          </p>
        )}

        {mode === 'login' && (
          <div className="mt-6 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
            <p className="font-medium text-gray-700 mb-1">Demo Credentials:</p>
            <p>Admin: admin@hrcoc.org / changeme123</p>
            <p>Admin: treasurer@hrcoc.org / changeme123</p>
            <p>Elder: elder@hrcoc.org / changeme123</p>
            <p>Viewer: viewer@hrcoc.org / changeme123</p>
          </div>
        )}
      </div>
    </div>
  );
}
