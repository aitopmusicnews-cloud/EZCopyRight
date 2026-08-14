export interface MusicalWork {
  id: string;
  userId?: string;
  title: string;
  artist: string;
  coArtists: string;
  genre: string;
  description: string;
  lyrics: string;
  dateCreated: string;
  dateRegistered: string;
  registrationNumber: string;
  digitalFingerprint: string;
  fileHash: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: 'registered' | 'pending';
}

export type LegalPageId = 'terms' | 'privacy' | 'refund-policy';

export type Page = 'landing' | 'auth' | 'register' | 'dashboard' | 'certificate' | LegalPageId;
