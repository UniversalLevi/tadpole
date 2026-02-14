import axios, { type AxiosError } from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

let refreshPromise: ReturnType<typeof api.post<{ accessToken: string; user?: { id: string; email: string; role: string } }>> | null = null;

function getAccessToken(): string | null {
  return localStorage.getItem('accessToken');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}

function setTokens(access: string, refresh: string) {
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

export function setAuthTokens(access: string, refresh: string) {
  setTokens(access, refresh);
}

export function clearAuth() {
  clearTokens();
}

export function getStoredUser(): { id: string; email: string; role: string } | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { id: string; email: string; role: string };
  } catch {
    return null;
  }
}

export function setStoredUser(user: { id: string; email: string; role: string }) {
  localStorage.setItem('user', JSON.stringify(user));
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as typeof err.config & { _retry?: boolean };
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = getRefreshToken();
      if (!refresh) {
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(err);
      }
      try {
        if (!refreshPromise) {
          refreshPromise = api.post<{ accessToken: string; user?: { id: string; email: string; role: string } }>('/auth/refresh', { refreshToken: refresh });
        }
        const res = await refreshPromise;
        refreshPromise = null;
        const access = res.data.accessToken;
        localStorage.setItem('accessToken', access);
        if (res.data.user) setStoredUser(res.data.user);
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch {
        refreshPromise = null;
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);
