import axios from 'axios';
import { useAuthStore } from '../store/auth';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const api = axios.create({ baseURL: API_URL });

/** Uploaded media is stored as a relative path (/uploads/...) on the API. */
export function assetUrl(url: string): string {
  return url.startsWith('/') ? `${API_URL}${url}` : url;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // expired/invalid token -> drop the session, App falls back to login
    if (error.response?.status === 401 && useAuthStore.getState().token) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

/** Human-readable message out of an axios/Nest error. */
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return 'Something went wrong';
}
