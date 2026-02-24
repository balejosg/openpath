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
export ORIGINAL_DNS_FILE="$ETC_CONFIG_DIR/original-dns.conf"

# State/cache files (in /var/lib/, regenerated) - exported for use by other scripts
# Use default if not set (allows override for testing)
export DNSMASQ_CONF="${DNSMASQ_CONF:-/etc/dnsmasq.d/openpath.conf}"
export DNSMASQ_CONF_HASH="$VAR_STATE_DIR/dnsmasq.hash"
export BROWSER_POLICIES_HASH="$VAR_STATE_DIR/browser-policies.hash"
export SYSTEM_DISABLED_FLAG="$VAR_STATE_DIR/system-disabled.flag"
export WHITELIST_FILE="$VAR_STATE_DIR/whitelist.txt"

# Legacy compatibility (for migration) - exported for use by other scripts
export CONFIG_DIR="$VAR_STATE_DIR"

# Browser policies - exported for use by other scripts
export FIREFOX_POLICIES="/etc/firefox/policies/policies.json"
export CHROMIUM_POLICIES_BASE="/etc/chromium/policies/managed"

# Default URL (must be provided via defaults.conf or environment)
# Empty default forces explicit configuration
DEFAULT_WHITELIST_URL="${DEFAULT_WHITELIST_URL:-}"

# Lock file for mutual exclusion between scripts that modify firewall/dnsmasq
export OPENPATH_LOCK_FILE="${OPENPATH_LOCK_FILE:-/var/run/openpath.lock}"

# Global variables (initialized at runtime) - exported for use by other scripts
export PRIMARY_DNS=""
export GATEWAY_IP=""
export DNS_CHANGED=false

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
    printf '[%s] [%s] [%s] [%d] %s\n' \
        "$(date '+%Y-%m-%d %H:%M:%S')" "$level" "$caller" "$$" "$1" \
        | tee -a "$LOG_FILE"
}

log_info() {
    log "$1" "INFO"
}

log_warn() {
    log "$1" "WARN"
}

log_error() {
    log "$1" "ERROR"
}

log_debug() {
    # Only if DEBUG is enabled
    [ "${DEBUG:-0}" = "1" ] && log "$1" "DEBUG"
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
    
    local section=""
    
    while IFS= read -r line || [ -n "$line" ]; do
        # Detect sections
        if [[ "$line" == "## WHITELIST" ]]; then
            section="whitelist"
            continue
        elif [[ "$line" == "## BLOCKED-SUBDOMAINS" ]]; then
            section="blocked_sub"
            continue
        elif [[ "$line" == "## BLOCKED-PATHS" ]]; then
            section="blocked_path"
            continue
        fi
        
        # Ignore comments and empty lines
        [[ "$line" =~ ^#.*$ ]] && continue
        [[ -z "$line" ]] && continue
        
        # Assume whitelist if no section
        [ -z "$section" ] && section="whitelist"
        
        case "$section" in
            "whitelist")
                WHITELIST_DOMAINS+=("$line")
                ;;
            "blocked_sub")
                BLOCKED_SUBDOMAINS+=("$line")
                ;;
            "blocked_path")
                BLOCKED_PATHS+=("$line")
                ;;
        esac
    done < "$file"
    
    log "Parsed: ${#WHITELIST_DOMAINS[@]} domains, ${#BLOCKED_SUBDOMAINS[@]} blocked subdomains, ${#BLOCKED_PATHS[@]} blocked paths"
}

# Check if script is running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "ERROR: This script must be run as root"
        exit 1
    fi
}

# Register machine with central API
# Args: $1=hostname $2=classroom_name $3=version $4=api_url $5=auth_token
# Sets global: REGISTER_RESPONSE (raw JSON), TOKENIZED_URL (extracted URL or empty)
# Returns: 0 on success, 1 on failure
register_machine() {
    local hostname="$1"
    local classroom_name="$2"
    local version="$3"
    local api_url="$4"
    local auth_token="$5"

    local payload
    payload=$(HN="$hostname" CNAME="$classroom_name" VER="$version" python3 -c '
import json, os
print(json.dumps({
    "hostname": os.environ.get("HN", ""),
    "classroomName": os.environ.get("CNAME", ""),
    "version": os.environ.get("VER", "unknown")
}))')

    REGISTER_RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $auth_token" \
        -d "$payload" \
        "$api_url/api/machines/register" 2>/dev/null || echo '{"success":false}')

    if echo "$REGISTER_RESPONSE" | grep -q '"success":true'; then
        TOKENIZED_URL=$(echo "$REGISTER_RESPONSE" | grep -o '"whitelistUrl":"[^"]*"' | sed 's/"whitelistUrl":"//;s/"$//')
        return 0
    else
        # shellcheck disable=SC2034  # Used by callers of register_machine
        TOKENIZED_URL=""
        return 1
    fi
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

    local shared_secret=""
    [ -f "$HEALTH_API_SECRET_CONF" ] && shared_secret=$(cat "$HEALTH_API_SECRET_CONF" 2>/dev/null)

    local hostname
    hostname=$(hostname)

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

    return 0
}

# Critical files for integrity checks (single source of truth)
# Used by install.sh, dnsmasq-watchdog.sh, and openpath-self-update.sh
# shellcheck disable=SC2034  # Used by scripts that source common.sh
CRITICAL_FILES=(
    "$INSTALL_DIR/lib/common.sh"
    "$INSTALL_DIR/lib/dns.sh"
    "$INSTALL_DIR/lib/firewall.sh"
    "$INSTALL_DIR/lib/browser.sh"
    "$INSTALL_DIR/lib/services.sh"
    "$INSTALL_DIR/lib/rollback.sh"
    "$SCRIPTS_DIR/openpath-update.sh"
    "$SCRIPTS_DIR/dnsmasq-watchdog.sh"
    "$SCRIPTS_DIR/openpath"
)

# Load all libraries
load_libraries() {
    local lib_dir="${1:-$INSTALL_DIR/lib}"
    local lib

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
