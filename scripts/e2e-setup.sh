#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.test.yml"
CONTAINER_NAME="openpath-test-db"
SERVICE_NAME="postgres-test"

cd "$ROOT_DIR"

wait_for_postgres() {
  local attempts=0

  until docker exec "$CONTAINER_NAME" pg_isready -U openpath -d openpath_test >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      echo "openpath-test-db did not become ready in time" >&2
      exit 1
    fi
    sleep 1
  done
}

docker compose -f "$COMPOSE_FILE" pull "$SERVICE_NAME" >/dev/null 2>&1 || true

if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  is_running="$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || echo false)"
  if [ "$is_running" = "true" ] && docker exec "$CONTAINER_NAME" pg_isready -U openpath -d openpath_test >/dev/null 2>&1; then
    echo "Reusing healthy E2E PostgreSQL container..."
    DB_PORT=5433 DB_PASSWORD=openpath_test DB_NAME=openpath_test npm run db:setup:e2e --workspace=@openpath/api
    exit 0
  fi
fi

docker compose -f "$COMPOSE_FILE" down -v
docker compose -f "$COMPOSE_FILE" up -d "$SERVICE_NAME"
wait_for_postgres
DB_PORT=5433 DB_PASSWORD=openpath_test DB_NAME=openpath_test npm run db:setup:e2e --workspace=@openpath/api
