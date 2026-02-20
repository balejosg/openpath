#!/bin/bash
# Start API with E2E test database configuration
export NODE_ENV="${NODE_ENV:-test}"
export JWT_SECRET="${JWT_SECRET:-openpath-e2e-secret}"
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-5433}"
export DB_NAME="${DB_NAME:-openpath_test}"
export DB_USER="${DB_USER:-openpath}"
export DB_PASSWORD="${DB_PASSWORD:-openpath_test}"
export PORT="${PORT:-3001}"

SCRIPT_DIR="$(dirname "$0")"

# Build the SPA for E2E tests (API serves it as static files).
# This ensures Playwright runs against the current UI.
if [ "${SKIP_SPA_BUILD:-0}" != "1" ]; then
  echo "Building SPA for E2E tests..."
  (cd "$SCRIPT_DIR/../react-spa" && npm run build)
fi

cd "$SCRIPT_DIR/../api" && npm run dev
