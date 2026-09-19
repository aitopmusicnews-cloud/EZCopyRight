import type { MusicalWork } from '../types';
import { getAccessToken } from './auth';
import { API_BASE_URL } from './api';

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Please sign in again to continue.');
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function apiError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => null);
  if (response.status === 401) return new Error('Please sign in again to continue.');
  if (response.status === 402) return new Error('An active subscription is required to register works.');
  if (response.status === 429) return new Error('Your monthly registration limit has been reached.');
  return new Error(payload?.message || payload?.error || fallback);
}

export async function listWorks(_userId: string): Promise<MusicalWork[]> {
  const response = await fetch(`${API_BASE_URL}/v1/works`, {
    headers: await authHeaders(),
  });
  if (!response.ok) throw await apiError(response, 'Could not load registered works.');
  const payload = await response.json();
  return payload.works || [];
}

export async function createWork(_userId: string, work: MusicalWork, file?: File): Promise<MusicalWork> {
  if (!file) throw new Error('An audio file is required to register this work.');

  const uploadResponse = await fetch(`${API_BASE_URL}/v1/uploads`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({
      fileHash: work.fileHash,
      fileName: work.fileName,
      fileSize: work.fileSize,
      fileType: work.fileType,
    }),
  });
  if (!uploadResponse.ok) throw await apiError(uploadResponse, 'Could not create upload link.');
  const upload = await uploadResponse.json();

  const storedResponse = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: upload.headers || { 'Content-Type': work.fileType },
    body: file,
  });
  if (!storedResponse.ok) throw new Error('The audio file could not be uploaded to storage.');

  const completeResponse = await fetch(`${API_BASE_URL}/v1/uploads/${encodeURIComponent(upload.uploadId)}/complete`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: '{}',
  });
  if (!completeResponse.ok) throw await apiError(completeResponse, 'The uploaded audio could not be verified.');

  const workResponse = await fetch(`${API_BASE_URL}/v1/works`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({
      id: work.id,
      uploadId: upload.uploadId,
      title: work.title,
      artist: work.artist,
      coArtists: work.coArtists,
      genre: work.genre,
      description: work.description,
      lyrics: work.lyrics,
      dateCreated: work.dateCreated,
      fileHash: work.fileHash,
      fileName: work.fileName,
      fileSize: work.fileSize,
      fileType: work.fileType,
    }),
  });
  if (!workResponse.ok) throw await apiError(workResponse, 'Could not register this work.');
  const payload = await workResponse.json();
  return payload.work;
}

export async function removeWork(_userId: string, workId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/works/${encodeURIComponent(workId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!response.ok && response.status !== 404) throw await apiError(response, 'Could not delete this work.');
}

export async function getWorkAudioUrl(workId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/v1/works/${encodeURIComponent(workId)}/audio`, {
    headers: await authHeaders(),
  });
  if (!response.ok) throw await apiError(response, 'Could not create download link.');
  const payload = await response.json();
  return payload.url;
}
