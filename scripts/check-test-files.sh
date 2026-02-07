#!/usr/bin/env bash
# check-test-files.sh - Verify ALL source files have corresponding test files
# This script enforces that every source file has a corresponding test file.
# Part of the mandatory test enforcement policy.
#
# Files in .test-allowlist are grandfathered and exempt from this check.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
declare -a missing_tests=()
checked_count=0
skipped_count=0
allowlisted_count=0

# Load allowlist (grandfathered files)
declare -A ALLOWLIST
if [[ -f ".test-allowlist" ]]; then
  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ -z "$line" ]] && continue
    [[ "$line" == \#* ]] && continue
    ALLOWLIST["$line"]=1
  done < ".test-allowlist"
fi

is_allowlisted() {
  [[ -n "${ALLOWLIST[$1]:-}" ]]
}

# Files/patterns that don't require tests
is_excluded() {
  local file="$1"
  local basename
  basename=$(basename "$file")
  local dirname
  dirname=$(dirname "$file")

  # Skip test files
  [[ "$file" == *".test.ts" ]] && return 0
  [[ "$file" == *".test.tsx" ]] && return 0
  [[ "$file" == *".spec.ts" ]] && return 0
  [[ "$file" == *".spec.tsx" ]] && return 0

  # Skip test directories
  [[ "$dirname" == */tests* ]] && return 0
  [[ "$dirname" == */__tests__* ]] && return 0
  [[ "$dirname" == */e2e* ]] && return 0

  # Skip type declarations
  [[ "$basename" == *.d.ts ]] && return 0

  # Skip index files
  [[ "$basename" == "index.ts" ]] && return 0
  [[ "$basename" == "index.tsx" ]] && return 0

  # Skip types files
  [[ "$basename" == "types.ts" ]] && return 0
  [[ "$basename" == *.types.ts ]] && return 0

  # Skip constants
  [[ "$basename" == "constants.ts" ]] && return 0
  [[ "$basename" == *.constants.ts ]] && return 0

  # Skip config files
  [[ "$basename" == *.config.ts ]] && return 0
  [[ "$basename" == "config.ts" ]] && return 0

  # Skip drizzle/migrations
  [[ "$dirname" == */drizzle* ]] && return 0
  [[ "$dirname" == */migrations* ]] && return 0

  # Skip setup/main files
  [[ "$basename" == "setup.ts" ]] && return 0
  [[ "$basename" == "main.ts" ]] && return 0
  [[ "$basename" == "main.tsx" ]] && return 0
  [[ "$basename" == "App.tsx" ]] && return 0

  # Skip generated
  [[ "$dirname" == */generated* ]] && return 0
  [[ "$basename" == "routeTree.gen.ts" ]] && return 0

  # Skip logger/swagger (exempted in coverage)
  [[ "$basename" == "logger.ts" ]] && return 0
  [[ "$basename" == "swagger.ts" ]] && return 0

  return 1
}

# Check if test file exists for a source file
test_exists_for() {
  local src_file="$1"
  local test_name
  test_name=$(basename "$src_file" .ts)
  test_name=$(basename "$test_name" .tsx)

  # API tests
  if [[ "$src_file" == api/src/* ]]; then
    [[ -f "api/tests/${test_name}.test.ts" ]] && return 0
    # Check subdirectory patterns
    local subdir
    subdir=$(dirname "${src_file#api/src/}")
    [[ "$subdir" != "." ]] && [[ -f "api/tests/${subdir}/${test_name}.test.ts" ]] && return 0
    return 1
  fi

  # React SPA tests
  if [[ "$src_file" == react-spa/src/* ]]; then
    local rel_dir
    rel_dir=$(dirname "${src_file#react-spa/src/}")
    [[ -f "react-spa/src/${rel_dir}/__tests__/${test_name}.test.ts" ]] && return 0
    [[ -f "react-spa/src/${rel_dir}/__tests__/${test_name}.test.tsx" ]] && return 0
    [[ -f "react-spa/src/${rel_dir}/${test_name}.test.ts" ]] && return 0
    [[ -f "react-spa/src/${rel_dir}/${test_name}.test.tsx" ]] && return 0
    return 1
  fi

  # Shared tests
  if [[ "$src_file" == shared/src/* ]]; then
    [[ -f "shared/tests/${test_name}.test.ts" ]] && return 0
    return 1
  fi

  # Dashboard tests
  if [[ "$src_file" == dashboard/src/* ]]; then
    [[ -f "dashboard/tests/${test_name}.test.ts" ]] && return 0
    return 1
  fi

  # Firefox extension tests
  if [[ "$src_file" == firefox-extension/src/* ]]; then
    [[ -f "firefox-extension/tests/${test_name}.test.ts" ]] && return 0
    return 1
  fi

  # Unknown workspace - skip
  return 0
}

echo "Checking test file coverage for source files..."
echo ""

# Find all TypeScript source files in tracked workspaces
for workspace in api react-spa shared dashboard firefox-extension; do
  if [[ ! -d "$workspace/src" ]]; then
    continue
  fi

  while IFS= read -r -d '' src_file; do
    # Skip excluded files
    if is_excluded "$src_file"; then
      ((skipped_count++)) || true
      continue
    fi

    # Skip allowlisted (grandfathered) files
    if is_allowlisted "$src_file"; then
      ((allowlisted_count++)) || true
      continue
    fi

    ((checked_count++)) || true

    if ! test_exists_for "$src_file"; then
      missing_tests+=("$src_file")
    fi
  done < <(find "$workspace/src" -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 2>/dev/null)
done

echo "Checked: $checked_count source files"
echo "Skipped: $skipped_count files (excluded patterns)"
echo "Allowlisted: $allowlisted_count files (grandfathered, tech debt)"
echo ""

if [[ ${#missing_tests[@]} -gt 0 ]]; then
  echo -e "${RED}ERROR: ${#missing_tests[@]} NEW source file(s) missing test files:${NC}"
  echo ""
  for file in "${missing_tests[@]}"; do
    echo -e "  ${YELLOW}$file${NC}"
    test_name=$(basename "$file" .ts)
    test_name=$(basename "$test_name" .tsx)
    if [[ "$file" == api/src/* ]]; then
      echo "    Expected: api/tests/${test_name}.test.ts"
    elif [[ "$file" == react-spa/src/* ]]; then
      rel_dir=$(dirname "${file#react-spa/src/}")
      echo "    Expected: react-spa/src/${rel_dir}/__tests__/${test_name}.test.tsx"
    elif [[ "$file" == shared/src/* ]]; then
      echo "    Expected: shared/tests/${test_name}.test.ts"
    elif [[ "$file" == dashboard/src/* ]]; then
      echo "    Expected: dashboard/tests/${test_name}.test.ts"
    elif [[ "$file" == firefox-extension/src/* ]]; then
      echo "    Expected: firefox-extension/tests/${test_name}.test.ts"
    fi
  done
  echo ""
  echo -e "${RED}POLICY: Every NEW source file MUST have a corresponding test file.${NC}"
  echo ""
  echo "To fix:"
  echo "  1. Create the missing test file(s)"
  echo "  2. Add at least one test case"
  echo "  3. Run 'npm run verify:full' to validate"
  echo ""
  echo "NOTE: Do NOT add new files to .test-allowlist."
  echo "      That file is only for grandfathered legacy code."
  echo ""
  exit 1
fi

echo -e "${GREEN}All NEW source files have corresponding test files.${NC}"
if [[ $allowlisted_count -gt 0 ]]; then
  echo -e "${YELLOW}($allowlisted_count legacy files are exempt - see .test-allowlist)${NC}"
fi
exit 0
