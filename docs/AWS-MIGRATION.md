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

## 3. Copy the two existing production secrets into AWS Secrets Manager

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

## 4. Copy Render PostgreSQL into private RDS

From AWS CloudShell or any shell with AWS CLI credentials:

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

## 5. Start one AWS API task

After the migration passes:

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

## 6. Point Amplify to the AWS API

In AWS Amplify Hosting, set the production branch environment variable:

```text
VITE_API_BASE_URL=<ApiUrl output from EzCopyrightProduction>
```

Redeploy the `main` branch and verify sign-in, dashboard loading, upload, download, evidence-record creation, billing status, and billing portal.

Do not remove the Render API yet.

## 7. Move Stripe webhook delivery to AWS

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

## 8. Production smoke test

Verify all of the following against the Amplify site:

1. Existing Cognito account can sign in.
2. Existing evidence records appear.
3. Existing stored audio downloads successfully.
4. New audio upload completes.
5. New evidence record is created and persisted.
6. Billing status loads.
7. Subscribe opens the live $9.99/month Stripe Checkout.
8. Customer Portal opens for an existing Stripe customer.
9. Stripe webhook delivery returns HTTP 2xx.
10. `/health/ready` returns HTTP 200.

## 9. Decommission Render only after the smoke test

After at least one successful AWS production session and successful Stripe webhook delivery:

- disable Render API auto-deploy
- keep Render API available briefly as rollback protection
- take a final Render PostgreSQL export
- suspend/delete the Render API
- suspend/delete `ez-copyright-db`
- remove the broken Render frontend service if it is still present
- delete the temporary `RenderSourceDatabaseSecret` in AWS Secrets Manager

Do **not** delete the existing AWS S3 bucket, Cognito user pool, or Amplify app. They are part of the retained AWS production system.

## Rollback

Before Render is decommissioned, rollback is simple:

1. Set Amplify `VITE_API_BASE_URL` back to `https://ezcopyright-api.onrender.com`.
2. Point the Stripe webhook endpoint back to the Render API.
3. Redeploy Amplify.

Because the AWS cutover is performed only after the Render database copy completes, Render remains the rollback source until final decommissioning.
