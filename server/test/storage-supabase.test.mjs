import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { createS3Storage } from '../storage.mjs';

const config = { storageProvider: 'supabase', s3Bucket: 'private-audio', maxUploadBytes: 100 };
test('Supabase verification hashes actual streamed bytes, ignoring claimed metadata', async () => {
  const body = Buffer.from('real audio bytes');
  const storage = createS3Storage(config, { client: { send: async () => ({
    Body: Readable.from([body.subarray(0, 4), body.subarray(4)]),
    ContentType: 'audio/wav', Metadata: { sha256: 'forged' },
  }) } });
  const result = await storage.verifyUpload({ objectKey: 'owner/audio' });
  assert.equal(result.size, body.length);
  assert.equal(result.checksumSha256, createHash('sha256').update(body).digest('base64'));
});

test('Supabase verification stops reading oversized audio', async () => {
  const body = Readable.from([Buffer.alloc(101)]);
  const storage = createS3Storage(config, { client: { send: async () => ({ Body: body }) } });
  await assert.rejects(storage.verifyUpload({ objectKey: 'large' }), /exceeds upload limit/);
  assert.equal(body.destroyed, true);
});
