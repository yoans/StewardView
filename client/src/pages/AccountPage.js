import React, { useState } from 'react';
import { authAPI } from '../services/api';

export default function AccountPage({ user, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await authAPI.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(res.data.message || 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change password');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (confirmDelete !== user.email) {
      setError('Enter your email address to confirm account deletion');
      return;
    }

    setLoading(true);
    try {
      await authAPI.deleteAccount();
      onLogout();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete account');
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Account Settings</h2>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-4">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-1">Change Password</h3>
          <p className="text-sm text-gray-500 mb-4">Update the password used with your email sign-in.</p>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="label">Current Password</label>
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Change Password'}
            </button>
          </form>
        </div>

        <div className="card border border-red-200">
          <h3 className="text-lg font-bold text-red-700 mb-1">Delete Account</h3>
          <p className="text-sm text-gray-600 mb-4">
            This deactivates your sign-in and removes your access to this organization. Financial records remain preserved for audit history.
          </p>
          {user.role === 'admin' && (
            <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">
              Admin accounts can only be deleted if the organization still has the required number of active admins.
            </p>
          )}

          <form onSubmit={handleDeleteAccount} className="space-y-4">
            <div>
              <label className="label">Type your email to confirm</label>
              <input
                type="email"
                className="input"
                value={confirmDelete}
                onChange={e => setConfirmDelete(e.target.value)}
                placeholder={user.email}
                required
              />
            </div>
            <button type="submit" className="btn-danger" disabled={loading || confirmDelete !== user.email}>
              {loading ? 'Deleting...' : 'Delete My Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
