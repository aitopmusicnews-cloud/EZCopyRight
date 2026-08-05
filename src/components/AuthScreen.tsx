import { useState } from 'react';
import { ArrowLeft, LockKeyhole, Mail, MailCheck, Shield, ShieldAlert } from 'lucide-react';
import type { AuthMode } from '../lib/auth';

interface Props {
  authMode: AuthMode;
  targetLabel: string;
  onBack: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<{ confirmationRequired: boolean }>;
  onConfirmSignUp: (email: string, password: string, confirmationCode: string) => Promise<void>;
}

export default function AuthScreen({
  authMode,
  targetLabel,
  onBack,
  onSignIn,
  onSignUp,
  onConfirmSignUp,
}: Props) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const authModeLabel = authMode === 'cognito'
    ? 'AWS Cognito secure cloud'
    : authMode === 'supabase'
      ? 'Supabase secure cloud'
      : 'Local demo fallback';

  const switchMode = () => {
    setIsSignUp((value) => !value);
    setAwaitingConfirmation(false);
    setConfirmationCode('');
    setError('');
  };

  const openConfirmationEntry = () => {
    if (!email.trim() || !password) {
      setIsSignUp(true);
      setError('Enter the email and password used to create the account, then choose “Enter confirmation code” again.');
      return;
    }

    setIsSignUp(true);
    setAwaitingConfirmation(true);
    setConfirmationCode('');
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (awaitingConfirmation) {
        await onConfirmSignUp(email, password, confirmationCode);
        return;
      }

      if (isSignUp) {
        const result = await onSignUp(email, password);
        if (result.confirmationRequired) {
          setAwaitingConfirmation(true);
        }
      } else {
        await onSignIn(email, password);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed.';
      if (!awaitingConfirmation && message.toLowerCase().includes('confirmation code')) {
        setIsSignUp(true);
        setAwaitingConfirmation(true);
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-stone-950 to-neutral-950">
      <div className="border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-orange-400" />
            <span className="font-bold text-white">Account Access</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-sm text-orange-200 mb-6">
              <LockKeyhole className="w-4 h-4" />
              Sign in required for {targetLabel.toLowerCase()}
            </div>
            <h1 className="text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
              Secure your Hub records
            </h1>
            <p className="text-white/60 leading-relaxed mb-6">
              Accounts tie your evidence records to a specific identity instead of leaving everything in a shared browser profile.
              AWS Cognito provides managed account registration, email verification, secure sign-in, and session tokens.
            </p>
            <div className="space-y-3 text-sm text-white/65">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">Authenticated access reduces casual tampering and cross-user mixing.</div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">AWS-managed accounts create a stronger foundation for the upcoming cloud database and file storage.</div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">You still need formal copyright registration for stronger legal protection.</div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-neutral-900/80 p-8 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {awaitingConfirmation ? 'Confirm your email' : isSignUp ? 'Create account' : 'Sign in'}
                </h2>
                <p className="text-sm text-white/45 mt-1">Mode: {authModeLabel}</p>
              </div>
              {!awaitingConfirmation && (
                <button
                  type="button"
                  onClick={switchMode}
                  className="text-sm text-orange-300 hover:text-orange-200 cursor-pointer"
                >
                  {isSignUp ? 'Have an account?' : 'Need an account?'}
                </button>
              )}
            </div>

            {authMode === 'local' && (
              <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-white/70 flex gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
                <span>
                  AWS Cognito environment variables are not configured, so this screen is using local demo authentication.
                </span>
              </div>
            )}

            {awaitingConfirmation && (
              <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-white/75 flex gap-3">
                <MailCheck className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" />
                <span>Enter the confirmation code AWS sent to <strong>{email}</strong>.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!awaitingConfirmation && (
                <>
                  <label className="block">
                    <span className="block text-sm text-white/70 mb-2">Email</span>
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <Mail className="w-4 h-4 text-white/35" />
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-transparent text-white placeholder:text-white/25 focus:outline-none"
                        required
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="block text-sm text-white/70 mb-2">Password</span>
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <LockKeyhole className="w-4 h-4 text-white/35" />
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Minimum 8 characters"
                        className="w-full bg-transparent text-white placeholder:text-white/25 focus:outline-none"
                        minLength={8}
                        required
                      />
                    </div>
                  </label>
                </>
              )}

              {awaitingConfirmation && (
                <label className="block">
                  <span className="block text-sm text-white/70 mb-2">Confirmation code</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <MailCheck className="w-4 h-4 text-white/35" />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={confirmationCode}
                      onChange={(event) => setConfirmationCode(event.target.value)}
                      placeholder="Enter the code from your email"
                      className="w-full bg-transparent text-white placeholder:text-white/25 focus:outline-none tracking-widest"
                      required
                      autoFocus
                    />
                  </div>
                </label>
              )}

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 px-5 py-3.5 text-white font-semibold transition hover:from-orange-500 hover:to-amber-500 disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Please wait...'
                  : awaitingConfirmation
                    ? 'Confirm and sign in'
                    : isSignUp
                      ? 'Create account'
                      : 'Sign in'}
              </button>

              {!awaitingConfirmation && authMode === 'cognito' && (
                <button
                  type="button"
                  onClick={openConfirmationEntry}
                  className="w-full rounded-2xl border border-orange-500/20 bg-orange-500/5 px-4 py-3 text-sm font-medium text-orange-200 hover:bg-orange-500/10 cursor-pointer"
                >
                  Enter confirmation code
                </button>
              )}

              {awaitingConfirmation && (
                <button
                  type="button"
                  onClick={() => {
                    setAwaitingConfirmation(false);
                    setConfirmationCode('');
                    setError('');
                  }}
                  className="w-full text-sm text-white/50 hover:text-white/75 cursor-pointer"
                >
                  Use a different email
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
