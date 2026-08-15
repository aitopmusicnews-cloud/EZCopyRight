# EZ Copyright — Render to AWS migration

This migration keeps the existing AWS Amplify frontend, Amazon Cognito users, and existing S3 audio objects. It moves the remaining production pieces from Render to AWS:

- Render Web Service -> Amazon ECS on AWS Fargate
- Render PostgreSQL -> Amazon RDS for PostgreSQL 17
- Render runtime secrets -> AWS Secrets Manager
- Render API URL -> Amazon API Gateway HTTP API
- Render logs -> Amazon CloudWatch Logs
- Stripe remains the payment provider, but its webhook endpoint moves to the AWS API URL

## Safety model

The infrastructure defaults to `desiredCount=0`. The first deployment provisions AWS without starting the production API. Do not change it to `1` until the database copy and Stripe secrets are complete.

RDS is private, encrypted, deletion-protected, backed up for seven days, and removed only by snapshot. The Fargate API runs in private subnets. API Gateway reaches the internal load balancer through a VPC Link.

The final database copy must be done during a brief write freeze. A rehearsal copy may be performed while Render is live, but do not use that rehearsal as the final cutover database because new records could be created afterward.

## 1. Identify the existing S3 bucket

Use the S3 bucket already configured as `S3_BUCKET` on the current production API. Do not create a replacement bucket; existing customer audio object keys are stored in PostgreSQL and must continue to resolve against the same bucket.

Set a shell variable in AWS CloudShell:

```bash
export EZCOPYRIGHT_S3_BUCKET='your-existing-bucket-name'
export AWS_REGION='us-west-2'
```

## 2. Bootstrap and provision AWS with the API stopped

From the repository root:

```bash
cd infrastructure
npm install
npx cdk bootstrap
npx cdk deploy EzCopyrightProduction \
  -c s3BucketName="$EZCOPYRIGHT_S3_BUCKET" \
  -c desiredCount=0
```

Save the CloudFormation outputs. They include the API URL, RDS secret ARN, Stripe secret ARN, temporary Render source database secret ARN, and migration task details.

## 3. Copy the existing production secrets into AWS Secrets Manager

Do not commit these values to GitHub.

In AWS Secrets Manager, update **StripeBillingSecret** so its JSON contains the existing production values:

```json
{
  "STRIPE_SECRET_KEY": "<existing live Stripe secret key>",
  "STRIPE_WEBHOOK_SECRET": "<existing live webhook signing secret>"
}
```

Update **RenderSourceDatabaseSecret** so its JSON contains the current Render PostgreSQL external connection URL:

```json
{
  "SOURCE_DATABASE_URL": "<current Render PostgreSQL external URL>"
}
```

The Render database URL is temporary migration material. Delete or rotate this secret after the migration is fully complete.

## 4. Optional rehearsal database copy

You may run the migration task once while Render is still live to prove connectivity and estimate the cutover procedure. Treat this only as a rehearsal.

From the repository root in AWS CloudShell or any shell with AWS CLI credentials:

```bash
bash scripts/aws-run-db-migration.sh
```

The one-off Fargate task performs a PostgreSQL 17 custom-format dump and restore, then compares row counts for:

- `works`
- `file_uploads`
- `billing_customers`
- `stripe_events`
- `policy_consents`
- `audit_events`

The task exits non-zero if any table count differs.

## 5. Final database cutover with a write freeze

Before the final copy, temporarily stop or suspend the Render API so it cannot accept customer writes or Stripe webhook writes while the snapshot is being taken. The Amplify frontend may show API errors during this short maintenance window; that is preferable to diverging databases.

With the Render API stopped, run the migration again from the repository root:

```bash
bash scripts/aws-run-db-migration.sh
```

Do not proceed unless the migration task reports matching row counts for every table.

Keep the Render PostgreSQL database itself available. Only the API needs to be stopped for the write freeze.

## 6. Start one AWS API task

After the final migration passes:

```bash
cd infrastructure
npx cdk deploy EzCopyrightProduction \
  -c s3BucketName="$EZCOPYRIGHT_S3_BUCKET" \
  -c desiredCount=1
```

Then verify the `ApiUrl` stack output:

```bash
curl -fsS "$(aws cloudformation describe-stacks \
  --stack-name EzCopyrightProduction \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue | [0]" \
  --output text)/health/ready"
```

Expected response:

```json
{"status":"ready"}
```

If AWS health does not pass, restart the Render API before allowing any AWS writes. At this point the Render database is still the safe rollback source because the AWS API has not yet received customer traffic.

## 7. Point Amplify to the AWS API

In AWS Amplify Hosting, set the production branch environment variable:

```text
VITE_API_BASE_URL=<ApiUrl output from EzCopyrightProduction>
```

Redeploy the `main` branch and verify sign-in and dashboard loading before creating new records.

The migration branch intentionally removes the old Render fallback. An Amplify production build will fail if `VITE_API_BASE_URL` is missing, preventing an accidental silent return to Render.

## 8. Move Stripe webhook delivery to AWS

Update the live Stripe webhook endpoint from:

```text
https://ezcopyright-api.onrender.com/v1/stripe/webhook
```

to:

```text
<ApiUrl>/v1/stripe/webhook
```

Keep these event types enabled:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

If Stripe creates a new webhook signing secret when the endpoint changes, update `STRIPE_WEBHOOK_SECRET` in AWS Secrets Manager and force a new ECS deployment before testing billing.

## 9. Production smoke test

Verify all of the following against the Amplify site:

1. Existing Cognito account can sign in.
2. Existing evidence records appear.
3. Existing stored audio downloads successfully.
4. New audio upload completes.
5. New evidence record is created and persists after a page reload.
6. Billing status loads.
7. Subscribe opens the live $9.99/month Stripe Checkout.
8. Customer Portal opens for an existing Stripe customer.
9. Stripe webhook delivery returns HTTP 2xx.
10. `/health/ready` returns HTTP 200.

Once new customer writes are accepted by AWS, do not point traffic back to the old Render database without first reconciling those AWS writes. The simple rollback window ends when AWS becomes the system of record.

## 10. Decommission Render only after the smoke test

After a successful AWS production session and successful Stripe webhook delivery:

- disable Render API auto-deploy
- take a final archival Render PostgreSQL export
- suspend/delete the Render API
- suspend/delete `ez-copyright-db`
- remove the broken Render frontend service if it is still present
- delete the temporary `RenderSourceDatabaseSecret` in AWS Secrets Manager

Do **not** delete the existing AWS S3 bucket, Cognito user pool, or Amplify app. They are part of the retained AWS production system.

## Rollback boundaries

Before AWS accepts customer writes, rollback is straightforward:

1. Restart the Render API if it was stopped.
2. Keep Amplify pointed at the Render API or set `VITE_API_BASE_URL` back to `https://ezcopyright-api.onrender.com` on the currently deployed production revision.
3. Keep or restore the Stripe webhook endpoint to the Render API.

After AWS accepts new customer writes, RDS is the system of record. A rollback to Render at that point requires a reverse data migration or reconciliation; do not switch the frontend back to the old Render database blindly.
