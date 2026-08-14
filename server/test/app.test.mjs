import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../app.mjs';

const config = {
  nodeEnvironment: 'test',
  cognitoIssuer: 'https://example.test/pool',
  cognitoClientId: 'client-id',
  allowedOrigins: ['https://frontend.example'],
  policyVersion: '2026-08-13',
  maxUploadBytes: 536870912,
};

const storage = {
  createUpload: async () => ({ url: 'https://uploads.example/signed', headers: {} }),
  verifyUpload: async () => ({ size: 2048, contentType: 'audio/wav', checksumSha256: Buffer.from('A'.repeat(64), 'hex').toString('base64') }),
  createDownloadUrl: async () => 'https://downloads.example/signed',
  deleteObject: async () => {},
};

async function request(app, path, init) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('liveness endpoint does not require authentication', async () => {
  const database = { query: async () => ({ rows: [] }) };
  const app = createApp({ database, config, storage, verifyToken: async () => null });
  const response = await request(app, '/health/live');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('protected endpoints reject requests without a bearer token', async () => {
  const database = { query: async () => ({ rows: [] }) };
  const app = createApp({ database, config, storage, verifyToken: async () => null });
  const response = await request(app, '/v1/works');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'authentication_required');
});

test('work creation uses authenticated ownership and server evidence fields', async () => {
  const queries = [];
  const database = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.includes('SELECT * FROM file_uploads')) {
        return { rows: [{
          id: values[0], user_id: values[1], object_key: 'private/user/upload/song.wav',
          file_hash: 'A'.repeat(64), file_name: 'song.wav', file_size: 2048,
          file_type: 'audio/wav', status: 'ready',
        }] };
      }
      if (sql.includes('INSERT INTO works')) {
        return {
          rows: [{
            id: values[0], user_id: values[1], title: values[3], artist: values[4],
            co_artists: values[5], genre: values[6], description: values[7], lyrics: values[8],
            date_created: values[9], date_registered: values[10], registration_number: values[11],
            digital_fingerprint: values[12], file_hash: values[13], file_name: values[14],
            file_size: values[15], file_type: values[16], status: 'registered',
            upload_id: values[17], object_key: values[18],
          }],
        };
      }
      return { rows: [] };
    },
  };
  const app = createApp({
    database,
    config,
    storage,
    verifyToken: async () => ({ userId: 'cognito-user-123', email: 'artist@example.com' }),
  });
  const response = await request(app, '/v1/works', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'e4d3651d-c542-4e80-b14d-0bfb11e265f1',
      uploadId: '2e847dda-f11b-44e7-8215-2f8cf0470a2f',
      title: 'Original Song', artist: 'The Artist', coArtists: '', genre: 'R&B',
      description: '', lyrics: '', dateCreated: '2026-08-13',
      fileHash: 'A'.repeat(64), fileName: 'song.wav', fileSize: 2048, fileType: 'audio/wav',
    }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.work.userId, 'cognito-user-123');
  assert.equal(body.work.status, 'registered');
  assert.equal(body.work.hasStoredAudio, true);
  assert.match(body.work.registrationNumber, /^EZ-\d{4}-[A-F0-9]{12}$/);
  assert.equal(body.work.digitalFingerprint.length, 64);
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO audit_events')), true);
});

test('private upload is signed and verified before use', async () => {
  const uploads = new Map();
  const database = {
    async query(sql, values = []) {
      if (sql.includes('INSERT INTO file_uploads')) {
        uploads.set(values[0], {
          id: values[0], user_id: values[1], object_key: values[2], file_hash: values[3],
          file_name: values[4], file_size: values[5], file_type: values[6],
          checksum_sha256: values[7], status: 'pending',
        });
      }
      if (sql.includes("SELECT * FROM file_uploads")) return { rows: [uploads.get(values[0])].filter(Boolean) };
      return { rows: [] };
    },
  };
  const app = createApp({
    database, config, storage,
    verifyToken: async () => ({ userId: 'cognito-user-123', email: 'artist@example.com' }),
  });
  const created = await request(app, '/v1/uploads', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({
      fileHash: 'A'.repeat(64), fileName: 'song.wav', fileSize: 2048, fileType: 'audio/wav',
    }),
  });
  assert.equal(created.status, 201);
  const upload = await created.json();
  assert.equal(upload.uploadUrl, 'https://uploads.example/signed');
  const completed = await request(app, `/v1/uploads/${upload.uploadId}/complete`, {
    method: 'POST', headers: { authorization: 'Bearer test' },
  });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).status, 'ready');
});
