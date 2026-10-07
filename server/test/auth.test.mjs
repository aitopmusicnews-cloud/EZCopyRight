import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createClerkIdentityReader } from '../auth.mjs';

async function startJwksServer(jwk) {
  const server = createServer((request, response) => {
    if (request.url === '/.well-known/jwks.json') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
  };
}

function mockRequest({ token = '', authorization = '' } = {}) {
  return {
    get(name) {
      const lower = String(name).toLowerCase();
      if (lower === 'authorization') return authorization;
      if (lower === 'cookie') return token ? `__session=${encodeURIComponent(token)}` : '';
      return '';
    },
  };
}

test('Clerk identity reader verifies signed session cookies and authorized party', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: 'test-key', alg: 'RS256', use: 'sig' });
  const { server, url } = await startJwksServer(jwk);

  try {
    const readIdentity = createClerkIdentityReader({
      clerkJwksUrl: url,
      clerkAuthorizedParties: ['https://ezwaycopyrights.com'],
    });

    const token = await new SignJWT({
      azp: 'https://ezwaycopyrights.com',
      email: 'artist@example.com',
      org_role: 'ezcopyright-admin',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('user_clerk_123')
      .setIssuedAt()
      .setNotBefore(Math.floor(Date.now() / 1000) - 5)
      .setExpirationTime('5m')
      .sign(privateKey);

    const identity = await readIdentity(mockRequest({ token }));
    assert.deepEqual(identity, {
      userId: 'user_clerk_123',
      email: 'artist@example.com',
      groups: ['ezcopyright-admin'],
      provider: 'clerk',
    });

    const wrongPartyToken = await new SignJWT({ azp: 'https://evil.example' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('user_clerk_123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    assert.equal(await readIdentity(mockRequest({ token: wrongPartyToken })), null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
