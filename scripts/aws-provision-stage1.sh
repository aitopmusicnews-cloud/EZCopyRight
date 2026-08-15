#!/usr/bin/env bash
set -Eeuo pipefail

export AWS_REGION="${AWS_REGION:-us-west-2}"
export AWS_DEFAULT_REGION="$AWS_REGION"

if [[ -z "${EZCOPYRIGHT_S3_BUCKET:-}" ]]; then
  echo "Existing S3 buckets in this AWS account:"
  aws s3api list-buckets --query 'Buckets[].Name' --output text | tr '\t' '\n' | sed 's/^/  - /'
  echo
  read -r -p "Enter the existing EZ Copyright audio bucket name: " EZCOPYRIGHT_S3_BUCKET
  export EZCOPYRIGHT_S3_BUCKET
fi

if [[ -z "$EZCOPYRIGHT_S3_BUCKET" ]]; then
  echo "An existing EZ Copyright S3 bucket name is required." >&2
  exit 1
fi

if ! aws s3api head-bucket --bucket "$EZCOPYRIGHT_S3_BUCKET" >/dev/null 2>&1; then
  echo "AWS cannot access bucket: $EZCOPYRIGHT_S3_BUCKET" >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "AWS account: $ACCOUNT_ID"
echo "AWS region:  $AWS_REGION"
echo "S3 bucket:   $EZCOPYRIGHT_S3_BUCKET"
echo

echo "Installing pinned infrastructure dependencies..."
(
  cd infrastructure
  npm install --ignore-scripts

  echo "Bootstrapping AWS CDK for $ACCOUNT_ID/$AWS_REGION..."
  npx cdk bootstrap "aws://${ACCOUNT_ID}/${AWS_REGION}"

  echo "Provisioning EZ Copyright AWS backend with zero running API tasks..."
  npx cdk deploy EzCopyrightProduction \
    --require-approval broadening \
    -c s3BucketName="$EZCOPYRIGHT_S3_BUCKET" \
    -c desiredCount=0
)

echo
echo "Stage 1 complete. AWS resources are provisioned but the production API has zero running tasks."
echo "CloudFormation outputs:"
aws cloudformation describe-stacks \
  --stack-name EzCopyrightProduction \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs[].{Name:OutputKey,Value:OutputValue}' \
  --output table

echo
echo "Next: put the existing Stripe credentials and Render PostgreSQL source URL directly into AWS Secrets Manager, then run the database migration. Do not paste those secret values into chat or GitHub."
