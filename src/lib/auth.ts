export type AuthMode = 'entra-external-id';

export interface AuthUser {
  id: string;
  email: string;
}

interface EasyAuthClaim {
  typ?: string;
  val?: string;
}

interface EasyAuthIdentity {
  user_id?: string;
  user_name?: string;
  user_claims?: EasyAuthClaim[];
}

function claimValue(identity: EasyAuthIdentity, names: string[]): string {
  const claims = identity.user_claims || [];
  for (const name of names) {
    const match = claims.find((claim) => claim.typ === name && claim.val);
    if (match?.val) return match.val;
  }
  return '';
}

export function getAuthMode(): AuthMode {
  return 'entra-external-id';
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/.auth/me', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Could not check your secure sign-in session.');

  const payload = await response.json().catch(() => []);
  const identity = Array.isArray(payload) ? payload[0] as EasyAuthIdentity | undefined : undefined;
  if (!identity) return null;

  const id = identity.user_id
    || claimValue(identity, [
      'sub',
      'oid',
      'http://schemas.microsoft.com/identity/claims/objectidentifier',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
    ]);

  const email = identity.user_name
    || claimValue(identity, [
      'email',
      'emails',
      'preferred_username',
      'upn',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    ]);

  if (!id) return null;
  return { id, email: email || 'Signed-in customer' };
}

export function subscribeToAuthChanges(callback: (user: AuthUser | null) => void): () => void {
  const refresh = () => {
    void getCurrentUser().then(callback).catch(() => callback(null));
  };
  window.addEventListener('focus', refresh);
  const onVisibility = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

async function getAuthProvider(): Promise<string> {
  const response = await fetch('/v1/auth/config', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Could not load the sign-in configuration.');
  const payload = await response.json().catch(() => ({}));
  const provider = typeof payload?.provider === 'string' ? payload.provider.trim() : '';
  if (!/^[A-Za-z0-9]+$/.test(provider)) throw new Error('The sign-in provider is not configured correctly.');
  return provider;
}

export async function signIn(postLoginRedirectUri = '/'): Promise<void> {
  const redirect = postLoginRedirectUri.startsWith('/') ? postLoginRedirectUri : '/';
  const provider = await getAuthProvider();
  window.location.assign(
    `/.auth/login/${provider}?post_login_redirect_uri=${encodeURIComponent(redirect)}`,
  );
}

export async function signOut(): Promise<void> {
  window.location.assign('/.auth/logout?post_logout_redirect_uri=%2F');
}
