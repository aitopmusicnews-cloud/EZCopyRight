#!/usr/bin/env bash
set -euo pipefail

LOCATION="${AZURE_LOCATION:-eastus2}"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-ezcopyright-prod-rg}"
CONTAINER_ENV="${AZURE_CONTAINER_ENV:-ezcopyright-prod-env}"
CONTAINER_APP="${AZURE_CONTAINER_APP:-ezcopyright}"
DATABASE_NAME="${AZURE_DATABASE_NAME:-ezcopyright}"
DATABASE_ADMIN="${AZURE_DATABASE_ADMIN:-ezadmin}"
STORAGE_CONTAINER="${AZURE_STORAGE_CONTAINER:-private-audio}"
STRIPE_PRICE_ID="${STRIPE_PRICE_ID:-price_1UHO2UIgHJywqbkk3hepc7hg}"
AUTH_MODE="${AUTH_MODE:-clerk}"
AUTH_PROVIDER="${AUTH_PROVIDER:-ezid}"
CLERK_PUBLISHABLE_KEY="${CLERK_PUBLISHABLE_KEY:-}"
CLERK_FRONTEND_API="${CLERK_FRONTEND_API:-https://clerk.ezwaycopyrights.com}"
CLERK_AUTHORIZED_PARTIES="${CLERK_AUTHORIZED_PARTIES:-https://ezwaycopyrights.com}"

command -v az >/dev/null 2>&1 || {
  echo "Azure CLI is required. Open Azure Cloud Shell and run this script there."
  exit 1
}

if ! az account show >/dev/null 2>&1; then
  echo "Signing in to Azure..."
  az login --use-device-code >/dev/null
fi

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
SUFFIX="$(printf '%s' "$SUBSCRIPTION_ID" | tr -d '-' | tr '[:upper:]' '[:lower:]' | cut -c1-8)"
ACR_NAME="${AZURE_ACR_NAME:-ezcopyright${SUFFIX}}"
STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-ezcopy${SUFFIX}}"
POSTGRES_SERVER="${AZURE_POSTGRES_SERVER:-ezcopyright-pg-${SUFFIX}}"

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  read -r -s -p "Stripe live secret key: " STRIPE_SECRET_KEY
  echo
fi
if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  read -r -s -p "Stripe webhook signing secret: " STRIPE_WEBHOOK_SECRET
  echo
fi

if [[ -z "$STRIPE_SECRET_KEY" || -z "$STRIPE_WEBHOOK_SECRET" ]]; then
  echo "Stripe secret key and webhook signing secret are required."
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  RANDOM_HEX="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(24))
PY
)"
else
  RANDOM_HEX="$(openssl rand -hex 24)"
fi
POSTGRES_PASSWORD="Aa1_${RANDOM_HEX}"

echo "Registering Azure providers..."
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.ContainerRegistry --wait
az provider register --namespace Microsoft.DBforPostgreSQL --wait
az provider register --namespace Microsoft.Storage --wait

az extension add --name containerapp --upgrade >/dev/null 2>&1 || \
  az extension update --name containerapp >/dev/null

echo "Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

echo "Preparing private Blob Storage..."
if ! az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az storage account create \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --allow-blob-public-access false \
    --output none
else
  echo "Storage account '$STORAGE_ACCOUNT' already exists; reusing it."
fi

STORAGE_KEY="$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query '[0].value' -o tsv)"

az storage container create \
  --name "$STORAGE_CONTAINER" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --public-access off \
  --output none

echo "Preparing PostgreSQL Flexible Server..."
if az postgres flexible-server show --resource-group "$RESOURCE_GROUP" --name "$POSTGRES_SERVER" >/dev/null 2>&1; then
  echo "PostgreSQL server '$POSTGRES_SERVER' already exists; resetting the generated admin password for this resumed deployment."
  az postgres flexible-server update \
    --resource-group "$RESOURCE_GROUP" \
    --name "$POSTGRES_SERVER" \
    --admin-password "$POSTGRES_PASSWORD" \
    --output none
else
  az postgres flexible-server create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$POSTGRES_SERVER" \
    --location "$LOCATION" \
    --admin-user "$DATABASE_ADMIN" \
    --admin-password "$POSTGRES_PASSWORD" \
    --tier Burstable \
    --sku-name Standard_B1ms \
    --storage-size 32 \
    --storage-auto-grow Enabled \
    --backup-retention 7 \
    --version 16 \
    --public-access 0.0.0.0 \
    --yes \
    --output none
fi

EXISTING_DATABASE="$(az postgres flexible-server db list \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$POSTGRES_SERVER" \
  --query "[?name=='$DATABASE_NAME'].name | [0]" -o tsv)"

if [[ "$EXISTING_DATABASE" != "$DATABASE_NAME" ]]; then
  az postgres flexible-server db create \
    --resource-group "$RESOURCE_GROUP" \
    --server-name "$POSTGRES_SERVER" \
    --name "$DATABASE_NAME" \
    --output none
else
  echo "Database '$DATABASE_NAME' already exists; reusing it."
fi

DATABASE_URL="postgresql://${DATABASE_ADMIN}:${POSTGRES_PASSWORD}@${POSTGRES_SERVER}.postgres.database.azure.com:5432/${DATABASE_NAME}?sslmode=require"

echo "Preparing Azure Container Registry..."
if ! az acr show --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" >/dev/null 2>&1; then
  az acr create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --location "$LOCATION" \
    --sku Basic \
    --admin-enabled true \
    --output none
else
  echo "Container registry '$ACR_NAME' already exists; reusing it."
  az acr update --name "$ACR_NAME" --admin-enabled true --output none
fi

echo "Building EZCopyRight in Azure..."
az acr build \
  --registry "$ACR_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --image "ezcopyright:latest" \
  .

ACR_SERVER="$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)"
ACR_USERNAME="$(az acr credential show --name "$ACR_NAME" --query username -o tsv)"
ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"

echo "Preparing Container Apps environment..."
if ! az containerapp env show --name "$CONTAINER_ENV" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az containerapp env create \
    --name "$CONTAINER_ENV" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
else
  echo "Container Apps environment '$CONTAINER_ENV' already exists; reusing it."
fi

echo "Deploying EZCopyRight..."
az containerapp create \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINER_ENV" \
  --image "${ACR_SERVER}/ezcopyright:latest" \
  --registry-server "$ACR_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --ingress external \
  --target-port 8080 \
  --transport auto \
  --min-replicas 1 \
  --max-replicas 3 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --secrets \
    "database-url=${DATABASE_URL}" \
    "azure-storage-key=${STORAGE_KEY}" \
    "stripe-secret-key=${STRIPE_SECRET_KEY}" \
    "stripe-webhook-secret=${STRIPE_WEBHOOK_SECRET}" \
  --env-vars \
    "NODE_ENV=production" \
    "PORT=8080" \
    "DATABASE_URL=secretref:database-url" \
    "DATABASE_SSL=true" \
    "STORAGE_PROVIDER=azure" \
    "AZURE_STORAGE_ACCOUNT=${STORAGE_ACCOUNT}" \
    "AZURE_STORAGE_CONTAINER=${STORAGE_CONTAINER}" \
    "AZURE_STORAGE_ACCOUNT_KEY=secretref:azure-storage-key" \
    "CORS_ALLOWED_ORIGINS=https://ezwaycopyrights.com" \
    "APP_BASE_URL=https://ezwaycopyrights.com" \
    "POLICY_VERSION=2026-08-13" \
    "AUTH_MODE=${AUTH_MODE}" \
    "AUTH_PROVIDER=${AUTH_PROVIDER}" \
    "CLERK_PUBLISHABLE_KEY=${CLERK_PUBLISHABLE_KEY}" \
    "CLERK_FRONTEND_API=${CLERK_FRONTEND_API}" \
    "CLERK_AUTHORIZED_PARTIES=${CLERK_AUTHORIZED_PARTIES}" \
    "STRIPE_SECRET_KEY=secretref:stripe-secret-key" \
    "STRIPE_WEBHOOK_SECRET=secretref:stripe-webhook-secret" \
    "STRIPE_PRICE_ID=${STRIPE_PRICE_ID}" \
    "MONTHLY_REGISTRATION_LIMIT=5" \
    "MAX_UPLOAD_BYTES=536870912" \
  --output none

FQDN="$(az containerapp show \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn \
  -o tsv)"

az containerapp update \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --set-env-vars \
    "CORS_ALLOWED_ORIGINS=https://ezwaycopyrights.com,https://${FQDN}" \
  --output none

echo
echo "Azure deployment complete."
echo "Temporary Azure URL: https://${FQDN}"
echo "Health check: https://${FQDN}/health/ready"
echo "Resource group: ${RESOURCE_GROUP}"
echo
echo "NEXT: verify the temporary URL, then point ezwaycopyrights.com to this Container App."
