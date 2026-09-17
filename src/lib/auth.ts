const COGNITO_REGION = import.meta.env.VITE_COGNITO_REGION || 'us-west-2';
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '6j3dpm8g95pa2uuevfuk206qdi';
const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
const SESSION_KEY = 'ezcopyright_cognito_session';

export type AuthMode = 'cognito';

export interface AuthUser {
  id: string;
  email: string;
}

export interface SignUpResult {
  user: AuthUser | null;
  confirmationRequired: boolean;
}

interface CognitoSession {
  user: AuthUser;
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt: number;
}

function readSession(): CognitoSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as CognitoSession;
    if (!session.accessToken || !session.user?.email) return null;
    return session;
  } catch {
    return null;
  }
}

function writeSession(session: CognitoSession | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) return {};
  try {
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(Array.from(atob(padded), c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
  } catch {
    return {};
  }
}

async function cognitoRequest<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.Message || 'Authentication request failed.';
    throw new Error(message);
  }
  return data as T;
}

export function getAuthMode(): AuthMode {
  return 'cognito';
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = readSession();
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    writeSession(null);
    return null;
  }
  return session.user;
}

export async function getAccessToken(): Promise<string | null> {
  const session = readSession();
  if (!session || session.expiresAt <= Date.now()) return null;
  return session.accessToken;
}

export function subscribeToAuthChanges(callback: (user: AuthUser | null) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY) callback(readSession()?.user ?? null);
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const data = await cognitoRequest<{
    AuthenticationResult?: { AccessToken?: string; IdToken?: string; RefreshToken?: string; ExpiresIn?: number };
    ChallengeName?: string;
  }>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });

  if (data.ChallengeName) throw new Error(`Additional sign-in step required: ${data.ChallengeName}`);
  const auth = data.AuthenticationResult;
  if (!auth?.AccessToken) throw new Error('Cognito did not return an access token.');

  const claims = auth.IdToken ? decodeJwt(auth.IdToken) : decodeJwt(auth.AccessToken);
  const user: AuthUser = {
    id: String(claims.sub || email),
    email: String(claims.email || email),
  };
  writeSession({
    user,
    accessToken: auth.AccessToken,
    idToken: auth.IdToken,
    refreshToken: auth.RefreshToken,
    expiresAt: Date.now() + (auth.ExpiresIn || 3600) * 1000,
  });
  return user;
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const data = await cognitoRequest<{ UserConfirmed?: boolean }>('SignUp', {
    ClientId: COGNITO_CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  });
  return { user: null, confirmationRequired: !data.UserConfirmed };
}

export async function confirmSignUp(email: string, password: string, confirmationCode: string): Promise<AuthUser> {
  await cognitoRequest('ConfirmSignUp', {
    ClientId: COGNITO_CLIENT_ID,
    Username: email,
    ConfirmationCode: confirmationCode,
  });
  return signIn(email, password);
}

export async function signOut(): Promise<void> {
  const token = await getAccessToken();
  writeSession(null);
  if (!token) return;
  try {
    await cognitoRequest('GlobalSignOut', { AccessToken: token });
  } catch {
    // Local sign-out has already completed.
  }
}
