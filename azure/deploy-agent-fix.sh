#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-ezcopyright}"
RESOURCE_GROUP="${RESOURCE_GROUP:-ezcopyright-prod-rg}"

command -v az >/dev/null 2>&1 || { echo "Azure CLI is required."; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git is required."; exit 1; }

if ! az account show >/dev/null 2>&1; then
  echo "Sign in first with: az login --use-device-code"
  exit 1
fi

git pull --ff-only

ACR_NAME="$(az acr list   --resource-group "$RESOURCE_GROUP"   --query "[0].name"   -o tsv)"

if [[ -z "$ACR_NAME" ]]; then
  echo "No Azure Container Registry found in $RESOURCE_GROUP."
  exit 1
fi

ACR_SERVER="$(az acr show   --name "$ACR_NAME"   --resource-group "$RESOURCE_GROUP"   --query loginServer   -o tsv)"

TAG="$(git rev-parse --short=12 HEAD)"
IMAGE="$ACR_SERVER/ezcopyright:$TAG"

echo "Building $IMAGE ..."
az acr build   --registry "$ACR_NAME"   --resource-group "$RESOURCE_GROUP"   --image "ezcopyright:$TAG"   .   --output none

echo "Deploying new application image..."
az containerapp update   --name "$APP_NAME"   --resource-group "$RESOURCE_GROUP"   --image "$IMAGE"   --output none

echo
echo "Latest revision:"
az containerapp revision list   --name "$APP_NAME"   --resource-group "$RESOURCE_GROUP"   --query "sort_by([], &properties.createdTime)[-1].{Name:name,Active:properties.active,Health:properties.healthState,Traffic:properties.trafficWeight,Provisioning:properties.provisioningState}"   -o table

echo
echo "Deployed image: $IMAGE"
echo "Refresh https://ezwaycopyrights.com and test the Agent again."
