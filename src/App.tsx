import { useState, useEffect } from 'react';
import LandingHero from './components/LandingHero';
import RegisterForm from './components/RegisterForm';
import Certificate from './components/Certificate';
import Dashboard from './components/Dashboard';
import AuthScreen from './components/AuthScreen';
import LegalPage from './components/LegalPage';
import type { LegalPageId, MusicalWork, Page } from './types';
import {
  confirmSignUp,
  getAuthMode,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
  subscribeToAuthChanges,
  type AuthUser,
} from './lib/auth';
import { createWork, listWorks, removeWork } from './lib/worksRepository';

const legalPathByPage: Record<LegalPageId, string> = {
  terms: '/terms',
  privacy: '/privacy',
  'refund-policy': '/refund-policy',
};

function pageFromPath(pathname: string): Page {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const legalPage = (Object.entries(legalPathByPage) as Array<[LegalPageId, string]>)
    .find(([, path]) => path === normalizedPath)?.[0];
  return legalPage ?? 'landing';
}

export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [works, setWorks] = useState<MusicalWork[]>([]);
  const [selectedWork, setSelectedWork] = useState<MusicalWork | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMode] = useState(getAuthMode());
  const [authReady, setAuthReady] = useState(false);
  const [worksLoading, setWorksLoading] = useState(false);
  const [appError, setAppError] = useState('');
  const [authTargetPage, setAuthTargetPage] = useState<'register' | 'dashboard'>('register');

  const navigateLegal = (target: LegalPageId) => {
    const path = legalPathByPage[target];
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setPage(target);
  };

  const navigateHome = () => {
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    setPage('landing');
  };

  useEffect(() => {
    const handlePopState = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let mounted = true;

    getCurrentUser()
      .then((user) => {
        if (!mounted) return;
        setAuthUser(user);
        setAuthReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setAuthReady(true);
      });

    const unsubscribe = subscribeToAuthChanges((user) => {
      setAuthUser(user);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      setWorks([]);
      return;
    }

    let cancelled = false;
    setWorksLoading(true);
    setAppError('');

    listWorks(authUser.id)
      .then((data) => {
        if (cancelled) return;
        setWorks(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setAppError(error instanceof Error ? error.message : 'Failed to load your works.');
      })
      .finally(() => {
        if (!cancelled) {
          setWorksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const navigateProtected = (target: 'register' | 'dashboard') => {
    setAppError('');
    if (!authUser) {
      setAuthTargetPage(target);
      setPage('auth');
      return;
    }
    setPage(target);
  };

  const handleRegister = async (work: MusicalWork) => {
    if (!authUser) {
      setAuthTargetPage('register');
      setPage('auth');
      return;
    }

    setAppError('');
    const savedWork = await createWork(authUser.id, work);
    setWorks((prev) => [savedWork, ...prev]);
    setSelectedWork(savedWork);
    setPage('certificate');
  };

  const handleDelete = async (id: string) => {
    if (!authUser) return;

    setAppError('');
    await removeWork(authUser.id, id);
    setWorks((prev) => prev.filter((w) => w.id !== id));
  };

  const handleViewCertificate = (work: MusicalWork) => {
    setSelectedWork(work);
    setPage('certificate');
  };

  const handleAuthSuccess = (user: AuthUser) => {
    setAuthUser(user);
    setPage(authTargetPage);
  };

  const handleSignIn = async (email: string, password: string) => {
    const user = await signIn(email, password);
    handleAuthSuccess(user);
  };

  const handleSignUp = async (email: string, password: string) => {
    const result = await signUp(email, password);
    if (result.user) {
      handleAuthSuccess(result.user);
    }
    return { confirmationRequired: result.confirmationRequired };
  };

  const handleConfirmSignUp = async (email: string, password: string, confirmationCode: string) => {
    const user = await confirmSignUp(email, password, confirmationCode);
    handleAuthSuccess(user);
  };

  const handleSignOut = async () => {
    await signOut();
    setAuthUser(null);
    setSelectedWork(null);
    navigateHome();
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading secure workspace...</p>
        </div>
      </div>
    );
  }

  switch (page) {
    case 'landing':
      return (
        <>
          {appError && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {appError}
            </div>
          )}
          <LandingHero
            onNavigate={navigateProtected}
            workCount={works.length}
            isAuthenticated={Boolean(authUser)}
            userEmail={authUser?.email ?? null}
            authModeLabel={
              authMode === 'cognito'
                ? 'AWS Cognito secure cloud'
                : authMode === 'supabase'
                  ? 'Supabase secure cloud'
                  : 'Local demo mode'
            }
            onAuthAction={() => {
              setAuthTargetPage('dashboard');
              setPage('auth');
            }}
            onSignOut={() => {
              void handleSignOut();
            }}
            onLegalNavigate={navigateLegal}
          />
        </>
      );
    case 'auth':
      return (
        <AuthScreen
          authMode={authMode}
          targetLabel={authTargetPage === 'register' ? 'new registrations' : 'your dashboard'}
          onBack={() => setPage('landing')}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onConfirmSignUp={handleConfirmSignUp}
          onLegalNavigate={navigateLegal}
        />
      );
    case 'register':
      return (
        <RegisterForm
          onBack={navigateHome}
          onRegister={handleRegister}
          onLegalNavigate={navigateLegal}
        />
      );
    case 'certificate':
      return selectedWork ? (
        <Certificate
          work={selectedWork}
          onBack={navigateHome}
          onDashboard={() => setPage('dashboard')}
          onLegalNavigate={navigateLegal}
        />
      ) : null;
    case 'dashboard':
      return (
        <Dashboard
          works={works}
          isLoading={worksLoading}
          userEmail={authUser?.email ?? null}
          onBack={navigateHome}
          onRegister={() => navigateProtected('register')}
          onViewCertificate={handleViewCertificate}
          onDelete={(id) => {
            void handleDelete(id);
          }}
          onSignOut={() => {
            void handleSignOut();
          }}
          onLegalNavigate={navigateLegal}
        />
      );
    case 'terms':
    case 'privacy':
    case 'refund-policy':
      return (
        <LegalPage
          page={page}
          onBack={navigateHome}
          onNavigate={navigateLegal}
        />
      );
    default:
      return null;
  }
}
