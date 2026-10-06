import { createHmac } from 'node:crypto';

const STORAGE_VERSION = '2023-11-03';

function formatUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function encodeBlobPath(objectKey) {
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

function createServiceSas(config, {
  objectKey,
  permissions,
  expiresInSeconds,
  contentDisposition = '',
  responseContentType = '',
}) {
  const start = formatUtc(new Date(Date.now() - 5 * 60 * 1000));
  const expiry = formatUtc(new Date(Date.now() + expiresInSeconds * 1000));
  const canonicalizedResource = '/blob/' + config.azureStorageAccount + '/'
    + config.azureStorageContainer + '/' + objectKey;

  const stringToSign = [
    permissions,
    start,
    expiry,
    canonicalizedResource,
    '',
    '',
    'https',
    STORAGE_VERSION,
    'b',
    '',
    '',
    '',
    contentDisposition,
    '',
    '',
    responseContentType,
  ].join('\n');

  const signature = createHmac(
    'sha256',
    Buffer.from(config.azureStorageAccountKey, 'base64'),
  ).update(stringToSign, 'utf8').digest('base64');

  const params = new URLSearchParams({
    sp: permissions,
    st: start,
    se: expiry,
    spr: 'https',
    sv: STORAGE_VERSION,
    sr: 'b',
    sig: signature,
  });

  if (contentDisposition) params.set('rscd', contentDisposition);
  if (responseContentType) params.set('rsct', responseContentType);

  return params.toString();
}

function blobUrl(config, objectKey, sas = '') {
  const base = 'https://' + config.azureStorageAccount + '.blob.core.windows.net/'
    + encodeURIComponent(config.azureStorageContainer) + '/' + encodeBlobPath(objectKey);
  return sas ? base + '?' + sas : base;
}

function cleanDownloadName(fileName) {
  return fileName.replace(/["\\\r\n]/g, '_');
}

export function createAzureBlobStorage(config) {
  if (!config.azureStorageAccount) {
    throw new Error('AZURE_STORAGE_ACCOUNT is required for Azure Blob Storage.');
  }
  if (!config.azureStorageContainer) {
    throw new Error('AZURE_STORAGE_CONTAINER is required for Azure Blob Storage.');
  }
  if (!config.azureStorageAccountKey) {
    throw new Error('AZURE_STORAGE_ACCOUNT_KEY is required for Azure Blob Storage.');
  }

  return {
    async createUpload({ objectKey, fileType, checksumSha256 }) {
      const sas = createServiceSas(config, {
        objectKey,
        permissions: 'cw',
        expiresInSeconds: 900,
      });

      return {
        url: blobUrl(config, objectKey, sas),
        headers: {
          'Content-Type': fileType,
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-meta-sha256': checksumSha256,
          'x-ms-version': STORAGE_VERSION,
        },
      };
    },

    async verifyUpload({ objectKey }) {
      const sas = createServiceSas(config, {
        objectKey,
        permissions: 'r',
        expiresInSeconds: 300,
      });

      const response = await fetch(blobUrl(config, objectKey, sas), {
        method: 'HEAD',
        headers: { 'x-ms-version': STORAGE_VERSION },
      });

      if (!response.ok) {
        throw new Error('Azure Blob Storage could not verify the uploaded audio.');
      }

      return {
        size: Number(response.headers.get('content-length') || 0),
        contentType: response.headers.get('content-type') || '',
        checksumSha256: response.headers.get('x-ms-meta-sha256') || '',
      };
    },

    async createDownloadUrl({ objectKey, fileName }) {
      const contentDisposition = 'attachment; filename="' + cleanDownloadName(fileName) + '"';
      const sas = createServiceSas(config, {
        objectKey,
        permissions: 'r',
        expiresInSeconds: 300,
        contentDisposition,
      });
      return blobUrl(config, objectKey, sas);
    },

    async deleteObject({ objectKey }) {
      const sas = createServiceSas(config, {
        objectKey,
        permissions: 'd',
        expiresInSeconds: 300,
      });

      const response = await fetch(blobUrl(config, objectKey, sas), {
        method: 'DELETE',
        headers: { 'x-ms-version': STORAGE_VERSION },
      });

      if (!response.ok && response.status !== 404) {
        throw new Error('Azure Blob Storage could not delete the audio file.');
      }
    },
  };
}
