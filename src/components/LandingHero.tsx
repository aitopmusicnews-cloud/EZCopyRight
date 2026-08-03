import type {} from 'react';
import { Shield, Fingerprint, Award, Zap, Music, Lock, ChevronRight, Star, TriangleAlert, ExternalLink } from 'lucide-react';

interface Props {
  onNavigate: (page: 'register' | 'dashboard') => void;
  workCount: number;
  isAuthenticated: boolean;
  userEmail: string | null;
  authModeLabel: string;
  onAuthAction: () => void;
  onSignOut: () => void;
}

export default function LandingHero({
  onNavigate,
  workCount,
  isAuthenticated,
  userEmail,
  authModeLabel,
  onAuthAction,
  onSignOut,
}: Props) {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-950 via-stone-950 to-neutral-950">
          <div className="absolute inset-0 opacity-20">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-orange-500/30 animate-pulse"
                style={{
                  width: `${Math.random() * 6 + 2}px`,
                  height: `${Math.random() * 6 + 2}px`,
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${Math.random() * 3 + 2}s`,
                }}
              />
            ))}
          </div>
          {/* Sound wave decorative lines */}
          <div className="absolute bottom-0 left-0 right-0 h-64 opacity-10">
            <svg viewBox="0 0 1440 320" className="w-full h-full">
              <path
                fill="none"
                stroke="url(#grad1)"
                strokeWidth="2"
                d="M0,160 C120,100 240,200 360,160 C480,120 600,220 720,160 C840,100 960,200 1080,160 C1200,120 1320,200 1440,160"
              />
              <path
                fill="none"
                stroke="url(#grad1)"
                strokeWidth="2"
                d="M0,200 C120,140 240,240 360,200 C480,160 600,260 720,200 C840,140 960,240 1080,200 C1200,160 1320,240 1440,200"
                opacity="0.5"
              />
              <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="50%" stopColor="#ea580c" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          {/* Metallic top gradient */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-60" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-32">
          <div className="flex items-center justify-between gap-4 mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
              <Shield className="w-4 h-4 text-orange-400" />
              {authModeLabel}
            </div>
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <span className="hidden sm:block text-sm text-white/45">{userEmail}</span>
                <button
                  onClick={onSignOut}
                  className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={onAuthAction}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
          <div className="text-center">
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <img
                src="/logo.png"
                alt="CTS Management Hub"
                className="w-36 h-36 sm:w-44 sm:h-44 object-contain drop-shadow-2xl"
                style={{ filter: 'drop-shadow(0 0 30px rgba(245, 158, 11, 0.25))' }}
              />
            </div>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-orange-500/30 rounded-full px-4 py-2 mb-8">
              <Shield className="w-4 h-4 text-orange-400" />
              <span className="text-sm text-white/80">Trusted by 50,000+ musicians worldwide</span>
            </div>

            <h1 className="text-5xl sm:text-7xl font-bold text-white mb-6 tracking-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
              Protect Your
              <span className="block bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
                Musical Legacy
              </span>
            </h1>

            <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
              Create a dated evidence record for your music with local hashing, fingerprinting, and a downloadable certificate.
              Use it to document your work before formal copyright registration.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={() => onNavigate('register')}
                className="group flex items-center gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white px-8 py-4 rounded-2xl text-lg font-semibold shadow-2xl shadow-orange-900/50 transition-all duration-300 hover:scale-105 hover:shadow-orange-800/60 cursor-pointer"
              >
                <Music className="w-5 h-5" />
                Register Your Work
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              {workCount > 0 && (
                <button
                  onClick={() => onNavigate('dashboard')}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur text-white px-8 py-4 rounded-2xl text-lg font-medium border border-white/20 transition-all duration-300 cursor-pointer"
                >
                  View My Works ({workCount})
                </button>
              )}
            </div>

            {/* Stats */}
            <div className="mt-20 grid grid-cols-3 gap-8 max-w-3xl mx-auto">
              {[
                { value: '256-bit', label: 'SHA Encryption' },
                { value: '<5s', label: 'Certificate Generation' },
                { value: 'Local', label: 'Processed On Your Device' },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-white mb-1">{stat.value}</div>
                  <div className="text-sm text-white/50">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-neutral-950 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
              How CTS Management Hub Helps You
            </h2>
            <p className="text-lg text-white/50 max-w-xl mx-auto">
              Three powerful layers of protection for your creative works
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Fingerprint,
                title: 'Digital Fingerprint',
                desc: 'Every file generates a unique SHA-256 cryptographic hash — your work\'s permanent digital DNA.',
                color: 'from-orange-500 to-amber-600',
                bg: 'bg-orange-500/10',
                border: 'border-orange-500/20',
              },
              {
                icon: Award,
                title: 'Evidence Certificate',
                desc: 'Generate a clean record with work details, timestamp, and file fingerprint for your documentation.',
                color: 'from-amber-500 to-yellow-600',
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/20',
              },
              {
                icon: Lock,
                title: 'Dated Proof Record',
                desc: 'Capture a precise timestamp tied to your file hash so you can document when this version existed.',
                color: 'from-yellow-500 to-orange-600',
                bg: 'bg-yellow-500/10',
                border: 'border-yellow-500/20',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className={`relative group rounded-3xl ${feature.bg} border ${feature.border} p-8 transition-all duration-300 hover:scale-105`}
              >
                <div className={`inline-flex p-3 rounded-2xl bg-gradient-to-br ${feature.color} shadow-lg mb-6`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                <p className="text-white/50 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Process Section */}
      <div className="bg-neutral-900 py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
              Register in 3 Simple Steps
            </h2>
          </div>

          <div className="space-y-8">
            {[
              { step: '01', title: 'Upload Your Work', desc: 'Upload your audio file (MP3, WAV, FLAC, etc.) along with work details.' },
              { step: '02', title: 'Generate Fingerprint', desc: 'Our system creates a unique SHA-256 digital fingerprint of your file.' },
              { step: '03', title: 'Save Your Record', desc: 'Download your evidence certificate, then file formal registration if you need stronger legal protection.' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-6 group">
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-600 to-amber-700 flex items-center justify-center shadow-lg shadow-orange-900/30">
                  <span className="text-xl font-bold text-white">{item.step}</span>
                </div>
                <div className="pt-2">
                  <h3 className="text-lg font-bold text-white mb-1">{item.title}</h3>
                  <p className="text-white/50">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <button
              onClick={() => onNavigate('register')}
              className="group inline-flex items-center gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white px-10 py-4 rounded-2xl text-lg font-semibold shadow-2xl shadow-orange-900/50 transition-all duration-300 hover:scale-105 cursor-pointer"
            >
              <Zap className="w-5 h-5" />
              Start Protecting Your Music
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-neutral-900 py-20 border-y border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-8 sm:p-10">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
                <TriangleAlert className="w-6 h-6 text-amber-300" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Use This As Evidence, Not As A Government Filing
                </h2>
                <p className="text-white/65 max-w-3xl leading-relaxed mb-6">
                  CTS Management Hub creates a private evidence record on your device. It does not replace registration with the U.S. Copyright Office.
                  If you want stronger legal standing, keep your source files and register the work officially.
                </p>
                <div className="grid sm:grid-cols-3 gap-4 mb-6">
                  {[
                    'Keep dated session files, stems, and exports.',
                    'Save the certificate, file hash, and record number.',
                    'Register the composition and sound recording when appropriate.',
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                      {item}
                    </div>
                  ))}
                </div>
                <a
                  href="https://www.copyright.gov/registration/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  U.S. Copyright Office Registration
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonials */}
      <div className="bg-neutral-950 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
              Trusted by Artists
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Sarah Chen', role: 'Independent Artist', quote: 'Finally, a fast and reliable way to timestamp my demos before sharing them.' },
              { name: 'Marcus Taylor', role: 'Producer', quote: 'The digital fingerprint gives me peace of mind with every beat I create.' },
              { name: 'Luna Rivera', role: 'Songwriter', quote: 'I register every song here before pitching. The certificates are incredibly professional.' },
            ].map((t, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-orange-500/20 transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-orange-400 text-orange-400" />
                  ))}
                </div>
                <p className="text-white/70 mb-4 italic">"{t.quote}"</p>
                <div>
                  <div className="font-semibold text-white">{t.name}</div>
                  <div className="text-sm text-white/40">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-neutral-950 border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src="/logo.png" alt="CTS Management Hub" className="w-8 h-8 object-contain" />
            <span className="font-bold text-white text-lg">CTS Management Hub</span>
          </div>
          <p className="text-sm text-white/30">© {new Date().getFullYear()} CTS Management Hub. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
