# EZ Copyright AWS App Runner API

The production frontend is hosted by AWS Amplify. The API is deployed as an AWS App Runner service from this GitHub repository using the root `Dockerfile`.

## Service configuration

- Source: `aitopmusicnews-cloud/EZCopyRight`
- Branch: `main`
- Runtime: Docker
- Container command: `npm run start:api`
- Health check protocol: HTTP
- Health check path: `/health/ready`
- Application port: use the App Runner `PORT` value; the server binds to `0.0.0.0`
- Automatic deployment: enable only after GitHub launch checks are green

The frontend must set:

- `VITE_API_BASE_URL` — the exact App Runner service URL, without a trailing slash
- `VITE_COGNITO_REGION`
- `VITE_COGNITO_CLIENT_ID`

These are public browser configuration values. Never expose server credentials through a `VITE_*` variable.

## Required App Runner environment

- `NODE_ENV=production`
- `DATABASE_URL` — PostgreSQL connection string reachable from App Runner
- `COGNITO_REGION=us-west-2`
- `COGNITO_USER_POOL_ID=us-west-2_jJs1JIarh`
- `COGNITO_CLIENT_ID=6j3dpm8g95pa2uuevfuk206qdi`
- `CORS_ALLOWED_ORIGINS` — exact comma-separated Amplify and custom-domain origins
- `APP_BASE_URL` — canonical frontend URL used for Stripe redirects
- `POLICY_VERSION=2026-08-13`
- `AWS_REGION` — region containing the private audio bucket
- `S3_BUCKET` — private audio bucket name
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `MONTHLY_REGISTRATION_LIMIT=5` (optional)
- `MAX_UPLOAD_BYTES=536870912` (optional)

Store credentials and secrets in App Runner runtime secrets backed by AWS Secrets Manager or Systems Manager Parameter Store. Do not commit them to GitHub.

## AWS permissions

Attach an App Runner instance role that permits only the required actions on the configured bucket and application prefix:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`

The service also verifies uploads with `HeadObject`, which is authorized through `s3:GetObject`. Configure S3 CORS to allow the production frontend origins, `PUT`, and the `Content-Type` and `x-amz-checksum-sha256` headers used by presigned uploads.

If the database is in a private VPC, configure an App Runner VPC connector with network access and security-group rules for PostgreSQL.

## Stripe webhook

Configure the Stripe endpoint as:

```text
https://<app-runner-service-domain>/v1/stripe/webhook
```

The signing secret for that exact endpoint and Stripe mode belongs in `STRIPE_WEBHOOK_SECRET`.

## Current API

Unauthenticated:

- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `POST /v1/stripe/webhook` (verified with the Stripe signature)

Authenticated with a valid Cognito bearer token:

- `GET /v1/me`
- `GET /v1/billing/status`
- `POST /v1/billing/checkout`
- `POST /v1/billing/portal`
- `POST /v1/uploads`
- `POST /v1/uploads/:id/complete`
- `GET /v1/works`
- `GET /v1/works/:id`
- `GET /v1/works/:id/audio`
- `POST /v1/works`
- `DELETE /v1/works/:id`
- `POST /v1/legal/consents`

Work and upload queries are scoped to the authenticated Cognito user ID.

## Deployment verification

1. Confirm the App Runner deployment reaches a healthy state.
2. Confirm `GET /health/live` and `GET /health/ready` return success.
3. Confirm the Amplify build contains the correct `VITE_API_BASE_URL`.
4. Sign in through Cognito and verify `GET /v1/me`.
5. Verify a presigned S3 upload and download.
6. Complete a Stripe test checkout and confirm the webhook updates billing status.
7. Confirm requests from every production frontend hostname pass CORS.
