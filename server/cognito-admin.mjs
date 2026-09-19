import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  const digest = createHmac('sha256', key).update(value);
  return encoding ? digest.digest(encoding) : digest.digest();
}

function awsDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function errorCode(payload) {
  const raw = payload?.__type || payload?.code || '';
  return String(raw).split('#').pop().split(':').pop();
}

let cachedCredentials = null;

async function containerAuthorizationToken() {
  if (process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN) {
    return process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN;
  }
  if (process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE) {
    return (await readFile(process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE, 'utf8')).trim();
  }
  return '';
}

async function loadCredentials() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN || '',
    };
  }

  if (cachedCredentials && (!cachedCredentials.expiration || cachedCredentials.expiration > Date.now() + 300_000)) {
    return cachedCredentials;
  }

  const relativeUri = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  const fullUri = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  const uri = fullUri || (relativeUri ? `http://169.254.170.2${relativeUri}` : '');
  if (!uri) {
    throw new Error('AWS role credentials are unavailable for Cognito account provisioning.');
  }

  const token = await containerAuthorizationToken();
  const response = await fetch(uri, {
    headers: token ? { Authorization: token } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Could not load AWS role credentials (HTTP ${response.status}).`);
  }

  const payload = await response.json();
  cachedCredentials = {
    accessKeyId: payload.AccessKeyId,
    secretAccessKey: payload.SecretAccessKey,
    sessionToken: payload.Token || '',
    expiration: payload.Expiration ? new Date(payload.Expiration).getTime() : null,
  };
  return cachedCredentials;
}

async function signedCognitoRequest({ region, target, body }) {
  const credentials = await loadCredentials();
  const service = 'cognito-idp';
  const host = `cognito-idp.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const payload = JSON.stringify(body);
  const amzDate = awsDate();
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders = {
    'content-type': 'application/x-amz-json-1.1',
    host,
    'x-amz-date': amzDate,
    'x-amz-target': `AWSCognitoIdentityProviderService.${target}`,
  };
  if (credentials.sessionToken) {
    canonicalHeaders['x-amz-security-token'] = credentials.sessionToken;
  }

  const signedHeaders = Object.keys(canonicalHeaders).sort();
  const canonicalHeadersText = signedHeaders
    .map((name) => `${name}:${String(canonicalHeaders[name]).trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const signedHeadersText = signedHeaders.join(';');
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeadersText,
    signedHeadersText,
    hash(payload),
  ].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    hash(canonicalRequest),
  ].join('\n');

  const kDate = hmac(Buffer.from(`AWS4${credentials.secretAccessKey}`, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign, 'hex');

  const headers = {
    'Content-Type': canonicalHeaders['content-type'],
    'X-Amz-Date': amzDate,
    'X-Amz-Target': canonicalHeaders['x-amz-target'],
    Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeadersText}, Signature=${signature}`,
  };
  if (credentials.sessionToken) headers['X-Amz-Security-Token'] = credentials.sessionToken;

  const response = await fetch(endpoint, { method: 'POST', headers, body: payload });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || data?.Message || `Cognito ${target} failed.`);
    error.code = errorCode(data);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

function subFromAttributes(attributes = []) {
  return attributes.find((attribute) => attribute.Name === 'sub')?.Value || null;
}

function filterValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function createCognitoAccountManager(config) {
  const region = config.cognitoRegion;
  const userPoolId = config.cognitoUserPoolId;

  async function findByEmail(email) {
    const result = await signedCognitoRequest({
      region,
      target: 'ListUsers',
      body: {
        UserPoolId: userPoolId,
        Filter: `email = "${filterValue(email)}"`,
        Limit: 2,
      },
    });
    const user = result.Users?.[0];
    if (!user) return null;
    const userId = subFromAttributes(user.Attributes);
    return userId ? { userId, username: user.Username, created: false } : null;
  }

  return {
    async ensureUserByEmail(rawEmail) {
      const email = String(rawEmail || '').trim().toLowerCase();
      if (!email || !email.includes('@')) throw new Error('A valid checkout email is required to provision the account.');

      const existing = await findByEmail(email);
      if (existing) return existing;

      try {
        const result = await signedCognitoRequest({
          region,
          target: 'AdminCreateUser',
          body: {
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: [{ Name: 'email', Value: email }],
            DesiredDeliveryMediums: ['EMAIL'],
          },
        });
        const userId = subFromAttributes(result.User?.Attributes);
        if (!userId) throw new Error('Cognito created the user without returning a subject identifier.');
        return { userId, username: result.User?.Username || email, created: true };
      } catch (error) {
        if (error?.code !== 'UsernameExistsException' && error?.code !== 'AliasExistsException') throw error;
        const raced = await findByEmail(email);
        if (!raced) throw error;
        return raced;
      }
    },
  };
}
