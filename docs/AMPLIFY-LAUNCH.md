# Amplify launch configuration

The repository-level `amplify.yml` builds the Vite application with the EZ Copyright Cognito configuration and publishes `dist/`.

## Build configuration

The build uses these production defaults unless the Amplify app overrides them:

- `VITE_AWS_REGION=us-west-2`
- `VITE_COGNITO_USER_POOL_ID=us-west-2_jJs1JIarh`
- `VITE_COGNITO_CLIENT_ID=6j3dpm8g95pa2uuevfuk206qdi`

These identifiers are public client configuration, not credentials. Secrets must never be placed in `VITE_*` variables.

`VITE_API_BASE_URL` will be added when the production Render API is ready. The current frontend does not consume that variable yet.

## Legal routes

The post-build script creates static entry points for:

- `/terms/`
- `/privacy/`
- `/refund-policy/`

This keeps the legal pages available on a direct page load even before an Amplify catch-all rewrite is configured. The recommended Amplify rewrite remains:

| Source | Target | Type |
|---|---|---|
| `/<*>` | `/index.html` | `200 (Rewrite)` |

## Production verification

After Amplify deploys `main`, verify:

1. The build uses `amplify.yml` and completes successfully.
2. The landing page shows the EZ Way logo and “EZ Copyright by THE EZ WAY.”
3. `/terms`, `/privacy`, and `/refund-policy` load directly and after refresh.
4. Sign up uses Cognito and sends an email confirmation code.
5. Browser storage does not contain a locally stored plaintext password.
