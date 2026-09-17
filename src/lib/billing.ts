import { supabase } from './supabase';

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
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export async function getBillingStatus(): Promise<BillingStatus> {
  if (!supabase) {
    return {
      configured: false,
      active: true,
      status: 'local',
      used: 0,
      limit: MONTHLY_LIMIT,
      remaining: MONTHLY_LIMIT,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      configured: false,
      active: false,
      status: 'no_user',
      used: 0,
      limit: MONTHLY_LIMIT,
      remaining: 0,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  const { data, error } = await supabase
    .from('billing_customers')
    .select('subscription_status, current_period_end, cancel_at_period_end')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return {
      configured: true,
      active: false,
      status: 'error',
      used: 0,
      limit: MONTHLY_LIMIT,
      remaining: 0,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  if (!data) {
    return {
      configured: true,
      active: false,
      status: 'inactive',
      used: 0,
      limit: MONTHLY_LIMIT,
      remaining: 0,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  const active = ACTIVE_STATUSES.has(data.subscription_status);

  const { count } = await supabase
    .from('works')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('date_registered', data.current_period_end
      ? new Date(new Date(data.current_period_end).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const used = count ?? 0;

  return {
    configured: true,
    active,
    status: data.subscription_status,
    used,
    limit: MONTHLY_LIMIT,
    remaining: Math.max(0, MONTHLY_LIMIT - used),
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
  };
}

async function invokeBillingFunction(name: 'create-checkout-session' | 'create-portal-session'): Promise<string> {
  if (!supabase) {
    throw new Error('Billing is not available right now.');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Please sign in again to continue.');
  }

  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(name, {
    body: { origin: window.location.origin },
  });

  if (error) {
    let serverMessage = '';
    try {
      const context = (error as { context?: { response?: Response } }).context;
      const response = context?.response;
      if (response) {
        const cloned = response.clone();
        const payload = await cloned.json().catch(() => null);
        if (payload && typeof payload === 'object' && payload !== null && 'error' in payload) {
          const raw = (payload as { error?: unknown }).error;
          if (typeof raw === 'string') serverMessage = raw;
        }
      }
    } catch {
      serverMessage = '';
    }
    throw new Error(serverMessage || error.message || 'Billing could not be started.');
  }
  if (!data?.url) {
    throw new Error(data?.error || 'Billing could not be started.');
  }
  return data.url;
}

export async function startCheckout() {
  const url = await invokeBillingFunction('create-checkout-session');
  window.location.assign(url);
}

export async function openBillingPortal() {
  const url = await invokeBillingFunction('create-portal-session');
  window.location.assign(url);
}
