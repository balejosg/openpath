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
# openpath-update.sh - Whitelist update script
# Part of the OpenPath DNS system
#
# Runs periodically (via timer) to:
# - Download the whitelist from the API/GitHub
# - Update the dnsmasq configuration
# - Apply browser policies
# - Detect remote deactivation
################################################################################

# Load common.sh first (defines OPENPATH_LOCK_FILE and shared functions)
INSTALL_DIR="/usr/local/lib/openpath"
source "$INSTALL_DIR/lib/common.sh"

# Cleanup on exit (normal or error)
cleanup_lock() {
    rm -f "$OPENPATH_LOCK_FILE" 2>/dev/null || true
}
trap cleanup_lock EXIT

# Acquire exclusive lock with timeout (prevents race with captive-portal-detector)
exec 200>"$OPENPATH_LOCK_FILE"
if ! timeout 30 flock -x 200; then
    echo "Could not acquire lock after 30s - another process may be stuck"
    exit 1
fi

# Load additional libraries
if ! load_libraries; then
    echo "ERROR: Could not load required OpenPath libraries"
    exit 1
fi

# Whitelist URL - always reads from whitelist-url.conf
# In Classroom mode, install.sh saves the tokenized URL during registration
get_whitelist_url() {
    if [ -f "$WHITELIST_URL_CONF" ]; then
        cat "$WHITELIST_URL_CONF"
    else
        echo "${WHITELIST_URL:-$DEFAULT_WHITELIST_URL}"
    fi
}

get_url_host() {
    local url="$1"
    local without_scheme="${url#*://}"
    local host_port="${without_scheme%%/*}"

    # Remove optional userinfo (user:pass@host)
    host_port="${host_port##*@}"

    # Drop optional port
    echo "${host_port%%:*}"
}

append_fail_safe_allow_domain() {
    local domain="$1"

    if validate_domain "$domain"; then
        local safe_domain
        safe_domain=$(sanitize_domain "$domain")
        echo "server=/${safe_domain}/${PRIMARY_DNS}" >> "$DNSMASQ_CONF"
        log "Fail-safe allows control-plane domain: $safe_domain"
    else
        log_warn "Fail-safe cannot allow invalid control-plane domain: ${domain:-<empty>}"
    fi
}

WHITELIST_URL=$(get_whitelist_url)

# NOTE: check_captive_portal() is now defined in common.sh
# to avoid code duplication with captive-portal-detector.sh

# Validate whitelist content format
# Returns 0 if valid, 1 if invalid
# Checks that the file contains enough domain-like lines (defense against HTML error pages)
validate_whitelist_content() {
    local file="$1"
    local valid_lines
    valid_lines=$(grep -cP '^[a-zA-Z0-9*].*\.[a-zA-Z]{2,}' "$file" 2>/dev/null || echo 0)

    if [ "$valid_lines" -lt "${MIN_VALID_DOMAINS:-5}" ]; then
        log_warn "Downloaded whitelist does not look valid ($valid_lines domain-like lines, need ${MIN_VALID_DOMAINS:-5})"
        return 1
    fi

    # Enforce max domains limit
    local total_lines
    total_lines=$(wc -l < "$file" 2>/dev/null || echo 0)
    if [ "$total_lines" -gt "${MAX_DOMAINS:-500}" ]; then
        log_warn "Whitelist has $total_lines lines, truncating to ${MAX_DOMAINS:-500}"
        local truncated="${file}.truncated"
        head -n "${MAX_DOMAINS:-500}" "$file" > "$truncated"
        mv "$truncated" "$file"
    fi

    return 0
}

# Download whitelist
download_whitelist() {
    log "Downloading whitelist from: $WHITELIST_URL"
    
    local temp_file="${WHITELIST_FILE}.tmp"
    
    if timeout 30 curl -L -f -s "$WHITELIST_URL" -o "$temp_file" 2>/dev/null; then
        if [ -s "$temp_file" ]; then
            # Validate content format before accepting
            if validate_whitelist_content "$temp_file"; then
                mv "$temp_file" "$WHITELIST_FILE"
                log "✓ Whitelist downloaded successfully"
                return 0
            else
                log_warn "Whitelist content validation failed - rejecting download"
                rm -f "$temp_file"
                return 1
            fi
        fi
    fi
    
    rm -f "$temp_file"
    log "⚠ Error downloading whitelist"
    return 1
}

# Verificar desactivación remota
check_emergency_disable() {
    if [ -f "$WHITELIST_FILE" ]; then
        local first_line
        first_line=$(grep -v '^[[:space:]]*$' "$WHITELIST_FILE" | head -n 1)
        if echo "$first_line" | grep -iq "^#.*DESACTIVADO"; then
            return 0
        fi
    fi
    return 1
}

# Limpiar sistema (modo fail-open)
cleanup_system() {
    log "=== Activando modo fail-open ==="
    
    # Limpiar firewall
    log "Desactivando firewall..."
    deactivate_firewall
    
    # Limpiar políticas de navegadores
    log "Limpiando políticas de navegadores..."
    cleanup_browser_policies
    
    # dnsmasq en modo passthrough
    log "Configurando dnsmasq en modo passthrough..."
    cat > "$DNSMASQ_CONF" << EOF
# MODO FAIL-OPEN - Sin restricciones
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
server=$PRIMARY_DNS
EOF
    
    # CRÍTICO: Borrar hashes para forzar regeneración cuando se reactive
    rm -f "$DNSMASQ_CONF_HASH" 2>/dev/null || true
    rm -f "$BROWSER_POLICIES_HASH" 2>/dev/null || true
    
    log "Reiniciando dnsmasq..."
    systemctl restart dnsmasq 2>/dev/null || true

    # Limpiar conexiones
    log "Limpiando conexiones..."
    flush_connections

    log "=== Sistema en modo fail-open ==="
}

# Forzar aplicación de cambios
force_apply_changes() {
    log "Forzando aplicación de cambios..."
    
    flush_connections
    flush_dns_cache
    force_browser_close
    
    log "✓ Cambios aplicados"
}

# Verificar si la configuración cambió
has_config_changed() {
    if [ ! -f "$DNSMASQ_CONF_HASH" ]; then
        return 0
    fi

    local new_hash
    new_hash=$(sha256sum "$DNSMASQ_CONF" 2>/dev/null | cut -d' ' -f1)
    local old_hash
    old_hash=$(cat "$DNSMASQ_CONF_HASH" 2>/dev/null)
    
    [ "$new_hash" != "$old_hash" ]
}

# Lógica principal
main() {
    log "=== Iniciando actualización de whitelist ==="
    
    # Inicializar
    init_directories
    PRIMARY_DNS=$(detect_primary_dns)
    
    # CRÍTICO: Verificar portal cautivo ANTES de cualquier cambio
    # Si hay portal cautivo, desactivar firewall y esperar
    if check_captive_portal; then
        log "⚠ Portal cautivo detectado - desactivando firewall para autenticación"
        deactivate_firewall
        # No continuar hasta que el usuario se autentique
        # El servicio captive-portal-detector.service se encargará de reactivar
        return 0
    fi
    
    # Descargar whitelist
    if ! download_whitelist; then
        log "⚠ Error al descargar - usando whitelist existente"
        if [ ! -f "$WHITELIST_FILE" ]; then
            log "⚠ Sin whitelist disponible - modo fail-open"
            cleanup_system
            return
        fi

        # Offline expiration policy: check whitelist age
        local max_age_hours="${WHITELIST_MAX_AGE_HOURS:-24}"
        if [ "$max_age_hours" -gt 0 ] 2>/dev/null; then
            local file_age_seconds
            file_age_seconds=$(( $(date +%s) - $(stat -c %Y "$WHITELIST_FILE" 2>/dev/null || echo 0) ))
            local max_age_seconds=$(( max_age_hours * 3600 ))

            if [ "$file_age_seconds" -ge "$max_age_seconds" ]; then
                local age_hours=$(( file_age_seconds / 3600 ))
                log_warn "⚠ Whitelist expired: ${age_hours}h old (max: ${max_age_hours}h)"
                log_warn "Entering fail-safe mode — blocking all DNS until fresh whitelist"

                # Write fail-safe dnsmasq config: block everything by default.
                # Then allow only the whitelist control-plane hostname so the
                # agent can recover automatically.
                cat > "$DNSMASQ_CONF" << EOF
# FAIL-SAFE MODE — whitelist expired (${age_hours}h old, max ${max_age_hours}h)
# Blocks all domains by default
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
server=$PRIMARY_DNS
# Block all domains by default (return NXDOMAIN)
address=/#/
EOF

                local whitelist_host
                whitelist_host=$(get_url_host "$WHITELIST_URL")
                append_fail_safe_allow_domain "$whitelist_host"

                rm -f "$DNSMASQ_CONF_HASH" 2>/dev/null || true
                systemctl restart dnsmasq 2>/dev/null || true
                log "=== Sistema en modo fail-safe (whitelist expirada) ==="
                return
            else
                local remaining_hours=$(( (max_age_seconds - file_age_seconds) / 3600 ))
                log "Whitelist age OK (expires in ~${remaining_hours}h)"
            fi
        fi
    fi
    
    # SIEMPRE verificar desactivación (tanto si se descargó como si usamos el existente)
    if check_emergency_disable; then
        # Solo actuar si es una NUEVA desactivación (transición)
        if [ ! -f "$SYSTEM_DISABLED_FLAG" ]; then
            log "=== SISTEMA DESACTIVADO REMOTAMENTE ==="
            cleanup_system
            # Cerrar navegadores solo en la transición activo → desactivado
            log "Cerrando navegadores por desactivación del sistema..."
            force_browser_close
            # Marcar sistema como desactivado
            touch "$SYSTEM_DISABLED_FLAG"
        else
            log "Sistema ya desactivado - sin cambios"
        fi
        return
    fi

    # Si llegamos aquí, el sistema está activo - borrar flag si existía
    if [ -f "$SYSTEM_DISABLED_FLAG" ]; then
        log "Sistema reactivándose desde modo desactivado"
        rm -f "$SYSTEM_DISABLED_FLAG"
    fi
    
    # Parsear secciones
    parse_whitelist_sections "$WHITELIST_FILE"
    
    # Guardar estado del firewall ANTES de hacer cambios
    local firewall_was_inactive=false
    if [ "$(check_firewall_status)" != "active" ]; then
        firewall_was_inactive=true
    fi

    # Save checkpoint before applying changes (for rollback if something breaks)
    save_checkpoint "pre-update"

    # Generar configuración
    generate_dnsmasq_config

    # Generar políticas de navegadores (WebsiteFilter + SearchEngines)
    generate_firefox_policies
    generate_chromium_policies
    apply_search_engine_policies

    # Verificar si las políticas de navegador cambiaron
    # Comparar contra hash guardado de ejecución anterior, no contra hash pre-regeneración
    local new_policies_hash
    new_policies_hash=$(get_policies_hash)
    local old_policies_hash=""
    if [ -f "$BROWSER_POLICIES_HASH" ]; then
        old_policies_hash=$(cat "$BROWSER_POLICIES_HASH" 2>/dev/null)
    fi

    local policies_changed=false
    if [ "$old_policies_hash" != "$new_policies_hash" ]; then
        policies_changed=true
        log "Detectados cambios en políticas de navegador"
        # Guardar nuevo hash
        echo "$new_policies_hash" > "$BROWSER_POLICIES_HASH"
    fi
    
    # Aplicar cambios de dnsmasq si es necesario
    if has_config_changed; then
        log "Detectados cambios en configuración DNS - aplicando..."
        
        if restart_dnsmasq; then
            # Guardar hash
            sha256sum "$DNSMASQ_CONF" | cut -d' ' -f1 > "$DNSMASQ_CONF_HASH"
            
            # Verificar DNS
            if verify_dns; then
                log "✓ DNS funcional"
                activate_firewall
            else
                log "⚠ DNS no funcional - modo permisivo"
                deactivate_firewall
            fi
        else
            log "ERROR: Fallo al reiniciar dnsmasq"
            cleanup_system
            return
        fi
    else
        # Sin cambios en DNS, pero verificar firewall
        if verify_dns; then
            if [ "$firewall_was_inactive" = true ]; then
                log "Reactivando firewall..."
                activate_firewall
            fi
        else
            log "⚠ DNS no funcional - manteniendo firewall permisivo"
            deactivate_firewall
        fi
    fi
    
    # Aplicar cambios de red sin cerrar navegadores.
    # El bloqueo por rutas se aplica en caliente desde la extension.
    if [ "$policies_changed" = true ]; then
        log "Cambio en políticas detectado (sin cierre de navegadores)"
        flush_connections
    elif [ "$firewall_was_inactive" = true ]; then
        log "Sistema reactivado (sin cierre de navegadores)"
        flush_connections
    fi
    
    log "=== Actualización completada ==="
}

main "$@"
