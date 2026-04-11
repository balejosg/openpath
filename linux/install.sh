#!/bin/bash

# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

################################################################################
# install.sh - Instalador del sistema dnsmasq URL Whitelist v3.5
#
# Este script instala y configura el sistema completo de whitelist DNS.
# Divide la funcionalidad en módulos para mejor mantenibilidad.
#
# Uso:
#   sudo ./install.sh
#   sudo ./install.sh --whitelist-url "https://tu-url.com/whitelist.txt"
#   sudo ./install.sh --unattended  (modo desatendido)
#   sudo ./install.sh --no-extension  (sin extensión Firefox)
#   sudo ./install.sh --skip-firefox  (omitir instalación de Firefox)
#   sudo ./install.sh --with-native-host  (incluir native messaging)
#   sudo ./install.sh --skip-preflight  (omitir validación previa)
#
################################################################################

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER_SOURCE_DIR="$SCRIPT_DIR"
VERSION=$(cat "$INSTALLER_SOURCE_DIR/../VERSION" 2>/dev/null || echo "4.1.0")
ORIGINAL_ARGS=("$@")

# Directorios de instalación
INSTALL_DIR="/usr/local/lib/openpath"
SCRIPTS_DIR="/usr/local/bin"
CONFIG_DIR="/var/lib/openpath"

# No default URL - must be provided via --whitelist-url or configured in defaults.conf
DEFAULT_WHITELIST_URL=""

# Procesar argumentos
WHITELIST_URL="$DEFAULT_WHITELIST_URL"
UNATTENDED=false
INSTALL_EXTENSION=true
INSTALL_FIREFOX=true
INSTALL_NATIVE_HOST=false
SKIP_PREFLIGHT=false
VERBOSE=false
INSTALLER_STEP_TOTAL=15
HEALTH_API_URL=""
HEALTH_API_SECRET=""
CLASSROOM_NAME=""
API_URL=""
REGISTRATION_TOKEN=""

# shellcheck source=lib/progress.sh
source "$INSTALLER_SOURCE_DIR/lib/progress.sh"

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        printf '%s\n' "$*"
    fi
}

log_notice() {
    printf '%s\n' "$*"
}

show_progress() {
    openpath_show_progress "$1" "$2" "$3" "$VERBOSE"
}

replay_quiet_warnings() {
    local output_file="$1"
    if grep -Eq 'ADVERTENCIA|WARNING|WARN|ERROR|Error|error|fall[oó]|fallida|fallido|no pudo|no se pudo|⚠|✗' "$output_file"; then
        [ -t 1 ] && printf '\n'
        grep -E 'ADVERTENCIA|WARNING|WARN|ERROR|Error|error|fall[oó]|fallida|fallido|no pudo|no se pudo|⚠|✗' "$output_file"
    fi
}

run_quietly() {
    local output_file
    output_file="$(mktemp)"

    if "$@" >"$output_file" 2>&1; then
        replay_quiet_warnings "$output_file"
        rm -f "$output_file"
        return 0
    fi

    [ -t 1 ] && printf '\n'
    cat "$output_file"
    rm -f "$output_file"
    return 1
}

run_installer_step() {
    local current="$1"
    local total="$2"
    local label="$3"
    local step_function="$4"

    show_progress "$current" "$total" "$label"
    if [ "$VERBOSE" = true ]; then
        "$step_function"
    else
        run_quietly "$step_function"
    fi
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --whitelist-url|--url)
            WHITELIST_URL="$2"
            shift 2
            ;;
        --health-api-url)
            HEALTH_API_URL="$2"
            shift 2
            ;;
        --health-api-secret)
            HEALTH_API_SECRET="$2"
            shift 2
            ;;
        --unattended)
            # shellcheck disable=SC2034  # Used in confirmation prompts
            UNATTENDED=true
            shift
            ;;
        --no-extension)
            INSTALL_EXTENSION=false
            shift
            ;;
        --skip-firefox)
            INSTALL_FIREFOX=false
            shift
            ;;
        --with-native-host)
            INSTALL_NATIVE_HOST=true
            shift
            ;;
        --skip-preflight)
            SKIP_PREFLIGHT=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --classroom)
            CLASSROOM_NAME="$2"
            shift 2
            ;;
        --api-url)
            API_URL="$2"
            shift 2
            ;;
        --registration-token)
            REGISTRATION_TOKEN="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Auto-generate API secret if classroom mode is configured but no secret provided
if [ -n "$CLASSROOM_NAME" ] && [ -n "$API_URL" ] && [ -z "$HEALTH_API_SECRET" ]; then
    # SECURITY: Disable trace before secret handling to prevent leaking in logs
    { set +x; } 2>/dev/null
    # Generate a random 32-character secret using cryptographic entropy
    HEALTH_API_SECRET=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)
    log_notice "API Secret generated automatically for classroom mode"
    log_notice "   Secret will be saved to /etc/openpath/api-secret.conf"
    log_notice "   ACTION: Backup this file securely for reinstallation"
fi

# Validate registration token in classroom mode
if [ -n "$CLASSROOM_NAME" ] && [ -n "$API_URL" ]; then
    if [ -z "$REGISTRATION_TOKEN" ]; then
        echo "❌ Error: --registration-token es requerido en modo aula"
        echo "   Obtenga el token de registro del administrador del servidor central"
        exit 1
    fi
    
    log_verbose "Validando token de registro..."
    VALIDATE_RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"token\":\"$REGISTRATION_TOKEN\"}" \
        "$API_URL/api/setup/validate-token" 2>/dev/null || echo "{\"valid\":false}")
    
    if ! echo "$VALIDATE_RESPONSE" | grep -q '"valid":true'; then
        echo "❌ Error: Token de registro inválido"
        echo "   Verifique el token con el administrador del servidor central"
        exit 1
    fi
    log_verbose "Token de registro validado"
fi

# Auto-elevación con sudo
if [ "$EUID" -ne 0 ]; then
    log_notice "Elevando permisos con sudo..."
    exec sudo "$0" "${ORIGINAL_ARGS[@]}"
fi

if [ "$VERBOSE" = true ]; then
    echo "======================================================"
    echo "  dnsmasq URL Whitelist System v$VERSION - Instalación"
    echo "======================================================"
    echo ""
    echo "URL Whitelist: $WHITELIST_URL"
    echo "Extensión Firefox: $INSTALL_EXTENSION"
    echo "Firefox: $INSTALL_FIREFOX"
    if [ -n "$CLASSROOM_NAME" ]; then
        echo "Modo Aula: $CLASSROOM_NAME"
        echo "API URL: $API_URL"
    fi
    echo ""
else
    log_notice "Installing OpenPath DNS v$VERSION..."
fi

# ============================================================================
# Installation Step Functions
# ============================================================================

run_pre_install_validation() {
    local errors=0
    local warnings=0

    echo ""
    echo "[Preflight] Validando requisitos del sistema..."

    if [ "$EUID" -ne 0 ]; then
        echo "  ✗ Requiere privilegios root"
        errors=$((errors + 1))
    else
        echo "  ✓ Privilegios root detectados"
    fi

    if [ ! -d /run/systemd/system ]; then
        echo "  ✗ systemd no está activo (requerido para timers/servicios)"
        errors=$((errors + 1))
    else
        echo "  ✓ systemd activo"
    fi

    if ! command -v apt-get >/dev/null 2>&1; then
        echo "  ✗ apt-get no disponible (se requiere distribución Debian/Ubuntu)"
        errors=$((errors + 1))
    else
        echo "  ✓ apt-get disponible"
    fi

    if ! command -v systemctl >/dev/null 2>&1; then
        echo "  ✗ systemctl no disponible"
        errors=$((errors + 1))
    else
        echo "  ✓ systemctl disponible"
    fi

    local free_mb
    free_mb=$(df -Pm / | awk 'NR==2 {print $4}')
    if [ -n "$free_mb" ] && [ "$free_mb" -lt 200 ]; then
        echo "  ✗ Espacio insuficiente en / (${free_mb}MB libres, mínimo 200MB)"
        errors=$((errors + 1))
    else
        echo "  ✓ Espacio en disco suficiente"
    fi

    if ! ip -o link show up 2>/dev/null | grep -q "state UP"; then
        echo "  ⚠ No se detecta interfaz de red activa"
        warnings=$((warnings + 1))
    else
        echo "  ✓ Interfaz de red activa detectada"
    fi

    if ! timeout 5 getent hosts github.com >/dev/null 2>&1; then
        echo "  ⚠ DNS/Internet no verificado (continuará igualmente)"
        warnings=$((warnings + 1))
    else
        echo "  ✓ Resolución DNS funcional"
    fi

    if ss -lntu 2>/dev/null | grep -qE '[:.]53\s'; then
        echo "  ⚠ Puerto 53 ya en uso (se intentará liberar durante la instalación)"
        warnings=$((warnings + 1))
    else
        echo "  ✓ Puerto 53 disponible"
    fi

    if [ "$errors" -gt 0 ]; then
        echo ""
        echo "✗ Preflight fallido: ${errors} error(es), ${warnings} advertencia(s)"
        echo "  Corrija los errores o use --skip-preflight bajo su propio riesgo"
        exit 1
    fi

    if [ "$warnings" -gt 0 ]; then
        echo "  ✓ Preflight completado con ${warnings} advertencia(s)"
    else
        echo "  ✓ Preflight completado sin advertencias"
    fi
}

reset_apt_package_indexes() {
    apt-get clean >/dev/null 2>&1 || true
    rm -rf /var/lib/apt/lists/*
    mkdir -p /var/lib/apt/lists/partial
}

apt_update_with_retry() {
    local attempt
    local max_attempts=3

    for attempt in $(seq 1 "$max_attempts"); do
        reset_apt_package_indexes

        if apt-get -o Acquire::Retries=3 update -qq; then
            return 0
        fi

        if [ "$attempt" -lt "$max_attempts" ]; then
            echo "  ! apt-get update falló (intento ${attempt}/${max_attempts}); reintentando..."
            sleep "$attempt"
        fi
    done

    echo "  ✗ apt-get update falló tras ${max_attempts} intentos"
    return 1
}

apt_install_with_retry() {
    local package_group="$1"
    shift

    local attempt
    local max_attempts=3

    for attempt in $(seq 1 "$max_attempts"); do
        if "$@" >/dev/null; then
            return 0
        fi

        if [ "$attempt" -lt "$max_attempts" ]; then
            echo "  ! Instalación de ${package_group} falló (intento ${attempt}/${max_attempts}); refrescando índices..."
            apt_update_with_retry
        fi
    done

    echo "  ✗ Instalación de ${package_group} falló tras ${max_attempts} intentos"
    return 1
}

step_install_libraries() {
    echo "[1/13] Instalando librerías..."
    mkdir -p "$INSTALL_DIR/lib"
    mkdir -p "$INSTALL_DIR/libexec"
    mkdir -p "$CONFIG_DIR"

    cp "$INSTALLER_SOURCE_DIR/lib/"*.sh "$INSTALL_DIR/lib/"
    cp "$INSTALLER_SOURCE_DIR/libexec/browser-json.py" "$INSTALL_DIR/libexec/"
    cp "$INSTALLER_SOURCE_DIR/../runtime/browser-policy-spec.json" "$INSTALL_DIR/libexec/"
    cp "$INSTALLER_SOURCE_DIR/uninstall.sh" "$INSTALL_DIR/uninstall.sh"

    chmod +x "$INSTALL_DIR/lib/"*.sh
    chmod +x "$INSTALL_DIR/libexec/browser-json.py"
    chmod +x "$INSTALL_DIR/uninstall.sh"
    echo "✓ Librerías instaladas"

    # Load all libraries at once
    source "$INSTALL_DIR/lib/common.sh"
    load_libraries
}

step_install_dependencies() {
    echo ""
    echo "[2/13] Instalando dependencias..."

    apt_update_with_retry
    DEBIAN_FRONTEND=noninteractive apt_install_with_retry "dependencias base" \
        apt-get -o Acquire::Retries=3 install -y \
        iptables ipset curl iproute2 \
        libcap2-bin dnsutils conntrack python3

    RUNLEVEL=1 apt_install_with_retry "dnsmasq" \
        apt-get -o Acquire::Retries=3 install -y dnsmasq

    if [ -d /etc/default ]; then
        grep -q "IGNORE_RESOLVCONF" /etc/default/dnsmasq 2>/dev/null || \
            echo "IGNORE_RESOLVCONF=yes" >> /etc/default/dnsmasq
    fi

    setcap 'cap_net_bind_service,cap_net_admin=+ep' /usr/sbin/dnsmasq 2>/dev/null || true
    echo "✓ Dependencias instaladas"
}

step_free_port_53() {
    echo ""
    echo "[3/13] Liberando puerto 53..."

    free_port_53
    echo "✓ Puerto 53 liberado"
}

step_detect_dns() {
    echo ""
    echo "[4/13] Detectando DNS primario..."

    PRIMARY_DNS=$(detect_primary_dns)
    echo "$PRIMARY_DNS" > "$CONFIG_DIR/original-dns.conf"
    echo "✓ DNS primario: $PRIMARY_DNS"
}

step_install_scripts() {
    echo ""
    echo "[5/13] Instalando scripts..."

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-update.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-update.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/dnsmasq-watchdog.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/dnsmasq-watchdog.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/captive-portal-detector.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/captive-portal-detector.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-sse-listener.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-sse-listener.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-browser-setup.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-browser-setup.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-cmd.sh" "$SCRIPTS_DIR/openpath"
    chmod +x "$SCRIPTS_DIR/openpath"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-self-update.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-self-update.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-agent-update.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-agent-update.sh"

    create_dns_init_script

    mkdir -p "$ETC_CONFIG_DIR"
    chown root:root "$ETC_CONFIG_DIR" "$CONFIG_DIR" 2>/dev/null || true
    chmod 750 "$ETC_CONFIG_DIR" 2>/dev/null || true

    if ! persist_openpath_whitelist_url "$WHITELIST_URL"; then
        echo "✗ ERROR: whitelist URL inválida"
        exit 1
    fi

    if persist_openpath_health_api_config "$HEALTH_API_URL" "$HEALTH_API_SECRET"; then
        if [ -n "$HEALTH_API_URL" ]; then
            echo "  → Health API URL configurada"
        fi
        if [ -n "$HEALTH_API_SECRET" ]; then
            echo "  → Health API secret configurado"
        fi
    else
        echo "✗ ERROR: configuración health API inválida"
        exit 1
    fi

    if [ -n "$CLASSROOM_NAME" ] && [ -n "$API_URL" ]; then
        if ! persist_openpath_classroom_runtime_config "$API_URL" "$CLASSROOM_NAME" ""; then
            echo "✗ ERROR: configuración de aula inválida"
            exit 1
        fi

        if [ -n "$HEALTH_API_SECRET" ]; then
            cp "$HEALTH_API_SECRET_CONF" "$ETC_CONFIG_DIR/api-secret.conf"
            chown root:root "$ETC_CONFIG_DIR/api-secret.conf" 2>/dev/null || true
            chmod 600 "$ETC_CONFIG_DIR/api-secret.conf"
        fi
        echo "  → Modo Aula configurado: $CLASSROOM_NAME"
    fi

    echo "✓ Scripts instalados"
}

step_configure_sudoers() {
    echo ""
    echo "[6/13] Configurando permisos sudo..."

    if [[ ! -d /etc/sudoers.d ]]; then
        mkdir -p /etc/sudoers.d
        chmod 755 /etc/sudoers.d
    fi

    cat > /etc/sudoers.d/openpath << 'EOF'
# Permitir a todos los usuarios ejecutar comandos de LECTURA sin contraseña
# Estos son seguros: no modifican configuración ni desactivan protecciones
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath status
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath test
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath check *
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath health
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath domains
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath domains *
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath log
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath log *
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath logs
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath help

# Comandos de sistema (solo internos, no expuestos al usuario)
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath-update.sh
ALL ALL=(root) NOPASSWD: /usr/local/bin/dnsmasq-watchdog.sh

# NOTA: Los siguientes comandos REQUIEREN contraseña de root:
# openpath update, enable, disable, force, restart, rotate-token, enroll, setup
EOF

    chmod 440 /etc/sudoers.d/openpath
    echo "✓ Permisos sudo configurados"
}

step_create_services() {
    echo ""
    echo "[7/13] Creando servicios systemd..."

    create_systemd_services
    create_logrotate_config
    create_tmpfiles_config

    echo "✓ Servicios creados"
}

step_configure_dns() {
    echo ""
    echo "[8/13] Configurando DNS..."

    configure_upstream_dns
    configure_resolv_conf

    echo "✓ DNS configurado"
}

step_configure_dnsmasq() {
    echo ""
    echo "[9/13] Configurando dnsmasq..."

    if [ -f /etc/dnsmasq.conf ]; then
        sed -i 's/^no-resolv/#no-resolv/g' /etc/dnsmasq.conf 2>/dev/null || true
        sed -i 's/^cache-size=/#cache-size=/g' /etc/dnsmasq.conf 2>/dev/null || true
    fi

    cat > /etc/dnsmasq.d/openpath.conf << EOF
# Configuración inicial - será sobrescrita por dnsmasq-whitelist.sh
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
cache-size=1000
server=$PRIMARY_DNS
EOF

    systemctl restart dnsmasq

    echo "  Esperando a que dnsmasq esté activo..."
    for _ in $(seq 1 5); do
        if systemctl is-active --quiet dnsmasq; then
            break
        fi
        sleep 1
    done

    if systemctl is-active --quiet dnsmasq; then
        echo "✓ dnsmasq activo"
    else
        echo "✗ ERROR: dnsmasq no arrancó"
        journalctl -u dnsmasq -n 10 --no-pager
        exit 1
    fi
}

step_install_firefox() {
    echo ""
    echo "[10/13] Instalando Firefox..."

    if [ "$INSTALL_FIREFOX" = false ]; then
        echo "⊘ Firefox omitido (--skip-firefox)"
        return 0
    fi

    if install_firefox_esr; then
        echo "✓ Firefox instalado"
    else
        echo "⚠ Firefox no pudo instalarse (continuando)"
    fi
}

step_apply_policies() {
    echo ""
    echo "[11/13] Aplicando políticas de navegadores..."

    apply_search_engine_policies
    echo "✓ Políticas aplicadas"
}

step_install_extension() {
    echo ""
    echo "[12/13] Instalando extensiones del navegador..."

    if [ "$INSTALL_EXTENSION" = true ]; then
        local staged_ext_dir="$INSTALL_DIR/firefox-extension"
        local staged_release_dir="$INSTALL_DIR/firefox-release"
        local firefox_release_source=""

        rm -rf "$staged_ext_dir"
        rm -rf "$staged_release_dir"
        stage_firefox_installation_bundle "$INSTALLER_SOURCE_DIR/firefox-extension" "$staged_ext_dir"

        if firefox_release_source="$(stage_firefox_release_artifacts "$INSTALLER_SOURCE_DIR" "$staged_release_dir")"; then
            echo "  ✓ Artefactos Firefox Release firmados preparados desde $firefox_release_source"
        fi

        local browser_integration_args=(
            --firefox-required
            --chromium-best-effort
            --native-host-required
        )
        if [ "$INSTALL_NATIVE_HOST" = true ]; then
            browser_integration_args+=(--native-host)
        fi

        install_browser_integrations \
            "$staged_ext_dir" \
            "$staged_release_dir" \
            "${browser_integration_args[@]}"
        echo "✓ Extensiones del navegador instaladas"
    else
        echo "⊘ Extensiones del navegador omitidas (--no-extension)"
    fi
}

step_enable_services() {
    echo ""
    echo "[13/13] Habilitando servicios..."

    enable_services

    # Generate integrity baseline for anti-tampering watchdog
    echo "Generando hashes de integridad..."
    source "$INSTALL_DIR/lib/common.sh"
    INTEGRITY_HASH_FILE="$VAR_STATE_DIR/integrity.sha256"
    # Uses CRITICAL_FILES from common.sh (single source of truth)
    : > "$INTEGRITY_HASH_FILE"
    for f in "${CRITICAL_FILES[@]}"; do
        [ -f "$f" ] && sha256sum "$f" >> "$INTEGRITY_HASH_FILE"
    done
    chmod 600 "$INTEGRITY_HASH_FILE"
    echo "✓ Hashes de integridad generados"

    # Primera ejecución del whitelist
    echo "Ejecutando primera actualización..."
    "$SCRIPTS_DIR/openpath-update.sh" || echo "⚠ Primera actualización falló (el timer lo reintentará)"

    echo "✓ Servicios habilitados"
}

run_smoke_tests() {
    if [ -f "$INSTALLER_SOURCE_DIR/scripts/runtime/smoke-test.sh" ]; then
        cp "$INSTALLER_SOURCE_DIR/scripts/runtime/smoke-test.sh" "$SCRIPTS_DIR/"
        chmod +x "$SCRIPTS_DIR/smoke-test.sh"
    fi

    echo ""
    echo "Ejecutando smoke tests..."
    if "$SCRIPTS_DIR/smoke-test.sh" --quick 2>/dev/null; then
        SMOKE_STATUS="PASSED"
    else
        SMOKE_STATUS="FAILED"
    fi
}

run_classroom_registration() {
    MACHINE_REGISTERED=""
    if [ -n "$CLASSROOM_NAME" ] && [ -n "$API_URL" ]; then
        echo ""
        echo "Registrando máquina en aula..."

        if register_machine "$(hostname)" "$CLASSROOM_NAME" "" "$VERSION" "$API_URL" "$REGISTRATION_TOKEN"; then
            MACHINE_REGISTERED="REGISTERED"
            if [ -n "$TOKENIZED_URL" ] && is_tokenized_whitelist_url "$TOKENIZED_URL" && persist_openpath_whitelist_url "$TOKENIZED_URL"; then
                WHITELIST_URL="$TOKENIZED_URL"
                if [ -n "$REGISTERED_MACHINE_NAME" ]; then
                    persist_machine_name "$REGISTERED_MACHINE_NAME" || true
                fi
                echo "✓ Máquina registrada en aula: $CLASSROOM_NAME"
                echo "  → Whitelist URL tokenizada guardada"
            else
                MACHINE_REGISTERED="FAILED"
                echo "⚠ Registro exitoso pero no se recibió URL tokenizada"
            fi
        else
            MACHINE_REGISTERED="FAILED"
            echo "⚠ Error al registrar máquina"
            echo "  Respuesta: $REGISTER_RESPONSE"
        fi
    fi
}

print_summary() {
    if [ "$VERBOSE" != true ]; then
        echo ""
        echo "Installation complete."
        echo "Status: dnsmasq=$(systemctl is-active dnsmasq), smoke-tests=$SMOKE_STATUS"
        if [ -n "$MACHINE_REGISTERED" ]; then
            echo "Enrollment: $MACHINE_REGISTERED"
        fi
        echo "Manage with: openpath status"
        echo "Uninstall: sudo $INSTALLER_SOURCE_DIR/uninstall.sh"
        echo ""
        return 0
    fi

    echo ""
    echo "======================================================"
    echo "  ✓ INSTALACIÓN COMPLETADA"
    echo "======================================================"
    echo ""
    echo "Estado:"
    echo "  - dnsmasq: $(systemctl is-active dnsmasq)"
    echo "  - Timer: $(systemctl is-active openpath-dnsmasq.timer)"
    echo "  - Agent Update: $(systemctl is-active openpath-agent-update.timer)"
    echo "  - Watchdog: $(systemctl is-active dnsmasq-watchdog.timer)"
    echo "  - Smoke Tests: $SMOKE_STATUS"
    if [ -n "$MACHINE_REGISTERED" ]; then
        echo "  - Registro Aula: $MACHINE_REGISTERED"
    fi
    echo ""
    echo "Configuración:"
    echo "  - Whitelist: $WHITELIST_URL"
    echo "  - DNS upstream: $PRIMARY_DNS"
    echo ""
    echo "Comando de gestión: openpath"
    echo "  openpath status  - Ver estado"
    echo "  openpath test    - Probar DNS"
    echo "  openpath update  - Forzar actualización"
    echo "  openpath help    - Ver ayuda completa"
    echo ""
    echo "Tests manuales:"
    echo "  sudo smoke-test.sh        - Ejecutar smoke tests completos"
    echo "  sudo smoke-test.sh --quick - Solo tests críticos"
    echo ""
    echo "Desinstalar: sudo $INSTALLER_SOURCE_DIR/uninstall.sh"
    echo ""
}

# ============================================================================
# Main Entry Point
# ============================================================================

main() {
    if [ "$SKIP_PREFLIGHT" = true ]; then
        log_verbose ""
        log_verbose "[Preflight] Omitido por --skip-preflight"
    else
        show_progress 0 "$INSTALLER_STEP_TOTAL" "Validando requisitos previos"
        if [ "$VERBOSE" = true ]; then
            run_pre_install_validation
        else
            run_quietly run_pre_install_validation
        fi
    fi

    run_installer_step 1 "$INSTALLER_STEP_TOTAL" "Instalando librerias" step_install_libraries
    run_installer_step 2 "$INSTALLER_STEP_TOTAL" "Instalando dependencias" step_install_dependencies
    run_installer_step 3 "$INSTALLER_STEP_TOTAL" "Liberando puerto 53" step_free_port_53
    run_installer_step 4 "$INSTALLER_STEP_TOTAL" "Detectando DNS primario" step_detect_dns
    run_installer_step 5 "$INSTALLER_STEP_TOTAL" "Instalando scripts" step_install_scripts
    run_installer_step 6 "$INSTALLER_STEP_TOTAL" "Configurando permisos sudo" step_configure_sudoers
    run_installer_step 7 "$INSTALLER_STEP_TOTAL" "Creando servicios systemd" step_create_services
    run_installer_step 8 "$INSTALLER_STEP_TOTAL" "Configurando DNS" step_configure_dns
    run_installer_step 9 "$INSTALLER_STEP_TOTAL" "Configurando dnsmasq" step_configure_dnsmasq
    run_installer_step 10 "$INSTALLER_STEP_TOTAL" "Instalando Firefox" step_install_firefox
    run_installer_step 11 "$INSTALLER_STEP_TOTAL" "Aplicando politicas de navegadores" step_apply_policies
    run_installer_step 12 "$INSTALLER_STEP_TOTAL" "Instalando extensiones del navegador" step_install_extension
    run_installer_step 13 "$INSTALLER_STEP_TOTAL" "Habilitando servicios" step_enable_services
    run_installer_step 14 "$INSTALLER_STEP_TOTAL" "Ejecutando smoke tests" run_smoke_tests
    run_installer_step 15 "$INSTALLER_STEP_TOTAL" "Registrando maquina" run_classroom_registration
    print_summary
}

main
