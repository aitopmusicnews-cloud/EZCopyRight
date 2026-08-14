import { supabase, isSupabaseConfigured } from './supabase';

const LOCAL_USERS_KEY = 'ogbeatz_local_users';
const LOCAL_SESSION_KEY = 'ogbeatz_local_session';
const COGNITO_TOKEN_KEY = 'ez_copyright_cognito_session';

const awsRegion = import.meta.env.VITE_AWS_REGION?.trim();
const cognitoUserPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID?.trim();
const cognitoClientId = import.meta.env.VITE_COGNITO_CLIENT_ID?.trim();

export const isCognitoConfigured = Boolean(awsRegion && cognitoUserPoolId && cognitoClientId);

export type AuthMode = 'cognito' | 'supabase' | 'local';

export interface AuthUser {
  id: string;
  email: string;
}

export interface SignUpResult {
  user: AuthUser | null;
  confirmationRequired: boolean;
}

interface LocalUserRecord extends AuthUser {
  password: string;
}

interface CognitoSession {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface CognitoAuthenticationResult {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
}

interface CognitoInitiateAuthResponse {
  AuthenticationResult?: CognitoAuthenticationResult;
  ChallengeName?: string;
}

interface CognitoSignUpResponse {
  UserConfirmed?: boolean;
}

class CognitoRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CognitoRequestError';
    this.code = code;
  }
}

function readLocalUsers(): LocalUserRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalUsers(users: LocalUserRecord[]) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function readLocalSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalSession(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
    return;
  }
  localStorage.removeItem(LOCAL_SESSION_KEY);
}

function mapSupabaseUser(user: { id: string; email?: string | null } | null): AuthUser | null {
  if (!user?.email) return null;
  return {
    id: user.id,
    email: user.email,
  };
}

function readCognitoSession(): CognitoSession | null {
  try {
    const raw = localStorage.getItem(COGNITO_TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCognitoSession(session: CognitoSession | null) {
  if (session) {
    localStorage.setItem(COGNITO_TOKEN_KEY, JSON.stringify(session));
    return;
  }
  localStorage.removeItem(COGNITO_TOKEN_KEY);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function userFromIdToken(idToken: string): AuthUser | null {
  const payload = decodeJwtPayload(idToken);
  const id = typeof payload?.sub === 'string' ? payload.sub : null;
  const email = typeof payload?.email === 'string' ? payload.email : null;
  if (!id || !email) return null;
  return { id, email };
}

function friendlyCognitoMessage(code: string, fallback: string): string {
  switch (code) {
    case 'UsernameExistsException':
      return 'An account with that email already exists.';
    case 'UserNotFoundException':
    case 'NotAuthorizedException':
      return 'Invalid email or password.';
    case 'UserNotConfirmedException':
      return 'Your account still needs the confirmation code sent to your email.';
    case 'CodeMismatchException':
      return 'That confirmation code is not correct.';
    case 'ExpiredCodeException':
      return 'That confirmation code has expired.';
    case 'InvalidPasswordException':
      return fallback || 'The password does not meet the security requirements.';
    case 'TooManyRequestsException':
      return 'Too many attempts. Please wait and try again.';
    default:
      return fallback || 'Authentication failed.';
  }
}

async function cognitoRequest<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
  if (!awsRegion) {
    throw new Error('AWS region is not configured.');
  }

  const response = await fetch(`https://cognito-idp.${awsRegion}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${operation}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const rawType = typeof data.__type === 'string' ? data.__type : 'CognitoError';
    const code = rawType.split('#').pop() ?? rawType;
    const rawMessage = typeof data.message === 'string'
      ? data.message
      : typeof data.Message === 'string'
        ? data.Message
        : 'Authentication failed.';
    throw new CognitoRequestError(code, friendlyCognitoMessage(code, rawMessage));
  }

  return data as T;
}

function saveAuthenticationResult(result: CognitoAuthenticationResult, existingRefreshToken?: string): AuthUser {
  if (!result.AccessToken || !result.IdToken) {
    throw new Error('Cognito did not return a complete session.');
  }

  const user = userFromIdToken(result.IdToken);
  if (!user) {
    throw new Error('Unable to read the signed-in account.');
  }

  writeCognitoSession({
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken ?? existingRefreshToken,
    expiresAt: Date.now() + Math.max(60, result.ExpiresIn ?? 3600) * 1000,
  });

  return user;
}

async function refreshCognitoSession(session: CognitoSession): Promise<AuthUser | null> {
  if (!cognitoClientId || !session.refreshToken) return null;

  try {
    const response = await cognitoRequest<CognitoInitiateAuthResponse>('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: cognitoClientId,
      AuthParameters: {
        REFRESH_TOKEN: session.refreshToken,
      },
    });

    if (!response.AuthenticationResult) return null;
    return saveAuthenticationResult(response.AuthenticationResult, session.refreshToken);
  } catch {
    writeCognitoSession(null);
    return null;
  }
}

export function getAuthMode(): AuthMode {
  if (isCognitoConfigured) return 'cognito';
  if (isSupabaseConfigured) return 'supabase';
  return 'local';
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isCognitoConfigured) {
    const session = readCognitoSession();
    if (!session) return null;

    if (session.expiresAt > Date.now() + 60_000) {
      return userFromIdToken(session.idToken);
    }

    return refreshCognitoSession(session);
  }

  if (!supabase) {
    return readLocalSession();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return mapSupabaseUser(user);
}

export async function getAccessToken(): Promise<string | null> {
  if (!isCognitoConfigured) return null;

  let session = readCognitoSession();
  if (!session) return null;

  if (session.expiresAt <= Date.now() + 60_000) {
    await refreshCognitoSession(session);
    session = readCognitoSession();
  }

  return session?.accessToken ?? null;
}

export function subscribeToAuthChanges(callback: (user: AuthUser | null) => void): () => void {
  if (isCognitoConfigured) {
    const onStorage = (event: StorageEvent) => {
      if (event.key === COGNITO_TOKEN_KEY) {
        void getCurrentUser().then(callback);
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }

  if (!supabase) {
    const onStorage = (event: StorageEvent) => {
      if (event.key === LOCAL_SESSION_KEY) {
        callback(readLocalSession());
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(mapSupabaseUser(session?.user ?? null));
  });

  return () => subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  if (isCognitoConfigured) {
    if (!cognitoClientId) throw new Error('Cognito client is not configured.');

    const response = await cognitoRequest<CognitoInitiateAuthResponse>('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: cognitoClientId,
      AuthParameters: {
        USERNAME: email.trim().toLowerCase(),
        PASSWORD: password,
      },
    });

    if (response.ChallengeName) {
      throw new Error(`Additional Cognito step required: ${response.ChallengeName}.`);
    }
    if (!response.AuthenticationResult) {
      throw new Error('Cognito did not return a session.');
    }
    return saveAuthenticationResult(response.AuthenticationResult);
  }

  if (!supabase) {
    const users = readLocalUsers();
    const matched = users.find((user) => user.email.toLowerCase() === email.toLowerCase());

    if (!matched || matched.password !== password) {
      throw new Error('Invalid email or password.');
    }

    const sessionUser = { id: matched.id, email: matched.email };
    writeLocalSession(sessionUser);
    return sessionUser;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const user = mapSupabaseUser(data.user);
  if (!user) throw new Error('Unable to load account.');
  return user;
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  if (isCognitoConfigured) {
    if (!cognitoClientId) throw new Error('Cognito client is not configured.');
    const normalizedEmail = email.trim().toLowerCase();
    const response = await cognitoRequest<CognitoSignUpResponse>('SignUp', {
      ClientId: cognitoClientId,
      Username: normalizedEmail,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: normalizedEmail }],
    });

    if (response.UserConfirmed) {
      return {
        user: await signIn(normalizedEmail, password),
        confirmationRequired: false,
      };
    }

    return { user: null, confirmationRequired: true };
  }

  if (!supabase) {
    const users = readLocalUsers();
    const exists = users.some((user) => user.email.toLowerCase() === email.toLowerCase());

    if (exists) {
      throw new Error('An account with that email already exists.');
    }

    const newUser: LocalUserRecord = {
      id: crypto.randomUUID(),
      email,
      password,
    };

    writeLocalUsers([...users, newUser]);
    const sessionUser = { id: newUser.id, email: newUser.email };
    writeLocalSession(sessionUser);
    return { user: sessionUser, confirmationRequired: false };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  const user = mapSupabaseUser(data.user);
  if (!user) {
    return { user: null, confirmationRequired: true };
  }
  return { user, confirmationRequired: false };
}

export async function confirmSignUp(email: string, password: string, confirmationCode: string): Promise<AuthUser> {
  if (!isCognitoConfigured || !cognitoClientId) {
    throw new Error('Email confirmation is only available in Cognito mode.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  await cognitoRequest('ConfirmSignUp', {
    ClientId: cognitoClientId,
    Username: normalizedEmail,
    ConfirmationCode: confirmationCode.trim(),
  });

  return signIn(normalizedEmail, password);
}

export async function signOut(): Promise<void> {
  if (isCognitoConfigured) {
    const session = readCognitoSession();
    writeCognitoSession(null);

    if (session?.accessToken) {
      try {
        await cognitoRequest('GlobalSignOut', { AccessToken: session.accessToken });
      } catch {
        // The local session is already cleared. A failed remote sign-out should not trap the user.
      }
    }
    return;
  }

  if (!supabase) {
    writeLocalSession(null);
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
