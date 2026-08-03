import { useRef } from 'react';
import { Shield, Download, ArrowLeft, Copy, Check, Fingerprint, FileText, ExternalLink, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { toPng } from 'html-to-image';
import { formatFileSize } from '../utils/crypto';
import type { MusicalWork } from '../types';

interface Props {
  work: MusicalWork;
  onBack: () => void;
  onDashboard: () => void;
}

export default function Certificate({ work, onBack, onDashboard }: Props) {
  const certRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadCertificate = async () => {
    if (!certRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(certRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#0a0a0a',
      });
      const link = document.createElement('a');
      link.download = `CTS-Management-Hub-Certificate-${work.registrationNumber}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to download certificate:', err);
    }
    setDownloading(false);
  };

  const formattedDate = new Date(work.dateRegistered).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  const fingerprintBlocks = work.digitalFingerprint.split('-');

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-stone-950 to-neutral-950">
      {/* Header */}
      <div className="border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-white">Evidence Certificate Issued</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onDashboard}
              className="text-sm text-white/60 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition cursor-pointer"
            >
              My Works
            </button>
            <button
              onClick={downloadCertificate}
              disabled={downloading}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Saving...' : 'Download PNG'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        {/* Success banner */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 mb-8 flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Check className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-emerald-300 mb-1">Evidence Record Created</h2>
            <p className="text-emerald-200/60 text-sm">
              Your work "<span className="text-emerald-200">{work.title}</span>" has been fingerprinted and timestamped.
              Your evidence certificate and digital fingerprint are ready below.
            </p>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 mb-8 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-white/70 leading-relaxed">
            This certificate documents file details, a timestamp, and a cryptographic fingerprint. It is not a government-issued copyright registration.
            For stronger legal protection, preserve your source files and register with the U.S. Copyright Office.
          </p>
        </div>

        {/* Certificate */}
        <div ref={certRef} className="bg-neutral-950 rounded-3xl overflow-hidden">
          <div className="border border-white/10 rounded-3xl overflow-hidden">
            {/* Certificate Header */}
            <div className="bg-gradient-to-r from-orange-900/40 via-amber-900/40 to-orange-900/40 border-b border-orange-500/20 p-8 sm:p-10 text-center relative overflow-hidden">
              {/* Decorative metallic lines */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
              
              <div className="flex items-center justify-center gap-3 mb-4">
                <img src="/logo.png" alt="CTS Management Hub" className="w-14 h-14 object-contain" />
                <span className="text-2xl font-bold text-white tracking-wide">CTS Management Hub</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                Certificate of Copyright Evidence
              </h1>
              <p className="text-white/40 text-sm">Digital Music Evidence Record</p>
            </div>

            {/* Certificate Body */}
            <div className="p-8 sm:p-10 space-y-8">
              {/* Registration Number */}
              <div className="text-center">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Record Number</p>
                <p className="text-2xl font-mono font-bold text-orange-400 tracking-wider">{work.registrationNumber}</p>
              </div>

              {/* Work Info */}
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-white/5 rounded-2xl p-5">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Title of Work</p>
                  <p className="text-lg font-semibold text-white">{work.title}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-5">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Primary Author / Artist</p>
                  <p className="text-lg font-semibold text-white">{work.artist}</p>
                </div>
                {work.coArtists && (
                  <div className="bg-white/5 rounded-2xl p-5">
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Co-Artists / Contributors</p>
                    <p className="text-white">{work.coArtists}</p>
                  </div>
                )}
                <div className="bg-white/5 rounded-2xl p-5">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Genre</p>
                  <p className="text-white">{work.genre}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-5">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Date of Creation</p>
                  <p className="text-white">{work.dateCreated}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-5">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Date of Registration</p>
                  <p className="text-white">{formattedDate}</p>
                </div>
              </div>

              {/* File Info */}
              <div className="bg-white/5 rounded-2xl p-5">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Documented File</p>
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-orange-400" />
                  <div>
                    <p className="text-white font-medium">{work.fileName}</p>
                    <p className="text-sm text-white/40">{formatFileSize(work.fileSize)} • {work.fileType}</p>
                  </div>
                </div>
              </div>

              {/* Digital Fingerprint */}
              <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Fingerprint className="w-5 h-5 text-orange-400" />
                  <p className="text-sm font-semibold text-orange-300 uppercase tracking-wider">Digital Fingerprint</p>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {fingerprintBlocks.map((block, i) => (
                    <div key={i} className="bg-neutral-900/80 rounded-lg px-2 py-2 text-center">
                      <span className="font-mono text-xs sm:text-sm text-orange-300 tracking-wider">{block}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-white/30">SHA-256 Cryptographic Hash • Unique & Immutable</p>
                </div>
              </div>

              {/* File SHA-256 Hash */}
              <div className="bg-white/5 rounded-2xl p-5">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-2">File SHA-256 Hash</p>
                <p className="font-mono text-xs text-white/60 break-all leading-relaxed">{work.fileHash}</p>
              </div>

              {/* Description */}
              {work.description && (
                <div className="bg-white/5 rounded-2xl p-5">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Description</p>
                  <p className="text-white/70 text-sm leading-relaxed">{work.description}</p>
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-white/10 pt-6 text-center">
                <div className="flex justify-center mb-3">
                  <img src="/logo.png" alt="CTS Management Hub" className="w-10 h-10 object-contain opacity-50" />
                </div>
                <p className="text-xs text-white/30 leading-relaxed">
                  This certificate confirms that the above-described work was documented with CTS Management Hub on the stated date.
                  The digital fingerprint serves as cryptographic proof of the work's contents at the time this record was created.
                  <br />
                  Certificate ID: {work.id}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons below certificate */}
        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          <button
            onClick={() => copyToClipboard(work.registrationNumber, 'reg')}
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer"
          >
            {copied === 'reg' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied === 'reg' ? 'Copied!' : 'Copy Reg. Number'}
          </button>
          <button
            onClick={() => copyToClipboard(work.digitalFingerprint, 'fp')}
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer"
          >
            {copied === 'fp' ? <Check className="w-4 h-4 text-emerald-400" /> : <Fingerprint className="w-4 h-4" />}
            {copied === 'fp' ? 'Copied!' : 'Copy Fingerprint'}
          </button>
          <button
            onClick={() => copyToClipboard(work.fileHash, 'hash')}
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer"
          >
            {copied === 'hash' ? <Check className="w-4 h-4 text-emerald-400" /> : <ExternalLink className="w-4 h-4" />}
            {copied === 'hash' ? 'Copied!' : 'Copy File Hash'}
          </button>
        </div>
      </div>
    </div>
  );
}
