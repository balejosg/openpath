#!/usr/bin/env bats
################################################################################
# openpath-cmd.bats - Tests para scripts/runtime/openpath-cmd.sh
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
    
    # Create test whitelist
    create_test_whitelist "$CONFIG_DIR/whitelist.txt" >/dev/null
}

teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# ============== Tests de cmd_check ==============

@test "check detecta dominio en whitelist" {
    local domain="google.com"
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    if grep -qi "^${domain}$" "$whitelist_file" 2>/dev/null; then
        local in_whitelist=true
    else
        local in_whitelist=false
    fi
    
    [ "$in_whitelist" = true ]
}

@test "check detecta dominio NO en whitelist" {
    local domain="malware.com"
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    if grep -qi "^${domain}$" "$whitelist_file" 2>/dev/null; then
        local in_whitelist=true
    else
        local in_whitelist=false
    fi
    
    [ "$in_whitelist" = false ]
}

# ============== Tests de subdominios bloqueados ==============

@test "detecta subdominio bloqueado" {
    local subdomain="ads.google.com"
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    # Extraer subdominios bloqueados
    local blocked=$(sed -n '/## BLOCKED-SUBDOMAINS/,/## BLOCKED-PATHS/p' "$whitelist_file" | grep -v "^#" | grep -v "^$")
    
    if echo "$blocked" | grep -qi "^${subdomain}$"; then
        local is_blocked=true
    else
        local is_blocked=false
    fi
    
    [ "$is_blocked" = true ]
}

# ============== Tests de estadísticas ==============

@test "cuenta dominios en whitelist" {
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    # Contar dominios en sección WHITELIST
    local count=$(sed -n '/## WHITELIST/,/## BLOCKED/p' "$whitelist_file" | grep -v "^#" | grep -v "^$" | grep -v "## BLOCKED" | wc -l)
    
    [ "$count" -eq 3 ]
}

@test "cuenta subdominios bloqueados" {
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    
    local count=$(sed -n '/## BLOCKED-SUBDOMAINS/,/## BLOCKED-PATHS/p' "$whitelist_file" | grep -v "^#" | grep -v "^$" | grep -v "## BLOCKED" | wc -l)
    
    [ "$count" -eq 2 ]
}

@test "incluye comando setup para modo aula" {
    run grep -n "setup           Asistente de configuración" "$PROJECT_DIR/linux/lib/runtime-cli.sh"
    [ "$status" -eq 0 ]
}

@test "status muestra seccion de enrollment" {
    run grep -n "Enrolled:" "$PROJECT_DIR/linux/lib/runtime-cli.sh"
    [ "$status" -eq 0 ]
}

@test "cmd_disable reuses shared disabled-mode transition helper" {
    run grep -n "enter_disabled_mode" "$PROJECT_DIR/linux/lib/runtime-cli.sh"
    [ "$status" -eq 0 ]
}

@test "enroll soporta token por archivo o stdin" {
    run grep -n -- "--token-file" "$PROJECT_DIR/linux/lib/runtime-cli.sh"
    [ "$status" -eq 0 ]

    run grep -n -- "--token-stdin" "$PROJECT_DIR/linux/lib/runtime-cli.sh"
    [ "$status" -eq 0 ]
}

@test "setup soporta enrollment token por classroom id" {
    run grep -n -- "--classroom-id" "$PROJECT_DIR/linux/lib/runtime-cli.sh"
    [ "$status" -eq 0 ]

    run grep -n -- "--enrollment-token" "$PROJECT_DIR/linux/lib/runtime-cli.sh"
    [ "$status" -eq 0 ]
}

@test "setup puede pedir datos por /dev/tty cuando stdin no es interactivo" {
    run grep -n "/dev/tty" "$PROJECT_DIR/linux/lib/runtime-cli.sh"
    [ "$status" -eq 0 ]
}

@test "persist_openpath_enrollment_state writes classroom runtime state atomically" {
    local helper_script="$TEST_TMP_DIR/persist-enrollment-state.sh"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -euo pipefail

project_dir="$1"
state_dir="$2"

export INSTALL_DIR="$project_dir/linux"
export ETC_CONFIG_DIR="$state_dir/etc/openpath"
export VAR_STATE_DIR="$state_dir/var/lib/openpath"
mkdir -p "$ETC_CONFIG_DIR" "$VAR_STATE_DIR"

source "$project_dir/linux/lib/common.sh"

persist_openpath_enrollment_state \
  "https://api.openpath.test" \
  "Aula-Canary" \
  "classroom-123" \
  "https://api.openpath.test/w/token-123/whitelist.txt"

printf 'api=%s\n' "$(cat "$ETC_CONFIG_DIR/api-url.conf")"
printf 'classroom=%s\n' "$(cat "$ETC_CONFIG_DIR/classroom.conf")"
printf 'classroom_id=%s\n' "$(cat "$ETC_CONFIG_DIR/classroom-id.conf")"
printf 'whitelist=%s\n' "$(cat "$ETC_CONFIG_DIR/whitelist-url.conf")"
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$TEST_TMP_DIR"

    [ "$status" -eq 0 ]
    [[ "$output" == *"api=https://api.openpath.test"* ]]
    [[ "$output" == *"classroom=Aula-Canary"* ]]
    [[ "$output" == *"classroom_id=classroom-123"* ]]
    [[ "$output" == *"whitelist=https://api.openpath.test/w/token-123/whitelist.txt"* ]]
}

@test "persist_openpath_enrollment_state preserves existing files when validation fails" {
    local helper_script="$TEST_TMP_DIR/persist-enrollment-state-invalid.sh"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -euo pipefail

project_dir="$1"
state_dir="$2"

export INSTALL_DIR="$project_dir/linux"
export ETC_CONFIG_DIR="$state_dir/etc/openpath"
export VAR_STATE_DIR="$state_dir/var/lib/openpath"
mkdir -p "$ETC_CONFIG_DIR" "$VAR_STATE_DIR"

source "$project_dir/linux/lib/common.sh"

printf '%s' 'https://existing.example/api' > "$ETC_CONFIG_DIR/api-url.conf"
printf '%s' 'Existing Classroom' > "$ETC_CONFIG_DIR/classroom.conf"
printf '%s' 'existing-id' > "$ETC_CONFIG_DIR/classroom-id.conf"
printf '%s' 'https://existing.example/w/original/whitelist.txt' > "$ETC_CONFIG_DIR/whitelist-url.conf"

if persist_openpath_enrollment_state \
  "https://api.openpath.test" \
  "Broken Classroom" \
  "broken-id" \
  "whitelist-dnsmasq/whitelist-url doesn't exist"; then
  echo "unexpected-success"
  exit 1
fi

printf 'api=%s\n' "$(cat "$ETC_CONFIG_DIR/api-url.conf")"
printf 'classroom=%s\n' "$(cat "$ETC_CONFIG_DIR/classroom.conf")"
printf 'classroom_id=%s\n' "$(cat "$ETC_CONFIG_DIR/classroom-id.conf")"
printf 'whitelist=%s\n' "$(cat "$ETC_CONFIG_DIR/whitelist-url.conf")"
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$TEST_TMP_DIR"

    [ "$status" -eq 0 ]
    [[ "$output" == *"api=https://existing.example/api"* ]]
    [[ "$output" == *"classroom=Existing Classroom"* ]]
    [[ "$output" == *"classroom_id=existing-id"* ]]
    [[ "$output" == *"whitelist=https://existing.example/w/original/whitelist.txt"* ]]
    [[ "$output" != *"unexpected-success"* ]]
}

@test "health treats remote-disabled fail-open mode as expected state" {
    local whitelist_file="$CONFIG_DIR/whitelist.txt"
    local helper_script="$TEST_TMP_DIR/run-cmd-health.sh"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -euo pipefail

project_dir="$1"
state_dir="$2"
whitelist_file="$3"
extracted_script="$state_dir/cmd-health.sh"

export VERSION="test"
export WHITELIST_FILE="$whitelist_file"
export FIREFOX_POLICIES="$state_dir/firefox-policies.json"
export SYSTEM_DISABLED_FLAG="$state_dir/system-disabled.flag"
export VAR_STATE_DIR="$state_dir"
export RED=""
export GREEN=""
export YELLOW=""
export BLUE=""
export NC=""

: > "$FIREFOX_POLICIES"
: > "$SYSTEM_DISABLED_FLAG"

timeout() {
    shift
    "$@"
}

dig() {
    case "$2" in
        google.com)
            echo "142.250.184.14"
            ;;
        blocked-test.invalid)
            return 0
            ;;
    esac
}

iptables() {
    printf "Chain OUTPUT (policy ACCEPT)\n"
}

systemctl() {
    [ "$1" = "is-active" ] && return 0
    return 1
}

find() {
    return 1
}

awk '/^cmd_health\(\) \{/,/^}/' \
    "$project_dir/linux/lib/runtime-cli.sh" > "$extracted_script"
source "$extracted_script"

cmd_health
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$TEST_TMP_DIR" "$whitelist_file"

    [ "$status" -eq 0 ]
    [[ "$output" == *"system disabled remotely"* ]]
    [[ "$output" != *"ISSUES DETECTED"* ]]
}

@test "health reports issues when firewall verification fails despite DNS rules being present" {
    local helper_script="$TEST_TMP_DIR/run-health-firewall-verification.sh"
    local whitelist_file="$CONFIG_DIR/whitelist.txt"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -uo pipefail

project_dir="$1"
state_dir="$2"
whitelist_file="$3"
extracted_script="$state_dir/cmd-health.sh"

export VERSION="test"
export SYSTEM_DISABLED_FLAG="$state_dir/system-disabled.flag"
export WHITELIST_FILE="$whitelist_file"
export FIREFOX_POLICIES="$state_dir/firefox-policies.json"
touch "$FIREFOX_POLICIES"

GREEN=""
RED=""
YELLOW=""
BLUE=""
NC=""

timeout() {
    shift
    "$@"
}

dig() {
    case "$2" in
        google.com)
            echo "142.250.184.14"
            ;;
        blocked-test.invalid)
            return 0
            ;;
    esac
}

iptables() {
    cat <<'RULES'
Chain OUTPUT (policy ACCEPT)
target     prot opt source    destination
ACCEPT     udp  --  anywhere  127.0.0.1   udp dpt:53
ACCEPT     tcp  --  anywhere  127.0.0.1   tcp dpt:53
DROP       udp  --  anywhere  anywhere    udp dpt:53
DROP       tcp  --  anywhere  anywhere    tcp dpt:53
RULES
}

check_firewall_status() {
    echo "active"
    return 0
}

has_firewall_loopback_rule() {
    return 0
}

verify_firewall_rules() {
    return 1
}

systemctl() {
    [ "$1" = "is-active" ] && return 0
    return 1
}

find() {
    return 1
}

awk '/^cmd_health\(\) \{/,/^}/' \
    "$project_dir/linux/lib/runtime-cli.sh" > "$extracted_script"
source "$extracted_script"

cmd_health
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$TEST_TMP_DIR" "$whitelist_file"

    [ "$status" -eq 1 ]
    [[ "$output" == *"ISSUES DETECTED"* ]]
}

@test "health uses firewall helpers instead of parsing iptables list output directly" {
    local helper_script="$TEST_TMP_DIR/run-health-firewall-helpers.sh"
    local whitelist_file="$CONFIG_DIR/whitelist.txt"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -uo pipefail

project_dir="$1"
state_dir="$2"
whitelist_file="$3"
extracted_script="$state_dir/cmd-health.sh"

export VERSION="test"
export SYSTEM_DISABLED_FLAG="$state_dir/system-disabled.flag"
export WHITELIST_FILE="$whitelist_file"
export FIREFOX_POLICIES="$state_dir/firefox-policies.json"
touch "$FIREFOX_POLICIES"

GREEN=""
RED=""
YELLOW=""
BLUE=""
NC=""

timeout() {
    shift
    "$@"
}

dig() {
    case "$2" in
        google.com)
            echo "142.250.184.14"
            ;;
        blocked-test.invalid)
            return 0
            ;;
    esac
}

iptables() {
    printf "Chain OUTPUT (policy ACCEPT)\n"
}

check_firewall_status() {
    echo "active"
    return 0
}

has_firewall_loopback_rule() {
    return 0
}

verify_firewall_rules() {
    return 0
}

systemctl() {
    [ "$1" = "is-active" ] && return 0
    return 1
}

find() {
    return 1
}

awk '/^cmd_health\(\) \{/,/^}/' \
    "$project_dir/linux/lib/runtime-cli.sh" > "$extracted_script"
source "$extracted_script"

cmd_health
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$TEST_TMP_DIR" "$whitelist_file"

    [ "$status" -eq 0 ]
    [[ "$output" == *"DNS blocking rules: ✓ active"* ]]
    [[ "$output" == *"Loopback rule: ✓ present"* ]]
    [[ "$output" != *"ISSUES DETECTED"* ]]
}

@test "reset_cached_whitelist_state clears cached whitelist and remote-disabled markers" {
    local helper_script="$TEST_TMP_DIR/run-reset-cached-whitelist-state.sh"
    local state_dir="$TEST_TMP_DIR/state"

    mkdir -p "$state_dir"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -euo pipefail

project_dir="$1"
state_dir="$2"
extracted_script="$state_dir/reset-cached-whitelist-state.sh"

export WHITELIST_FILE="$state_dir/whitelist.txt"
export SYSTEM_DISABLED_FLAG="$state_dir/system-disabled.flag"
export DNSMASQ_CONF_HASH="$state_dir/dnsmasq.hash"
export BROWSER_POLICIES_HASH="$state_dir/browser-policies.hash"

: > "$WHITELIST_FILE"
: > "${WHITELIST_FILE}.etag"
: > "$SYSTEM_DISABLED_FLAG"
: > "$DNSMASQ_CONF_HASH"
: > "$BROWSER_POLICIES_HASH"

awk '/^reset_cached_whitelist_state\(\) \{/,/^}/' \
    "$project_dir/linux/lib/runtime-cli.sh" > "$extracted_script"
source "$extracted_script"

reset_cached_whitelist_state

test ! -e "$WHITELIST_FILE"
test ! -e "${WHITELIST_FILE}.etag"
test ! -e "$SYSTEM_DISABLED_FLAG"
test ! -e "$DNSMASQ_CONF_HASH"
test ! -e "$BROWSER_POLICIES_HASH"
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$state_dir"

    [ "$status" -eq 0 ]
}

@test "cmd_enroll does not persist partial classroom state when registration fails" {
    local helper_script="$TEST_TMP_DIR/run-cmd-enroll-registration-failure.sh"
    local state_dir="$TEST_TMP_DIR/enroll-state"

    mkdir -p "$state_dir"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -euo pipefail

project_dir="$1"
state_dir="$2"
extracted_script="$state_dir/cmd-enroll.sh"

export ETC_CONFIG_DIR="$state_dir/etc"
export INSTALL_DIR="$project_dir/linux"
export WHITELIST_URL_CONF="$ETC_CONFIG_DIR/whitelist-url.conf"
export WHITELIST_FILE="$state_dir/whitelist.txt"
export SYSTEM_DISABLED_FLAG="$state_dir/system-disabled.flag"
export DNSMASQ_CONF_HASH="$state_dir/dnsmasq.hash"
export BROWSER_POLICIES_HASH="$state_dir/browser.hash"

mkdir -p "$ETC_CONFIG_DIR"

GREEN=""
RED=""
YELLOW=""
BLUE=""
NC=""

normalize_machine_name_value() { printf '%s\n' "$1"; }
register_machine() { REGISTER_RESPONSE='{"success":false}'; return 1; }
persist_machine_name() { return 0; }
reset_cached_whitelist_state() { :; }
systemctl() { return 0; }
dpkg() { printf 'Version: 4.1.15-1\n'; }
hostname() { printf 'max12\n'; }

{
    awk '/^cmd_enroll\(\) \{/,/^}/' \
        "$project_dir/linux/lib/runtime-cli.sh"
    awk '/^reset_cached_whitelist_state\(\) \{/,/^}/' \
        "$project_dir/linux/lib/runtime-cli.sh"
} > "$extracted_script"
set +e
(
    source "$extracted_script"
    cmd_enroll --classroom 'Room 101' --api-url 'https://classroompath.eu' --classroom-id 'cls_123' --enrollment-token 'enroll-token'
)
status=$?
set -e

printf 'status=%s\n' "$status"
printf 'api_url_exists=%s\n' "$(test -f "$ETC_CONFIG_DIR/api-url.conf" && echo yes || echo no)"
printf 'classroom_exists=%s\n' "$(test -f "$ETC_CONFIG_DIR/classroom.conf" && echo yes || echo no)"
printf 'classroom_id_exists=%s\n' "$(test -f "$ETC_CONFIG_DIR/classroom-id.conf" && echo yes || echo no)"
printf 'whitelist_url_exists=%s\n' "$(test -f "$WHITELIST_URL_CONF" && echo yes || echo no)"
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$state_dir"

    [ "$status" -eq 0 ]
    [[ "$output" == *"status=1"* ]]
    [[ "$output" == *"api_url_exists=no"* ]]
    [[ "$output" == *"classroom_exists=no"* ]]
    [[ "$output" == *"classroom_id_exists=no"* ]]
    [[ "$output" == *"whitelist_url_exists=no"* ]]
}

@test "cmd_enroll persists api, classroom, and tokenized whitelist together after successful registration" {
    local helper_script="$TEST_TMP_DIR/run-cmd-enroll-success.sh"
    local state_dir="$TEST_TMP_DIR/enroll-success-state"

    mkdir -p "$state_dir"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -euo pipefail

project_dir="$1"
state_dir="$2"
extracted_script="$state_dir/cmd-enroll.sh"

export ETC_CONFIG_DIR="$state_dir/etc"
export WHITELIST_URL_CONF="$ETC_CONFIG_DIR/whitelist-url.conf"
export WHITELIST_FILE="$state_dir/whitelist.txt"
export SYSTEM_DISABLED_FLAG="$state_dir/system-disabled.flag"
export DNSMASQ_CONF_HASH="$state_dir/dnsmasq.hash"
export BROWSER_POLICIES_HASH="$state_dir/browser.hash"

mkdir -p "$ETC_CONFIG_DIR"

GREEN=""
RED=""
YELLOW=""
BLUE=""
NC=""

source "$project_dir/linux/lib/common.sh"

normalize_machine_name_value() { printf '%s\n' "$1"; }
register_machine() {
    TOKENIZED_URL='https://classroompath.eu/w/token123/whitelist.txt'
    REGISTERED_CLASSROOM_NAME='Room 201'
    REGISTERED_CLASSROOM_ID='cls_201'
    REGISTERED_MACHINE_NAME='max12-scoped'
    return 0
}
persist_machine_name() { printf '%s\n' "$1" > "$ETC_CONFIG_DIR/persisted-machine-name"; return 0; }
reset_cached_whitelist_state() { :; }
systemctl() { return 0; }
dpkg() { printf 'Version: 4.1.15-1\n'; }
hostname() { printf 'max12\n'; }

{
    awk '/^cmd_enroll\(\) \{/,/^}/' \
        "$project_dir/linux/lib/runtime-cli.sh"
    awk '/^reset_cached_whitelist_state\(\) \{/,/^}/' \
        "$project_dir/linux/lib/runtime-cli.sh"
} > "$extracted_script"

set +e
(
    source "$extracted_script"
    cmd_enroll --classroom 'Room 101' --api-url 'https://classroompath.eu' --classroom-id 'cls_123' --enrollment-token 'enroll-token'
)
status=$?
set -e

printf 'status=%s\n' "$status"
printf 'api_url=%s\n' "$(cat "$ETC_CONFIG_DIR/api-url.conf")"
printf 'classroom=%s\n' "$(cat "$ETC_CONFIG_DIR/classroom.conf")"
printf 'classroom_id=%s\n' "$(cat "$ETC_CONFIG_DIR/classroom-id.conf")"
printf 'whitelist_url=%s\n' "$(cat "$WHITELIST_URL_CONF")"
printf 'machine_name=%s\n' "$(cat "$ETC_CONFIG_DIR/persisted-machine-name")"
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$state_dir"

    [ "$status" -eq 0 ]
    [[ "$output" == *"status=0"* ]]
    [[ "$output" == *"api_url=https://classroompath.eu"* ]]
    [[ "$output" == *"classroom=Room 201"* ]]
    [[ "$output" == *"classroom_id=cls_201"* ]]
    [[ "$output" == *"whitelist_url=https://classroompath.eu/w/token123/whitelist.txt"* ]]
    [[ "$output" == *"machine_name=max12-scoped"* ]]
}
