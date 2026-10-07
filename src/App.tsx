import { useState, useEffect } from 'react';
import LandingHero from './components/LandingHero';
import RegisterForm from './components/RegisterForm';
import Certificate from './components/Certificate';
import Dashboard from './components/Dashboard';
import LegalPage from './components/LegalPage';
import AgentConsole from './components/AgentConsole';
import type { LegalPageId, MusicalWork, Page } from './types';
import {
  getCurrentUser,
  signIn,
  signOut,
  subscribeToAuthChanges,
  type AuthUser,
} from './lib/auth';
import { createWork, getWorkAudioUrl, listWorks, removeWork } from './lib/worksRepository';
import { getBillingStatus, openBillingPortal, startCheckout, type BillingStatus } from './lib/billing';
import { getAgentAccess } from './lib/agent';

const AUTH_TARGET_KEY = 'ezcopyright_auth_target';
const AFTER_AUTH_KEY = 'ezcopyright_after_auth';

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
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [agentAllowed, setAgentAllowed] = useState(false);
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
    if (!authReady || !authUser) return;

    const target = sessionStorage.getItem(AUTH_TARGET_KEY);
    const afterAuth = sessionStorage.getItem(AFTER_AUTH_KEY);
    sessionStorage.removeItem(AUTH_TARGET_KEY);
    sessionStorage.removeItem(AFTER_AUTH_KEY);

    if (afterAuth === 'checkout') {
      void startCheckout().catch((error) => {
        setAppError(error instanceof Error ? error.message : 'Checkout could not be opened.');
      });
      return;
    }

    if (target === 'register' || target === 'dashboard') {
      setPage(target);
    }
  }, [authReady, authUser]);

  useEffect(() => {
    if (!authReady || !postCheckout) return;

    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    if (authUser) {
      setPostCheckout(false);
      setPage('dashboard');
      return;
    }

    beginAuth('dashboard');
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

  useEffect(() => {
    if (!authUser) {
      setAgentAllowed(false);
      return;
    }

    let cancelled = false;
    getAgentAccess()
      .then((allowed) => {
        if (!cancelled) setAgentAllowed(allowed);
      })
      .catch(() => {
        if (!cancelled) setAgentAllowed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const beginAuth = (target: 'register' | 'dashboard', afterAuth?: 'checkout') => {
    sessionStorage.setItem(AUTH_TARGET_KEY, target);
    if (afterAuth) sessionStorage.setItem(AFTER_AUTH_KEY, afterAuth);
    void signIn('/');
  };

  const navigateProtected = (target: 'register' | 'dashboard') => {
    setAppError('');
    if (!authUser) {
      beginAuth(target);
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
      beginAuth('register');
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

  const handleSubscribe = () => {
    setAppError('');
    if (!authUser) {
      beginAuth('dashboard', 'checkout');
      return;
    }
    void startCheckout().catch((error) => {
      setAppError(error instanceof Error ? error.message : 'Checkout could not be opened.');
    });
  };


  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      // Keep local UI cleanup as a fallback if the auth redirect is interrupted.
    }
    setAuthUser(null);
    setSelectedWork(null);
    setBilling(null);
    setAgentAllowed(false);
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
            onSubscribe={handleSubscribe}
            hasActiveMembership={Boolean(billing?.active)}
            workCount={works.length}
            isAuthenticated={Boolean(authUser)}
            userEmail={authUser?.email ?? null}
            authModeLabel="Microsoft Entra secure sign-in"
            onAuthAction={() => beginAuth('dashboard')}
            onSignOut={() => {
              void handleSignOut();
            }}
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
          agentAllowed={agentAllowed}
          onAgent={() => setPage('agent')}
        />
        </>
      );
    case 'agent':
      return authUser && agentAllowed ? (
        <>
          {errorBanner}
          <AgentConsole
            userEmail={authUser.email}
            onBack={() => setPage('dashboard')}
            onSignOut={() => {
              void handleSignOut();
            }}
          />
        </>
      ) : (
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
            onDelete={(id) => { void handleDelete(id); }}
            onSignOut={() => { void handleSignOut(); }}
            onLegalNavigate={navigateLegal}
            billing={billing}
            onSubscribe={() => { void startCheckout().catch((error) => setAppError(error instanceof Error ? error.message : 'Checkout could not be opened.')); }}
            onManageBilling={() => { void openBillingPortal().catch((error) => setAppError(error instanceof Error ? error.message : 'Billing could not be opened.')); }}
            agentAllowed={agentAllowed}
            onAgent={() => setPage('agent')}
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
