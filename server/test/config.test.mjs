import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, validateEnvironment } from '../config.mjs';

test('development config provides localhost origins', () => {
  const config = loadConfig({ NODE_ENV: 'development' });
  assert.deepEqual(config.allowedOrigins, [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
  assert.equal(config.appBaseUrl, 'http://localhost:5173');
});

test('production config reports every missing required variable', () => {
  assert.throws(
    () => validateEnvironment({ NODE_ENV: 'production' }),
    (error) => {
      assert.match(error.message, /DATABASE_URL/);
      assert.match(error.message, /S3_BUCKET/);
      assert.match(error.message, /CORS_ALLOWED_ORIGINS/);
      assert.match(error.message, /APP_BASE_URL/);
      assert.match(error.message, /STRIPE_SECRET_KEY/);
      assert.match(error.message, /STRIPE_WEBHOOK_SECRET/);
      assert.match(error.message, /STRIPE_PRICE_ID/);
      assert.doesNotMatch(error.message, /COGNITO_/);
      return true;
    },
  );
});

test('production config accepts a complete environment', () => {
  const environment = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://example.test/database',
    S3_BUCKET: 'ezcopyright-private',
    AWS_REGION: 'us-west-2',
    CORS_ALLOWED_ORIGINS: 'https://app.example, https://www.example/',
    APP_BASE_URL: 'https://app.example/',
    STRIPE_SECRET_KEY: 'test-secret',
    STRIPE_WEBHOOK_SECRET: 'test-webhook-secret',
    STRIPE_PRICE_ID: 'price_test',
  };

  const config = loadConfig(environment);
  assert.deepEqual(config.allowedOrigins, ['https://app.example', 'https://www.example']);
  assert.equal(config.appBaseUrl, 'https://app.example');
  assert.equal(config.awsRegion, 'us-west-2');
  assert.equal('cognitoIssuer' in config, false);
  assert.equal('cognitoClientId' in config, false);
});


test('production Clerk mode requires public Clerk configuration', () => {
  const environment = {
    NODE_ENV: 'production',
    AUTH_MODE: 'clerk',
    DATABASE_URL: 'postgres://example.test/database',
    S3_BUCKET: 'ezcopyright-private',
    CORS_ALLOWED_ORIGINS: 'https://ezwaycopyrights.com',
    APP_BASE_URL: 'https://ezwaycopyrights.com',
    STRIPE_SECRET_KEY: 'test-secret',
    STRIPE_WEBHOOK_SECRET: 'test-webhook-secret',
    STRIPE_PRICE_ID: 'price_test',
  };

  assert.throws(
    () => validateEnvironment(environment),
    (error) => {
      assert.match(error.message, /CLERK_PUBLISHABLE_KEY/);
      assert.match(error.message, /CLERK_FRONTEND_API/);
      return true;
    },
  );

  const config = loadConfig({
    ...environment,
    CLERK_PUBLISHABLE_KEY: 'pk_live_example',
    CLERK_FRONTEND_API: 'https://clerk.ezwaycopyrights.com',
  });
  assert.equal(config.authMode, 'clerk');
  assert.equal(config.clerkJwksUrl, 'https://clerk.ezwaycopyrights.com/.well-known/jwks.json');
  assert.deepEqual(config.clerkAuthorizedParties, ['https://ezwaycopyrights.com']);
});
