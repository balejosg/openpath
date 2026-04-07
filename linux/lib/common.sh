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
# common.sh - Common variables and functions
# Part of the OpenPath DNS system
################################################################################

# System version - read from central VERSION file or fallback
_VERSION_FILE="${INSTALL_DIR:-/usr/local/lib/openpath}/VERSION"
_SCRIPT_VERSION_FILE="$(dirname "${BASH_SOURCE[0]}")/../../VERSION"
if [ -f "$_VERSION_FILE" ]; then
    VERSION=$(cat "$_VERSION_FILE")
elif [ -f "$_SCRIPT_VERSION_FILE" ]; then
    VERSION=$(cat "$_SCRIPT_VERSION_FILE")
else
    VERSION="4.1.0"
fi
export VERSION

# Source configurable defaults (must be early, before other variables)
# Try installed location first, then source directory
if [ -f "/usr/local/lib/openpath/lib/defaults.conf" ]; then
    # shellcheck source=defaults.conf
    source "/usr/local/lib/openpath/lib/defaults.conf"
elif [ -f "$(dirname "${BASH_SOURCE[0]}")/defaults.conf" ]; then
    # shellcheck source=defaults.conf
    source "$(dirname "${BASH_SOURCE[0]}")/defaults.conf"
fi

# Directories and files - exported for use by other scripts
export INSTALL_DIR="${INSTALL_DIR:-/usr/local/lib/openpath}"
export SCRIPTS_DIR="${SCRIPTS_DIR:-/usr/local/bin}"

# Debian FHS compliant paths:
# - /etc/ for configuration (preserved on upgrade)
# - /var/lib/ for state/cache (can be regenerated)
# Use defaults if not set (allows override for testing)
ETC_CONFIG_DIR="${ETC_CONFIG_DIR:-/etc/openpath}"
VAR_STATE_DIR="${VAR_STATE_DIR:-/var/lib/openpath}"
LOG_FILE="${LOG_FILE:-/var/log/openpath.log}"

# Configuration files (in /etc/, preserved on upgrade) - exported for use by other scripts
export WHITELIST_URL_CONF="$ETC_CONFIG_DIR/whitelist-url.conf"
export HEALTH_API_URL_CONF="$ETC_CONFIG_DIR/health-api-url.conf"
export HEALTH_API_SECRET_CONF="$ETC_CONFIG_DIR/health-api-secret.conf"
export MACHINE_NAME_CONF="$ETC_CONFIG_DIR/machine-name.conf"
export ORIGINAL_DNS_FILE="$ETC_CONFIG_DIR/original-dns.conf"

# State/cache files (in /var/lib/, regenerated) - exported for use by other scripts
# Use default if not set (allows override for testing)
export DNSMASQ_CONF="${DNSMASQ_CONF:-/etc/dnsmasq.d/openpath.conf}"
export DNSMASQ_CONF_HASH="${DNSMASQ_CONF_HASH:-$VAR_STATE_DIR/dnsmasq.hash}"
export BROWSER_POLICIES_HASH="${BROWSER_POLICIES_HASH:-$VAR_STATE_DIR/browser-policies.hash}"
export SYSTEM_DISABLED_FLAG="${SYSTEM_DISABLED_FLAG:-$VAR_STATE_DIR/system-disabled.flag}"
export WHITELIST_FILE="${WHITELIST_FILE:-$VAR_STATE_DIR/whitelist.txt}"

# Legacy compatibility (for migration) - exported for use by other scripts
export CONFIG_DIR="$VAR_STATE_DIR"

# Browser policies - exported for use by other scripts
export FIREFOX_POLICIES="${FIREFOX_POLICIES:-/etc/firefox/policies/policies.json}"
export CHROMIUM_POLICIES_BASE="${CHROMIUM_POLICIES_BASE:-/etc/chromium/policies/managed}"

# Default URL (must be provided via defaults.conf or environment)
# Empty default forces explicit configuration
DEFAULT_WHITELIST_URL="${DEFAULT_WHITELIST_URL:-}"

# Lock file for mutual exclusion between scripts that modify firewall/dnsmasq
export OPENPATH_LOCK_FILE="${OPENPATH_LOCK_FILE:-/var/run/openpath.lock}"

OPENPATH_PROTECTED_DOMAINS=()
OPENPATH_PROTECTED_DOMAINS_READY=0

# Acquire the shared OpenPath lock on file descriptor 200.
# Intended for scripts that hold the lock for their entire runtime.
# Returns 0 on success, 1 on failure.
openpath_lock_acquire() {
    local timeout_sec="${1:-30}"

    exec 200>"$OPENPATH_LOCK_FILE"
    if ! timeout "$timeout_sec" flock -x 200; then
        return 1
    fi
    return 0
}

# Remove the lock file on exit (best-effort).
openpath_lock_cleanup() {
    flock -u 200 2>/dev/null || true
    exec 200>&- 2>/dev/null || true
}

# Run a command under the shared OpenPath lock (short-lived).
# Uses file descriptor 201 to avoid interfering with scripts holding the lock
# on fd 200.
with_openpath_lock() {
    local timeout_sec="${OPENPATH_LOCK_TIMEOUT_SEC:-30}"

    exec 201>"$OPENPATH_LOCK_FILE"
    if ! timeout "$timeout_sec" flock -x 201; then
        exec 201>&- 2>/dev/null || true
        return 1
    fi

    "$@"
    local rc=$?

    flock -u 201 2>/dev/null || true
    exec 201>&- 2>/dev/null || true
    return "$rc"
}

write_passthrough_dnsmasq_config() {
    local upstream_dns="$1"

    mkdir -p "$(dirname "$DNSMASQ_CONF")"
    cat > "$DNSMASQ_CONF" << EOF
# MODO PASSTHROUGH - Sin restricciones
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
server=$upstream_dns
EOF
}

apply_passthrough_system_mode() {
    local upstream_dns="$1"
    local clear_hashes="${2:-false}"
    local close_browsers="${3:-false}"

    deactivate_firewall
    cleanup_browser_policies
    write_passthrough_dnsmasq_config "$upstream_dns"

    if [ "$clear_hashes" = true ]; then
        rm -f "$DNSMASQ_CONF_HASH" 2>/dev/null || true
        rm -f "$BROWSER_POLICIES_HASH" 2>/dev/null || true
    fi

    systemctl restart dnsmasq 2>/dev/null || true
    flush_connections

    if [ "$close_browsers" = true ]; then
        force_browser_close
    fi
}

enter_fail_open_mode() {
    local upstream_dns="$1"
    apply_passthrough_system_mode "$upstream_dns" true false
}

enter_disabled_mode() {
    local upstream_dns="$1"
    apply_passthrough_system_mode "$upstream_dns" false true
}

build_runtime_reconciliation_plan() {
    local dns_config_changed="${1:-false}"
    local dns_healthy="${2:-false}"
    local firewall_was_inactive="${3:-false}"
    local policies_changed="${4:-false}"
    local firewall_action="none"
    local flush_connections_required="false"
    local flush_reason=""
    local activation_context="none"

    if [ "$dns_healthy" = true ]; then
        if [ "$dns_config_changed" = true ]; then
            firewall_action="activate"
            activation_context="apply"
        elif [ "$firewall_was_inactive" = true ]; then
            firewall_action="activate"
            activation_context="reactivate"
        fi
    else
        firewall_action="deactivate"
    fi

    if [ "$policies_changed" = true ]; then
        flush_connections_required="true"
        flush_reason="policy_change"
    elif [ "$firewall_was_inactive" = true ]; then
        flush_connections_required="true"
        flush_reason="system_reactivated"
    fi

    printf 'FIREWALL_ACTION=%s\n' "$firewall_action"
    printf 'FLUSH_CONNECTIONS=%s\n' "$flush_connections_required"
    printf 'FLUSH_REASON=%s\n' "$flush_reason"
    printf 'ACTIVATION_CONTEXT=%s\n' "$activation_context"
}

apply_runtime_reconciliation_plan() {
    local firewall_action="${1:-none}"
    local flush_connections_required="${2:-false}"
    local flush_reason="${3:-}"
    local activation_context="${4:-none}"

    case "$firewall_action" in
        activate)
            if ! activate_firewall; then
                if [ "$activation_context" = "reactivate" ]; then
                    log "⚠ Fallo al reactivar firewall restrictivo - manteniendo modo permisivo"
                else
                    log "⚠ Fallo al activar firewall restrictivo - manteniendo modo permisivo"
                fi
                deactivate_firewall
            fi
            ;;
        deactivate)
            deactivate_firewall
            ;;
    esac

    if [ "$flush_connections_required" = true ]; then
        case "$flush_reason" in
            policy_change)
                log "Cambio en políticas detectado (sin cierre de navegadores)"
                ;;
            system_reactivated)
                log "Sistema reactivado (sin cierre de navegadores)"
                ;;
        esac
        flush_connections
    fi
}

get_registered_machine_name() {
    if [ -n "${OPENPATH_MACHINE_NAME:-}" ]; then
        printf '%s\n' "$OPENPATH_MACHINE_NAME"
        return 0
    fi

    if [ -n "${OPENPATH_MACHINE_ID:-}" ]; then
        printf '%s\n' "$OPENPATH_MACHINE_ID"
        return 0
    fi

    if [ -r "$MACHINE_NAME_CONF" ]; then
        local saved_name
        saved_name=$(tr -d '\r\n' < "$MACHINE_NAME_CONF" 2>/dev/null || true)
        if [ -n "$saved_name" ]; then
            printf '%s\n' "$saved_name"
            return 0
        fi
    fi

    hostname
}

extract_machine_token_from_whitelist_url() {
    local whitelist_url="${1:-}"
    if [ -z "$whitelist_url" ]; then
        return 1
    fi

    local machine_token
    machine_token=$(printf '%s\n' "$whitelist_url" | sed -n 's#.*\/w\/\([^/][^/]*\)\/.*#\1#p')
    if [ -z "$machine_token" ]; then
        return 1
    fi

    printf '%s\n' "$machine_token"
}

get_machine_token_from_whitelist_url_file() {
    if [ ! -r "$WHITELIST_URL_CONF" ]; then
        return 1
    fi

    local whitelist_url
    whitelist_url=$(tr -d '\r\n' < "$WHITELIST_URL_CONF" 2>/dev/null || true)
    if [ -z "$whitelist_url" ]; then
        return 1
    fi

    extract_machine_token_from_whitelist_url "$whitelist_url"
}

normalize_machine_name_value() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//'
}

compute_scoped_machine_name() {
    local raw_hostname="$1"
    local classroom_id="$2"
    local base hash suffix max_base_length

    base=$(normalize_machine_name_value "$raw_hostname")
    [ -z "$base" ] && base="machine"

    hash=$(printf '%s' "$classroom_id" | sha256sum | awk '{print $1}' | cut -c1-8)
    suffix="-$hash"
    max_base_length=$((63 - ${#suffix}))
    [ "$max_base_length" -lt 1 ] && max_base_length=1
    base="${base:0:max_base_length}"
    base="${base%-}"
    [ -z "$base" ] && base="machine"

    printf '%s\n' "${base}${suffix}"
}

persist_machine_name() {
    local machine_name="$1"
    [ -z "$machine_name" ] && return 1
    machine_name=$(normalize_machine_name_value "$machine_name")
    [ -z "$machine_name" ] && return 1

    mkdir -p "$ETC_CONFIG_DIR"
    printf '%s' "$machine_name" > "$MACHINE_NAME_CONF"
    chown root:root "$MACHINE_NAME_CONF" 2>/dev/null || true
    chmod 640 "$MACHINE_NAME_CONF" 2>/dev/null || true
}

# Global variables (initialized at runtime) - exported for use by other scripts
# Preserve test/runtime overrides when this file is sourced more than once.
export PRIMARY_DNS="${PRIMARY_DNS:-}"
export GATEWAY_IP="${GATEWAY_IP:-}"
export DNS_CHANGED="${DNS_CHANGED:-false}"

# Arrays for whitelist parsing
WHITELIST_DOMAINS=()
BLOCKED_SUBDOMAINS=()
BLOCKED_PATHS=()

# Logging function with levels
# Includes PID and caller for structured debugging in fleet deployments
# Usage: log "message" or log_info/log_warn/log_error/log_debug "message"
log() {
    local level="${2:-INFO}"
    local caller="${FUNCNAME[1]:-main}"
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"
    local line="[${ts}] [${level}] [${caller}] [$$] ${1}"

    # Always print to stdout (journald/console) and best-effort append to file.
    # IMPORTANT: logging must never abort installers or services running under `set -e`.
    printf '%s\n' "$line" || true

    if [ -n "${LOG_FILE:-}" ]; then
        mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
        printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
    fi

    return 0
}

log_info() {
    log "$1" "INFO"
    return 0
}

log_warn() {
    log "$1" "WARN"
    return 0
}

log_error() {
    log "$1" "ERROR"
    return 0
}

log_debug() {
    if [ "${DEBUG:-0}" = "1" ]; then
        log "$1" "DEBUG"
    fi
    return 0
}

# Create necessary directories
init_directories() {
    mkdir -p "$ETC_CONFIG_DIR"
    mkdir -p "$VAR_STATE_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$INSTALL_DIR/lib"
}

# Detect primary DNS dynamically
detect_primary_dns() {
    local dns=""
    
    # 1. Try to read saved DNS
    if [ -f "$ORIGINAL_DNS_FILE" ]; then
        local saved_dns
        saved_dns=$(head -1 "$ORIGINAL_DNS_FILE")
        # Validate IP format before using
        if [ -n "$saved_dns" ] && validate_ip "$saved_dns" && timeout 5 dig @"$saved_dns" google.com +short >/dev/null 2>&1; then
            echo "$saved_dns"
            return 0
        fi
    fi

    # 2. NetworkManager
    if command -v nmcli >/dev/null 2>&1; then
        dns=$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS\[1\]" | awk '{print $2}' | head -1)
        if [ -n "$dns" ] && validate_ip "$dns" && timeout 5 dig @"$dns" google.com +short >/dev/null 2>&1; then
            echo "$dns"
            return 0
        fi
    fi

    # 3. systemd-resolved
    if [ -f /run/systemd/resolve/resolv.conf ]; then
        dns=$(grep "^nameserver" /run/systemd/resolve/resolv.conf | head -1 | awk '{print $2}')
        if [ -n "$dns" ] && [ "$dns" != "127.0.0.53" ] && validate_ip "$dns"; then
            if timeout 5 dig @"$dns" google.com +short >/dev/null 2>&1; then
                echo "$dns"
                return 0
            fi
        fi
    fi

    # 4. Gateway as DNS
    local gw
    gw=$(ip route | grep default | awk '{print $3}' | head -1)
    if [ -n "$gw" ] && validate_ip "$gw" && timeout 5 dig @"$gw" google.com +short >/dev/null 2>&1; then
        echo "$gw"
        return 0
    fi

    # 5. Fallback to configurable DNS (default: Google DNS)
    echo "${FALLBACK_DNS_PRIMARY:-8.8.8.8}"
}

# Validate IP address
validate_ip() {
    local ip="$1"
    if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    else
        return 1
    fi
}

# Check internet connectivity
check_internet() {
    if timeout 10 curl -s http://detectportal.firefox.com/success.txt 2>/dev/null | grep -q "success"; then
        return 0
    fi
    if ping -c 1 -W 5 8.8.8.8 >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# =============================================================================
# Captive Portal Detection (shared by update and detector scripts)
# =============================================================================

# URL and expected response for (single) captive portal detection
# Configurable via defaults.conf or environment variables
# NOTE: CAPTIVE_PORTAL_CHECK_URL/CAPTIVE_PORTAL_CHECK_EXPECTED are kept for testability.
CAPTIVE_PORTAL_CHECK_URL="${CAPTIVE_PORTAL_CHECK_URL:-${CAPTIVE_PORTAL_URL:-http://detectportal.firefox.com/success.txt}}"
CAPTIVE_PORTAL_CHECK_EXPECTED="${CAPTIVE_PORTAL_CHECK_EXPECTED:-${CAPTIVE_PORTAL_EXPECTED:-success}}"

# Get captive portal state.
# Returns one of:
# - AUTHENTICATED: endpoint(s) return expected response (no portal)
# - PORTAL: network reachable but response differs (login/redirect/HTML)
# - NO_NETWORK: transport failure (timeout/DNS failure/no route)
get_captive_portal_state() {
    local timeout_sec="${CAPTIVE_PORTAL_TIMEOUT:-3}"
    local checks_raw="${CAPTIVE_PORTAL_CHECKS:-}"

    # Multi-check mode (pipe-separated: url,expected)
    if [ -n "$checks_raw" ]; then
        local total=0
        local success=0
        local transport_fail=0

        local check
        local -a checks
        IFS='|' read -r -a checks <<< "$checks_raw"

        for check in "${checks[@]}"; do
            [ -z "$check" ] && continue
            total=$((total + 1))

            local url expected
            IFS=',' read -r url expected <<< "$check"

            # Best-effort trim for URL only
            url="${url//[[:space:]]/}"

            local response rc
            response=$(timeout "$timeout_sec" curl -s -L "$url" 2>/dev/null)
            rc=$?
            if [ "$rc" -ne 0 ]; then
                transport_fail=$((transport_fail + 1))
                continue
            fi

            response=$(printf '%s' "$response" | tr -d '\n\r')
            if [ "$response" = "$expected" ]; then
                success=$((success + 1))
            fi
        done

        if [ "$total" -eq 0 ]; then
            echo "NO_NETWORK"
            return 0
        fi

        if [ "$transport_fail" -ge "$total" ]; then
            echo "NO_NETWORK"
            return 0
        fi

        local threshold
        threshold=$(( (total / 2) + 1 ))
        if [ "$success" -ge "$threshold" ]; then
            echo "AUTHENTICATED"
            return 0
        fi

        echo "PORTAL"
        return 0
    fi

    # Single-check fallback (legacy behavior)
    local response rc
    response=$(timeout "$timeout_sec" curl -s -L "$CAPTIVE_PORTAL_CHECK_URL" 2>/dev/null)
    rc=$?
    if [ "$rc" -ne 0 ]; then
        echo "NO_NETWORK"
        return 0
    fi

    response=$(printf '%s' "$response" | tr -d '\n\r')
    if [ "$response" = "$CAPTIVE_PORTAL_CHECK_EXPECTED" ]; then
        echo "AUTHENTICATED"
        return 0
    fi

    echo "PORTAL"
    return 0
}

# Check if there's a captive portal (not authenticated).
# Returns 0 if captive portal detected (needs auth) OR no network.
# Returns 1 if no captive portal (authenticated/normal).
check_captive_portal() {
    local state
    state=$(get_captive_portal_state)

    if [ "$state" = "AUTHENTICATED" ]; then
        return 1  # NO captive portal (authenticated)
    fi
    return 0  # Captive portal detected (needs auth) OR no network
}

# Check if authenticated (inverse of check_captive_portal for readability)
# Returns 0 if authenticated
# Returns 1 if captive portal detected OR no network
is_network_authenticated() {
    local state
    state=$(get_captive_portal_state)
    [ "$state" = "AUTHENTICATED" ]
}

get_url_host() {
    local url="$1"
    local without_scheme="${url#*://}"
    local host_port="${without_scheme%%/*}"

    host_port="${host_port##*@}"
    echo "${host_port%%:*}"
}

is_openpath_domain_format() {
    local domain="$1"

    if declare -F validate_domain >/dev/null 2>&1; then
        validate_domain "$domain"
        return $?
    fi

    [ -z "$domain" ] && return 1
    [ ${#domain} -lt 4 ] && return 1
    [ ${#domain} -gt 253 ] && return 1

    local check_domain="$domain"
    if [[ "$domain" == \*.* ]]; then
        check_domain="${domain:2}"
    fi

    [[ "$domain" == "*." ]] && return 1
    [[ "$domain" == "*" ]] && return 1
    [[ "$check_domain" =~ \.local$ ]] && return 1
    [[ "$check_domain" =~ \.\. ]] && return 1
    [[ "$check_domain" != *.* ]] && return 1

    IFS='.' read -ra labels <<< "$check_domain"
    [ ${#labels[@]} -lt 2 ] && return 1

    local label index last_index
    last_index=$((${#labels[@]} - 1))
    for index in "${!labels[@]}"; do
        label="${labels[$index]}"
        [ -z "$label" ] && return 1
        [ ${#label} -gt 63 ] && return 1
        [[ "$label" == -* ]] && return 1
        [[ "$label" == *- ]] && return 1

        if [ "$index" -eq "$last_index" ]; then
            [ ${#label} -lt 2 ] && return 1
            [[ ! "$label" =~ ^[a-zA-Z]+$ ]] && return 1
        else
            [[ ! "$label" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$ ]] && return 1
        fi
    done

    return 0
}

append_unique_openpath_domain() {
    local domain="$1"

    [ -z "$domain" ] && return 0

    local normalized
    normalized=$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]' | tr -d '\r\n' | sed 's/[[:space:]]//g; s/^\.*//; s/\.*$//')
    if ! is_openpath_domain_format "$normalized"; then
        return 0
    fi

    local existing
    for existing in "${OPENPATH_PROTECTED_DOMAINS[@]}"; do
        if [ "$existing" = "$normalized" ]; then
            return 0
        fi
    done

    OPENPATH_PROTECTED_DOMAINS+=("$normalized")
}

refresh_openpath_protected_domains() {
    OPENPATH_PROTECTED_DOMAINS=()
    OPENPATH_PROTECTED_DOMAINS_READY=0

    local domain
    for domain in \
        raw.githubusercontent.com \
        github.com \
        githubusercontent.com \
        api.github.com \
        release-assets.githubusercontent.com \
        objects.githubusercontent.com \
        sourceforge.net \
        downloads.sourceforge.net; do
        append_unique_openpath_domain "$domain"
    done

    local whitelist_url=""
    if [ -f "$WHITELIST_URL_CONF" ]; then
        whitelist_url=$(tr -d '\r\n' < "$WHITELIST_URL_CONF" 2>/dev/null || true)
    elif [ -n "${WHITELIST_URL:-}" ]; then
        whitelist_url="$WHITELIST_URL"
    elif [ -n "${DEFAULT_WHITELIST_URL:-}" ]; then
        whitelist_url="$DEFAULT_WHITELIST_URL"
    fi
    append_unique_openpath_domain "$(get_url_host "$whitelist_url")"

    local health_api_url=""
    if [ -f "$HEALTH_API_URL_CONF" ]; then
        health_api_url=$(tr -d '\r\n' < "$HEALTH_API_URL_CONF" 2>/dev/null || true)
    fi
    append_unique_openpath_domain "$(get_url_host "$health_api_url")"

    OPENPATH_PROTECTED_DOMAINS_READY=1
}

ensure_openpath_protected_domains() {
    if [ "${OPENPATH_PROTECTED_DOMAINS_READY:-0}" -ne 1 ]; then
        refresh_openpath_protected_domains
    fi
}

get_openpath_protected_domains() {
    refresh_openpath_protected_domains

    printf '%s\n' "${OPENPATH_PROTECTED_DOMAINS[@]}"
}

is_openpath_protected_domain() {
    local candidate="$1"
    [ -z "$candidate" ] && return 1

    local normalized
    normalized=$(printf '%s' "$candidate" | tr '[:upper:]' '[:lower:]' | tr -d '\r\n' | sed 's/[[:space:]]//g; s/^\.*//; s/\.*$//')

    ensure_openpath_protected_domains

    local protected
    for protected in "${OPENPATH_PROTECTED_DOMAINS[@]}"; do
        [ -z "$protected" ] && continue
        if [ "$protected" = "$normalized" ]; then
            return 0
        fi
    done

    return 1
}

get_blocked_path_host() {
    local rule="$1"
    [ -z "$rule" ] && return 1

    local candidate="$rule"
    candidate="${candidate#*://}"

    while [[ "$candidate" == \** ]]; do
        candidate="${candidate#\*}"
    done
    while [[ "$candidate" == .* ]]; do
        candidate="${candidate#.}"
    done

    [ -z "$candidate" ] && return 1
    [[ "$candidate" == /* ]] && return 1

    local host="${candidate%%/*}"
    host="${host%%\?*}"
    host="${host%%\#*}"
    host="${host%%:*}"
    host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]' | tr -d '\r\n' | sed 's/[[:space:]]//g; s/^\.*//; s/\.*$//')

    if is_openpath_domain_format "$host"; then
        printf '%s\n' "$host"
        return 0
    fi

    return 1
}

protect_control_plane_rules() {
    refresh_openpath_protected_domains

    local -A protected_domain_lookup=()
    local -A whitelist_lookup=()

    local protected_domain
    for protected_domain in "${OPENPATH_PROTECTED_DOMAINS[@]}"; do
        [ -z "$protected_domain" ] && continue
        protected_domain_lookup["$protected_domain"]=1
    done

    local domain
    for domain in "${WHITELIST_DOMAINS[@]}"; do
        [ -n "$domain" ] && whitelist_lookup["$domain"]=1
    done

    for protected_domain in "${OPENPATH_PROTECTED_DOMAINS[@]}"; do
        [ -z "$protected_domain" ] && continue
        if [ -z "${whitelist_lookup[$protected_domain]+x}" ]; then
            WHITELIST_DOMAINS+=("$protected_domain")
            whitelist_lookup["$protected_domain"]=1
        fi
    done

    local filtered_subdomains=()
    local removed_subdomains=0
    local blocked_subdomain
    for blocked_subdomain in "${BLOCKED_SUBDOMAINS[@]}"; do
        if [ -n "${protected_domain_lookup[$blocked_subdomain]+x}" ]; then
            removed_subdomains=$((removed_subdomains + 1))
            continue
        fi
        filtered_subdomains+=("$blocked_subdomain")
    done
    BLOCKED_SUBDOMAINS=("${filtered_subdomains[@]}")

    local filtered_paths=()
    local removed_paths=0
    local blocked_path
    for blocked_path in "${BLOCKED_PATHS[@]}"; do
        local blocked_path_host=""
        blocked_path_host=$(get_blocked_path_host "$blocked_path" 2>/dev/null || true)
        if [ -n "$blocked_path_host" ] && [ -n "${protected_domain_lookup[$blocked_path_host]+x}" ]; then
            removed_paths=$((removed_paths + 1))
            continue
        fi
        filtered_paths+=("$blocked_path")
    done
    BLOCKED_PATHS=("${filtered_paths[@]}")

    if [ "$removed_subdomains" -gt 0 ] || [ "$removed_paths" -gt 0 ]; then
        log_warn "Removed ${removed_subdomains} blocked subdomains and ${removed_paths} blocked paths targeting protected control-plane domains"
    fi
}

# Parse whitelist file sections
parse_whitelist_sections() {
    local file="$1"
    
    WHITELIST_DOMAINS=()
    BLOCKED_SUBDOMAINS=()
    BLOCKED_PATHS=()
    
    if [ ! -f "$file" ]; then
        log "Whitelist file not found: $file"
        return 1
    fi
    
    local entry_type=""
    local entry_value=""
    while IFS=$'\t' read -r entry_type entry_value; do
        case "$entry_type" in
            "whitelist")
                WHITELIST_DOMAINS+=("$entry_value")
                ;;
            "blocked_sub")
                BLOCKED_SUBDOMAINS+=("$entry_value")
                ;;
            "blocked_path")
                BLOCKED_PATHS+=("$entry_value")
                ;;
        esac
    done < <(
        awk '
            BEGIN { section = "whitelist" }
            /^[[:space:]]*##[[:space:]]*WHITELIST[[:space:]]*$/ { section = "whitelist"; next }
            /^[[:space:]]*##[[:space:]]*BLOCKED-SUBDOMAINS[[:space:]]*$/ { section = "blocked_sub"; next }
            /^[[:space:]]*##[[:space:]]*BLOCKED-PATHS[[:space:]]*$/ { section = "blocked_path"; next }
            /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
            {
                line = $0
                sub(/\r$/, "", line)
                print section "\t" line
            }
        ' "$file"
    )
    
    protect_control_plane_rules

    log "Parsed: ${#WHITELIST_DOMAINS[@]} domains, ${#BLOCKED_SUBDOMAINS[@]} blocked subdomains, ${#BLOCKED_PATHS[@]} blocked paths"
}

# Check if script is running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "ERROR: This script must be run as root"
        exit 1
    fi
}

build_machine_registration_payload() {
    local reported_hostname="$1"
    local classroom_name="$2"
    local classroom_id="$3"
    local version="$4"

    HN="$reported_hostname" CNAME="$classroom_name" CID="$classroom_id" VER="$version" python3 -c '
import json, os

payload = {
    "hostname": os.environ.get("HN", ""),
    "version": os.environ.get("VER", "unknown"),
}

classroom_id = os.environ.get("CID", "")
classroom_name = os.environ.get("CNAME", "")
if classroom_id:
    payload["classroomId"] = classroom_id
elif classroom_name:
    payload["classroomName"] = classroom_name

print(json.dumps(payload))
'
}

parse_machine_registration_response() {
    local response="$1"
    local parsed_response
    local parsed_lines=()

    parsed_response=$(printf '%s' "$response" | python3 -c '
import json, sys

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)

if data.get("success") is not True:
    sys.exit(1)

whitelist_url = data.get("whitelistUrl")
if not isinstance(whitelist_url, str) or not whitelist_url:
    sys.exit(1)

def as_text(value):
    return value if isinstance(value, str) else ""

print(whitelist_url)
print(as_text(data.get("classroomName")))
print(as_text(data.get("classroomId")))
print(as_text(data.get("machineHostname")))
') || {
        # shellcheck disable=SC2034  # Global outputs consumed by callers after register_machine
        TOKENIZED_URL=""
        # shellcheck disable=SC2034  # Global outputs consumed by callers after register_machine
        REGISTERED_CLASSROOM_NAME=""
        # shellcheck disable=SC2034  # Global outputs consumed by callers after register_machine
        REGISTERED_CLASSROOM_ID=""
        # shellcheck disable=SC2034  # Global outputs consumed by callers after register_machine
        REGISTERED_MACHINE_NAME=""
        return 1
    }

    mapfile -t parsed_lines <<< "$parsed_response"
    # shellcheck disable=SC2034  # Global outputs consumed by callers after register_machine
    TOKENIZED_URL="${parsed_lines[0]:-}"
    # shellcheck disable=SC2034  # Global outputs consumed by callers after register_machine
    REGISTERED_CLASSROOM_NAME="${parsed_lines[1]:-}"
    # shellcheck disable=SC2034  # Global outputs consumed by callers after register_machine
    REGISTERED_CLASSROOM_ID="${parsed_lines[2]:-}"
    # shellcheck disable=SC2034  # Global outputs consumed by callers after register_machine
    REGISTERED_MACHINE_NAME="${parsed_lines[3]:-}"

    [ -n "$TOKENIZED_URL" ]
}

# Register machine with central API
# Args: $1=reported_hostname $2=classroom_name $3=classroom_id $4=version $5=api_url $6=auth_token
# Sets global: REGISTER_RESPONSE (raw JSON), TOKENIZED_URL (extracted URL or empty),
#              REGISTERED_CLASSROOM_NAME, REGISTERED_CLASSROOM_ID,
#              REGISTERED_MACHINE_NAME (server-issued machine identifier or empty)
# Returns: 0 on success, 1 on failure
register_machine() {
    local reported_hostname="$1"
    local classroom_name="$2"
    local classroom_id="$3"
    local version="$4"
    local api_url="$5"
    local auth_token="$6"

    local payload
    payload=$(build_machine_registration_payload "$reported_hostname" "$classroom_name" "$classroom_id" "$version")

    REGISTER_RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $auth_token" \
        -d "$payload" \
        "$api_url/api/machines/register" 2>/dev/null || echo '{"success":false}')

    parse_machine_registration_response "$REGISTER_RESPONSE"
}

# Send health report to central API (tRPC)
# Args:
#   $1 = status (HEALTHY, DEGRADED, CRITICAL, FAIL_OPEN, STALE_FAILSAFE, TAMPERED)
#   $2 = actions (short reason codes)
#   $3 = dnsmasq_running ("true"|"false")
#   $4 = dns_resolving ("true"|"false")
#   $5 = fail_count (integer)
#   $6 = version (optional)
# Returns: 0 always (fire-and-forget, non-blocking)
send_health_report_to_api() {
    local status="$1"
    local actions="$2"
    local dnsmasq_running="${3:-false}"
    local dns_resolving="${4:-false}"
    local fail_count="${5:-0}"
    local version="${6:-${VERSION:-unknown}}"

    if [ ! -f "$HEALTH_API_URL_CONF" ]; then
        log_debug "[HEALTH] No health API configured (create $HEALTH_API_URL_CONF)"
        return 0
    fi

    local api_url
    api_url=$(cat "$HEALTH_API_URL_CONF" 2>/dev/null)
    if [ -z "$api_url" ]; then
        log_warn "[HEALTH] Health API URL file is empty: $HEALTH_API_URL_CONF"
        return 0
    fi

    local auth_token=""
    auth_token=$(get_machine_token_from_whitelist_url_file 2>/dev/null || true)
    if [ -z "$auth_token" ] && [ -f "$HEALTH_API_SECRET_CONF" ]; then
        auth_token=$(cat "$HEALTH_API_SECRET_CONF" 2>/dev/null)
    fi

    local hostname
    hostname=$(get_registered_machine_name)

    local payload
    payload=$(HN="$hostname" ST="$status" DR="$dnsmasq_running" DRE="$dns_resolving" \
        FC="$fail_count" AC="$actions" VER="$version" python3 -c '
import json, os
print(json.dumps({"json": {
    "hostname": os.environ["HN"],
    "status": os.environ["ST"],
    "dnsmasqRunning": os.environ["DR"] == "true",
    "dnsResolving": os.environ["DRE"] == "true",
    "failCount": int(os.environ["FC"]),
    "actions": os.environ["AC"],
    "version": os.environ["VER"]
}}))')

    if [ -n "$auth_token" ]; then
        timeout 5 curl -s -X POST "$api_url/trpc/healthReports.submit" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $auth_token" \
            -d "$payload" >/dev/null 2>&1 &
    else
        timeout 5 curl -s -X POST "$api_url/trpc/healthReports.submit" \
            -H "Content-Type: application/json" \
            -d "$payload" >/dev/null 2>&1 &
    fi

    return 0
}

# Critical files for integrity checks (single source of truth)
# Used by install.sh, dnsmasq-watchdog.sh, and openpath-self-update.sh
# shellcheck disable=SC2034  # Used by scripts that source common.sh
CRITICAL_FILES=(
    "$INSTALL_DIR/lib/common.sh"
    "$INSTALL_DIR/lib/dns.sh"
    "$INSTALL_DIR/lib/firewall.sh"
    "$INSTALL_DIR/lib/captive-portal.sh"
    "$INSTALL_DIR/lib/browser.sh"
    "$INSTALL_DIR/lib/chromium-managed-extension.sh"
    "$INSTALL_DIR/lib/firefox-policy.sh"
    "$INSTALL_DIR/lib/firefox-managed-extension.sh"
    "$INSTALL_DIR/libexec/browser-json.py"
    "$INSTALL_DIR/libexec/browser-policy-spec.json"
    "$INSTALL_DIR/lib/services.sh"
    "$INSTALL_DIR/lib/rollback.sh"
    "$SCRIPTS_DIR/openpath-update.sh"
    "$SCRIPTS_DIR/dnsmasq-watchdog.sh"
    "$SCRIPTS_DIR/openpath"
)

# Load all libraries
load_libraries() {
    local lib_dir="${1:-$INSTALL_DIR/lib}"
    local libexec_dir
    local lib
    local helper_lib

    libexec_dir="$(cd "$lib_dir/.." && pwd)/libexec"

    for helper_lib in chromium-managed-extension.sh firefox-policy.sh firefox-managed-extension.sh; do
        if [ ! -f "$lib_dir/$helper_lib" ]; then
            log_error "Required library not found: $lib_dir/$helper_lib"
            return 1
        fi
    done

    for helper_runtime in browser-json.py browser-policy-spec.json; do
        if [ ! -f "$libexec_dir/$helper_runtime" ]; then
            log_error "Required helper not found: $libexec_dir/$helper_runtime"
            return 1
        fi
    done

    for lib in dns.sh firewall.sh browser.sh services.sh rollback.sh; do
        if [ ! -f "$lib_dir/$lib" ]; then
            log_error "Required library not found: $lib_dir/$lib"
            return 1
        fi

        # shellcheck disable=SC1090  # Dynamic source path is intentional
        source "$lib_dir/$lib"
    done

    return 0
}
