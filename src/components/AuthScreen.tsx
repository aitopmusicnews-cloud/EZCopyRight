import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { LegalPageId } from '../types';
import LegalFooter from './LegalFooter';

interface Props {
  targetLabel: string;
  onBack: () => void;
  onContinue: () => void;
  postCheckout?: boolean;
  onLegalNavigate: (page: LegalPageId) => void;
}

export default function AuthScreen({
  targetLabel,
  onBack,
  onContinue,
  postCheckout = false,
  onLegalNavigate,
}: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-stone-950 to-neutral-950">
      <div className="border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/ez-way-logo-new.webp" alt="THE EZ WAY" className="w-7 h-7 object-contain" />
            <span className="font-bold text-white">Account Access</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 sm:p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-6">
            <LockKeyhole className="w-7 h-7 text-orange-300" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-sm text-orange-200 mb-5">
            <ShieldCheck className="w-4 h-4" />
            Microsoft Entra External ID
          </div>
          <h1 className="text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            {postCheckout ? 'Access your membership' : 'Secure account sign-in'}
          </h1>
          <p className="text-white/60 leading-relaxed max-w-xl mx-auto mb-8">
            Continue to the secure EZ Way Copyrights customer sign-in to access {targetLabel.toLowerCase()}.
            Your password and sign-in verification are handled by Microsoft Entra External ID.
          </p>
          <button
            onClick={onContinue}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-neutral-950 font-bold transition cursor-pointer"
          >
            Continue to secure sign-in
          </button>
          <p className="text-xs text-white/40 mt-5">
            By creating or using an account, you agree to the Terms of Service and acknowledge the Privacy Policy.
          </p>
        </div>

        <LegalFooter onNavigate={onLegalNavigate} />
      </div>
    </div>
  );
}
