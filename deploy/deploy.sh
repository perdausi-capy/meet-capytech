#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

NEW_TAG="$1"
PREV_TAG="$(cat .current_tag 2>/dev/null || echo '')"

export APP_TAG="$NEW_TAG"
docker compose pull app
docker compose up -d app

for i in {1..12}; do
  STATUS=$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q app)" || echo "starting")
  if [ "$STATUS" == "healthy" ]; then
    echo "$NEW_TAG" > .current_tag
    docker image prune -f >/dev/null
    echo "Successfully deployed $NEW_TAG"
    exit 0
  fi
  sleep 5
done

echo "Health check failed." >&2
if [ -z "$PREV_TAG" ] || [ "$PREV_TAG" == "latest" ]; then
  echo "No valid previous tag to roll back to. Stopping app." >&2
  docker compose stop app
  exit 1
fi

echo "Rolling back to $PREV_TAG" >&2
export APP_TAG="$PREV_TAG"
docker compose up -d app
exit 1
