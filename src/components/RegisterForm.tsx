import { useState, useRef } from 'react';
import {
  Upload,
  Music,
  FileAudio,
  FileText,
  AlertCircle,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { generateFileHash, generateRegistrationNumber, generateDigitalFingerprint, formatFileSize } from '../utils/crypto';
import type { LegalPageId, MusicalWork } from '../types';
import LegalFooter from './LegalFooter';

interface Props {
  onBack: () => void;
  onRegister: (work: MusicalWork, file: File) => Promise<void>;
  onLegalNavigate: (page: LegalPageId) => void;
}

const GENRES = [
  'Pop', 'Rock', 'Hip-Hop/Rap', 'R&B/Soul', 'Jazz', 'Classical', 'Electronic/EDM',
  'Country', 'Folk', 'Blues', 'Latin', 'Reggae', 'Metal', 'Indie', 'Gospel',
  'Afrobeats', 'K-Pop', 'Lo-fi', 'Ambient', 'Soundtrack/Score', 'Other'
];

function extractLabeledValue(text: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, 'im'));
  return match?.[1]?.trim() ?? '';
}

function extractSection(text: string, headingPattern: string): string {
  const expression = new RegExp(
    `(?:^|\\n)${headingPattern}:\\s*\\n(?:-+\\s*\\n)?([\\s\\S]*?)(?=\\n[A-Z][A-Z0-9 /&()_-]{3,}:\\s*\\n|\\n={8,}|$)`,
    'i',
  );
  return text.match(expression)?.[1]?.trim() ?? '';
}

export default function RegisterForm({ onBack, onRegister, onLegalNavigate }: Props) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [coArtists, setCoArtists] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [lyricsFileName, setLyricsFileName] = useState('');
  const [isLyricsDragging, setIsLyricsDragging] = useState(false);
  const [masterSheetFileName, setMasterSheetFileName] = useState('');
  const [masterSheetMessage, setMasterSheetMessage] = useState('');
  const [isMasterSheetDragging, setIsMasterSheetDragging] = useState(false);
  const [dateCreated, setDateCreated] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lyricsInputRef = useRef<HTMLInputElement>(null);
  const masterSheetInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const validateAndSetFile = (audioFile: File) => {
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm'];
    const validExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.webm'];
    const extension = audioFile.name.substring(audioFile.name.lastIndexOf('.')).toLowerCase();

    if (validTypes.includes(audioFile.type) || validExtensions.includes(extension)) {
      setFile(audioFile);
      setError('');
    } else {
      setError('Please upload a valid audio file (MP3, WAV, FLAC, OGG, AAC, M4A).');
    }
  };

  const loadMasterSheet = async (masterSheetFile: File) => {
    const extension = masterSheetFile.name.slice(masterSheetFile.name.lastIndexOf('.')).toLowerCase();
    const isTextFile = masterSheetFile.type.startsWith('text/') || ['.txt', '.md', '.markdown'].includes(extension);

    if (!isTextFile) {
      setError('Please use a TXT or MD master sheet.');
      return;
    }

    if (masterSheetFile.size > 2 * 1024 * 1024) {
      setError('The master sheet must be 2 MB or smaller.');
      return;
    }

    try {
      const text = (await masterSheetFile.text()).replace(/\r\n?/g, '\n');
      const importedTitle = extractLabeledValue(text, 'Track Name');
      const importedArtist = extractLabeledValue(text, 'Artist / Producer');
      const importedGenre = extractLabeledValue(text, 'Primary Genre');
      const importedCoArtists = extractLabeledValue(text, 'Co-Artists / Contributors');
      const pitch = extractSection(text, 'TRACK DESCRIPTION \\/ MARKETING PITCH');
      const importedLyrics = extractSection(text, '(?:SONG )?LYRICS(?: \\/ SONG TEXT)?');
      const bpm = extractLabeledValue(text, 'BPM (Tempo)');
      const keySignature = extractLabeledValue(text, 'Key Signature');
      const duration = extractLabeledValue(text, 'Duration');
      const mood = extractLabeledValue(text, 'Emotional Mood');
      const vibe = extractLabeledValue(text, 'Auditory Vibe');
      const instruments = extractLabeledValue(text, 'Instruments');
      const streamingUrl = extractLabeledValue(text, 'Streaming Master URL');

      if (!importedTitle && !importedArtist && !importedGenre && !pitch) {
        setError('This file does not look like an OGBeatz master sheet.');
        return;
      }

      const technicalDetails = [
        bpm ? `BPM: ${bpm}` : '',
        keySignature ? `Key: ${keySignature}` : '',
        duration ? `Duration: ${duration}` : '',
        mood ? `Mood: ${mood}` : '',
        vibe ? `Vibe: ${vibe}` : '',
        instruments ? `Instruments: ${instruments}` : '',
      ].filter(Boolean).join(' • ');

      if (importedTitle) setTitle(importedTitle);
      if (importedArtist) setArtist(importedArtist);
      if (importedCoArtists) setCoArtists(importedCoArtists);
      if (importedGenre) setGenre(importedGenre);
      if (pitch || technicalDetails) {
        setDescription([pitch, technicalDetails].filter(Boolean).join('\n\n'));
      }
      if (importedLyrics) {
        setLyrics(importedLyrics);
        setLyricsFileName(masterSheetFile.name);
      }

      setMasterSheetFileName(masterSheetFile.name);
      setMasterSheetMessage(
        streamingUrl && streamingUrl !== 'N/A'
          ? 'Details imported. Upload the matching audio file separately so EZ Copyright can hash the exact file.'
          : 'Details imported. Review the fields, add the creation date, and upload the matching audio file.',
      );
      setError('');
    } catch {
      setError('The master sheet could not be read. Please try a plain text file.');
    }
  };

  const handleMasterSheetDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsMasterSheetDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      void loadMasterSheet(droppedFile);
    }
  };

  const loadLyricsFile = async (lyricsFile: File) => {
    const dotIndex = lyricsFile.name.lastIndexOf('.');
    const extension = dotIndex >= 0 ? lyricsFile.name.slice(dotIndex).toLowerCase() : '';
    const validExtensions = ['.txt', '.md', '.markdown', '.lrc'];
    const isTextFile = lyricsFile.type.startsWith('text/') || validExtensions.includes(extension);

    if (!isTextFile) {
      setError('Please use a TXT, MD, or LRC file for lyrics.');
      return;
    }

    if (lyricsFile.size > 2 * 1024 * 1024) {
      setError('The lyrics file must be 2 MB or smaller.');
      return;
    }

    try {
      const text = (await lyricsFile.text()).replace(/\r\n?/g, '\n');
      if (!text.trim()) {
        setError('The lyrics file is empty.');
        return;
      }

      setLyrics(text);
      setLyricsFileName(lyricsFile.name);
      setError('');
    } catch {
      setError('The lyrics file could not be read. Please try a plain text file.');
    }
  };

  const handleLyricsDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsLyricsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      void loadLyricsFile(droppedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !artist.trim() || !genre || !file) {
      setError('Please fill in all required fields and upload an audio file.');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      setProcessingStep('Analyzing audio file...');
      await new Promise(resolve => setTimeout(resolve, 800));

      setProcessingStep('Generating cryptographic hash...');
      const fileHash = await generateFileHash(file);
      await new Promise(resolve => setTimeout(resolve, 600));

      setProcessingStep('Creating digital fingerprint...');
      const timestamp = new Date().toISOString();
      const fingerprint = await generateDigitalFingerprint(title, artist, timestamp, fileHash);
      await new Promise(resolve => setTimeout(resolve, 700));

      setProcessingStep('Uploading encrypted private copy...');
      const registrationNumber = generateRegistrationNumber();
      await new Promise(resolve => setTimeout(resolve, 500));

      const work: MusicalWork = {
        id: crypto.randomUUID(),
        title: title.trim(),
        artist: artist.trim(),
        coArtists: coArtists.trim(),
        genre,
        description: description.trim(),
        lyrics: lyrics.trim(),
        dateCreated: dateCreated || new Date().toISOString().split('T')[0],
        dateRegistered: timestamp,
        registrationNumber,
        digitalFingerprint: fingerprint,
        fileHash: fileHash.toUpperCase(),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'audio',
        status: 'registered',
      };

      await onRegister(work, file);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred during registration. Please try again.');
      setIsProcessing(false);
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
            <img src="/ez-way-logo.png" alt="THE EZ WAY" className="w-7 h-7 object-contain" />
            <span className="font-bold text-white">Register New Work</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {isProcessing && (
          <div className="fixed inset-0 bg-neutral-950/90 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-neutral-900 border border-orange-500/30 rounded-3xl p-10 max-w-md w-full mx-4 text-center shadow-2xl shadow-orange-900/30">
              <div className="relative inline-flex mb-6">
                <div className="w-20 h-20 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
                <Sparkles className="w-8 h-8 text-orange-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Processing Your Work</h3>
              <p className="text-orange-300 animate-pulse">{processingStep}</p>
            </div>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Copyright Evidence Record
          </h1>
          <p className="text-white/50">Document your musical work with a local hash, timestamp, and downloadable certificate.</p>
        </div>

        <div className="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-white/70 leading-relaxed">
              This tool creates an evidence record on your device. It is not an official copyright filing.
              For stronger legal protection, keep your source files and register the work with the U.S. Copyright Office.
              <a
                href="https://www.copyright.gov/registration/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 ml-2"
              >
                Official registration
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-400" />
              Import OGBeatz Master Sheet
            </h2>
            <p className="text-sm text-white/45 mb-4">
              Optional: import a studio master sheet to fill the work details automatically.
            </p>
            <div
              onDrop={handleMasterSheetDrop}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsMasterSheetDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsMasterSheetDragging(true);
              }}
              onDragLeave={() => setIsMasterSheetDragging(false)}
              className={`rounded-2xl border-2 border-dashed p-6 transition-all ${
                isMasterSheetDragging
                  ? 'border-orange-400 bg-orange-500/10'
                  : 'border-white/20 bg-black/10 hover:border-orange-500/40'
              }`}
            >
              <input
                ref={masterSheetInputRef}
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="hidden"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    void loadMasterSheet(selectedFile);
                  }
                  e.currentTarget.value = '';
                }}
              />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10">
                    <FileText className="w-6 h-6 text-orange-300" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Drop the master sheet here</p>
                    <p className="text-sm text-white/40">TXT or MD • Maximum 2 MB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => masterSheetInputRef.current?.click()}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 cursor-pointer"
                >
                  Choose master sheet
                </button>
              </div>
              {masterSheetFileName && (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Imported {masterSheetFileName}
                  </div>
                  <p className="mt-1 text-xs text-emerald-100/70">{masterSheetMessage}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FileAudio className="w-5 h-5 text-orange-400" />
              Audio File <span className="text-red-400">*</span>
            </h2>
            <div
              onDrop={handleFileDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
                file
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-white/20 hover:border-orange-500/50 hover:bg-orange-500/5'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
              />
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  <div>
                    <p className="font-semibold text-white">{file.name}</p>
                    <p className="text-sm text-white/40">{formatFileSize(file.size)} • {file.type || 'audio file'}</p>
                  </div>
                  <p className="text-xs text-emerald-400">Click to change file</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="w-12 h-12 text-white/30" />
                  <div>
                    <p className="font-semibold text-white">Drop your audio file here</p>
                    <p className="text-sm text-white/40">or click to browse • MP3, WAV, FLAC, OGG, AAC</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Music className="w-5 h-5 text-orange-400" />
              Work Details
            </h2>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Title of Work <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter the title of your musical work"
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Primary Artist / Author <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Your name or artist name"
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Co-Artists / Contributors
                </label>
                <input
                  type="text"
                  value={coArtists}
                  onChange={(e) => setCoArtists(e.target.value)}
                  placeholder="Separate names with commas"
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Genre <span className="text-red-400">*</span>
                </label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition appearance-none"
                >
                  <option value="" className="bg-neutral-900">Select genre</option>
                  {genre && !GENRES.includes(genre) && (
                    <option value={genre} className="bg-neutral-900">{genre} (imported)</option>
                  )}
                  {GENRES.map(item => (
                    <option key={item} value={item} className="bg-neutral-900">{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Date of Creation
                </label>
                <input
                  type="date"
                  value={dateCreated}
                  onChange={(e) => setDateCreated(e.target.value)}
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the work (mood, inspiration, instruments used...)"
                  rows={5}
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition resize-y"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Lyrics (type, paste, or drag and drop)
                </label>
                <div
                  onDrop={handleLyricsDrop}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setIsLyricsDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsLyricsDragging(true);
                  }}
                  onDragLeave={() => setIsLyricsDragging(false)}
                  className={`rounded-2xl border-2 border-dashed p-4 transition-all ${
                    isLyricsDragging
                      ? 'border-orange-400 bg-orange-500/10'
                      : 'border-white/15 bg-white/[0.03] hover:border-orange-500/35'
                  }`}
                >
                  <input
                    ref={lyricsInputRef}
                    type="file"
                    accept=".txt,.md,.markdown,.lrc,text/plain,text/markdown"
                    className="hidden"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) {
                        void loadLyricsFile(selectedFile);
                      }
                      e.currentTarget.value = '';
                    }}
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                        <Upload className="w-5 h-5 text-orange-300" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Drop a lyrics file here</p>
                        <p className="text-xs text-white/40">TXT, MD, or LRC • Maximum 2 MB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => lyricsInputRef.current?.click()}
                      className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 cursor-pointer"
                    >
                      Choose lyrics file
                    </button>
                  </div>

                  {lyricsFileName && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      Loaded {lyricsFileName}. You can edit the lyrics below.
                    </div>
                  )}

                  <textarea
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    placeholder="Type or paste lyrics here, or drop a TXT, MD, or LRC file above..."
                    rows={8}
                    className="mt-4 w-full bg-black/20 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition resize-y font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
              type="submit"
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white px-8 py-4 rounded-2xl text-lg font-semibold shadow-2xl shadow-orange-900/50 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              {isProcessing ? 'Processing...' : 'Generate Evidence Certificate'}
            </button>
          </div>

          <p className="text-xs text-white/30 text-center">
            By continuing, you confirm that you are the rightful creator or authorized representative of this work.
            Your file is hashed locally, then uploaded through an encrypted, temporary link to private storage.
          </p>
        </form>
      </div>
      <LegalFooter onNavigate={onLegalNavigate} />
    </div>
  );
}
