import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function createS3Storage(config) {
  if (!config.s3Bucket) throw new Error('S3_BUCKET is required to start private audio storage.');
  const client = new S3Client({ region: config.awsRegion });

  return {
    async createUpload({ objectKey, fileType, checksumSha256 }) {
      const command = new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: objectKey,
        ContentType: fileType,
        ChecksumSHA256: checksumSha256,
      });
      return {
        url: await getSignedUrl(client, command, { expiresIn: 900 }),
        headers: {
          'Content-Type': fileType,
          'x-amz-checksum-sha256': checksumSha256,
        },
      };
    },
    async verifyUpload({ objectKey }) {
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
