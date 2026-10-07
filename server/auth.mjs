import { createRemoteJWKSet, jwtVerify } from 'jose';

function decodePrincipal(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function claimValues(principal, names) {
  const claims = Array.isArray(principal?.claims) ? principal.claims : [];
  return claims
    .filter((claim) => names.includes(claim?.typ) && typeof claim?.val === 'string')
    .map((claim) => claim.val)
    .filter(Boolean);
}

function firstClaim(principal, names) {
  return claimValues(principal, names)[0] || null;
}

export function readEasyAuthIdentity(request) {
  const principal = decodePrincipal(request.get('x-ms-client-principal'));
  const userId = request.get('x-ms-client-principal-id')
    || firstClaim(principal, [
      'sub',
      'oid',
      'http://schemas.microsoft.com/identity/claims/objectidentifier',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
    ]);

  if (!userId) return null;

  const email = request.get('x-ms-client-principal-name')
    || firstClaim(principal, [
      'email',
      'emails',
      'preferred_username',
      'upn',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    ]);

  const groups = [
    ...claimValues(principal, ['roles', 'role']),
    ...claimValues(principal, ['groups']),
  ];

  return {
    userId,
    email,
    groups: [...new Set(groups)],
    provider: request.get('x-ms-client-principal-idp') || principal?.auth_typ || 'ezid',
  };
}

function readBearerToken(request) {
  const authorization = request.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function readCookie(request, name) {
  const header = request.get('cookie') || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return '';
}

function flattenClaimValues(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  if (typeof value === 'string' && value) return [value];
  return [];
}

export function createClerkIdentityReader(config) {
  if (!config.clerkJwksUrl) {
    throw new Error('CLERK_JWKS_URL or CLERK_FRONTEND_API is required for Clerk authentication.');
  }

  const jwks = createRemoteJWKSet(new URL(config.clerkJwksUrl));
  const authorizedParties = new Set(config.clerkAuthorizedParties || []);

  return async function readClerkIdentity(request) {
    const token = readBearerToken(request) || readCookie(request, '__session');
    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['RS256'],
      });

      if (payload.sts === 'pending') return null;

      if (payload.azp && authorizedParties.size > 0) {
        const parties = Array.isArray(payload.azp) ? payload.azp : [payload.azp];
        if (!parties.some((party) => typeof party === 'string' && authorizedParties.has(party))) {
          return null;
        }
      }

      const userId = typeof payload.sub === 'string' ? payload.sub : '';
      if (!userId) return null;

      const email = [
        payload.email,
        payload.primary_email_address,
        payload.email_address,
      ].find((value) => typeof value === 'string' && value) || null;

      const groups = [
        ...flattenClaimValues(payload.org_permissions),
        ...flattenClaimValues(payload.org_role),
        ...flattenClaimValues(payload.roles),
        ...flattenClaimValues(payload.groups),
      ];

      return {
        userId,
        email,
        groups: [...new Set(groups)],
        provider: 'clerk',
      };
    } catch {
      return null;
    }
  };
}
