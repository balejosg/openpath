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
#   sudo ./install.sh --with-native-host  (incluir native messaging)
#   sudo ./install.sh --skip-preflight  (omitir validación previa)
#
################################################################################

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=$(cat "$SCRIPT_DIR/../VERSION" 2>/dev/null || echo "4.1.0")

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
INSTALL_NATIVE_HOST=false
SKIP_PREFLIGHT=false
HEALTH_API_URL=""
HEALTH_API_SECRET=""
CLASSROOM_NAME=""
API_URL=""
REGISTRATION_TOKEN=""

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
        --with-native-host)
            INSTALL_NATIVE_HOST=true
            shift
            ;;
        --skip-preflight)
            SKIP_PREFLIGHT=true
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
    echo "🔑 API Secret generated automatically for Classroom mode"
    echo "   Secret will be saved to /etc/openpath/api-secret.conf"
    echo "   ACTION: Backup this file securely for reinstallation"
fi

# Validate registration token in classroom mode
if [ -n "$CLASSROOM_NAME" ] && [ -n "$API_URL" ]; then
    if [ -z "$REGISTRATION_TOKEN" ]; then
        echo "❌ Error: --registration-token es requerido en modo aula"
        echo "   Obtenga el token de registro del administrador del servidor central"
        exit 1
    fi
    
    echo "Validando token de registro..."
    VALIDATE_RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"token\":\"$REGISTRATION_TOKEN\"}" \
        "$API_URL/api/setup/validate-token" 2>/dev/null || echo "{\"valid\":false}")
    
    if ! echo "$VALIDATE_RESPONSE" | grep -q '"valid":true'; then
        echo "❌ Error: Token de registro inválido"
        echo "   Verifique el token con el administrador del servidor central"
        exit 1
    fi
    echo "✓ Token de registro validado"
fi

# Auto-elevación con sudo
if [ "$EUID" -ne 0 ]; then
    echo "Elevando permisos con sudo..."
    exec sudo "$0" "$@"
fi

echo "======================================================"
echo "  dnsmasq URL Whitelist System v$VERSION - Instalación"
echo "======================================================"
echo ""
echo "URL Whitelist: $WHITELIST_URL"
echo "Extensión Firefox: $INSTALL_EXTENSION"
if [ -n "$CLASSROOM_NAME" ]; then
    echo "Modo Aula: $CLASSROOM_NAME"
    echo "API URL: $API_URL"
fi
echo ""

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

step_install_libraries() {
    echo "[1/13] Instalando librerías..."
    mkdir -p "$INSTALL_DIR/lib"
    mkdir -p "$CONFIG_DIR"

    cp "$SCRIPT_DIR/lib/common.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_DIR/lib/dns.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_DIR/lib/firewall.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_DIR/lib/captive-portal.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_DIR/lib/browser.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_DIR/lib/services.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_DIR/lib/rollback.sh" "$INSTALL_DIR/lib/"

    chmod +x "$INSTALL_DIR/lib/"*.sh
    echo "✓ Librerías instaladas"

    # Load all libraries at once
    source "$INSTALL_DIR/lib/common.sh"
    load_libraries
}

step_install_dependencies() {
    echo ""
    echo "[2/13] Instalando dependencias..."

    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        iptables iptables-persistent ipset curl \
        libcap2-bin dnsutils conntrack python3 >/dev/null

    RUNLEVEL=1 apt-get install -y dnsmasq >/dev/null

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

    cp "$SCRIPT_DIR/scripts/runtime/openpath-update.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-update.sh"

    cp "$SCRIPT_DIR/scripts/runtime/dnsmasq-watchdog.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/dnsmasq-watchdog.sh"

    cp "$SCRIPT_DIR/scripts/runtime/captive-portal-detector.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/captive-portal-detector.sh"

    cp "$SCRIPT_DIR/scripts/runtime/openpath-sse-listener.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-sse-listener.sh"

    cp "$SCRIPT_DIR/scripts/runtime/openpath-cmd.sh" "$SCRIPTS_DIR/openpath"
    chmod +x "$SCRIPTS_DIR/openpath"

    cp "$SCRIPT_DIR/scripts/runtime/openpath-self-update.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-self-update.sh"

    create_dns_init_script

    mkdir -p "$ETC_CONFIG_DIR"
    chown root:root "$ETC_CONFIG_DIR" "$CONFIG_DIR" 2>/dev/null || true
    chmod 750 "$ETC_CONFIG_DIR" 2>/dev/null || true

    echo "$WHITELIST_URL" > "$WHITELIST_URL_CONF"
    chown root:root "$WHITELIST_URL_CONF" 2>/dev/null || true
    chmod 640 "$WHITELIST_URL_CONF"

    if [ -n "$HEALTH_API_URL" ]; then
        echo "$HEALTH_API_URL" > "$HEALTH_API_URL_CONF"
        chown root:root "$HEALTH_API_URL_CONF" 2>/dev/null || true
        chmod 640 "$HEALTH_API_URL_CONF"
        echo "  → Health API URL configurada"
    fi
    if [ -n "$HEALTH_API_SECRET" ]; then
        local old_umask
        old_umask=$(umask)
        umask 077
        echo "$HEALTH_API_SECRET" > "$HEALTH_API_SECRET_CONF"
        umask "$old_umask"
        chown root:root "$HEALTH_API_SECRET_CONF" 2>/dev/null || true
        chmod 600 "$HEALTH_API_SECRET_CONF"
        echo "  → Health API secret configurado"
    fi

    if [ -n "$CLASSROOM_NAME" ] && [ -n "$API_URL" ]; then
        echo "$CLASSROOM_NAME" > "$ETC_CONFIG_DIR/classroom.conf"
        echo "$API_URL" > "$ETC_CONFIG_DIR/api-url.conf"
        chown root:root "$ETC_CONFIG_DIR/classroom.conf" "$ETC_CONFIG_DIR/api-url.conf" 2>/dev/null || true
        chmod 640 "$ETC_CONFIG_DIR/classroom.conf" "$ETC_CONFIG_DIR/api-url.conf"
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
    echo "[10/13] Instalando Firefox ESR..."

    install_firefox_esr
    echo "✓ Firefox ESR instalado"
}

step_apply_policies() {
    echo ""
    echo "[11/13] Aplicando políticas de navegadores..."

    apply_search_engine_policies
    echo "✓ Políticas aplicadas"
}

step_install_extension() {
    echo ""
    echo "[12/13] Instalando extensión Firefox..."

    if [ "$INSTALL_EXTENSION" = true ]; then
        install_firefox_extension "$SCRIPT_DIR/firefox-extension"
        if [ "$INSTALL_NATIVE_HOST" = true ]; then
            install_native_host "$SCRIPT_DIR/firefox-extension/native"
        fi
        echo "✓ Extensión Firefox instalada"
    else
        echo "⊘ Extensión Firefox omitida (--no-extension)"
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
    > "$INTEGRITY_HASH_FILE"
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
    if [ -f "$SCRIPT_DIR/scripts/runtime/smoke-test.sh" ]; then
        cp "$SCRIPT_DIR/scripts/runtime/smoke-test.sh" "$SCRIPTS_DIR/"
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

        if register_machine "$(hostname)" "$CLASSROOM_NAME" "$VERSION" "$API_URL" "$REGISTRATION_TOKEN"; then
            MACHINE_REGISTERED="REGISTERED"
            if [ -n "$TOKENIZED_URL" ]; then
                echo "$TOKENIZED_URL" > "$WHITELIST_URL_CONF"
                WHITELIST_URL="$TOKENIZED_URL"
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
    echo ""
    echo "======================================================"
    echo "  ✓ INSTALACIÓN COMPLETADA"
    echo "======================================================"
    echo ""
    echo "Estado:"
    echo "  - dnsmasq: $(systemctl is-active dnsmasq)"
    echo "  - Timer: $(systemctl is-active openpath-dnsmasq.timer)"
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
    echo "Desinstalar: sudo $SCRIPT_DIR/uninstall.sh"
    echo ""
}

# ============================================================================
# Main Entry Point
# ============================================================================

main() {
    if [ "$SKIP_PREFLIGHT" = true ]; then
        echo ""
        echo "[Preflight] Omitido por --skip-preflight"
    else
        run_pre_install_validation
    fi

    step_install_libraries
    step_install_dependencies
    step_free_port_53
    step_detect_dns
    step_install_scripts
    step_configure_sudoers
    step_create_services
    step_configure_dns
    step_configure_dnsmasq
    step_install_firefox
    step_apply_policies
    step_install_extension
    step_enable_services
    run_smoke_tests
    run_classroom_registration
    print_summary
}

main
