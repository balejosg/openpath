#!/bin/bash
# =============================================================================
# safe-commit.sh - Verified Commit Wrapper
# =============================================================================
# This script ensures verify:full passes BEFORE allowing any commit.
# Use this instead of raw git commit to guarantee verification.
#
# Usage:
#   ./scripts/safe-commit.sh "commit message"
#   ./scripts/safe-commit.sh -m "commit message"
#
# This script will:
#   1. Run npm run verify:full
#   2. Only commit if verification passes
#   3. Reject commit if any tests fail
#
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=============================================="
echo "  SAFE COMMIT - Verified Commit Wrapper"
echo "=============================================="
echo ""

# Check for commit message
COMMIT_MSG=""
if [ $# -eq 0 ]; then
    echo -e "${RED}ERROR: Commit message required${NC}"
    echo "Usage: $0 \"commit message\""
    echo "       $0 -m \"commit message\""
    exit 1
fi

# Parse arguments
if [ "$1" = "-m" ]; then
    if [ $# -lt 2 ]; then
        echo -e "${RED}ERROR: Commit message required after -m${NC}"
        exit 1
    fi
    COMMIT_MSG="$2"
else
    COMMIT_MSG="$1"
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}ERROR: Must run from OpenPath root directory${NC}"
    exit 1
fi

# Check if there are staged changes
if git diff --cached --quiet; then
    echo -e "${YELLOW}WARNING: No staged changes. Stage files first with 'git add'${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1/3: Running full verification suite...${NC}"
echo ""

# Run verification - this is the critical gate
if ! npm run verify:full; then
    echo ""
    echo -e "${RED}=============================================="
    echo "  VERIFICATION FAILED"
    echo "=============================================="
    echo "  Commit BLOCKED."
    echo ""
    echo "  Required actions:"
    echo "  1. Fix all failing tests"
    echo "  2. Fix all lint errors"
    echo "  3. Fix all type errors"
    echo "  4. Run this script again"
    echo "==============================================${NC}"
    echo ""
    exit 1
fi

echo ""
echo -e "${GREEN}Step 2/3: Verification PASSED${NC}"
echo ""

echo -e "${YELLOW}Step 3/3: Creating commit...${NC}"
echo ""

# Now commit (hooks will run again, but they should pass)
if git commit -m "$COMMIT_MSG"; then
    echo ""
    echo -e "${GREEN}=============================================="
    echo "  COMMIT SUCCESSFUL"
    echo "=============================================="
    echo "  Message: $COMMIT_MSG"
    echo "  All tests passed before commit."
    echo "==============================================${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}ERROR: git commit failed${NC}"
    exit 1
fi
