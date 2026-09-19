import { getAccessToken } from './auth';
import { API_BASE_URL } from './api';

export interface BillingStatus {
  configured: boolean;
  active: boolean;
  status: string;
  used: number;
  limit: number;
  remaining: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const MONTHLY_LIMIT = 5;

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  authRequired = true,
): Promise<T> {
  const token = await getAccessToken();
  if (authRequired && !token) {
    throw new Error('Please sign in again to continue.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Please sign in again to continue.');
    }
    const message = data && typeof data === 'object' && 'error' in data
      ? String((data as { error?: unknown }).error || '')
      : '';
    throw new Error(message || 'Billing request failed.');
  }

  return data as T;
}

export async function getBillingStatus(): Promise<BillingStatus> {
  try {
    return await apiRequest<BillingStatus>('/v1/billing/status');
  } catch (error) {
    if (error instanceof Error && error.message === 'Please sign in again to continue.') {
      return {
        configured: true,
        active: false,
        status: 'no_user',
        used: 0,
        limit: MONTHLY_LIMIT,
        remaining: 0,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    throw error;
  }
}

async function invokeBillingEndpoint(
  path: '/v1/billing/checkout' | '/v1/billing/portal',
  authRequired = true,
): Promise<string> {
  const data = await apiRequest<{ url?: string }>(path, {
    method: 'POST',
    body: JSON.stringify({}),
  }, authRequired);

  if (!data?.url) {
    throw new Error('Billing could not be started.');
  }
  return data.url;
}

export async function startCheckout() {
  const url = await invokeBillingEndpoint('/v1/billing/checkout', false);
  window.location.assign(url);
}

export async function openBillingPortal() {
  const url = await invokeBillingEndpoint('/v1/billing/portal', true);
  window.location.assign(url);
}
