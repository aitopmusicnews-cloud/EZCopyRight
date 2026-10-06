import { getAccessToken } from './auth';

const AGENT_API_BASE_URL = (import.meta.env.VITE_AGENT_API_URL || '').trim().replace(/\/$/, '');

export interface AgentReply {
  ok: boolean;
  reply: string;
  requiresConfirmation?: boolean;
  pendingAction?: {
    name: string;
    arguments?: Record<string, unknown>;
  };
  model?: string;
}

async function agentRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!AGENT_API_BASE_URL) throw new Error('The operations agent is not configured for this deployment.');

  const token = await getAccessToken();
  if (!token) throw new Error('Please sign in again to use the operations agent.');

  const response = await fetch(AGENT_API_BASE_URL + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error('Please sign out and sign back in.');
    if (response.status === 403) throw new Error('This account is not authorized to use the operations agent.');
    throw new Error(data?.message || data?.error || 'The operations agent request failed.');
  }

  return data as T;
}

export async function getAgentAccess(): Promise<boolean> {
  if (!AGENT_API_BASE_URL) return false;
  try {
    const result = await agentRequest<{ allowed: boolean }>('/access');
    return Boolean(result.allowed);
  } catch {
    return false;
  }
}

export async function askAgent(message: string, confirmDeployment = false): Promise<AgentReply> {
  return agentRequest<AgentReply>('/agent', {
    method: 'POST',
    body: JSON.stringify({ message, confirmDeployment }),
  });
}
