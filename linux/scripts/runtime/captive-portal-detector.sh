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
source "$INSTALL_DIR/lib/firewall.sh"

# Lock file compartido con openpath-update.sh (defined in common.sh as OPENPATH_LOCK_FILE)

# Configuración
CHECK_INTERVAL=30
CAPTIVE_PORTAL_DETECTED=false

# NOTE: is_network_authenticated() and check_captive_portal() are now
# defined in common.sh to avoid code duplication with openpath-update.sh

# Modificar firewall con lock (with timeout to prevent deadlock)
modify_firewall_locked() {
    local action="$1"

    exec 200>"$OPENPATH_LOCK_FILE"
    if ! timeout 30 flock -x 200; then
        log "[CAPTIVE] Could not acquire lock after 30s - skipping firewall modification"
        return 1
    fi

    # Set PRIMARY_DNS for firewall functions to use
    PRIMARY_DNS=$(detect_primary_dns)
    export PRIMARY_DNS

    if [ "$action" = "activate" ]; then
        activate_firewall
    else
        deactivate_firewall
    fi

    flock -u 200
}

# Bucle principal
main() {
    log "[CAPTIVE] Iniciando detector de portal cautivo"

    while true; do
        if is_network_authenticated; then
            if [ "$CAPTIVE_PORTAL_DETECTED" = true ]; then
                log "[CAPTIVE] Autenticación completada - reactivando firewall"
                modify_firewall_locked "activate"
                CAPTIVE_PORTAL_DETECTED=false
            fi
        else
            if [ "$CAPTIVE_PORTAL_DETECTED" = false ]; then
                log "[CAPTIVE] Portal cautivo detectado - desactivando firewall"
                modify_firewall_locked "deactivate"
                CAPTIVE_PORTAL_DETECTED=true
            fi
        fi

        sleep $CHECK_INTERVAL
    done
}

main "$@"
