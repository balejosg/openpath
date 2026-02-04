#!/bin/bash
# Start API with E2E test database configuration
export DB_HOST=localhost
export DB_PORT=5433
export DB_NAME=openpath_test
export DB_USER=openpath
export DB_PASSWORD=openpath_test

cd "$(dirname "$0")/../api" && npm run dev
