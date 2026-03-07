import React, { useState } from 'react';
import { authAPI } from '../services/api';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.login(email, password);
      onLogin(res.data.user, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-5xl">⛪</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">HRCOC Finance</h1>
          <p className="text-gray-500 text-sm mt-1">Church Finance Transparency System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label className="label">Email</label>
            <input
              type="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="treasurer@hrcoc.org" required
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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
          <p className="font-medium text-gray-700 mb-1">Demo Credentials:</p>
          <p>Treasurer: treasurer@hrcoc.org / changeme123</p>
          <p>Elder: elder@hrcoc.org / changeme123</p>
          <p>Viewer: viewer@hrcoc.org / changeme123</p>
        </div>
      </div>
    </div>
  );
}
