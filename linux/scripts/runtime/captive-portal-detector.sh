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
# captive-portal-detector.sh - Captive portal detector
# Part of the OpenPath DNS system
#
# Detects captive portals (hotel WiFi, airports, etc.)
# and temporarily deactivates the firewall for authentication
################################################################################

# Cargar librerías
INSTALL_DIR="/usr/local/lib/openpath"
source "$INSTALL_DIR/lib/common.sh"
source "$INSTALL_DIR/lib/dns.sh"
source "$INSTALL_DIR/lib/firewall.sh"

# Lock file compartido con openpath-update.sh (defined in common.sh as OPENPATH_LOCK_FILE)

# Files (Debian FHS compliant)
CAPTIVE_PORTAL_STATE_FILE="$VAR_STATE_DIR/captive-portal-active.state"
CAPTIVE_DNSMASQ_BACKUP_FILE="$VAR_STATE_DIR/openpath.conf.pre-portal"

CAPTIVE_PORTAL_DETECTED=false
LAST_STATE=""

SLEEP_PID=""

# NOTE: is_network_authenticated() and check_captive_portal() are now
# defined in common.sh to avoid code duplication with openpath-update.sh

wake_now() {
    if [ -n "${SLEEP_PID:-}" ]; then
        kill "$SLEEP_PID" 2>/dev/null || true
    fi
}

trap 'wake_now' USR1

interruptible_sleep() {
    local seconds="$1"
    sleep "$seconds" &
    SLEEP_PID=$!
    wait "$SLEEP_PID" 2>/dev/null || true
    SLEEP_PID=""
}

with_openpath_lock() {
    exec 200>"$OPENPATH_LOCK_FILE"
    if ! timeout 30 flock -x 200; then
        log "[CAPTIVE] Could not acquire lock after 30s - skipping modification" "WARN"
        return 1
    fi

    "$@"
    local rc=$?

    flock -u 200
    return "$rc"
}

is_portal_mode_active() {
    [ -f "$CAPTIVE_PORTAL_STATE_FILE" ]
}

get_portal_mode_start_ts() {
    if [ ! -f "$CAPTIVE_PORTAL_STATE_FILE" ]; then
        return 1
    fi

    local ts
    ts=$(cat "$CAPTIVE_PORTAL_STATE_FILE" 2>/dev/null | head -1)
    if [[ "$ts" =~ ^[0-9]+$ ]]; then
        echo "$ts"
        return 0
    fi
    return 1
}

get_active_ssid() {
    if ! command -v nmcli >/dev/null 2>&1; then
        return 1
    fi

    LC_ALL=C nmcli -t -f ACTIVE,SSID dev wifi 2>/dev/null \
        | awk -F: '$1=="yes" {print $2; exit}'
}

enter_portal_mode_locked() {
    mkdir -p "$VAR_STATE_DIR" 2>/dev/null || true

    PRIMARY_DNS=$(detect_primary_dns)
    export PRIMARY_DNS

    if [ -f "$DNSMASQ_CONF" ]; then
        cp "$DNSMASQ_CONF" "$CAPTIVE_DNSMASQ_BACKUP_FILE" 2>/dev/null || true
    fi

    log "[CAPTIVE] Portal cautivo detectado - activando modo fail-open (DNS passthrough + firewall permisivo)" "WARN"

    cat > "$DNSMASQ_CONF" << EOF
# OPENPATH PORTAL MODE - DNS passthrough (temporary)
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
cache-size=1000
server=$PRIMARY_DNS
EOF

    if ! restart_dnsmasq; then
        log "[CAPTIVE] ERROR: dnsmasq no reinició en modo portal" "ERROR"
        if [ -f "$CAPTIVE_DNSMASQ_BACKUP_FILE" ]; then
            log "[CAPTIVE] Restaurando configuración DNS previa" "WARN"
            cp "$CAPTIVE_DNSMASQ_BACKUP_FILE" "$DNSMASQ_CONF" 2>/dev/null || true
            restart_dnsmasq 2>/dev/null || true
        fi
    fi

    deactivate_firewall
    flush_connections 2>/dev/null || true

    date +%s > "$CAPTIVE_PORTAL_STATE_FILE" 2>/dev/null || true
    return 0
}

exit_portal_mode_locked() {
    PRIMARY_DNS=$(detect_primary_dns)
    export PRIMARY_DNS

    local start_ts duration
    duration=""
    if start_ts=$(get_portal_mode_start_ts); then
        duration=$(( $(date +%s) - start_ts ))
    fi

    log "[CAPTIVE] Autenticación completada - restaurando protecciones" "INFO"
    if [ -n "$duration" ]; then
        log "[CAPTIVE] Tiempo en modo portal: ${duration}s" "INFO"
    fi

    if [ -f "$DNSMASQ_CONF" ] && grep -q "^# OPENPATH PORTAL MODE" "$DNSMASQ_CONF" 2>/dev/null; then
        if [ -f "$CAPTIVE_DNSMASQ_BACKUP_FILE" ]; then
            cp "$CAPTIVE_DNSMASQ_BACKUP_FILE" "$DNSMASQ_CONF" 2>/dev/null || true
            restart_dnsmasq 2>/dev/null || true
        fi
    fi

    rm -f "$CAPTIVE_DNSMASQ_BACKUP_FILE" 2>/dev/null || true
    rm -f "$CAPTIVE_PORTAL_STATE_FILE" 2>/dev/null || true

    activate_firewall
    flush_connections 2>/dev/null || true
    return 0
}

# Bucle principal
main() {
    log "[CAPTIVE] Iniciando detector de portal cautivo"

    if is_portal_mode_active; then
        log "[CAPTIVE] Portal mode marker detectado al inicio - manteniendo modo fail-open hasta AUTHENTICATED" "WARN"
        CAPTIVE_PORTAL_DETECTED=true
    fi

    while true; do
        local state
        state=$(get_captive_portal_state)

        if [ "$state" != "$LAST_STATE" ]; then
            local ssid gw
            ssid=$(get_active_ssid 2>/dev/null || true)
            gw=$(ip route 2>/dev/null | awk '/default/ {print $3; exit}' || true)
            log "[CAPTIVE] Estado: ${LAST_STATE:-INIT} -> $state (ssid=${ssid:-n/a}, gw=${gw:-n/a})" "INFO"
            LAST_STATE="$state"
        fi

        if [ "$state" = "AUTHENTICATED" ]; then
            if [ "$CAPTIVE_PORTAL_DETECTED" = true ] || is_portal_mode_active; then
                if with_openpath_lock exit_portal_mode_locked; then
                    CAPTIVE_PORTAL_DETECTED=false
                fi
            fi
        elif [ "$state" = "PORTAL" ]; then
            if [ "$CAPTIVE_PORTAL_DETECTED" = false ] && ! is_portal_mode_active; then
                if with_openpath_lock enter_portal_mode_locked; then
                    CAPTIVE_PORTAL_DETECTED=true
                fi
            fi
        fi

        local interval
        if [ "$state" = "AUTHENTICATED" ]; then
            interval="${CAPTIVE_INTERVAL_NORMAL:-60}"
        elif [ "$state" = "PORTAL" ]; then
            interval="${CAPTIVE_INTERVAL_PORTAL_ACTIVE:-10}"
        else
            interval="${CAPTIVE_INTERVAL_NO_NETWORK:-5}"
        fi

        interruptible_sleep "$interval"
    done
}

main "$@"
