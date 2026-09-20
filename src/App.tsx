import { useState, useEffect } from 'react';
import LandingHero from './components/LandingHero';
import RegisterForm from './components/RegisterForm';
import Certificate from './components/Certificate';
import Dashboard from './components/Dashboard';
import AuthScreen from './components/AuthScreen';
import LegalPage from './components/LegalPage';
import type { LegalPageId, MusicalWork, Page } from './types';
import {
  completeNewPassword,
  confirmForgotPassword,
  confirmSignUp,
  forgotPassword,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
  subscribeToAuthChanges,
  type AuthUser,
} from './lib/auth';
import { createWork, getWorkAudioUrl, listWorks, removeWork } from './lib/worksRepository';
import { getBillingStatus, openBillingPortal, startCheckout, type BillingStatus } from './lib/billing';

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
  const [authReady, setAuthReady] = useState(false);
  const [worksLoading, setWorksLoading] = useState(false);
  const [appError, setAppError] = useState('');
  const [authTargetPage, setAuthTargetPage] = useState<'register' | 'dashboard'>('register');
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [postCheckout, setPostCheckout] = useState(
    () => new URLSearchParams(window.location.search).get('billing') === 'success',
  );

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
    if (!authReady || !postCheckout) return;

    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    if (authUser) {
      setPostCheckout(false);
      return;
    }

    setAuthTargetPage('dashboard');
    setPage('auth');
  }, [authReady, authUser, postCheckout]);

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

  useEffect(() => {
    if (!authUser) {
      setBilling(null);
      return;
    }
    getBillingStatus()
      .then(setBilling)
      .catch((error) => {
        setBilling({
          configured: true,
          active: false,
          status: 'error',
          used: 0,
          limit: 5,
          remaining: 0,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        });
        setAppError(error instanceof Error ? error.message : 'Could not load your membership status.');
      });
  }, [authUser]);

  const navigateProtected = (target: 'register' | 'dashboard') => {
    setAppError('');
    if (!authUser) {
      setAuthTargetPage(target);
      setPage('auth');
      return;
    }
    if (target === 'register' && billing && !billing.active) {
      setPage('dashboard');
      return;
    }
    setPage(target);
  };

  const handleRegister = async (work: MusicalWork, file: File) => {
    if (!authUser) {
      setAuthTargetPage('register');
      setPage('auth');
      return;
    }

    setAppError('');
    const savedWork = await createWork(authUser.id, work, file);
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

  const handleDownloadAudio = async (id: string) => {
    setAppError('');
    try {
      const url = await getWorkAudioUrl(id);
      window.location.assign(url);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'The stored audio could not be downloaded.');
    }
  };

  const handleAuthSuccess = (user: AuthUser) => {
    setAuthUser(user);
    setPostCheckout(false);
    setPage(authTargetPage);
  };

  const handleSignIn = async (email: string, password: string) => {
    const result = await signIn(email, password);
    if (result.user) handleAuthSuccess(result.user);
    return result.user
      ? { newPasswordRequired: false as const }
      : {
          newPasswordRequired: true as const,
          session: result.session,
          username: result.username,
        };
  };

  const handleCompleteNewPassword = async (
    email: string,
    username: string,
    newPassword: string,
    session: string,
  ) => {
    const user = await completeNewPassword(email, username, newPassword, session);
    handleAuthSuccess(user);
  };

  const handleForgotPassword = async (email: string) => {
    await forgotPassword(email);
  };

  const handleResetPassword = async (email: string, confirmationCode: string, newPassword: string) => {
    await confirmForgotPassword(email, confirmationCode, newPassword);
    const result = await signIn(email, newPassword);
    if (!result.user) throw new Error('Password reset completed, but your account still requires another setup step.');
    handleAuthSuccess(result.user);
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
    try {
      await signOut();
    } catch {
      // Sign-out should always return the user to the landing page, even if the
      // remote revoke fails. Local session storage is cleared inside signOut().
    }
    setAuthUser(null);
    setSelectedWork(null);
    setBilling(null);
    setWorks([]);
    setAppError('');
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

  const errorBanner = appError ? (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md rounded-2xl border border-red-500/30 bg-red-500/15 px-4 py-3 text-sm text-red-100 shadow-lg flex items-start gap-3">
      <span className="flex-1">{appError}</span>
      <button
        onClick={() => setAppError('')}
        className="text-red-200/70 hover:text-white transition cursor-pointer"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  ) : null;

  switch (page) {
    case 'landing':
      return (
        <>
          {errorBanner}
          <LandingHero
            onNavigate={navigateProtected}
            onSubscribe={() => {
              void startCheckout().catch((error) => setAppError(error instanceof Error ? error.message : 'Checkout could not be opened.'));
            }}
            hasActiveMembership={Boolean(billing?.active)}
            workCount={works.length}
            isAuthenticated={Boolean(authUser)}
            userEmail={authUser?.email ?? null}
            authModeLabel="AWS Cognito secure cloud"
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
        <>
        {errorBanner}
        <AuthScreen
          targetLabel={authTargetPage === 'register' ? 'new registrations' : 'your dashboard'}
          onBack={() => setPage('landing')}
          onSignIn={handleSignIn}
          onCompleteNewPassword={handleCompleteNewPassword}
          onForgotPassword={handleForgotPassword}
          onResetPassword={handleResetPassword}
          postCheckout={postCheckout}
          onSignUp={handleSignUp}
          onConfirmSignUp={handleConfirmSignUp}
          onLegalNavigate={navigateLegal}
        />
        </>
      );
    case 'register':
      return (
        <>
        {errorBanner}
        <RegisterForm
          onBack={navigateHome}
          onRegister={handleRegister}
          onLegalNavigate={navigateLegal}
        />
        </>
      );
    case 'certificate':
      return selectedWork ? (
        <>
        {errorBanner}
        <Certificate
          work={selectedWork}
          onBack={navigateHome}
          onDashboard={() => setPage('dashboard')}
          onLegalNavigate={navigateLegal}
        />
        </>
      ) : null;
    case 'dashboard':
      return (
        <>
        {errorBanner}
        <Dashboard
          works={works}
          isLoading={worksLoading}
          userEmail={authUser?.email ?? null}
          onBack={navigateHome}
          onRegister={() => navigateProtected('register')}
          onViewCertificate={handleViewCertificate}
          onDownloadAudio={(id) => { void handleDownloadAudio(id); }}
          onDelete={(id) => {
            void handleDelete(id);
          }}
          onSignOut={() => {
            void handleSignOut();
          }}
          onLegalNavigate={navigateLegal}
          billing={billing}
          onSubscribe={() => {
            void startCheckout().catch((error) => setAppError(error instanceof Error ? error.message : 'Checkout could not be opened.'));
          }}
          onManageBilling={() => {
            void openBillingPortal().catch((error) => setAppError(error instanceof Error ? error.message : 'Billing could not be opened.'));
          }}
        />
        </>
      );
    case 'terms':
    case 'privacy':
    case 'refund-policy':
      return (
        <>
        {errorBanner}
        <LegalPage
          page={page}
          onBack={navigateHome}
          onNavigate={navigateLegal}
        />
        </>
      );
    default:
      return null;
  }
}
