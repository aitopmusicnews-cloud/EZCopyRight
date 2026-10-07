import { getAuthToken } from './auth';

const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : '';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || runtimeOrigin
).trim().replace(/\/$/, '');

async function sendApiRequest(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers,
  });
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const response = await sendApiRequest(path, init, token);

  if (response.status !== 401 || !token) return response;

  const refreshedToken = await getAuthToken(true);
  if (!refreshedToken || refreshedToken === token) return response;

  return sendApiRequest(path, init, refreshedToken);
}
