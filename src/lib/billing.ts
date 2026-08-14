import { apiRequest } from './api';

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

export function getBillingStatus() {
  return apiRequest<BillingStatus>('/v1/billing/status');
}

export async function startCheckout() {
  const result = await apiRequest<{ url: string }>('/v1/billing/checkout', { method: 'POST' });
  window.location.assign(result.url);
}

export async function openBillingPortal() {
  const result = await apiRequest<{ url: string }>('/v1/billing/portal', { method: 'POST' });
  window.location.assign(result.url);
}
