import { createHash, createHmac } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function resolveCredentials() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN || '',
    };
  }

  const full = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  const relative = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  const credentialsUrl = full || (relative ? 'http://169.254.170.2' + relative : '');

  if (!credentialsUrl) {
    throw new Error('AWS runtime credentials are not available.');
  }

  const headers = {};
  if (process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN) {
    headers.Authorization = process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN;
  }

  const response = await fetch(credentialsUrl, { headers });
  if (!response.ok) throw new Error('Could not load AWS runtime credentials.');

  const credentials = await response.json();
  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.Token || '',
  };
}

async function invokeLambda({ region, functionName, payload }) {
  const service = 'lambda';
  const host = 'lambda.' + region + '.amazonaws.com';
  const path = '/2015-03-31/functions/' + encodeURIComponent(functionName) + '/invocations';
  const body = JSON.stringify(payload);
  const credentials = await resolveCredentials();
  const timestamp = amzDate();
  const dateStamp = timestamp.slice(0, 8);
  const payloadHash = sha256(body);

  const canonicalHeaders = [
    'content-type:application/json',
    'host:' + host,
    'x-amz-date:' + timestamp,
    credentials.sessionToken ? 'x-amz-security-token:' + credentials.sessionToken : null,
  ].filter(Boolean).join('\n') + '\n';

  const signedHeaders = credentials.sessionToken
    ? 'content-type;host;x-amz-date;x-amz-security-token'
    : 'content-type;host;x-amz-date';

  const canonicalRequest = [
    'POST',
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = dateStamp + '/' + region + '/' + service + '/aws4_request';
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const kDate = hmac(Buffer.from('AWS4' + credentials.secretAccessKey, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign, 'hex');

  const authorization = 'AWS4-HMAC-SHA256 Credential=' + credentials.accessKeyId + '/' + credentialScope
    + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  const headers = {
    'Content-Type': 'application/json',
    'X-Amz-Date': timestamp,
    Authorization: authorization,
  };
  if (credentials.sessionToken) headers['X-Amz-Security-Token'] = credentials.sessionToken;

  const response = await fetch('https://' + host + path, {
    method: 'POST',
    headers,
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error('The EZCopyRight agent Lambda request failed with status ' + response.status + '.');
  }

  return text;
}

export function createAgentBridge(config) {
  return {
    async ask({ message, confirmDeployment = false }) {
      const raw = await invokeLambda({
        region: config.awsRegion,
        functionName: config.agentFunctionName,
        payload: { message, confirmDeployment },
      });

      if (!raw) throw new Error('The EZCopyRight agent returned an empty response.');

      let result;
      try {
        result = JSON.parse(raw);
      } catch {
        throw new Error('The EZCopyRight agent returned an invalid response.');
      }

      if (!result || typeof result !== 'object') {
        throw new Error('The EZCopyRight agent returned an invalid response.');
      }

      return result;
    },
  };
}
