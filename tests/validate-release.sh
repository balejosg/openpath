#!/bin/bash
################################################################################
# validate-release.sh - Quick validation before committing/releasing
#
# Run this script before committing to catch common packaging issues
#
# Usage: ./tests/validate-release.sh
################################################################################

set -e

cd "$(dirname "$0")/.."

echo "🔍 Running quick release validation..."
echo ""

if [ -f "firefox-extension/package.json" ]; then
    echo "🔧 Building Firefox extension artifacts..."
    npm run clean:all --workspace=@openpath/firefox-extension
    npm run build --workspace=@openpath/firefox-extension
    echo ""
fi

# Run pre-installation validation
if [ -x "tests/e2e/pre-install-validation.sh" ]; then
    ./tests/e2e/pre-install-validation.sh
else
    echo "❌ tests/e2e/pre-install-validation.sh not found or not executable"
    exit 1
fi
