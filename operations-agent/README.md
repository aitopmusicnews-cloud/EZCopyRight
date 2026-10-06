# EZCopyRight Operations Agent

A separately deployed, OpenAI-powered operations service for EZCopyRight. It has an owner-only dashboard, scheduled investigations, durable PostgreSQL jobs, scoped integrations, and a review queue for actions affecting customers, money, code, or production services.

**Status:** implementation and offline tests are available. AWS deployment, live credentials, and end-to-end provider tests are still required. This directory does not change the existing frontend/API deployment.

## What it can do

| Area | Investigate automatically | Execute after owner approval |
| --- | --- | --- |
| App | Frontend response, API liveness/readiness | Request an API redeployment |
| Stripe | Configured plan, up to 500 subscriptions per scan, customer invoices, invoice payment IDs | Partial refunds up to configured cap, cancellation at period end, undo scheduled cancellation, single-use product-scoped coupons |
| Customers | App billing membership and subscription status | Enable/disable a Cognito user belonging to this app; owner accounts are protected |
| Evidence/uploads | Status counts, recent uploads, stale uploads | Prepare code fixes; never edit or delete evidence or audio |
| AWS | App Runner, Amplify, RDS state/backup configuration, Cognito, S3 versioning/public access block, named CloudWatch alarms | Request API/frontend deployment |
| Code | Repository files, recent GitHub workflow runs, open PRs | Create a branch and draft PR containing the exact reviewed replacement files |
| Project management | Priorities, persistent recent reports, action history | Track owner decisions in an audit trail |
| Support/content | Draft explanations and support replies | Owner sends messages outside the agent |

This first release does **not** send customer messages, merge PRs, execute arbitrary shell commands/SQL, alter prices/tax/payouts, resolve disputes, restore backups, read raw application logs, or perform end-to-end musical uploads. These need additional scoped tools and validation; a report must not imply they were checked or completed. Infrastructure alarms have no external notification destination until an operator connects one. The dashboard is the current reporting destination.

Evidence records are not government copyright registrations. Preserve that distinction in all generated copy.

## Architecture

- One always-running **ECS Fargate** task serves the dashboard and polls the durable work queue. This avoids relying on background timers in a request-scaled hosting service.
- An **HTTPS Application Load Balancer** fronts the task. Task port 8080 only accepts inbound traffic from the ALB security group.
- A separate **Cognito app client** uses authorization-code flow with PKCE. API calls verify the ID token signature, issuer, audience, expiry, token use, and explicit owner `sub` allowlist. Ordinary app users cannot access operations.
- The existing RDS instance can host an isolated `ez_agent` schema. The agent uses a schema-specific runtime login and a second SELECT-only application login. It never uses the app's database-owner credentials.
- An advisory lock elects a single monitoring worker across task replacements. Jobs survive restarts. Interrupted jobs are marked failed and must be rerun; interrupted actions require reconciliation.
- OpenAI Responses tools can read and **propose**. They cannot approve or execute. Approval endpoints execute a strict, fixed tool allowlist outside the model loop.
- Scans run every 15 minutes; the default cap is 120 investigations per rolling 24 hours, including manually requested jobs. A run has a six-turn tool limit and a time bound. This is a run limit, not a monetary budget; also set your OpenAI project spending controls.

The supplied network configuration uses existing public subnets with internet-gateway routes, a public task IP for outbound API access, and no direct task ingress. It provisions no NAT gateway or replacement database. Review this against your network policy before deployment. Fargate, ALB, logs, Secrets Manager, and model calls incur ongoing usage charges.

## Setup order

1. Authenticate AWS deployment tooling in the intended account and region. Required local tools: Node 22+, npm, AWS CLI, Docker, and CDK (installed by this package). Confirm the account before any deployment.
2. Install: `cd operations-agent && npm ci`.
3. Copy `infra/config.example.json` to the ignored `infra/config.json`. Fill real resource IDs, two public subnets in distinct availability zones in the database VPC, your Cognito user `sub`, existing Cognito Hosted UI domain, an enabled OpenAI model, and the Stripe **product and price for the selected environment**. Use `agent.ezwaycopyrights.com` or your chosen hostname.
4. Obtain an ACM certificate for that hostname in the same AWS region and complete DNS validation. Set its ARN in the config. The template creates a new Cognito app client with that hostname as its callback/logout destination.
5. Apply `src/migration.sql` using a schema-owner/DBA connection, then adapt and run `infra/database-grants.sql`. Replace `CURRENT_DATABASE_PLACEHOLDER` with the actual database identifier and set dedicated role passwords securely. Runtime credentials cannot run migrations. `npm run migrate` is an alternative when migration credentials are provided through environment variables.
6. Create a Secrets Manager secret containing the JSON fields listed below. Use the complete ARN including its six-character suffix. If using a customer-managed KMS key, explicitly grant the ECS execution role decrypt access before launch.
7. Run `npm test`, `npm run synth`, then `npm run diff`. Review the new resources and the one added database security-group rule. Bootstrap CDK in the account/region if not already done. The deployment builds and uploads the agent Docker image through CDK's asset registry.
8. Deploy with `npm run deploy`. Create a DNS-only CNAME from your agent hostname to the `DnsCnameTarget` output. The certificate and HTTPS listener terminate TLS. Wait for healthy ECS targets.
9. Sign in with the allowlisted owner account. Check the first review for unavailable integrations. Run the smoke tests below in Stripe's sandbox before switching to live configuration.
10. After review, set `enableWrites: true` and redeploy to enable approved actions and the matching limited AWS IAM writes. Add the separate Stripe write key only for the actions you intend to use. This still requires an individual dashboard approval for each action.

The CDK stack creates a cluster, task/service, ALB/listeners/target group, two security groups, task roles/policies, log group, a Cognito app client, and an unhealthy-target alarm. It adds ingress to the configured existing DB security group. It does not create a new RDS instance, S3 bucket, app API, app frontend, or Cognito pool. Stack termination protection is enabled; logs are retained.

## Secrets and access

Do not paste these values into the dashboard or chat, commit them, or put them in browser variables.

| Secret JSON field | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL login restricted to the `ez_agent` tables |
| `APP_DATABASE_URL` | Separate read-only application DB login |
| `DATABASE_CA` | AWS RDS CA certificate PEM as a JSON string with escaped newlines |
| `OPENAI_API_KEY` | Dedicated OpenAI project service account key |
| `STRIPE_READ_KEY` | Restricted key in the selected Stripe environment |
| `STRIPE_WRITE_KEY` | Optional, separately restricted key; omit during observation-only rollout |
| `GITHUB_TOKEN` | Fine-grained credential restricted to `aitopmusicnews-cloud/EZCopyRight` |

Stripe read access: prices, subscriptions, invoices, invoice payments, payment intents. Stripe write access: refunds, subscription updates, coupons. Use restricted keys and test in a separate sandbox. Both configured keys must match `stripeLive`. The SDK's API version is pinned by `package-lock.json`; do not upgrade without repeating billing tests.

GitHub read access: contents, actions, pull requests, metadata. Draft PRs additionally require contents and pull-request write. Workflow-file changes need GitHub's corresponding workflow permission; otherwise those proposals fail and require investigation. The agent never merges or runs generated code on its own host.

The application reader has column-level SELECT permissions only for the actual counts and membership checks used. Its default SQL transaction mode is read-only. Database TLS verifies certificates; there is no `rejectUnauthorized:false` bypass.

## Operator workflow

Ask the agent:

- “Review the whole app and give me the three most important next actions.”
- “Investigate past-due subscriptions for our plan.”
- “Look up customer cus_… and explain their invoice problem.”
- “Read invoice in_… and prepare a 500-cent refund of its payment if eligible.”
- “Investigate the latest failed build and prepare a draft PR with a fix.”
- “Review evidence upload failures and tell me what is actually verified.”

Expand **View exact action** to inspect targets, amounts, full file content, and parameters. Approvals expire after 24 hours. Refunds use integer smallest-currency units and default to a 2,500-unit per-action cap. The app currently uses a single configured price: a subscription with additional unrelated items is not eligible for automated changes.

`completed` on a deployment action means the provider accepted the deployment request, **not** that deployment succeeded. The following health review verifies its status. A refund result can likewise be `pending` at Stripe; inspect the returned provider status.

`needs_reconciliation` means an external request may have succeeded even if the response was lost. Investigate the action ID, Stripe metadata/idempotency key, AWS operation/job status, or GitHub branch `ez-agent/<action-id>` before creating another proposal. The system will not replay the action automatically.

Emergency stop: set `enableWrites: false` and redeploy; stop the ECS service if investigation itself must stop immediately. Rotate/revoke affected provider credentials for an access incident.

## Validation and launch checks

```bash
npm ci
npm test
npm audit --omit=dev --audit-level=high
npm run synth
npm run diff
```

Tests exercise owner authorization, cross-origin requests, duplicate approval prevention, rejection/kill switch behavior, uncertain outcomes, cross-app billing isolation, refund caps and idempotency, PostgreSQL job/action transitions, model tool boundaries, and deployment IAM/network configuration. They use mocks and an embedded PostgreSQL engine, not production customers.

Before live use verify:

1. Ordinary app users receive 401; the designated owner can sign in through PKCE.
2. The dashboard updates through ALB HTTPS and the first scheduled job completes.
3. All five integration groups return observed data rather than errors.
4. A sandbox invoice lookup returns its payment ID, and an approved sandbox refund updates the correct payment once.
5. Cancellation/resumption and one-use coupon creation work only for the configured app product.
6. A test draft PR is created and the repository CI passes before anybody merges it.
7. Stop/restart the task: completed jobs and actions remain; interrupted actions are flagged.
8. Confirm restore procedures and customer upload flows separately. Backup configuration visibility is not a restore test.

Known dependency limitation: the current CDK development dependency bundles `brace-expansion` with a high-severity denial-of-service advisory. `npm audit fix` cannot replace that bundled dependency. Runtime production dependencies pass the high-severity audit; CDK receives only operator-controlled paths/configuration. Track the upstream CDK fix and rerun a full audit before deployment-tool upgrades. Do not describe the full development dependency tree as advisory-free.

## References

- https://developers.openai.com/api/docs/guides/function-calling
- https://docs.stripe.com/keys
- https://docs.stripe.com/api/invoice-payment/list
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/networking-outbound.html
