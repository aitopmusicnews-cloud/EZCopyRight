# EZCopyRight Azure fast cutover

This directory contains the fast migration path from AWS hosting to Azure.

## Target architecture

- Azure Container Apps: React frontend + Node/Express API in one container
- Azure Container Registry: container images
- Azure Database for PostgreSQL Flexible Server: application database
- Azure Blob Storage: private evidence/audio storage
- Stripe: unchanged billing account and product
- Amazon Cognito: temporary authentication bridge during the hosting cutover
- Cloudflare: existing DNS remains authoritative

## First deployment

Run `azure/deploy.sh` from Azure Cloud Shell or any machine with Azure CLI.

The script:
1. signs in to Azure if needed,
2. creates the resource group in East US 2,
3. creates private Blob Storage,
4. creates a fresh PostgreSQL Flexible Server/database,
5. creates Azure Container Registry,
6. builds this repository in ACR,
7. creates a Container Apps environment,
8. deploys EZCopyRight with production secrets stored as Container App secrets,
9. prints the temporary Azure hostname and health URL.

The script prompts for the live Stripe secret key and current Stripe webhook signing secret. Do not commit those values.

## Cutover

Before changing DNS, verify:
- the temporary Azure URL loads the EZCopyRight website,
- `/health/ready` is healthy,
- sign-in works,
- checkout opens correctly,
- a test audio upload completes,
- the evidence record/certificate flow completes,
- private audio can be downloaded.

After verification, bind `ezwaycopyrights.com` to the Container App, update the Cloudflare DNS record, and verify Stripe webhooks on the live domain.

## After cutover

Once Azure is stable:
- migrate authentication from Cognito to Microsoft Entra External ID,
- remove AWS-only agent/API references,
- disable the AWS Amplify/App Runner/RDS/S3 resources only after final verification.
