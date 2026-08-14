# EZ Copyright legal launch checklist

Policy version: `2026-08-13`

- Legal entity: The Artist Cut Inc
- Governing state: California
- Privacy and support contact: privacy@cts-management.com

## Implemented in the frontend

- Public routes for `/terms`, `/privacy`, and `/refund-policy`
- Legal links on every customer-facing screen
- Required Terms and Privacy acceptance before account creation
- Clear distinction between an EZ Copyright evidence record and a U.S. Copyright Office registration
- Privacy disclosures covering accounts, musical works, uploads, generated hashes, payments, infrastructure providers, retention, and user requests

## Required before public production launch

- Have qualified counsel review and approve all three policies.
- Confirm that `privacy@cts-management.com` is active and monitored.
- Configure Amplify to rewrite `/terms`, `/privacy`, and `/refund-policy` to `/index.html` with a `200` response.
- Store consent on the server using authenticated user ID, policy type, policy version, acceptance timestamp, request ID, and source flow.
- Require the current policy versions at checkout and store checkout consent server-side.
- Provide authenticated account export and deletion requests, plus an internal fulfillment workflow.
- Confirm the final list of subprocessors and infrastructure regions after the Render-backed production architecture is deployed.
- Confirm final prices, subscription behavior, cancellation behavior, taxes, and refund handling before enabling live Stripe payments.
- Re-review the policies whenever collection, storage, analytics, advertising, subprocessors, payment terms, or user eligibility changes.
