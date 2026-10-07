# EZ Copyright by THE EZ WAY

EZ Copyright creates private evidence records for original musical works with local hashing, server-side evidence data, private audio storage, and downloadable certificates.

## Production architecture

- **Hosting:** Azure Container Apps, serving the React frontend and Express API from one container
- **Authentication:** Clerk directly in the React frontend and Express API; Azure Container Apps only hosts the application
- **Database:** Azure Database for PostgreSQL Flexible Server
- **Private audio storage:** Azure Blob Storage
- **Billing:** Stripe subscriptions and webhooks
- **DNS:** Cloudflare for `ezwaycopyrights.com`

Amazon Cognito is no longer part of the application authentication path.

## Authentication flow

EZCopyRight supports a staged authentication cutover controlled by `AUTH_MODE`.

- `AUTH_MODE=easy-auth` keeps the existing Azure Container Apps Authentication provider (`ezid`) active for rollback.
- `AUTH_MODE=clerk` uses Clerk directly and no longer depends on Entra/Easy Auth for customer identity.

In Clerk mode, the frontend loads Clerk from the production Frontend API at `https://clerk.ezwaycopyrights.com`. Clerk stores the browser session, and same-origin API requests include the Clerk `__session` cookie automatically.

The Express API validates each Clerk session JWT against the production Clerk JWKS endpoint and checks the token's authorized-party claim against `https://ezwaycopyrights.com`. The verified Clerk `sub` becomes the EZCopyright customer ID used for works, uploads, billing, certificates, audit events, and admin-agent authorization.

The browser never supplies a user ID as ownership proof. The API derives ownership only from the verified authentication session.

During cutover, keep Azure Easy Auth enabled with anonymous requests allowed until Clerk has been tested. After Clerk sign-in, Stripe checkout, billing portal, uploads, certificates, downloads, and the agent are verified, Azure Easy Auth can be disabled and the old `ezid` provider removed.

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

For the safe transition, deploy with:

- `AUTH_MODE=easy-auth`
- `AUTH_PROVIDER=ezid`
- `CLERK_PUBLISHABLE_KEY` set to the production Clerk `pk_live_...` value
- `CLERK_FRONTEND_API=https://clerk.ezwaycopyrights.com`
- `CLERK_AUTHORIZED_PARTIES=https://ezwaycopyrights.com`

After the new build is live, switch only `AUTH_MODE` to `clerk`. This lets the same revision start using Clerk immediately without rebuilding the frontend.

The public health endpoints are `/health/live` and `/health/ready`.

Clerk's frontend resources require the CSP allowances configured in `server/app.mjs` for the production Frontend API, Clerk protection endpoints, image host, workers, frames, and Clerk's runtime inline styles.

## Billing flow

Membership checkout requires the customer to be signed in first. The Stripe Checkout session carries the authenticated EZ Copyright user ID in metadata and `client_reference_id`, so Stripe webhooks can link the subscription to the correct database account without creating an AWS Cognito user.

## Registration flow

1. Customer signs in through Clerk directly on EZCopyRight.
2. Browser hashes the selected audio file locally.
3. API verifies the authenticated customer's active subscription and monthly allowance.
4. API creates a private Azure Blob upload URL.
5. Browser uploads the file directly to private Blob Storage.
6. API verifies the stored object before creating the work record.
7. PostgreSQL stores server-generated registration evidence and audit events.
8. The application generates a downloadable certificate.

EZ Copyright provides evidence and recordkeeping. It is not a submission to the U.S. Copyright Office and is not a substitute for formal copyright registration or legal advice.

## Standalone operations agent

The separate operations agent remains an optional owner/admin service. It is not enabled merely by deploying the customer application. Owner access can be granted either through a verified Clerk role/permission claim matching `AGENT_ADMIN_GROUP` or by placing the owner's Clerk user ID in `AGENT_ADMIN_USER_IDS`. Customer authentication no longer depends on Cognito or Entra after `AUTH_MODE=clerk` is enabled.
