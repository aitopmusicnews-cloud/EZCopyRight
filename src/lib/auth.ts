export type AuthMode = 'easy-auth' | 'clerk';

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

interface EasyAuthConfig {
  mode: 'easy-auth';
  provider: string;
}

interface ClerkAuthConfig {
  mode: 'clerk';
  publishableKey: string;
  frontendApi: string;
}

type AuthConfig = EasyAuthConfig | ClerkAuthConfig;

interface ClerkEmailAddress {
  emailAddress?: string;
}

interface ClerkUser {
  id?: string;
  primaryEmailAddress?: ClerkEmailAddress | null;
  emailAddresses?: ClerkEmailAddress[];
}

interface ClerkSession {
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
}

interface ClerkResources {
  user?: ClerkUser | null;
}

interface ClerkClient {
  user?: ClerkUser | null;
  session?: ClerkSession | null;
  load: (options?: Record<string, unknown>) => Promise<void>;
  openSignIn: (options?: Record<string, unknown>) => void;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
  addListener: (
    callback: (resources: ClerkResources) => void,
    options?: { skipInitialEmit?: boolean },
  ) => () => void;
}

declare global {
  interface Window {
    Clerk?: ClerkClient;
    __internal_ClerkUICtor?: unknown;
  }
}

let authConfigPromise: Promise<AuthConfig> | null = null;
let clerkPromise: Promise<ClerkClient> | null = null;

function claimValue(identity: EasyAuthIdentity, names: string[]): string {
  const claims = identity.user_claims || [];
  for (const name of names) {
    const match = claims.find((claim) => claim.typ === name && claim.val);
    if (match?.val) return match.val;
  }
  return '';
}

async function getAuthConfig(): Promise<AuthConfig> {
  if (!authConfigPromise) {
    authConfigPromise = fetch('/v1/auth/config', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load the sign-in configuration.');
      const payload = await response.json();

      if (payload?.mode === 'clerk') {
        const publishableKey = typeof payload.publishableKey === 'string' ? payload.publishableKey.trim() : '';
        const frontendApi = typeof payload.frontendApi === 'string'
          ? payload.frontendApi.trim().replace(/\/$/, '')
          : '';
        if (!publishableKey || !frontendApi.startsWith('https://')) {
          throw new Error('Clerk sign-in is not configured correctly.');
        }
        return { mode: 'clerk', publishableKey, frontendApi };
      }

      const provider = typeof payload?.provider === 'string' ? payload.provider.trim() : '';
      if (!/^[A-Za-z0-9]+$/.test(provider)) {
        throw new Error('The sign-in provider is not configured correctly.');
      }
      return { mode: 'easy-auth', provider };
    });
  }
  return authConfigPromise;
}

function loadScript(id: string, src: string, configure?: (script: HTMLScriptElement) => void): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Secure sign-in could not be loaded.')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    configure?.(script);
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('Secure sign-in could not be loaded.')), { once: true });
    document.head.appendChild(script);
  });
}

async function loadClerk(): Promise<ClerkClient> {
  if (!clerkPromise) {
    clerkPromise = (async () => {
      const config = await getAuthConfig();
      if (config.mode !== 'clerk') throw new Error('Clerk sign-in is not active.');

      await loadScript(
        'ez-clerk-ui',
        `${config.frontendApi}/npm/@clerk/ui@1/dist/ui.browser.js`,
      );
      await loadScript(
        'ez-clerk-js',
        `${config.frontendApi}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
        (script) => script.setAttribute('data-clerk-publishable-key', config.publishableKey),
      );

      const clerk = window.Clerk;
      if (!clerk) throw new Error('Secure sign-in did not initialize.');

      await clerk.load({
        ui: { ClerkUI: window.__internal_ClerkUICtor },
        afterSignOutUrl: '/',
        signInFallbackRedirectUrl: '/',
        signUpFallbackRedirectUrl: '/',
      });
      return clerk;
    })();
  }
  return clerkPromise;
}

function authUserFromClerk(user?: ClerkUser | null): AuthUser | null {
  if (!user?.id) return null;
  const email = user.primaryEmailAddress?.emailAddress
    || user.emailAddresses?.find((entry) => entry.emailAddress)?.emailAddress
    || 'Signed-in customer';
  return { id: user.id, email };
}

async function getEasyAuthUser(): Promise<AuthUser | null> {
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

export async function getAuthMode(): Promise<AuthMode> {
  return (await getAuthConfig()).mode;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const config = await getAuthConfig();
  if (config.mode === 'clerk') {
    const clerk = await loadClerk();
    return authUserFromClerk(clerk.user);
  }
  return getEasyAuthUser();
}

export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  const config = await getAuthConfig();
  if (config.mode !== 'clerk') return null;
  const clerk = await loadClerk();
  if (!clerk.session) return null;
  return clerk.session.getToken(forceRefresh ? { skipCache: true } : undefined);
}

export function subscribeToAuthChanges(callback: (user: AuthUser | null) => void): () => void {
  let active = true;
  let unsubscribe = () => {};

  void getAuthConfig().then(async (config) => {
    if (!active) return;

    if (config.mode === 'clerk') {
      const clerk = await loadClerk();
      if (!active) return;
      unsubscribe = clerk.addListener(({ user }) => callback(authUserFromClerk(user)));
      return;
    }

    const refresh = () => {
      void getEasyAuthUser().then(callback).catch(() => callback(null));
    };
    window.addEventListener('focus', refresh);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    unsubscribe = () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }).catch(() => callback(null));

  return () => {
    active = false;
    unsubscribe();
  };
}

export async function signIn(postLoginRedirectUri = '/'): Promise<void> {
  const redirect = postLoginRedirectUri.startsWith('/') ? postLoginRedirectUri : '/';
  const config = await getAuthConfig();

  if (config.mode === 'clerk') {
    const clerk = await loadClerk();
    clerk.openSignIn({
      fallbackRedirectUrl: redirect,
      signUpFallbackRedirectUrl: redirect,
    });
    return;
  }

  window.location.assign(
    `/.auth/login/${config.provider}?post_login_redirect_uri=${encodeURIComponent(redirect)}`,
  );
}

export async function signOut(): Promise<void> {
  const config = await getAuthConfig();
  if (config.mode === 'clerk') {
    const clerk = await loadClerk();
    await clerk.signOut({ redirectUrl: '/' });
    return;
  }
  window.location.assign('/.auth/logout?post_logout_redirect_uri=%2F');
}
