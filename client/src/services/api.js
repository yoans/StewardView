import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hrcoc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('hrcoc_token');
      localStorage.removeItem('hrcoc_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Auth ─────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
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
  syncLog: () => api.get('/bank/sync-log'),
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

export default api;
