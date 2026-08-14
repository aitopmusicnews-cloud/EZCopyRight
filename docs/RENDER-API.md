# EZ Copyright Render API

The production frontend is hosted by AWS Amplify. The API remains on Render during initial production stabilization.

## Render web service

- Runtime: Node
- Region: Oregon
- Build command: `npm ci`
- Start command: `npm run start:api`
- Health check: `/health/ready`

## Required environment

- `NODE_ENV=production`
- `DATABASE_URL` — Render Postgres internal connection string
- `COGNITO_REGION=us-west-2`
- `COGNITO_USER_POOL_ID=us-west-2_jJs1JIarh`
- `COGNITO_CLIENT_ID=6j3dpm8g95pa2uuevfuk206qdi`
- `CORS_ALLOWED_ORIGINS` — exact comma-separated Amplify/custom-domain origins
- `POLICY_VERSION=2026-08-13`

Render supplies `PORT` automatically. Never expose the database URL or other server credentials through a `VITE_*` variable.

## Current API

- `GET /health/live`
- `GET /health/ready`
- `GET /v1/me`
- `GET /v1/works`
- `GET /v1/works/:id`
- `POST /v1/works`
- `DELETE /v1/works/:id`
- `POST /v1/legal/consents`

All `/v1` routes require a valid Cognito bearer token. Work queries always include the authenticated Cognito user ID so another user's record cannot be read or deleted by changing an ID.
