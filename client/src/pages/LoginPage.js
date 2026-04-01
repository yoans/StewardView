import React, { useState, useRef } from 'react';
import { authAPI } from '../services/api';

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [step, setStep] = useState('credentials'); // 'credentials' | 'mfa'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const codeRefs = useRef([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await authAPI.login(email, password);
        if (res.data.mfa_required) {
          setMfaToken(res.data.mfa_token);
          setStep('mfa');
          setMfaCode(['', '', '', '', '', '']);
          setTimeout(() => codeRefs.current[0]?.focus(), 50);
        } else {
          onLogin(res.data.user, res.data.token);
        }
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

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    const code = mfaCode.join('');
    if (code.length !== 6) { setError('Enter all 6 digits'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.verifyMfa(mfaToken, code);
      onLogin(res.data.user, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
      setMfaCode(['', '', '', '', '', '']);
      setTimeout(() => codeRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (index, value) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const updated = [...mfaCode];
    updated[index] = digit;
    setMfaCode(updated);
    // Auto-advance to next input
    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !mfaCode[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const updated = [...mfaCode];
    for (let i = 0; i < 6; i++) updated[i] = pasted[i] || '';
    setMfaCode(updated);
    const focusIdx = Math.min(pasted.length, 5);
    codeRefs.current[focusIdx]?.focus();
  };

  const handleBackToLogin = () => {
    setStep('credentials');
    setMfaToken('');
    setMfaCode(['', '', '', '', '', '']);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/logo.svg" alt="StewardView" className="h-16 w-auto mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900 mt-3">StewardView</h1>
          <p className="text-gray-500 text-sm mt-1">Church Finance Transparency Platform</p>
        </div>

        {step === 'mfa' ? (
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
              <p className="text-gray-500 text-sm mt-1">
                We sent a 6-digit code to <strong>{email}</strong>
              </p>
            </div>

            <form onSubmit={handleMfaSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
              )}

              <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
                {mfaCode.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (codeRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="w-11 h-13 text-center text-xl font-bold border-2 border-gray-300 rounded-lg
                               focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-colors"
                    value={digit}
                    onChange={(e) => handleCodeChange(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                className="text-sm text-blue-600 hover:text-blue-800"
                onClick={handleBackToLogin}
              >
                Back to sign in
              </button>
            </div>
          </>
        ) : (
          <>
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
                  placeholder="you@church.org" required
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
          </>
        )}

      </div>
    </div>
  );
}
