function parseList(value = '') {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseOrigins(value, environment) {
  const configured = value
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (configured.length > 0 || environment === 'production') return configured;
  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

function requiredProductionValues(environment) {
  const storageProvider = (environment.STORAGE_PROVIDER || (environment.AZURE_STORAGE_ACCOUNT ? 'azure' : 's3')).trim();
  const authMode = (environment.AUTH_MODE || 'easy-auth').trim();
  const values = [
    ['DATABASE_URL', environment.DATABASE_URL],
    ['CORS_ALLOWED_ORIGINS', environment.CORS_ALLOWED_ORIGINS],
    ['APP_BASE_URL', environment.APP_BASE_URL],
    ['STRIPE_SECRET_KEY', environment.STRIPE_SECRET_KEY],
    ['STRIPE_WEBHOOK_SECRET', environment.STRIPE_WEBHOOK_SECRET],
    ['STRIPE_PRICE_ID', environment.STRIPE_PRICE_ID],
  ];

  if (authMode === 'clerk') {
    values.push(
      ['CLERK_PUBLISHABLE_KEY', environment.CLERK_PUBLISHABLE_KEY],
      ['CLERK_FRONTEND_API', environment.CLERK_FRONTEND_API],
    );
  }

  if (storageProvider === 'azure') {
    values.push(
      ['AZURE_STORAGE_ACCOUNT', environment.AZURE_STORAGE_ACCOUNT],
      ['AZURE_STORAGE_CONTAINER', environment.AZURE_STORAGE_CONTAINER],
      ['AZURE_STORAGE_ACCOUNT_KEY', environment.AZURE_STORAGE_ACCOUNT_KEY],
    );
  } else {
    values.push(['S3_BUCKET', environment.S3_BUCKET]);
  }

  return values;
}

export function validateEnvironment(environment = process.env) {
  const nodeEnvironment = environment.NODE_ENV?.trim() || 'development';
  if (nodeEnvironment !== 'production') return;

  const missing = requiredProductionValues(environment)
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
}

export function loadConfig(environment = process.env) {
  validateEnvironment(environment);
  const nodeEnvironment = environment.NODE_ENV?.trim() || 'development';
  const databaseUrl = environment.DATABASE_URL?.trim() || '';
  const storageProvider = (environment.STORAGE_PROVIDER || (environment.AZURE_STORAGE_ACCOUNT ? 'azure' : 's3')).trim();
  const appBaseUrl = (environment.APP_BASE_URL || 'http://localhost:5173').trim().replace(/\/$/, '');
  const authMode = (environment.AUTH_MODE || 'easy-auth').trim();
  const clerkFrontendApi = (environment.CLERK_FRONTEND_API || '').trim().replace(/\/$/, '');

  return {
    nodeEnvironment,
    port: Number.parseInt(environment.PORT || '8080', 10),
    databaseUrl,
    databaseSsl: environment.DATABASE_SSL === 'false'
      ? false
      : !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1'),
    allowedOrigins: parseOrigins(environment.CORS_ALLOWED_ORIGINS || '', nodeEnvironment),
    policyVersion: environment.POLICY_VERSION?.trim() || '2026-08-13',
    storageProvider,
    s3Bucket: environment.S3_BUCKET?.trim() || '',
    azureStorageAccount: environment.AZURE_STORAGE_ACCOUNT?.trim() || '',
    azureStorageContainer: environment.AZURE_STORAGE_CONTAINER?.trim() || 'private-audio',
    azureStorageAccountKey: environment.AZURE_STORAGE_ACCOUNT_KEY?.trim() || '',
    maxUploadBytes: Number.parseInt(environment.MAX_UPLOAD_BYTES || '536870912', 10),
    appBaseUrl,
    stripeSecretKey: environment.STRIPE_SECRET_KEY?.trim() || '',
    stripeWebhookSecret: environment.STRIPE_WEBHOOK_SECRET?.trim() || '',
    stripePriceId: environment.STRIPE_PRICE_ID?.trim() || '',
    monthlyRegistrationLimit: Number.parseInt(environment.MONTHLY_REGISTRATION_LIMIT || '5', 10),
    authMode,
    authProvider: environment.AUTH_PROVIDER?.trim() || 'ezid',
    clerkPublishableKey: environment.CLERK_PUBLISHABLE_KEY?.trim() || '',
    clerkFrontendApi,
    clerkJwksUrl: (environment.CLERK_JWKS_URL || (clerkFrontendApi ? `${clerkFrontendApi}/.well-known/jwks.json` : '')).trim(),
    clerkAuthorizedParties: parseList(environment.CLERK_AUTHORIZED_PARTIES || appBaseUrl),
    azureOpenAiEndpoint: environment.AZURE_OPENAI_ENDPOINT?.trim() || '',
    azureOpenAiApiKey: environment.AZURE_OPENAI_API_KEY?.trim() || '',
    azureOpenAiModel: environment.AZURE_OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    agentAdminGroup: environment.AGENT_ADMIN_GROUP?.trim() || 'ezcopyright-admin',
    agentAdminUserIds: parseList(environment.AGENT_ADMIN_USER_IDS || ''),
  };
}
