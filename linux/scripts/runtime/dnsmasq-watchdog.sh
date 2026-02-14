#!/bin/bash
set -o pipefail

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
# dnsmasq-watchdog.sh - Watchdog para dnsmasq
# Parte del sistema OpenPath DNS
#
# Verifica la salud del sistema y recupera automáticamente si hay problemas
################################################################################

# Cargar librerías
INSTALL_DIR="/usr/local/lib/openpath"
source "$INSTALL_DIR/lib/common.sh"
source "$INSTALL_DIR/lib/dns.sh"
source "$INSTALL_DIR/lib/rollback.sh"

HEALTH_FILE="$CONFIG_DIR/health-status"
FAIL_COUNT_FILE="$CONFIG_DIR/watchdog-fails"
MAX_CONSECUTIVE_FAILS=3

# Obtener/incrementar contador de fallos
get_fail_count() {
    if [ -f "$FAIL_COUNT_FILE" ]; then
        cat "$FAIL_COUNT_FILE"
    else
        echo "0"
    fi
}

increment_fail_count() {
    local count
    count=$(get_fail_count)
    echo $((count + 1)) > "$FAIL_COUNT_FILE"
}

reset_fail_count() {
    echo "0" > "$FAIL_COUNT_FILE"
}

# Verificaciones
check_dnsmasq_running() {
    systemctl is-active --quiet dnsmasq
}

check_dns_resolving() {
    timeout 5 dig @127.0.0.1 google.com +short +time=3 >/dev/null 2>&1
}

check_upstream_dns() {
    [ -s /run/dnsmasq/resolv.conf ]
}

check_resolv_conf() {
    grep -q "nameserver 127.0.0.1" /etc/resolv.conf 2>/dev/null
}

# Recuperaciones
recover_upstream_dns() {
    log "[WATCHDOG] Recuperando DNS upstream..."
    if [ -x "$SCRIPTS_DIR/dnsmasq-init-resolv.sh" ]; then
        "$SCRIPTS_DIR/dnsmasq-init-resolv.sh"
    else
        mkdir -p /run/dnsmasq
        local dns
        dns=$(head -1 "$ORIGINAL_DNS_FILE" 2>/dev/null)
        [ -z "$dns" ] && dns="8.8.8.8"
        echo "nameserver $dns" > /run/dnsmasq/resolv.conf
        echo "nameserver 8.8.8.8" >> /run/dnsmasq/resolv.conf
    fi
}

recover_resolv_conf() {
    log "[WATCHDOG] Recuperando /etc/resolv.conf..."
    chattr -i /etc/resolv.conf 2>/dev/null || true
    cat > /etc/resolv.conf << 'EOF'
nameserver 127.0.0.1
options edns0 trust-ad
search lan
EOF
    chattr +i /etc/resolv.conf 2>/dev/null || true
}

# Principal
main() {
    local status="OK"
    local actions=""
    local fail_count
    fail_count=$(get_fail_count)
    
    # Protección contra loop infinito de reinicios
    if [ "$fail_count" -ge "$MAX_CONSECUTIVE_FAILS" ]; then
        log "[WATCHDOG] ALERTA: $fail_count fallos consecutivos"
        
        # First, try to rollback to a previous working checkpoint
        if attempt_rollback_recovery; then
            status="RECOVERED"
            actions="rollback_recovery"
            # Don't enter fail-open, rollback succeeded
        else
            # Rollback failed, enter fail-open mode
            log "[WATCHDOG] Entrando en modo fail-open"
            source "$INSTALL_DIR/lib/firewall.sh"
            deactivate_firewall
            
            # Guardar estado
            status="FAIL_OPEN"
            cat > "$HEALTH_FILE" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "status": "FAIL_OPEN",
    "message": "Demasiados fallos consecutivos - sistema en modo permisivo",
    "fail_count": $fail_count
}
EOF
            # Report fail-open to central API immediately
            report_health_to_api "FAIL_OPEN" "fail_open_activated"
            
            # No resetear contador - requiere intervención manual
            return 1
        fi
    fi
    
    # Check 1: dnsmasq running
    if ! check_dnsmasq_running; then
        status="CRITICAL"
        actions="dnsmasq_restart"
        log "[WATCHDOG] CRÍTICO: dnsmasq no está corriendo"
    fi
    
    # Check 2: upstream DNS config
    if ! check_upstream_dns; then
        [ "$status" = "OK" ] && status="WARNING"
        actions="$actions upstream_dns"
        log "[WATCHDOG] ADVERTENCIA: /run/dnsmasq/resolv.conf no existe"
    fi
    
    # Check 3: resolv.conf
    if ! check_resolv_conf; then
        [ "$status" = "OK" ] && status="WARNING"
        actions="$actions resolv_conf"
        log "[WATCHDOG] ADVERTENCIA: /etc/resolv.conf no apunta a localhost"
    fi
    
    # Ejecutar recuperaciones
    if [ -n "$actions" ]; then
        log "[WATCHDOG] Iniciando recuperación: $actions"
        
        for action in $actions; do
            case "$action" in
                upstream_dns)
                    recover_upstream_dns
                    ;;
                resolv_conf)
                    recover_resolv_conf
                    ;;
                dnsmasq_restart)
                    recover_upstream_dns
                    recover_resolv_conf
                    systemctl restart dnsmasq
                    # Esperar a que dnsmasq esté listo (máx 5 segundos)
                    for _ in $(seq 1 5); do
                        if check_dnsmasq_running; then
                            break
                        fi
                        sleep 1
                    done
                    if check_dnsmasq_running; then
                        log "[WATCHDOG] ✓ dnsmasq reiniciado"
                        status="RECOVERED"
                    else
                        status="FAILED"
                        increment_fail_count
                    fi
                    ;;
            esac
        done
    fi
    
    # Si todo OK, resetear contador de fallos
    if [ "$status" = "OK" ] || [ "$status" = "RECOVERED" ]; then
        reset_fail_count
    fi
    
    # Guardar estado local
    cat > "$HEALTH_FILE" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "status": "$status",
    "dnsmasq_running": $(check_dnsmasq_running && echo "true" || echo "false"),
    "dns_resolving": $(check_dns_resolving && echo "true" || echo "false"),
    "fail_count": $(get_fail_count),
    "actions": "$actions"
}
EOF
    
    # Report health to central API (mandatory)
    report_health_to_api "$status" "$actions"
    
    [ "$status" = "OK" ] || [ "$status" = "RECOVERED" ]
}

# Report health status to central monitoring API (using tRPC)
report_health_to_api() {
    local status="$1"
    local actions="$2"

    # Read API URL from config
    local api_url_file="$CONFIG_DIR/health-api-url.conf"
    local shared_secret_file="$CONFIG_DIR/health-api-secret.conf"

    if [ ! -f "$api_url_file" ]; then
        log_debug "[WATCHDOG] No health API configured (create $api_url_file)"
        return 0
    fi

    local api_url
    api_url=$(cat "$api_url_file")
    local shared_secret=""
    [ -f "$shared_secret_file" ] && shared_secret=$(cat "$shared_secret_file")

    local hostname
    hostname=$(hostname)

    # Build tRPC payload with json wrapper
    local payload
    payload=$(cat << EOF
{"json": {
    "hostname": "$hostname",
    "status": "$status",
    "dnsmasqRunning": $(check_dnsmasq_running && echo "true" || echo "false"),
    "dnsResolving": $(check_dns_resolving && echo "true" || echo "false"),
    "failCount": $(get_fail_count),
    "actions": "$actions",
    "version": "${VERSION:-1.0.4}"
}}
EOF
)

    # Send report to tRPC endpoint (fire and forget, don't block watchdog)
    # Build curl command with optional auth header
    if [ -n "$shared_secret" ]; then
        timeout 5 curl -s -X POST "$api_url/trpc/healthReports.submit" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $shared_secret" \
            -d "$payload" >/dev/null 2>&1 &
    else
        timeout 5 curl -s -X POST "$api_url/trpc/healthReports.submit" \
            -H "Content-Type: application/json" \
            -d "$payload" >/dev/null 2>&1 &
    fi
}

# Attempt rollback before entering fail-open mode
attempt_rollback_recovery() {
    log "[WATCHDOG] Intentando restaurar desde checkpoint antes de entrar en modo fail-open..."
    
    if has_checkpoint; then
        local prev
        prev=$(get_previous_checkpoint)
        if [ -n "$prev" ]; then
            restore_checkpoint "$prev"
            
            # Esperar a que el sistema se asiente tras el rollback (máx 5 segundos)
            for _ in $(seq 1 5); do
                if check_dnsmasq_running && check_dns_resolving; then
                    break
                fi
                sleep 1
            done
            
            # Check if rollback fixed the issue
            if check_dnsmasq_running && check_dns_resolving; then
                log "[WATCHDOG] ✓ Rollback exitoso - sistema recuperado"
                reset_fail_count
                return 0
            fi
        fi
    fi
    
    log "[WATCHDOG] Rollback falló o no hay checkpoint disponible"
    return 1
}

main "$@"
