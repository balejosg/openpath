#!/usr/bin/env bats
################################################################################
# common.bats - Tests for lib/common.sh
################################################################################

load 'test_helper'

setup() {
    # Create temp directory for tests
    TEST_TMP_DIR=$(mktemp -d)
    export CONFIG_DIR="$TEST_TMP_DIR/config"
    export INSTALL_DIR="$TEST_TMP_DIR/install"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$INSTALL_DIR/lib"
    
    # Copy libs
    cp "$PROJECT_DIR/linux/lib/"*.sh "$INSTALL_DIR/lib/" 2>/dev/null || true
    
    # Load the library to test
    source "$PROJECT_DIR/linux/lib/common.sh"
}

teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# ============== Whitelist parsing tests ==============

@test "parse_whitelist extracts domains from WHITELIST section" {
    local wl_file=$(create_test_whitelist)
    
    # Simulate parse (the actual function may vary)
    local domains=$(grep -A 100 "## WHITELIST" "$wl_file" | grep -B 100 "## BLOCKED" | grep -v "^#" | grep -v "^$" | head -n -1)
    
    [[ "$domains" == *"google.com"* ]]
    [[ "$domains" == *"github.com"* ]]
}

@test "parse_whitelist extracts blocked subdomains" {
    local wl_file=$(create_test_whitelist)
    
    local blocked=$(sed -n '/## BLOCKED-SUBDOMAINS/,/## BLOCKED-PATHS/p' "$wl_file" | grep -v "^#" | grep -v "^$")
    
    [[ "$blocked" == *"ads.google.com"* ]]
}

@test "detects disabled whitelist" {
    local wl_file=$(create_disabled_whitelist)
    
    if head -1 "$wl_file" | grep -qi "DESACTIVADO"; then
        local is_disabled=true
    else
        local is_disabled=false
    fi
    
    [ "$is_disabled" = true ]
}

@test "normal whitelist is not disabled" {
    local wl_file=$(create_test_whitelist)
    
    if head -1 "$wl_file" | grep -qi "DESACTIVADO"; then
        local is_disabled=true
    else
        local is_disabled=false
    fi
    
    [ "$is_disabled" = false ]
}

# ============== Logging tests ==============

@test "log writes to log file" {
    export LOG_FILE="$TEST_TMP_DIR/test.log"

    log_info "Test message"

    [ -f "$LOG_FILE" ]
    grep -q "Test message" "$LOG_FILE"
}

@test "log functions never abort under set -e when log path is unwritable" {
    local unwritable_dir="$TEST_TMP_DIR/unwritable"
    mkdir -p "$unwritable_dir"
    chmod 500 "$unwritable_dir"

    run bash -c '
        set -euo pipefail
        export LOG_FILE="'"$unwritable_dir"'/openpath.log"
        source "'"$PROJECT_DIR"'/linux/lib/common.sh"
        log_info "hello"
        log_warn "warn"
        log_error "err"
        DEBUG=1 log_debug "debug"
    '

    chmod 700 "$unwritable_dir"
    [ "$status" -eq 0 ]
}

# ============== Validation tests ==============

@test "valid domain passes validation" {
    local domain="google.com"
    
    # Validación básica de dominio
    if [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$ ]]; then
        local valid=true
    else
        local valid=false
    fi
    
    [ "$valid" = true ]
}

@test "invalid domain fails validation" {
    local domain="invalid domain with spaces"
    
    if [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$ ]]; then
        local valid=true
    else
        local valid=false
    fi
    
    [ "$valid" = false ]
}

@test "validate_domain accepts shared valid contract fixtures" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    source "$PROJECT_DIR/linux/lib/dns.sh"

    while IFS= read -r domain; do
        run validate_domain "$domain"
        [ "$status" -eq 0 ]
    done < <(load_contract_fixture_lines "domain-valid.txt")
}

@test "validate_domain rejects shared invalid contract fixtures" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    source "$PROJECT_DIR/linux/lib/dns.sh"

    while IFS= read -r domain; do
        run validate_domain "$domain"
        [ "$status" -eq 1 ]
    done < <(load_contract_fixture_lines "domain-invalid.txt")
}

# ============== Tests de parse_whitelist_sections ==============

@test "parse_whitelist_sections fills arrays correctly" {
    local wl_file=$(create_test_whitelist)
    
    source "$PROJECT_DIR/linux/lib/common.sh"
    # Override log to avoid permission issues
    log() { echo "$1"; }
    
    parse_whitelist_sections "$wl_file"
    
    # Check WHITELIST_DOMAINS array
    [ ${#WHITELIST_DOMAINS[@]} -eq 3 ]
    [[ " ${WHITELIST_DOMAINS[*]} " == *" google.com "* ]]
    [[ " ${WHITELIST_DOMAINS[*]} " == *" github.com "* ]]
}

@test "parse_whitelist_sections extracts blocked subdomains" {
    local wl_file=$(create_test_whitelist)
    
    source "$PROJECT_DIR/linux/lib/common.sh"
    log() { echo "$1"; }
    
    parse_whitelist_sections "$wl_file"
    
    [ ${#BLOCKED_SUBDOMAINS[@]} -eq 2 ]
    [[ " ${BLOCKED_SUBDOMAINS[*]} " == *" ads.google.com "* ]]
}

@test "parse_whitelist_sections extracts blocked paths" {
    local wl_file=$(create_test_whitelist)
    
    source "$PROJECT_DIR/linux/lib/common.sh"
    log() { echo "$1"; }
    
    parse_whitelist_sections "$wl_file"
    
    [ ${#BLOCKED_PATHS[@]} -eq 2 ]
    [[ " ${BLOCKED_PATHS[*]} " == *" example.org/ads "* ]]
}

@test "parse_whitelist_sections handles nonexistent file" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    
    run parse_whitelist_sections "/nonexistent/file.txt"
    [ "$status" -eq 1 ]
}

# ============== Tests de validate_ip ==============

@test "validate_ip acepta IP válida" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    
    run validate_ip "192.168.1.1"
    [ "$status" -eq 0 ]
}

@test "validate_ip acepta DNS Google" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    
    run validate_ip "8.8.8.8"
    [ "$status" -eq 0 ]
}

@test "validate_ip rechaza texto" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    
    run validate_ip "not-an-ip"
    [ "$status" -eq 1 ]
}

@test "validate_ip rechaza IPv6" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    
    run validate_ip "::1"
    [ "$status" -eq 1 ]
}

@test "normalize_machine_name_value canonicalizes machine identifiers" {
    source "$PROJECT_DIR/linux/lib/common.sh"

    run normalize_machine_name_value "PC 01__Lab"
    [ "$status" -eq 0 ]
    [ "$output" = "pc-01-lab" ]
}

@test "compute_scoped_machine_name returns deterministic classroom-scoped names" {
    source "$PROJECT_DIR/linux/lib/common.sh"

    run compute_scoped_machine_name "PC 01__Lab" "classroom-123"
    [ "$status" -eq 0 ]
    [[ "$output" =~ ^pc-01-lab-[a-f0-9]{8}$ ]]
    [ "${#output}" -le 63 ]
}

@test "persist_machine_name stores the canonicalized machine name" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    ETC_CONFIG_DIR="$TEST_TMP_DIR/etc"
    MACHINE_NAME_CONF="$ETC_CONFIG_DIR/machine-name.conf"

    persist_machine_name "PC 01__Lab"

    [ -f "$MACHINE_NAME_CONF" ]
    [ "$(cat "$MACHINE_NAME_CONF")" = "pc-01-lab" ]
}

@test "parse_machine_registration_response extracts shared registration fields" {
    source "$PROJECT_DIR/linux/lib/common.sh"

    parse_machine_registration_response '{"success":true,"whitelistUrl":"https://api.example.com/w/token/whitelist.txt","classroomName":"Room 101","classroomId":"cls_123","machineHostname":"pc-01-abcd1234"}'

    [ "$TOKENIZED_URL" = "https://api.example.com/w/token/whitelist.txt" ]
    [ "$REGISTERED_CLASSROOM_NAME" = "Room 101" ]
    [ "$REGISTERED_CLASSROOM_ID" = "cls_123" ]
    [ "$REGISTERED_MACHINE_NAME" = "pc-01-abcd1234" ]
}

# ============== Tests de init_directories ==============

@test "init_directories creates CONFIG_DIR" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    # Override paths after sourcing - use actual variables the function uses
    ETC_CONFIG_DIR="$TEST_TMP_DIR/etc_config"
    VAR_STATE_DIR="$TEST_TMP_DIR/var_state"
    LOG_FILE="$TEST_TMP_DIR/logs/test.log"
    INSTALL_DIR="$TEST_TMP_DIR/install"
    
    init_directories
    
    [ -d "$ETC_CONFIG_DIR" ]
}

@test "init_directories creates log directory" {
    source "$PROJECT_DIR/linux/lib/common.sh"
    # Override paths after sourcing - use actual variables the function uses
    ETC_CONFIG_DIR="$TEST_TMP_DIR/etc_config2"
    VAR_STATE_DIR="$TEST_TMP_DIR/var_state2"
    LOG_FILE="$TEST_TMP_DIR/logs/openpath.log"
    INSTALL_DIR="$TEST_TMP_DIR/install2"
    
    init_directories
    
    [ -d "$(dirname "$LOG_FILE")" ]
}

# ============== Health reporting tests ==============

@test "send_health_report_to_api succeeds when health endpoint is not configured" {
    HEALTH_API_URL_CONF="$TEST_TMP_DIR/missing-health-api-url.conf"
    HEALTH_API_SECRET_CONF="$TEST_TMP_DIR/missing-health-api-secret.conf"

    run send_health_report_to_api "HEALTHY" "watchdog_ok" "true" "true" "0" "4.1.0"
    [ "$status" -eq 0 ]
}

@test "send_health_report_to_api prefers machine token auth derived from whitelist URL" {
    local etc_dir="$TEST_TMP_DIR/etc/openpath"
    local bin_dir="$TEST_TMP_DIR/bin"
    local curl_log="$TEST_TMP_DIR/curl-args.log"

    mkdir -p "$etc_dir" "$bin_dir"

    HEALTH_API_URL_CONF="$etc_dir/health-api-url.conf"
    WHITELIST_URL_CONF="$etc_dir/whitelist-url.conf"
    echo "https://api.example.test" > "$HEALTH_API_URL_CONF"
    echo "https://api.example.test/w/token123/whitelist.txt" > "$WHITELIST_URL_CONF"

    cat > "$bin_dir/curl" << EOF
#!/bin/bash
echo "\$*" >> "$curl_log"
exit 0
EOF
    chmod +x "$bin_dir/curl"
    PATH="$bin_dir:$PATH"

    run send_health_report_to_api "DEGRADED" "watchdog_repair" "true" "false" "2" "4.1.0"
    [ "$status" -eq 0 ]

    for _ in $(seq 1 20); do
        [ -f "$curl_log" ] && break
        sleep 0.1
    done

    [ -f "$curl_log" ]
    grep -q "/trpc/healthReports.submit" "$curl_log"
    grep -q "Authorization: Bearer token123" "$curl_log"
}
