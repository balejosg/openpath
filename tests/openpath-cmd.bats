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
    create_test_whitelist "$CONFIG_DIR/whitelist.txt"
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
    run grep -n "setup           Asistente de configuración" "$PROJECT_DIR/linux/scripts/runtime/openpath-cmd.sh"
    [ "$status" -eq 0 ]
}

@test "status muestra seccion de enrollment" {
    run grep -n "Enrolled:" "$PROJECT_DIR/linux/scripts/runtime/openpath-cmd.sh"
    [ "$status" -eq 0 ]
}

@test "enroll soporta token por archivo o stdin" {
    run grep -n -- "--token-file" "$PROJECT_DIR/linux/scripts/runtime/openpath-cmd.sh"
    [ "$status" -eq 0 ]

    run grep -n -- "--token-stdin" "$PROJECT_DIR/linux/scripts/runtime/openpath-cmd.sh"
    [ "$status" -eq 0 ]
}

@test "setup soporta enrollment token por classroom id" {
    run grep -n -- "--classroom-id" "$PROJECT_DIR/linux/scripts/runtime/openpath-cmd.sh"
    [ "$status" -eq 0 ]

    run grep -n -- "--enrollment-token" "$PROJECT_DIR/linux/scripts/runtime/openpath-cmd.sh"
    [ "$status" -eq 0 ]
}

@test "setup puede pedir datos por /dev/tty cuando stdin no es interactivo" {
    run grep -n "/dev/tty" "$PROJECT_DIR/linux/scripts/runtime/openpath-cmd.sh"
    [ "$status" -eq 0 ]
}
