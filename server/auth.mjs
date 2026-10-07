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
