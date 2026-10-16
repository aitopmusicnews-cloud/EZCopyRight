# EZCopyRight — Render + Supabase

Prepared for a fresh installation; existing Azure test data is not copied or deleted.
The existing Clerk and Stripe integrations remain. No DNS, billing, or production changes are made by these files.

## 1. Supabase

Choose a dedicated project, or explicitly select an existing project. Do not assume the separate EZway app's project should be used.
Run this once in the selected project's SQL Editor:

```sql
CREATE SCHEMA IF NOT EXISTS ezcopyright AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA ezcopyright FROM PUBLIC, anon, authenticated;
```

Keep `ezcopyright` out of the Data API's exposed schemas. The app creates its six tables on startup inside this schema and enables RLS. Its backend uses the `postgres` connection (owner/bypass RLS); Clerk ownership checks remain enforced in the API. No browser database access or Supabase Auth integration is needed.

Copy the **session pooler** PostgreSQL connection string from Connect (port 5432, IPv4 compatible). Set the real database password, URL-encoded if it contains reserved characters. Store this only in Render's `DATABASE_URL`.

Create a **private** Storage bucket named `private-audio`. Enable S3 access in Storage settings and generate S3 credentials. Copy the endpoint, region, access key ID, and secret into the corresponding Render variables. These are Supabase S3 credentials, not AWS account credentials or the Supabase publishable key. Never expose them to frontend variables.

The template caps audio at 50 MiB. Match the bucket and project upload limits; raise `MAX_UPLOAD_BYTES` only after confirming your Supabase plan supports the larger size.

## 2. Render

Use this branch's `render.yaml` after reviewing and merging it, or select this branch explicitly in a new Blueprint. One Node service serves both the frontend and API. No Render database or persistent disk is needed.

The Blueprint defaults to the free plan for testing. Review Render's current sleep and resource limits before launch; select an appropriate always-on plan when ready. Paid provisioning is a separate decision.

Fill every variable marked `sync: false` in Render. Set `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`, and `CLERK_AUTHORIZED_PARTIES` to the actual preview origin initially. Multiple CORS origins/authorized parties use comma-separated values. API URLs are same-origin; no VITE secrets are required.

Use `AUTH_MODE=clerk`. Azure Easy Auth headers must not be trusted on Render. Configure Clerk to allow the preview hostname, or use a Clerk test instance for preview if the production instance's domain restrictions prevent it. Keep the production Clerk domain DNS records when moving the website.

Azure OpenAI is optional: the operations-agent feature requires separate configuration; evidence registration, login, and billing do not require it.

## 3. Stripe

For preview, use a consistent set of test-mode secret key, recurring price ID, and webhook signing secret. Add the webhook URL:

`https://YOUR-RENDER-HOST/v1/stripe/webhook`

Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed` (confirm against `server/billing.mjs` when changing billing code). Use the signing secret for this exact endpoint. Existing test subscriptions are not automatically associated with the fresh database. Do not create duplicate live subscriptions to test; use test mode first. Nothing here cancels the old subscription.

## 4. Verify before domain cutover

- `/health/live` and `/health/ready` respond successfully.
- Sign up/sign in/sign out through Clerk.
- Complete Stripe test checkout; confirm webhook delivery and allowance of five.
- Upload audio, create an evidence record, download the original, and verify the certificate.
- Sign in as a second user and verify they cannot access the first user's records.
- Check Render logs for upload, database, auth, and webhook errors.

Supabase uses its S3-compatible API for signed uploads/downloads. The backend streams the uploaded object and computes SHA-256 rather than trusting uploaded metadata. This adds a storage download during verification. Signed upload URLs are bearer credentials valid for 15 minutes; this is not an immutable/WORM storage system.

## 5. Domain switch — only after approval

Add `ezwaycopyrights.com` and `www.ezwaycopyrights.com` in Render and use the exact DNS records Render supplies in Cloudflare. Preserve email and Clerk records. Set the final application origin and Clerk authorized parties; update Stripe's webhook endpoint/signing secret as necessary. Verify TLS, auth, billing, upload, and certificate flows again. Retire Azure only after the replacement passes these checks.

## Validation scope

Local API tests, type checking, and production frontend build can be run with:

```bash
npm ci
npm run test:api
npm run typecheck
npm run build
```

A real Supabase upload/database connection, Render deployment, Clerk login, and Stripe checkout still require configured resources and credentials; local tests do not establish live readiness.
