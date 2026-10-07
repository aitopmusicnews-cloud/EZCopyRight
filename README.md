# EZ Copyright by THE EZ WAY

EZ Copyright creates private evidence records for original musical works with local hashing, server-side evidence data, private audio storage, and downloadable certificates.

## Production architecture

- **Hosting:** Azure Container Apps, serving the React frontend and Express API from one container
- **Authentication:** Clerk customer accounts through Azure Container Apps Authentication (Easy Auth) using a custom OIDC provider named `clerk`
- **Database:** Azure Database for PostgreSQL Flexible Server
- **Private audio storage:** Azure Blob Storage
- **Billing:** Stripe subscriptions and webhooks
- **DNS:** Cloudflare for `ezwaycopyrights.com`

Amazon Cognito is no longer part of the application authentication path.

## Authentication flow

The public landing page is allowed anonymously. The application reads the configured provider alias from `/v1/auth/config`. In production that alias should be `clerk`, so protected actions redirect customers to:

`/.auth/login/clerk`

Clerk authenticates the customer using the sign-in methods enabled for the Clerk application, and Azure Container Apps completes the OIDC callback at:

`https://ezwaycopyrights.com/.auth/login/clerk/callback`

Azure Container Apps then establishes the authenticated session cookie. The frontend reads the signed-in identity from `/.auth/me`.

For API requests, Container Apps validates the session before the request reaches Express and injects trusted identity headers such as `X-MS-CLIENT-PRINCIPAL-ID` and `X-MS-CLIENT-PRINCIPAL-NAME`. The API uses those headers as the owner identity for works, uploads, billing, certificates, and audit records.

Do not accept a browser-supplied user ID as ownership evidence.

## Local development

Requirements: Node.js 22 and npm 10 or newer.

1. Copy `.env.example` to `.env` and replace example values.
2. Install dependencies with `npm ci`.
3. Start the frontend with `npm run dev`.
4. Start the API in a second terminal with `npm run dev:api`.

Production authentication is supplied by Azure Easy Auth. API tests simulate the trusted Azure identity headers locally.

## Verification

Run the same checks used by GitHub Actions:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run test:api
npm run typecheck
npm run build
```

## Azure deployment

The production container is built from `main` and deployed to the `ezcopyright` Container App in `ezcopyright-prod-rg`.

The Container App authentication configuration must keep:

- Authentication platform: enabled
- Unauthenticated requests: `AllowAnonymous`
- Custom OpenID Connect provider: `clerk`
- OIDC scopes: `openid profile email`
- Client ID: the Clerk OAuth application client ID
- Client secret: stored only as a Container App secret, for example `clerk-authentication-secret`
- Metadata/discovery URL: the discovery URL shown by the Clerk OAuth application
- Callback URL: `https://ezwaycopyrights.com/.auth/login/clerk/callback`
- Runtime environment: `AUTH_PROVIDER=clerk`

Keep the old `ezid` provider in place during cutover. Create and test `clerk` first, switch `AUTH_PROVIDER` to `clerk`, verify sign-in and billing, and only then remove `ezid`.

The public health endpoints are `/health/live` and `/health/ready`. Depending on Easy Auth policy, an external unauthenticated health request can be intercepted before Express; use the Container App revision/replica health as the infrastructure source of truth if that policy is tightened.

## Billing flow

Membership checkout requires the customer to be signed in first. The Stripe Checkout session carries the authenticated EZ Copyright user ID in metadata and `client_reference_id`, so Stripe webhooks can link the subscription to the correct database account without creating an AWS Cognito user.

## Registration flow

1. Customer signs in through Clerk.
2. Browser hashes the selected audio file locally.
3. API verifies the authenticated customer's active subscription and monthly allowance.
4. API creates a private Azure Blob upload URL.
5. Browser uploads the file directly to private Blob Storage.
6. API verifies the stored object before creating the work record.
7. PostgreSQL stores server-generated registration evidence and audit events.
8. The application generates a downloadable certificate.

EZ Copyright provides evidence and recordkeeping. It is not a submission to the U.S. Copyright Office and is not a substitute for formal copyright registration or legal advice.

## Standalone operations agent

The separate operations agent remains an optional owner/admin service. It is not enabled merely by deploying the customer application. Owner access can be granted either through an identity role/group claim matching `AGENT_ADMIN_GROUP` or by placing the Clerk/OIDC subject ID in `AGENT_ADMIN_USER_IDS`. Customer authentication no longer depends on Cognito or Entra.
