#!/bin/bash
# Start API with E2E test database configuration
export DB_HOST=localhost
export DB_PORT=5433
export DB_NAME=openpath_test
export DB_USER=openpath
export DB_PASSWORD=openpath_test
export PORT=3001

SCRIPT_DIR="$(dirname "$0")"

# Build the SPA if dist/ doesn't exist (API serves it as static files)
if [ ! -d "$SCRIPT_DIR/../react-spa/dist" ]; then
  echo "Building SPA for E2E tests..."
  (cd "$SCRIPT_DIR/../react-spa" && npm run build)
fi

cd "$SCRIPT_DIR/../api" && npm run dev
