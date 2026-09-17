import { supabase, isSupabaseConfigured } from './supabase';

const LOCAL_USERS_KEY = 'ogbeatz_local_users';
const LOCAL_SESSION_KEY = 'ogbeatz_local_session';

export type AuthMode = 'supabase' | 'local';

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

export function getAuthMode(): AuthMode {
  if (isSupabaseConfigured) return 'supabase';
  return 'local';
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!supabase) {
    return readLocalSession();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return mapSupabaseUser(user);
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function subscribeToAuthChanges(callback: (user: AuthUser | null) => void): () => void {
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

export async function confirmSignUp(_email: string, _password: string, _confirmationCode: string): Promise<AuthUser> {
  throw new Error('Email confirmation is not required.');
}

export async function signOut(): Promise<void> {
  if (!supabase) {
    writeLocalSession(null);
    return;
  }

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // ignore
  }
}
