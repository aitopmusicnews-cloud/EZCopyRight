import type { MusicalWork } from '../types';
import { supabase } from './supabase';

const STORAGE_KEY = 'ogbeatz_works';

interface WorkRow {
  id: string;
  user_id: string;
  title: string;
  artist: string;
  co_artists: string;
  genre: string;
  description: string;
  lyrics: string;
  date_created: string;
  date_registered: string;
  registration_number: string;
  digital_fingerprint: string;
  file_hash: string;
  file_name: string;
  file_size: number;
  file_type: string;
  status: 'registered' | 'pending';
}

function loadLocalWorks(): MusicalWork[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLocalWorks(works: MusicalWork[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(works));
}

function fromRow(row: WorkRow): MusicalWork {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    artist: row.artist,
    coArtists: row.co_artists,
    genre: row.genre,
    description: row.description,
    lyrics: row.lyrics,
    dateCreated: row.date_created,
    dateRegistered: row.date_registered,
    registrationNumber: row.registration_number,
    digitalFingerprint: row.digital_fingerprint,
    fileHash: row.file_hash,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    status: row.status,
  };
}

function toRow(work: MusicalWork, userId: string): WorkRow {
  return {
    id: work.id,
    user_id: userId,
    title: work.title,
    artist: work.artist,
    co_artists: work.coArtists,
    genre: work.genre,
    description: work.description,
    lyrics: work.lyrics,
    date_created: work.dateCreated,
    date_registered: work.dateRegistered,
    registration_number: work.registrationNumber,
    digital_fingerprint: work.digitalFingerprint,
    file_hash: work.fileHash,
    file_name: work.fileName,
    file_size: work.fileSize,
    file_type: work.fileType,
    status: work.status,
  };
}

export async function listWorks(userId: string): Promise<MusicalWork[]> {
  if (!supabase) {
    return loadLocalWorks().filter((work) => work.userId === userId);
  }

  const { data, error } = await supabase
    .from('works')
    .select('*')
    .eq('user_id', userId)
    .order('date_registered', { ascending: false });

  if (error) throw error;
  return (data as WorkRow[]).map(fromRow);
}

export async function createWork(userId: string, work: MusicalWork): Promise<MusicalWork> {
  if (!supabase) {
    const works = loadLocalWorks();
    const nextWork = { ...work, userId };
    saveLocalWorks([nextWork, ...works.filter((item) => item.id !== nextWork.id)]);
    return nextWork;
  }

  const { data, error } = await supabase
    .from('works')
    .insert(toRow(work, userId))
    .select()
    .single();

  if (error) throw error;
  return fromRow(data as WorkRow);
}

export async function removeWork(userId: string, workId: string): Promise<void> {
  if (!supabase) {
    const works = loadLocalWorks();
    saveLocalWorks(works.filter((work) => !(work.id === workId && work.userId === userId)));
    return;
  }

  const { error } = await supabase
    .from('works')
    .delete()
    .eq('id', workId)
    .eq('user_id', userId);

  if (error) throw error;
}
