import axios from 'axios';

const API_ROOT = '/api';

const normalizeBackendUrl = (url) => {
  const trimmed = (url || 'https://utc-cafe.onrender.com').replace(/\/+$/, '');
  return trimmed.endsWith(API_ROOT) ? trimmed : `${trimmed}${API_ROOT}`;
};

const BACKEND_URL = normalizeBackendUrl(import.meta.env.VITE_BACKEND_URL);

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

const MAX_RETRIES = 3;
let refreshPromise = null;
let isRedirecting  = false; // ── BUG FIX: prevent duplicate redirect race

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('utc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // ── SECURITY FIX: attach stored refresh token in header for cross-origin fallback
  const refreshToken = localStorage.getItem('utc_refresh_token');
  if (refreshToken && config.url?.includes('/auth/refresh')) {
    config.headers.Authorization = `Refresh ${refreshToken}`;
    config.data = { ...config.data, refreshToken };
  }

  return config;
});

api.interceptors.response.use(
  (res) => {
    // ── BUG FIX: persist refresh token from response header/body if provided
    const xRefresh = res.headers?.['x-refresh-token'];
    if (xRefresh) localStorage.setItem('utc_refresh_token', xRefresh);
    if (res.data?.refreshToken) localStorage.setItem('utc_refresh_token', res.data.refreshToken);
    return res;
  },
  async (err) => {
    // Surface franchise-inactive 403s
    if (err.response?.status === 403) {
      const code = err.response?.data?.code;
      const msg  = err.response?.data?.message || 'Access denied (403)';
      if (code === 'FRANCHISE_INACTIVE' || code === 'FRANCHISE_ARCHIVED' || code === 'FRANCHISE_NOT_FOUND') {
        err.userMessage = msg;
        try {
          const { default: toast } = await import('react-hot-toast');
          toast.error(msg, { duration: 6000, id: 'franchise-inactive' });
        } catch (_) {}
      }
    }

    // 401 → try token refresh once
    if (
      err.response?.status === 401 &&
      err.config &&
      !err.config.__isRetryRequest &&
      !err.config.skipAuthRefresh
    ) {
      const isRefreshRoute = err.config.url?.includes('/auth/refresh');
      if (!isRefreshRoute) {
        try {
          refreshPromise = refreshPromise || api.post('/auth/refresh');
          const { data } = await refreshPromise;
          localStorage.setItem('utc_token', data.token);
          if (data.refreshToken) localStorage.setItem('utc_refresh_token', data.refreshToken);
          refreshPromise = null;
          err.config.__isRetryRequest = true;
          err.config.headers.Authorization = `Bearer ${data.token}`;
          return api(err.config);
        } catch (refreshErr) {
          refreshPromise = null;
        }
      }

      // Refresh failed — clear session
      localStorage.removeItem('utc_token');
      localStorage.removeItem('utc_refresh_token');
      delete api.defaults.headers.common.Authorization;

      const isPublicPage = window.location.pathname.startsWith('/menu/') ||
                           window.location.pathname.startsWith('/display/');

      // ── BUG FIX: deduplicate redirects to avoid multiple replaceState calls
      if (!isPublicPage && window.location.pathname !== '/login' && !isRedirecting) {
        isRedirecting = true;
        window.location.replace('/login');
      }
      return Promise.reject(err);
    }

    // Network errors → exponential backoff retry
    if (!err.response && err.config) {
      err.config.__retryCount = (err.config.__retryCount || 0) + 1;
      if (err.config.__retryCount <= MAX_RETRIES) {
        const delay = 2 ** (err.config.__retryCount - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return api(err.config);
      }
    }

    // User-friendly network error messages
    if (!err.response) {
      if (err.code === 'ECONNABORTED') {
        err.userMessage = 'Request timed out. Please try again.';
      } else if (err.code === 'ERR_NETWORK' || err.code === 'ENOTFOUND') {
        err.userMessage = 'Unable to connect to server. Please check your internet connection.';
      } else {
        err.userMessage = 'Network error. Please try again.';
      }
    }

    return Promise.reject(err);
  }
);

export default api;
