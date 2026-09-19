# EZ Copyright by THE EZ WAY

EZ Copyright registers, fingerprints, stores, and certifies original musical works.

## Production architecture

- **Frontend:** React 19 and Vite on AWS Amplify
- **API:** Node.js and Express on AWS App Runner
- **Authentication:** Amazon Cognito
- **Database:** PostgreSQL
- **Private audio storage:** Amazon S3 with presigned uploads and downloads
- **Billing:** Stripe subscriptions and webhooks

Supabase and local demo authentication are not part of the current application architecture.

## Local development

Requirements: Node.js 22 and npm 10 or newer.

1. Copy `.env.example` to `.env` and replace its example values.
2. Install locked dependencies with `npm ci`.
3. Start the frontend with `npm run dev`.
4. Start the API in a second terminal with `npm run dev:api`.

The frontend runs at `http://localhost:5173`. The API uses `PORT`, defaulting to `8080` to match the container configuration.

## Verification

Run the same checks used by GitHub Actions:

```bash
npm ci
npm audit --audit-level=high
npm run test:api
npm run typecheck
npm run build
```

## Environment configuration

Use `.env.example` as the variable inventory. Public `VITE_*` values belong in the Amplify build environment. Server credentials and signing secrets belong in AWS App Runner runtime secrets backed by AWS Secrets Manager or Systems Manager Parameter Store.

Never commit `.env` files, database URLs, AWS credentials, or Stripe secret keys.

## Deployment

- [AWS Amplify frontend guide](docs/AMPLIFY-LAUNCH.md)
- [AWS App Runner API guide](docs/APP-RUNNER-API.md)
- [Legal launch checklist](docs/LEGAL-LAUNCH-CHECKLIST.md)

The frontend must use the production App Runner URL through `VITE_API_BASE_URL`. App Runner health checks should use `/health/ready`.

## API overview

Public service endpoints:

- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `POST /v1/stripe/webhook` with Stripe signature verification

Authenticated routes cover user identity, billing, private uploads, registered works, audio downloads, and policy consents. The API verifies Cognito tokens and scopes work and upload records to the authenticated Cognito user ID.

## Registration flow

1. The browser hashes the selected audio file.
2. The API checks the authenticated user's active subscription and monthly allowance.
3. The API creates a private S3 presigned upload.
4. The browser uploads the file directly to S3 with its SHA-256 checksum.
5. The API verifies the stored object before creating the work record.
6. PostgreSQL stores server-generated registration evidence and audit events.
7. The application generates a downloadable certificate.

EZ Copyright provides evidence and recordkeeping; it is not a substitute for registration with a government copyright office or advice from a qualified attorney.
