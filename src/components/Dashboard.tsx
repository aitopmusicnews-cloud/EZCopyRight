import { ArrowLeft, Plus, Fingerprint, Calendar, Music2, Eye, Trash2, Search, FileAudio } from 'lucide-react';
import { useState } from 'react';
import { formatFileSize } from '../utils/crypto';
import type { MusicalWork } from '../types';

interface Props {
  works: MusicalWork[];
  isLoading: boolean;
  userEmail: string | null;
  onBack: () => void;
  onRegister: () => void;
  onViewCertificate: (work: MusicalWork) => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
}

export default function Dashboard({ works, isLoading, userEmail, onBack, onRegister, onViewCertificate, onDelete, onSignOut }: Props) {
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filtered = works.filter(w =>
    w.title.toLowerCase().includes(search.toLowerCase()) ||
    w.artist.toLowerCase().includes(search.toLowerCase()) ||
    w.registrationNumber.toLowerCase().includes(search.toLowerCase()) ||
    w.genre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-stone-950 to-neutral-950">
      {/* Header */}
      <div className="border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="CTS Management Hub" className="w-7 h-7 object-contain" />
              <span className="font-bold text-white">My Registered Works</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {userEmail && <span className="hidden md:block text-sm text-white/40">{userEmail}</span>}
            <button
              onClick={onSignOut}
              className="text-sm text-white/60 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition cursor-pointer"
            >
              Sign Out
            </button>
            <button
              onClick={onRegister}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Register New
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Your Protected Works
          </h1>
          <p className="text-white/50">
            {works.length} {works.length === 1 ? 'work' : 'works'} registered and protected
          </p>
        </div>

        {/* Stats Cards */}
        {works.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-2xl font-bold text-white">{works.length}</p>
              <p className="text-xs text-white/40">Total Works</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-2xl font-bold text-emerald-400">{works.filter(w => w.status === 'registered').length}</p>
              <p className="text-xs text-white/40">Registered</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-2xl font-bold text-orange-400">{new Set(works.map(w => w.genre)).size}</p>
              <p className="text-xs text-white/40">Genres</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-2xl font-bold text-amber-400">
                {formatFileSize(works.reduce((acc, w) => acc + w.fileSize, 0))}
              </p>
              <p className="text-xs text-white/40">Total Size</p>
            </div>
          </div>
        )}

        {/* Search */}
        {works.length > 0 && (
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, artist, registration number, or genre..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition"
            />
          </div>
        )}

        {/* Works List */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin mx-auto mb-5" />
            <p className="text-white/45">Loading your protected works...</p>
          </div>
        ) : works.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
              <Music2 className="w-10 h-10 text-white/20" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No works registered yet</h3>
            <p className="text-white/40 mb-8">Start protecting your music by registering your first work.</p>
            <button
              onClick={onRegister}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-600 to-amber-600 text-white px-6 py-3 rounded-2xl font-semibold shadow-lg transition hover:scale-105 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              Register Your First Work
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/40">No works match your search.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((work) => (
              <div
                key={work.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6 hover:bg-white/[0.07] hover:border-orange-500/15 transition-all duration-200 group"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                    <FileAudio className="w-6 h-6 text-orange-400" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-white truncate">{work.title}</h3>
                        <p className="text-sm text-white/50">{work.artist}{work.coArtists ? ` • ${work.coArtists}` : ''}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Registered
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/40">
                      <span className="inline-flex items-center gap-1">
                        <Music2 className="w-3.5 h-3.5" />
                        {work.genre}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(work.dateRegistered).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono">
                        {work.registrationNumber}
                      </span>
                    </div>

                    {/* Fingerprint Preview */}
                    <div className="mt-3 flex items-center gap-2">
                      <Fingerprint className="w-3.5 h-3.5 text-orange-400/50" />
                      <span className="font-mono text-xs text-orange-300/50 truncate">
                        {work.digitalFingerprint.substring(0, 40)}...
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-end gap-3">
                  {deleteConfirm === work.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-300">Delete permanently?</span>
                      <button
                        onClick={() => { onDelete(work.id); setDeleteConfirm(null); }}
                        className="text-xs bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition cursor-pointer"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs bg-white/10 text-white/60 px-3 py-1.5 rounded-lg hover:bg-white/20 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setDeleteConfirm(work.id)}
                        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                      <button
                        onClick={() => onViewCertificate(work)}
                        className="flex items-center gap-1.5 text-xs bg-orange-500/20 text-orange-300 px-4 py-1.5 rounded-lg hover:bg-orange-500/30 transition cursor-pointer font-medium"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Certificate
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
