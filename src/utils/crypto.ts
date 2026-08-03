export async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateRegistrationNumber(): string {
  const prefix = 'OGB';
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const seq = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
  return `${prefix}-${year}-${random}-${seq}`;
}

export async function generateDigitalFingerprint(
  title: string,
  artist: string,
  timestamp: string,
  fileHash: string
): Promise<string> {
  const combined = `${title}|${artist}|${timestamp}|${fileHash}`;
  const hash = await generateSHA256(combined);
  // Format as fingerprint blocks
  return hash.toUpperCase().match(/.{1,8}/g)?.join('-') || hash.toUpperCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
