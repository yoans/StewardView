import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sv_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 / 402 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('sv_token');
      localStorage.removeItem('sv_user');
      window.location.href = '/app/login';
    }
    if (error.response?.status === 402) {
      // Subscription suspended or cancelled — redirect to a suspension notice
      const reason = error.response.data?.reason || 'subscription_suspended';
      window.location.href = `/app/suspended?reason=${reason}`;
    }
    return Promise.reject(error);
  }
);

// ── Auth ─────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  signup: (data) => api.post('/auth/signup', data),
  me: () => api.get('/auth/me'),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  deactivateUser: (id) => api.delete(`/auth/users/${id}`),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// ── Transactions ─────────────────────────────────────────
export const transactionsAPI = {
  list: (params) => api.get('/transactions', { params }),
  get: (id) => api.get(`/transactions/${id}`),
  create: (data) => api.post('/transactions', data),
  update: (id, data) => api.put(`/transactions/${id}`, data),
  void: (id, reason) => api.delete(`/transactions/${id}`, { data: { change_reason: reason } }),
  summary: (year, month) => api.get(`/transactions/summary/${year}/${month}`),
};

// ── Funds ────────────────────────────────────────────────
export const fundsAPI = {
  list: () => api.get('/funds'),
  get: (id) => api.get(`/funds/${id}`),
  create: (data) => api.post('/funds', data),
  update: (id, data) => api.put(`/funds/${id}`, data),
  transfer: (fromId, data) => api.post(`/funds/${fromId}/transfer`, data),
  history: (id) => api.get(`/funds/${id}/history`),
};

// ── Budgets ──────────────────────────────────────────────
export const budgetsAPI = {
  list: (year) => api.get('/budgets', { params: { year } }),
  vsActual: (year, month) => api.get('/budgets/vs-actual', { params: { year, month } }),
  create: (data) => api.post('/budgets', data),
  update: (id, data) => api.put(`/budgets/${id}`, data),
  delete: (id) => api.delete(`/budgets/${id}`),
  copy: (data) => api.post('/budgets/copy', data),
  ytd: (year) => api.get('/budgets/ytd', { params: { year } }),
};

// ── Bank ─────────────────────────────────────────────────
export const bankAPI = {
  accounts: () => api.get('/bank/accounts'),
  balances: () => api.get('/bank/balances'),
  linkToken: () => api.post('/bank/link-token'),
  exchangeToken: (data) => api.post('/bank/exchange-token', data),
  sync: () => api.post('/bank/sync'),
  syncAccount: (id) => api.post(`/bank/sync/${id}`),
  syncLog: () => api.get('/bank/sync-log'),
  createAccount: (data) => api.post('/bank/accounts', data),
  updateAccount: (id, data) => api.put(`/bank/accounts/${id}`, data),
  deactivateAccount: (id) => api.delete(`/bank/accounts/${id}`),
};

// ── Reports ──────────────────────────────────────────────
export const reportsAPI = {
  monthly: (year, month) => api.get('/reports/monthly', { params: { year, month } }),
  generate: (year, month) => api.post('/reports/monthly/generate', { year, month }),
  download: (year, month) => api.get('/reports/monthly/download', { params: { year, month }, responseType: 'blob' }),
  list: () => api.get('/reports/list'),
  dashboard: () => api.get('/reports/dashboard'),
};

// ── Audit ────────────────────────────────────────────────
export const auditAPI = {
  list: (params) => api.get('/audit', { params }),
  forEntity: (entityType, entityId) => api.get(`/audit/${entityType}/${entityId}`),
};

// ── Categories ───────────────────────────────────────────
export const categoriesAPI = {
  list: (type) => api.get('/categories', { params: { type } }),
};

// ── Givelify ─────────────────────────────────────────────
export const givelifyAPI = {
  list: (params) => api.get('/givelify', { params }),
  summary: () => api.get('/givelify/summary'),
  import: (contributions) => api.post('/givelify/import', { contributions }),
  earmark: (id, fund_id) => api.post(`/givelify/${id}/earmark`, { fund_id }),
  getEnvelopeMap: () => api.get('/givelify/envelope-map'),
  updateEnvelopeMap: (map) => api.put('/givelify/envelope-map', { map }),
};

// ── Backups ──────────────────────────────────────────────
export const backupsAPI = {
  list: () => api.get('/backups'),
  create: (type) => api.post('/backups', { type }),
  download: (id) => api.get(`/backups/${id}/download`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/backups/${id}`),
};

// ── Platform Admin ───────────────────────────────────────
export const platformAPI = {
  stats: () => api.get('/platform/stats'),
  tenants: () => api.get('/platform/tenants'),
  getTenant: (id) => api.get(`/platform/tenants/${id}`),
  updateTenant: (id, data) => api.put(`/platform/tenants/${id}`, data),
  suspend: (id, reason) => api.post(`/platform/tenants/${id}/suspend`, { reason }),
  reactivate: (id) => api.post(`/platform/tenants/${id}/reactivate`),
};

// ── Onboarding ───────────────────────────────────────────
export const onboardingAPI = {
  register: (data) => api.post('/onboarding/register', data),
  tenantInfo: (slug) => api.get(`/onboarding/tenant-info/${slug}`),
  confirmPayment: (sessionId, token) => api.post('/onboarding/payment-success', { session_id: sessionId, token }),
};

export default api;
