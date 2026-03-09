import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/transactions', label: 'Transactions', icon: '💰' },
  { path: '/funds', label: 'Funds', icon: '🏦' },
  { path: '/givelify', label: 'Givelify', icon: '💝' },
  { path: '/budget', label: 'Budget', icon: '📋' },
  { path: '/bank', label: 'Bank', icon: '🏧' },
  { path: '/reports', label: 'Reports', icon: '📄' },
  { path: '/audit', label: 'Audit Trail', icon: '🔍' },
  { path: '/admin', label: 'Admin', icon: '⚙️', adminOnly: true },
];

export default function Layout({ user, onLogout, children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">⛪</span>
              <div>
                <h1 className="text-lg font-bold">StewardView</h1>
                <p className="text-blue-200 text-xs">Transparency System</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-blue-200">
                {user.name} ({user.role})
              </span>
              <button
                onClick={onLogout}
                className="bg-blue-900 hover:bg-blue-950 px-3 py-1 rounded text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Sub Navigation */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1 overflow-x-auto">
            {navItems
              .filter(item => !item.adminOnly || user?.role === 'admin')
              .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center space-x-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-blue-700 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
