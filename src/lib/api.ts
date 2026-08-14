import { getAccessToken } from './auth';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');

export const isApiConfigured = Boolean(configuredApiBaseUrl);

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!configuredApiBaseUrl) {
    throw new Error('The EZ Copyright API is not configured.');
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Please sign in again to continue.');
  }

  const response = await fetch(`${configuredApiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error === 'invalid_authentication'
      ? 'Your session expired. Please sign in again.'
      : body?.error === 'work_not_found'
        ? 'That work could not be found.'
        : 'EZ Copyright could not complete the request. Please try again.';
    throw new Error(message);
  }

  return body as T;
}
