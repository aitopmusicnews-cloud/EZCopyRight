#!/usr/bin/env bash
set -Eeuo pipefail

STACK_NAME="${STACK_NAME:-EzCopyrightProduction}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}"

output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text
}

CLUSTER="$(output MigrationClusterName)"
TASK_DEFINITION="$(output MigrationTaskDefinitionArn)"
SECURITY_GROUP="$(output MigrationSecurityGroupId)"
SUBNETS="$(output MigrationSubnetIds)"

if [[ -z "$CLUSTER" || "$CLUSTER" == "None" || -z "$TASK_DEFINITION" || "$TASK_DEFINITION" == "None" ]]; then
  echo "Migration outputs are missing from stack $STACK_NAME." >&2
  exit 1
fi

NETWORK="awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=DISABLED}"

echo "Starting one-off database migration task in $REGION..."
TASK_ARN="$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEFINITION" \
  --launch-type FARGATE \
  --network-configuration "$NETWORK" \
  --region "$REGION" \
  --query 'tasks[0].taskArn' \
  --output text)"

if [[ -z "$TASK_ARN" || "$TASK_ARN" == "None" ]]; then
  echo "AWS did not return a migration task ARN." >&2
  exit 1
fi

echo "Migration task: $TASK_ARN"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION"

EXIT_CODE="$(aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --region "$REGION" \
  --query 'tasks[0].containers[0].exitCode' \
  --output text)"
STOP_REASON="$(aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --region "$REGION" \
  --query 'tasks[0].stoppedReason' \
  --output text)"

echo "Stopped reason: $STOP_REASON"
if [[ "$EXIT_CODE" != "0" ]]; then
  echo "Database migration failed with exit code $EXIT_CODE. Check the ez-copyright-db-migration CloudWatch log stream." >&2
  exit 1
fi

echo "Database migration completed and row counts matched."
