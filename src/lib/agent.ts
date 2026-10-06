import { API_BASE_URL } from './api';
import { getAccessToken } from './auth';

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
  const token = await getAccessToken();
  if (!token) throw new Error('Please sign in again to use the AWS Agent.');

  const response = await fetch(API_BASE_URL + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403) throw new Error('This account is not authorized to use the AWS Agent.');
    throw new Error(data?.message || data?.error || 'The AWS Agent request failed.');
  }

  return data as T;
}

export async function getAgentAccess(): Promise<boolean> {
  try {
    const result = await agentRequest<{ allowed: boolean }>('/v1/agent/access');
    return Boolean(result.allowed);
  } catch {
    return false;
  }
}

export async function askAgent(message: string, confirmDeployment = false): Promise<AgentReply> {
  return agentRequest<AgentReply>('/v1/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ message, confirmDeployment }),
  });
}
