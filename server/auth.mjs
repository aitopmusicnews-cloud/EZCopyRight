import { createRemoteJWKSet, jwtVerify } from 'jose';

export function createCognitoVerifier({ cognitoIssuer, cognitoClientId }) {
  const keySet = createRemoteJWKSet(new URL(`${cognitoIssuer}/.well-known/jwks.json`));

  return async function verifyCognitoToken(token) {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: cognitoIssuer,
      algorithms: ['RS256'],
    });

    const tokenUse = payload.token_use;
    const tokenClientId = tokenUse === 'access' ? payload.client_id : payload.aud;
    if (!['access', 'id'].includes(tokenUse) || tokenClientId !== cognitoClientId) {
      throw new Error('The authentication token is not valid for this application.');
    }

    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new Error('The authentication token does not identify a user.');
    }

    const groups = Array.isArray(payload['cognito:groups'])
      ? payload['cognito:groups'].filter((group) => typeof group === 'string')
      : [];

    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      tokenUse,
      groups,
    };
  };
}
