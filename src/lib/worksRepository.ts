import type { MusicalWork } from '../types';
import { apiRequest, isApiConfigured } from './api';
import { supabase } from './supabase';

const STORAGE_KEY = 'ogbeatz_works';
const AUDIO_BUCKET = 'audio';

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
  storage_path: string | null;
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
    hasStoredAudio: Boolean(row.storage_path),
  uploadId: undefined,
  };
}

function toRow(work: MusicalWork, userId: string): Omit<WorkRow, 'storage_path'> & { storage_path: string | null } {
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
    storage_path: null,
  };
}

function audioPath(userId: string, workId: string, fileName: string): string {
  const safeName = fileName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-180) || 'audio';
  return `${userId}/${workId}/${safeName}`;
}

export async function listWorks(userId: string): Promise<MusicalWork[]> {
  if (isApiConfigured) {
    const response = await apiRequest<{ works: MusicalWork[] }>('/v1/works');
    return response.works;
  }

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

export async function createWork(userId: string, work: MusicalWork, file?: File): Promise<MusicalWork> {
  if (isApiConfigured) {
    if (!file) throw new Error('Select the audio file again to store a private copy.');
    const upload = await apiRequest<{
      uploadId: string;
      uploadUrl: string;
      headers: Record<string, string>;
    }>('/v1/uploads', {
      method: 'POST',
      body: JSON.stringify({
        fileHash: work.fileHash,
        fileName: work.fileName,
        fileSize: work.fileSize,
        fileType: work.fileType,
      }),
    });
    const uploadResponse = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.headers,
      body: file,
    });
    if (!uploadResponse.ok) {
      const responseText = await uploadResponse.text();
      const awsCode = responseText.match(/<Code>([^<]+)<\/Code>/)?.[1];
      throw new Error(
        awsCode
          ? `Private audio upload failed: ${awsCode}.`
          : `Private audio upload failed with status ${uploadResponse.status}.`,
      );
    }
    await apiRequest(`/v1/uploads/${encodeURIComponent(upload.uploadId)}/complete`, { method: 'POST' });
    const response = await apiRequest<{ work: MusicalWork }>('/v1/works', {
      method: 'POST',
      body: JSON.stringify({ ...work, uploadId: upload.uploadId }),
    });
    return response.work;
  }

  if (!supabase) {
    const works = loadLocalWorks();
    const nextWork = { ...work, userId };
    saveLocalWorks([nextWork, ...works.filter((item) => item.id !== nextWork.id)]);
    return nextWork;
  }

  let storagePath: string | null = null;

  if (file) {
    storagePath = audioPath(userId, work.id, work.fileName);
    const { error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, file, { contentType: work.fileType, upsert: false });

    if (uploadError) {
      throw new Error(`Audio upload failed: ${uploadError.message}`);
    }
  }

  const row = toRow(work, userId);
  const { data, error } = await supabase
    .from('works')
    .insert({ ...row, storage_path: storagePath })
    .select()
    .single();

  if (error) {
    if (storagePath) {
      await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);
    }
    throw error;
  }

  return fromRow(data as WorkRow);
}

export async function removeWork(userId: string, workId: string): Promise<void> {
  if (isApiConfigured) {
    await apiRequest<void>(`/v1/works/${encodeURIComponent(workId)}`, { method: 'DELETE' });
    return;
  }

  if (!supabase) {
    const works = loadLocalWorks();
    saveLocalWorks(works.filter((work) => !(work.id === workId && work.userId === userId)));
    return;
  }

  const { data: row } = await supabase
    .from('works')
    .select('storage_path')
    .eq('id', workId)
    .eq('user_id', userId)
    .maybeSingle();

  if (row?.storage_path) {
    await supabase.storage.from(AUDIO_BUCKET).remove([row.storage_path]);
  }

  const { error } = await supabase
    .from('works')
    .delete()
    .eq('id', workId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function getWorkAudioUrl(workId: string): Promise<string> {
  if (isApiConfigured) {
    const response = await apiRequest<{ url: string }>(`/v1/works/${encodeURIComponent(workId)}/audio`);
    return response.url;
  }

  if (!supabase) {
    throw new Error('Audio download is not available in local mode.');
  }

  const { data: row, error: queryError } = await supabase
    .from('works')
    .select('storage_path, user_id')
    .eq('id', workId)
    .maybeSingle();

  if (queryError) throw queryError;
  if (!row?.storage_path) {
    throw new Error('No stored audio found for this record.');
  }

  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(row.storage_path, 300);

  if (error) throw error;
  return data.signedUrl;
}
