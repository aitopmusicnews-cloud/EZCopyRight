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
      assert.match(error.message, /COGNITO_REGION/);
      assert.match(error.message, /COGNITO_USER_POOL_ID/);
      assert.match(error.message, /COGNITO_CLIENT_ID/);
      assert.match(error.message, /CORS_ALLOWED_ORIGINS/);
      assert.match(error.message, /APP_BASE_URL/);
      assert.match(error.message, /STRIPE_SECRET_KEY/);
      assert.match(error.message, /STRIPE_WEBHOOK_SECRET/);
      assert.match(error.message, /STRIPE_PRICE_ID/);
      return true;
    },
  );
});

test('production config accepts a complete environment', () => {
  const environment = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://example.test/database',
    S3_BUCKET: 'ezcopyright-private',
    COGNITO_REGION: 'us-west-2',
    COGNITO_USER_POOL_ID: 'us-west-2_example',
    COGNITO_CLIENT_ID: 'example-client-id',
    CORS_ALLOWED_ORIGINS: 'https://app.example, https://www.example/',
    APP_BASE_URL: 'https://app.example/',
    STRIPE_SECRET_KEY: 'test-secret',
    STRIPE_WEBHOOK_SECRET: 'test-webhook-secret',
    STRIPE_PRICE_ID: 'price_test',
  };

  const config = loadConfig(environment);
  assert.deepEqual(config.allowedOrigins, ['https://app.example', 'https://www.example']);
  assert.equal(config.appBaseUrl, 'https://app.example');
  assert.equal(config.cognitoIssuer, 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_example');
  assert.equal(config.cognitoClientId, 'example-client-id');
});
