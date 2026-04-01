#!/usr/bin/env bats
################################################################################
# openpath-update.bats - Tests for scripts/runtime/openpath-update.sh
################################################################################

load 'test_helper'

@test "validate_whitelist_content accepts disabled whitelist content below minimum domain threshold" {
    local whitelist_file="$TEST_TMP_DIR/disabled-whitelist.txt"
    local helper_script="$TEST_TMP_DIR/run-validate-whitelist.sh"
    cat > "$whitelist_file" <<'EOF'
#DESACTIVADO

## WHITELIST
google.com
EOF

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -euo pipefail

project_dir="$1"
whitelist_file="$2"
extracted_script="${TMPDIR:-/tmp}/openpath-update-validate.$$.$RANDOM.sh"

log_warn() { :; }

awk '/^validate_whitelist_content\(\) \{/,/^}/' \
    "$project_dir/linux/scripts/runtime/openpath-update.sh" > "$extracted_script"
source "$extracted_script"

MIN_VALID_DOMAINS=5
MAX_DOMAINS=500

validate_whitelist_content "$whitelist_file"
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$whitelist_file"

    [ "$status" -eq 0 ]
}
