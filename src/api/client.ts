import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    const claims = decodeJwtPayload(token);
    const clientId = claims?.clientId;
    const userId = claims?.sub;
    const role = claims?.role;
    const isDeveloper = claims?.isDeveloper;
    if (typeof clientId === 'string' && clientId) {
      config.headers['X-Client-Id'] = clientId;
    }
    if (typeof userId === 'string' && userId) {
      config.headers['X-User-Id'] = userId;
    }
    if (typeof role === 'string' && role) {
      config.headers['X-User-Role'] = role;
    }
    if (typeof isDeveloper === 'boolean') {
      config.headers['X-Is-Developer'] = String(isDeveloper);
    }
  }
  return config;
});

// 401 시 refresh 시도, 실패하면 로그인으로 리다이렉트
let isRefreshing = false;
let pendingRequests: ((token: string) => void)[] = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 로그인·리프레시 엔드포인트 자체의 실패는 그대로 reject (루프 방지)
    const url = originalRequest?.url ?? '';
    if (url.includes('/user/doLogin') || url.includes('/user/refresh-at')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingRequests.push((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post<{ accessToken: string }>(
          `${import.meta.env.VITE_API_BASE_URL || ''}/account-service/user/refresh-at`,
          { refreshToken },
        );
        const newToken = res.data.accessToken;
        localStorage.setItem('token', newToken);

        pendingRequests.forEach((cb) => cb(newToken));
        pendingRequests = [];

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
