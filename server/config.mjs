const DEFAULT_COGNITO_REGION = 'us-west-2';
const DEFAULT_COGNITO_USER_POOL_ID = 'us-west-2_jJs1JIarh';
const DEFAULT_COGNITO_CLIENT_ID = '6j3dpm8g95pa2uuevfuk206qdi';

function parseOrigins(value, environment) {
  const configured = value
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (configured.length > 0 || environment === 'production') return configured;
  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

export function loadConfig(environment = process.env) {
  const nodeEnvironment = environment.NODE_ENV?.trim() || 'development';
  const region = environment.COGNITO_REGION?.trim() || DEFAULT_COGNITO_REGION;
  const userPoolId = environment.COGNITO_USER_POOL_ID?.trim() || DEFAULT_COGNITO_USER_POOL_ID;
  const clientId = environment.COGNITO_CLIENT_ID?.trim() || DEFAULT_COGNITO_CLIENT_ID;
  const databaseUrl = environment.DATABASE_URL?.trim() || '';
  const s3Bucket = environment.S3_BUCKET?.trim() || '';

  return {
    nodeEnvironment,
    port: Number.parseInt(environment.PORT || '10000', 10),
    databaseUrl,
    databaseSsl: environment.DATABASE_SSL === 'false'
      ? false
      : !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1'),
    cognitoIssuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
    cognitoClientId: clientId,
    allowedOrigins: parseOrigins(environment.CORS_ALLOWED_ORIGINS || '', nodeEnvironment),
    policyVersion: environment.POLICY_VERSION?.trim() || '2026-08-13',
    awsRegion: environment.AWS_REGION?.trim() || region,
    s3Bucket,
    maxUploadBytes: Number.parseInt(environment.MAX_UPLOAD_BYTES || '536870912', 10),
    appBaseUrl: (environment.APP_BASE_URL || 'https://main.dfhj64edk9o6n.amplifyapp.com').trim().replace(/\/$/, ''),
    stripeSecretKey: environment.STRIPE_SECRET_KEY?.trim() || '',
    stripeWebhookSecret: environment.STRIPE_WEBHOOK_SECRET?.trim() || '',
    stripePriceId: environment.STRIPE_PRICE_ID?.trim() || '',
    monthlyRegistrationLimit: Number.parseInt(environment.MONTHLY_REGISTRATION_LIMIT || '5', 10),
  };
}
