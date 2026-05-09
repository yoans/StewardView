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

function initials(name) {
  return (name || 'SV')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'SV';
}

function formatAddress(tenant) {
  if (!tenant) return '';
  const cityLine = [tenant.city, tenant.state, tenant.postal_code].filter(Boolean).join(', ').replace(', ', tenant.city && tenant.state ? ', ' : ' ');
  return [tenant.address_line1, tenant.address_line2, cityLine].filter(Boolean).join(' · ');
}

export default function Layout({ user, tenant, onLogout, children }) {
  const tenantName = tenant?.name || 'StewardView';
  const address = formatAddress(tenant);
  const contactItems = [tenant?.contact_email, tenant?.phone, address].filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="bg-white rounded-lg h-10 w-10 flex items-center justify-center overflow-hidden text-blue-800 font-bold">
                {tenant?.profile_image_url ? (
                  <img src={tenant.profile_image_url} alt={tenantName} className="h-full w-full object-cover" />
                ) : tenant?.logo_url ? (
                  <img src={tenant.logo_url} alt={tenantName} className="h-full w-full object-contain p-1" />
                ) : (
                  <span>{initials(tenantName)}</span>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">{tenantName}</h1>
                <p className="text-blue-200 text-xs">StewardView Finance</p>
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

      {contactItems.length > 0 && (
        <div className="bg-blue-900 text-blue-100 text-xs">
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap gap-x-4 gap-y-1">
            {tenant?.contact_email && <span>{tenant.contact_email}</span>}
            {tenant?.phone && <span>{tenant.phone}</span>}
            {address && <span>{address}</span>}
          </div>
        </div>
      )}

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
