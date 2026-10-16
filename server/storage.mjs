import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function createS3Storage(config, dependencies = {}) {
  if (!config.s3Bucket) throw new Error('S3_BUCKET is required to start private audio storage.');
  const supabase = config.storageProvider === 'supabase';
  const client = dependencies.client || new S3Client(supabase ? {
    region: config.s3Region,
    endpoint: config.s3Endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  } : { region: config.awsRegion });

  return {
    async createUpload({ objectKey, fileType, checksumSha256 }) {
      const command = new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: objectKey,
        ContentType: fileType,
        ...(supabase ? {} : { ChecksumSHA256: checksumSha256 }),
      });
      return {
        url: await getSignedUrl(client, command, {
          expiresIn: 900,
          unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
        }),
        headers: {
          'Content-Type': fileType,
          ...(supabase ? {} : { 'x-amz-checksum-sha256': checksumSha256 }),
        },
      };
    },
    async verifyUpload({ objectKey }) {
      if (supabase) {
        // Hash actual bytes: user metadata is not proof of an evidence file's contents.
        const result = await client.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: objectKey }));
        const hash = createHash('sha256');
        let size = 0;
        try {
          for await (const chunk of result.Body) {
            size += chunk.length;
            if (size > config.maxUploadBytes) throw new Error('Stored audio exceeds upload limit.');
            hash.update(chunk);
          }
        } finally {
          result.Body?.destroy?.();
        }
        return { size, contentType: result.ContentType || '', checksumSha256: hash.digest('base64') };
      }
      const result = await client.send(new HeadObjectCommand({
        Bucket: config.s3Bucket,
        Key: objectKey,
        ChecksumMode: 'ENABLED',
      }));
      return {
        size: Number(result.ContentLength),
        contentType: result.ContentType || '',
        checksumSha256: result.ChecksumSHA256 || '',
      };
    },
    async createDownloadUrl({ objectKey, fileName }) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket: config.s3Bucket,
        Key: objectKey,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\]/g, '_')}"`,
      }), { expiresIn: 300 });
    },
    async deleteObject({ objectKey }) {
      await client.send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: objectKey }));
    },
  };
}
