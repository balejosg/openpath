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

@test "validate_whitelist_content accepts structured whitelist content below minimum domain threshold" {
    local whitelist_file="$TEST_TMP_DIR/structured-whitelist.txt"
    local helper_script="$TEST_TMP_DIR/run-validate-structured-whitelist.sh"
    cat > "$whitelist_file" <<'EOF'
## WHITELIST
google.com
github.com
mozilla.org
wikipedia.org
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

@test "main falls back to permissive mode when firewall activation fails after DNS recovery" {
    local helper_script="$TEST_TMP_DIR/run-main-firewall-fallback.sh"
    local state_dir="$TEST_TMP_DIR/update-state"

    mkdir -p "$state_dir"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -uo pipefail

project_dir="$1"
state_dir="$2"
extracted_script="$state_dir/openpath-update-main.sh"

export WHITELIST_FILE="$state_dir/whitelist.txt"
export DNSMASQ_CONF="$state_dir/openpath.conf"
export DNSMASQ_CONF_HASH="$state_dir/openpath.conf.hash"
export BROWSER_POLICIES_HASH="$state_dir/browser.hash"
export SYSTEM_DISABLED_FLAG="$state_dir/system-disabled.flag"

mkdir -p "$state_dir"
: > "$WHITELIST_FILE"
: > "$DNSMASQ_CONF"

activate_calls=0
deactivate_calls=0

log() { echo "$1"; }
log_warn() { echo "$1"; }
init_directories() { :; }
detect_primary_dns() { echo "8.8.8.8"; }
check_captive_portal() { return 1; }
download_whitelist() { return 0; }
check_emergency_disable() { return 1; }
parse_whitelist_sections() { :; }
check_firewall_status() { echo "inactive"; }
save_checkpoint() { :; }
generate_dnsmasq_config() { :; }
generate_firefox_policies() { :; }
generate_chromium_policies() { :; }
apply_search_engine_policies() { :; }
get_policies_hash() { echo "policies-hash"; }
has_config_changed() { return 0; }
restart_dnsmasq() { return 0; }
verify_dns() { return 0; }
activate_firewall() { activate_calls=$((activate_calls + 1)); return 1; }
deactivate_firewall() { deactivate_calls=$((deactivate_calls + 1)); echo "deactivate_firewall called"; return 0; }
cleanup_system() { :; }
flush_connections() { :; }
force_browser_close() { :; }
sha256sum() { printf 'deadbeef  %s\n' "$1"; }

awk '/^main\(\) \{/,/^}/' \
    "$project_dir/linux/scripts/runtime/openpath-update.sh" > "$extracted_script"
source "$extracted_script"

main

printf 'activate_calls=%s\n' "$activate_calls"
printf 'deactivate_calls=%s\n' "$deactivate_calls"
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$state_dir"

    [ "$status" -eq 0 ]
    [[ "$output" == *"activate_calls=1"* ]]
    [[ "$output" == *"deactivate_calls=1"* ]]
}
