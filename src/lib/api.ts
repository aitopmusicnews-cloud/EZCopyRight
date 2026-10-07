import { getAuthToken } from './auth';

const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : '';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || runtimeOrigin
).trim().replace(/\/$/, '');

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const token = await getAuthToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers,
  });
}
