#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-ezcopyright}"
RESOURCE_GROUP="${RESOURCE_GROUP:-ezcopyright-prod-rg}"
APP_URL="${APP_URL:-https://ezwaycopyrights.com}"
CLERK_FRONTEND_API="${CLERK_FRONTEND_API:-https://clerk.ezwaycopyrights.com}"
AZURE_OPENAI_ENDPOINT="${AZURE_OPENAI_ENDPOINT:-https://ezvids-resource.services.ai.azure.com/openai/v1/responses}"
AZURE_OPENAI_MODEL="${AZURE_OPENAI_MODEL:-gpt-4.1-mini}"

command -v az >/dev/null 2>&1 || {
  echo "Azure CLI is required."
  exit 1
}

if ! az account show >/dev/null 2>&1; then
  echo "Sign in to Azure first:"
  echo "  az login --use-device-code"
  exit 1
fi

echo
echo "EZCopyRight live repair"
echo "App: $APP_NAME"
echo "Resource group: $RESOURCE_GROUP"
echo

if ! az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  echo "Container App '$APP_NAME' was not found in '$RESOURCE_GROUP'."
  exit 1
fi

read -r -p "Clerk User ID for agent admin (starts with user_): " CLERK_USER_ID
if [[ "$CLERK_USER_ID" != user_* ]]; then
  echo "That does not look like a Clerk User ID. No changes were made."
  exit 1
fi

EXISTING_AI_SECRET="$(az containerapp secret list   --name "$APP_NAME"   --resource-group "$RESOURCE_GROUP"   --query "[?name=='azure-openai-key'].name | [0]"   -o tsv 2>/dev/null || true)"

if [[ "$EXISTING_AI_SECRET" != "azure-openai-key" ]]; then
  echo
  read -r -s -p "Azure AI API key: " AZURE_AI_KEY
  echo
  if [[ -z "$AZURE_AI_KEY" ]]; then
    echo "Azure AI API key is required. No changes were made."
    exit 1
  fi

  az containerapp secret set     --name "$APP_NAME"     --resource-group "$RESOURCE_GROUP"     --secrets "azure-openai-key=$AZURE_AI_KEY"     --output none
else
  echo "Existing Azure AI secret found; reusing it."
fi

echo "Applying live settings..."

az containerapp update   --name "$APP_NAME"   --resource-group "$RESOURCE_GROUP"   --set-env-vars     "AUTH_MODE=clerk"     "CLERK_FRONTEND_API=$CLERK_FRONTEND_API"     "CLERK_AUTHORIZED_PARTIES=$APP_URL"     "CLERK_JWKS_URL=$CLERK_FRONTEND_API/.well-known/jwks.json"     "AGENT_ADMIN_USER_IDS=$CLERK_USER_ID"     "AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT"     "AZURE_OPENAI_API_KEY=secretref:azure-openai-key"     "AZURE_OPENAI_MODEL=$AZURE_OPENAI_MODEL"   --output none

echo
echo "Checking newest revision..."

LATEST_REVISION="$(az containerapp revision list   --name "$APP_NAME"   --resource-group "$RESOURCE_GROUP"   --query "sort_by([], &properties.createdTime)[-1].name"   -o tsv)"

az containerapp revision list   --name "$APP_NAME"   --resource-group "$RESOURCE_GROUP"   --query "[?name=='$LATEST_REVISION'].{Name:name,Active:properties.active,Health:properties.healthState,Traffic:properties.trafficWeight,Provisioning:properties.provisioningState}"   -o table

echo
echo "Checking application health..."
HTTP_CODE="$(curl -sS -o /tmp/ezcopyright-health.json -w "%{http_code}" "$APP_URL/health/live" || true)"
if [[ "$HTTP_CODE" == "200" ]]; then
  echo "Live health check: OK"
else
  echo "Live health check returned HTTP $HTTP_CODE"
  cat /tmp/ezcopyright-health.json 2>/dev/null || true
  echo
fi

echo
echo "Repair complete."
echo "Next:"
echo "  1. Refresh $APP_URL"
echo "  2. Sign in"
echo "  3. Open the Agent"
echo "  4. Ask: Check the current EZCopyRight deployment health."
