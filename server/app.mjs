import { createHash, randomBytes, randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { createCognitoVerifier } from './auth.mjs';

const workSchema = z.object({
  id: z.string().uuid(),
  uploadId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  coArtists: z.string().trim().max(2_000).default(''),
  genre: z.string().trim().min(1).max(80),
  description: z.string().trim().max(10_000).default(''),
  lyrics: z.string().trim().max(250_000).default(''),
  dateCreated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fileHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(2_147_483_648),
  fileType: z.string().trim().min(1).max(120),
});

const uploadSchema = z.object({
  fileHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive(),
  fileType: z.string().trim().min(1).max(120),
});

const consentSchema = z.object({
  policyType: z.enum(['terms', 'privacy', 'refund-policy']),
  policyVersion: z.string().trim().min(1).max(32),
  sourceFlow: z.enum(['signup', 'checkout', 'settings']),
});

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function requestId(request) {
  const supplied = request.get('x-request-id');
  return supplied && /^[0-9a-f-]{36}$/i.test(supplied) ? supplied : randomUUID();
}

function createRegistrationNumber(dateRegistered) {
  const year = dateRegistered.getUTCFullYear();
  return `EZ-${year}-${randomBytes(6).toString('hex').toUpperCase()}`;
}

function createFingerprint(userId, work, dateRegistered) {
  return createHash('sha256')
    .update([userId, work.title, work.artist, dateRegistered.toISOString(), work.fileHash.toUpperCase()].join('|'))
    .digest('hex')
    .toUpperCase();
}

function createObjectKey(userId, uploadId, fileName) {
  const owner = createHash('sha256').update(userId).digest('hex').slice(0, 40);
  const safeName = fileName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-180) || 'audio';
  return `private/${owner}/${uploadId}/${safeName}`;
}

function fromWorkRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    artist: row.artist,
    coArtists: row.co_artists,
    genre: row.genre,
    description: row.description,
    lyrics: row.lyrics,
    dateCreated: row.date_created instanceof Date
      ? row.date_created.toISOString().slice(0, 10)
      : String(row.date_created).slice(0, 10),
    dateRegistered: new Date(row.date_registered).toISOString(),
    registrationNumber: row.registration_number,
    digitalFingerprint: row.digital_fingerprint,
    fileHash: row.file_hash,
    fileName: row.file_name,
    fileSize: Number(row.file_size),
    fileType: row.file_type,
    status: row.status,
    uploadId: row.upload_id || undefined,
    hasStoredAudio: Boolean(row.object_key),
  };
}

async function recordAudit(database, request, action, resourceType, resourceId, metadata = {}) {
  await database.query(
    `INSERT INTO audit_events (id, request_id, user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [randomUUID(), request.id, request.auth?.userId ?? null, action, resourceType, resourceId, JSON.stringify(metadata)],
  );
}

export function createApp({
  database,
  config,
  storage,
  billing = { status: async () => ({ active: true, remaining: 5, limit: 5 }) },
  verifyToken = createCognitoVerifier(config),
}) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((request, response, next) => {
    request.id = requestId(request);
    response.setHeader('x-request-id', request.id);
    const startedAt = Date.now();
    response.on('finish', () => {
      console.log(JSON.stringify({
        level: 'info',
        requestId: request.id,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
      }));
    });
    next();
  });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    credentials: false,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        callback(null, true);
        return;
      }
      const error = new Error('This website is not allowed to call the EZ Copyright API.');
      error.statusCode = 403;
      callback(error);
    },
  }));
  app.post('/v1/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), asyncRoute(async (request, response) => {
    try {
      const event = billing.constructEvent(request.body, request.get('stripe-signature'));
      await billing.processEvent(database, event);
      response.json({ received: true });
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'Stripe webhook rejected', requestId: request.id }));
      response.status(400).json({ error: 'invalid_stripe_webhook', requestId: request.id });
    }
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }));

  const authenticate = asyncRoute(async (request, response, next) => {
    const authorization = request.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      response.status(401).json({ error: 'authentication_required', requestId: request.id });
      return;
    }

    try {
      request.auth = await verifyToken(match[1]);
      next();
    } catch {
      response.status(401).json({ error: 'invalid_authentication', requestId: request.id });
    }
  });

  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  app.get('/', (_request, response) => {
    response.json({ service: 'EZ Copyright API', status: 'ok' });
  });

  app.get('/health/live', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/health/ready', asyncRoute(async (_request, response) => {
    await database.query('SELECT 1');
    response.json({ status: 'ready' });
  }));

  app.get('/v1/me', authenticate, (request, response) => {
    response.json({ id: request.auth.userId, email: request.auth.email });
  });

  app.get('/v1/billing/status', authenticate, asyncRoute(async (request, response) => {
    response.json(await billing.status(database, request.auth.userId));
  }));

  app.post('/v1/billing/checkout', authenticate, writeLimiter, asyncRoute(async (request, response) => {
    const session = await billing.createCheckout({
      database, userId: request.auth.userId, email: request.auth.email,
    });
    await recordAudit(database, request, 'billing.checkout_created', 'checkout', session.id);
    response.status(201).json({ url: session.url });
  }));

  app.post('/v1/billing/portal', authenticate, writeLimiter, asyncRoute(async (request, response) => {
    const session = await billing.createPortal({ database, userId: request.auth.userId });
    if (!session) {
      response.status(404).json({ error: 'billing_customer_not_found', requestId: request.id });
      return;
    }
    response.status(201).json({ url: session.url });
  }));

  async function requireRegistrationAllowance(request, response) {
    const status = await billing.status(database, request.auth.userId);
    if (!status.active) {
      response.status(402).json({ error: 'subscription_required', billing: status, requestId: request.id });
      return false;
    }
    if (status.remaining < 1) {
      response.status(429).json({ error: 'monthly_registration_limit_reached', billing: status, requestId: request.id });
      return false;
    }
    return true;
  }

  app.post('/v1/uploads', authenticate, writeLimiter, asyncRoute(async (request, response) => {
    if (!await requireRegistrationAllowance(request, response)) return;
    const upload = uploadSchema.parse(request.body);
    if (upload.fileSize > config.maxUploadBytes) {
      response.status(413).json({ error: 'file_too_large', maxBytes: config.maxUploadBytes, requestId: request.id });
      return;
    }
    const id = randomUUID();
    const fileHash = upload.fileHash.toUpperCase();
    const checksumSha256 = Buffer.from(fileHash, 'hex').toString('base64');
    const objectKey = createObjectKey(request.auth.userId, id, upload.fileName);
    await database.query(
      `INSERT INTO file_uploads (
        id, user_id, object_key, file_hash, file_name, file_size, file_type, checksum_sha256, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [id, request.auth.userId, objectKey, fileHash, upload.fileName, upload.fileSize, upload.fileType, checksumSha256],
    );
    const signed = await storage.createUpload({ objectKey, fileType: upload.fileType, checksumSha256 });
    await recordAudit(database, request, 'upload.created', 'upload', id, { fileSize: upload.fileSize });
    response.status(201).json({ uploadId: id, uploadUrl: signed.url, headers: signed.headers, expiresInSeconds: 900 });
  }));

  app.post('/v1/uploads/:id/complete', authenticate, writeLimiter, asyncRoute(async (request, response) => {
    const id = z.string().uuid().parse(request.params.id);
    const result = await database.query(
      `SELECT * FROM file_uploads WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [id, request.auth.userId],
    );
    const upload = result.rows[0];
    if (!upload) {
      response.status(404).json({ error: 'upload_not_found', requestId: request.id });
      return;
    }
    const stored = await storage.verifyUpload({ objectKey: upload.object_key });
    if (stored.size !== Number(upload.file_size) || stored.checksumSha256 !== upload.checksum_sha256) {
      await storage.deleteObject({ objectKey: upload.object_key });
      response.status(409).json({ error: 'upload_verification_failed', requestId: request.id });
      return;
    }
    await database.query(
      `UPDATE file_uploads SET status = 'ready', completed_at = NOW() WHERE id = $1 AND user_id = $2`,
      [id, request.auth.userId],
    );
    await recordAudit(database, request, 'upload.verified', 'upload', id, { fileSize: stored.size });
    response.json({ uploadId: id, status: 'ready' });
  }));

  app.get('/v1/works', authenticate, asyncRoute(async (request, response) => {
    const result = await database.query(
      `SELECT * FROM works WHERE user_id = $1 ORDER BY date_registered DESC LIMIT 500`,
      [request.auth.userId],
    );
    response.json({ works: result.rows.map(fromWorkRow) });
  }));

  app.get('/v1/works/:id', authenticate, asyncRoute(async (request, response) => {
    const id = z.string().uuid().parse(request.params.id);
    const result = await database.query(
      `SELECT * FROM works WHERE id = $1 AND user_id = $2`,
      [id, request.auth.userId],
    );
    if (!result.rows[0]) {
      response.status(404).json({ error: 'work_not_found', requestId: request.id });
      return;
    }
    response.json({ work: fromWorkRow(result.rows[0]) });
  }));

  app.get('/v1/works/:id/audio', authenticate, asyncRoute(async (request, response) => {
    const id = z.string().uuid().parse(request.params.id);
    const result = await database.query(
      `SELECT object_key, file_name FROM works WHERE id = $1 AND user_id = $2`,
      [id, request.auth.userId],
    );
    const work = result.rows[0];
    if (!work?.object_key) {
      response.status(404).json({ error: 'stored_audio_not_found', requestId: request.id });
      return;
    }
    const url = await storage.createDownloadUrl({ objectKey: work.object_key, fileName: work.file_name });
    response.json({ url, expiresInSeconds: 300 });
  }));

  app.post('/v1/works', authenticate, writeLimiter, asyncRoute(async (request, response) => {
    if (!await requireRegistrationAllowance(request, response)) return;
    const work = workSchema.parse(request.body);
    const uploadResult = await database.query(
      `SELECT * FROM file_uploads WHERE id = $1 AND user_id = $2 AND status = 'ready'`,
      [work.uploadId, request.auth.userId],
    );
    const upload = uploadResult.rows[0];
    if (!upload || upload.file_hash !== work.fileHash.toUpperCase()
      || Number(upload.file_size) !== work.fileSize || upload.file_name !== work.fileName) {
      response.status(409).json({ error: 'verified_upload_required', requestId: request.id });
      return;
    }
    const serverId = randomUUID();
    const registeredAt = new Date();
    const registrationNumber = createRegistrationNumber(registeredAt);
    const fingerprint = createFingerprint(request.auth.userId, work, registeredAt);

    const result = await database.query(
      `INSERT INTO works (
        id, user_id, idempotency_key, title, artist, co_artists, genre, description, lyrics,
        date_created, date_registered, registration_number, digital_fingerprint, file_hash,
        file_name, file_size, file_type, status, upload_id, object_key
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, 'registered', $18, $19
      )
      ON CONFLICT (user_id, idempotency_key)
      DO UPDATE SET updated_at = works.updated_at
      RETURNING *`,
      [
        serverId, request.auth.userId, work.id, work.title, work.artist, work.coArtists,
        work.genre, work.description, work.lyrics, work.dateCreated, registeredAt,
        registrationNumber, fingerprint, work.fileHash.toUpperCase(), work.fileName,
        work.fileSize, work.fileType,
        work.uploadId, upload.object_key,
      ],
    );

    await database.query(
      `UPDATE file_uploads SET status = 'consumed', consumed_at = NOW() WHERE id = $1 AND user_id = $2`,
      [work.uploadId, request.auth.userId],
    );

    const savedWork = fromWorkRow(result.rows[0]);
    await recordAudit(database, request, 'work.created', 'work', savedWork.id, {
      registrationNumber: savedWork.registrationNumber,
      status: savedWork.status,
    });
    response.status(201).json({ work: savedWork });
  }));

  app.delete('/v1/works/:id', authenticate, writeLimiter, asyncRoute(async (request, response) => {
    const id = z.string().uuid().parse(request.params.id);
    const existing = await database.query(
      `SELECT object_key FROM works WHERE id = $1 AND user_id = $2`,
      [id, request.auth.userId],
    );
    if (!existing.rows[0]) {
      response.status(404).json({ error: 'work_not_found', requestId: request.id });
      return;
    }
    if (existing.rows[0].object_key) await storage.deleteObject({ objectKey: existing.rows[0].object_key });
    const result = await database.query(
      `DELETE FROM works WHERE id = $1 AND user_id = $2 RETURNING id, registration_number`,
      [id, request.auth.userId],
    );
    if (!result.rows[0]) {
      response.status(404).json({ error: 'work_not_found', requestId: request.id });
      return;
    }
    await recordAudit(database, request, 'work.deleted', 'work', id, {
      registrationNumber: result.rows[0].registration_number,
    });
    response.status(204).end();
  }));

  app.post('/v1/legal/consents', authenticate, writeLimiter, asyncRoute(async (request, response) => {
    const consent = consentSchema.parse(request.body);
    if (consent.policyVersion !== config.policyVersion) {
      response.status(409).json({
        error: 'policy_version_outdated',
        currentPolicyVersion: config.policyVersion,
        requestId: request.id,
      });
      return;
    }

    const id = randomUUID();
    const result = await database.query(
      `INSERT INTO policy_consents (
        id, user_id, policy_type, policy_version, request_id, source_flow
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, policy_type, policy_version, source_flow)
      DO UPDATE SET accepted_at = NOW(), request_id = EXCLUDED.request_id
      RETURNING *`,
      [id, request.auth.userId, consent.policyType, consent.policyVersion, request.id, consent.sourceFlow],
    );
    await recordAudit(database, request, 'policy.accepted', 'policy', consent.policyType, {
      policyVersion: consent.policyVersion,
      sourceFlow: consent.sourceFlow,
    });
    response.status(201).json({
      consent: {
        policyType: result.rows[0].policy_type,
        policyVersion: result.rows[0].policy_version,
        acceptedAt: new Date(result.rows[0].accepted_at).toISOString(),
        sourceFlow: result.rows[0].source_flow,
      },
    });
  }));

  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found' });
  });

  app.use((error, request, response, _next) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: 'invalid_request',
        fields: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        requestId: request.id,
      });
      return;
    }

    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    console.error(JSON.stringify({
      level: 'error',
      requestId: request.id,
      message: error.message,
      stack: config.nodeEnvironment === 'production' ? undefined : error.stack,
    }));
    response.status(statusCode).json({
      error: statusCode >= 500 ? 'internal_error' : 'request_rejected',
      requestId: request.id,
    });
  });

  return app;
}
