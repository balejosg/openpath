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
# browser.sh - Browser policy management functions
# Part of the OpenPath DNS system
################################################################################

_browser_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=firefox-extension-assets.sh
source "$_browser_lib_dir/firefox-extension-assets.sh"
# shellcheck source=firefox-policy.sh
source "$_browser_lib_dir/firefox-policy.sh"
# shellcheck source=firefox-managed-extension.sh
source "$_browser_lib_dir/firefox-managed-extension.sh"
# shellcheck source=chromium-managed-extension.sh
source "$_browser_lib_dir/chromium-managed-extension.sh"
unset _browser_lib_dir

OPENPATH_FIREFOX_NATIVE_HOST_NAME="${OPENPATH_FIREFOX_NATIVE_HOST_NAME:-whitelist_native_host}"
OPENPATH_FIREFOX_NATIVE_HOST_FILENAME="${OPENPATH_FIREFOX_NATIVE_HOST_FILENAME:-${OPENPATH_FIREFOX_NATIVE_HOST_NAME}.json}"
OPENPATH_CHROMIUM_NATIVE_HOST_FILENAME="${OPENPATH_CHROMIUM_NATIVE_HOST_FILENAME:-openpath_native_host.json}"
OPENPATH_NATIVE_HOST_SCRIPT_NAME="${OPENPATH_NATIVE_HOST_SCRIPT_NAME:-openpath-native-host.py}"

get_firefox_native_host_dir() {
    printf '%s\n' "${FIREFOX_NATIVE_HOST_DIR:-/usr/lib/mozilla/native-messaging-hosts}"
}

get_native_host_install_dir() {
    printf '%s\n' "${OPENPATH_NATIVE_HOST_INSTALL_DIR:-/usr/local/lib/openpath}"
}

# Close browsers to apply policies
force_browser_close() {
    log "Closing browsers..."
    
    local closed=0
    
    # Method 1: pkill by process name (works for native and Snap)
    # -f searches the entire command line
    for pattern in "firefox" "chromium" "chrome"; do
        if pgrep -f "$pattern" >/dev/null 2>&1; then
            log "Detectado proceso: $pattern - enviando SIGTERM..."
            pkill -TERM -f "$pattern" 2>/dev/null || true
            closed=$((closed + 1))
        fi
    done
    
    # Wait for graceful shutdown (max 5 seconds)
    if [ $closed -gt 0 ]; then
        log "Waiting for $closed browser(s) to close..."
        local wait_retries=5
        while [ $wait_retries -gt 0 ]; do
            local still_running=0
            for pattern in "firefox" "chromium" "chrome"; do
                if pgrep -f "$pattern" >/dev/null 2>&1; then
                    still_running=1
                    break
                fi
            done
            [ $still_running -eq 0 ] && break
            sleep 1
            wait_retries=$((wait_retries - 1))
        done
        
        # SIGKILL for those that didn't respond
        for pattern in "firefox" "chromium" "chrome"; do
            if pgrep -f "$pattern" >/dev/null 2>&1; then
                log "Forcing close (SIGKILL): $pattern"
                pkill -9 -f "$pattern" 2>/dev/null || true
            fi
        done
        
        log "✓ Browsers closed"
    else
        log "No open browsers detected"
    fi
}
# ============================================================================
# FIREFOX ESR INSTALLATION
# ============================================================================

browser_dpkg_is_installed() {
    local pkg="$1"
    dpkg-query -W -f='${Status}\n' "$pkg" 2>/dev/null | grep -q '^install ok installed$'
}

browser_apt_candidate_version() {
    local pkg="$1"
    apt-cache policy "$pkg" 2>/dev/null | awk '/Candidate:/ {print $2; exit}'
}

browser_apt_has_candidate() {
    local pkg="$1"
    local candidate
    candidate="$(browser_apt_candidate_version "$pkg")"
    [ -n "$candidate" ] && [ "$candidate" != "(none)" ]
}

# Install Firefox ESR, removing Snap Firefox if present
install_firefox_esr() {
    log "Verificando instalación de Firefox..."
    
    # Check if Snap Firefox is installed
    if command -v snap &>/dev/null 2>&1 && snap list firefox &>/dev/null 2>&1; then
        log "⚠ Firefox Snap detected - removing..."
        
        # Close any running Firefox first
        pkill -TERM -f firefox 2>/dev/null || true
        # Wait for close
        for _ in $(seq 1 5); do
            pgrep -f firefox >/dev/null 2>&1 || break
            sleep 1
        done
        pkill -9 -f firefox 2>/dev/null || true
        
        # Remove Snap Firefox
        snap remove --purge firefox 2>/dev/null || snap remove firefox 2>/dev/null || true
        
        log "✓ Firefox Snap removed"
    fi
    
    # Check if Firefox ESR is already installed via APT
    if browser_dpkg_is_installed firefox-esr; then
        log "✓ Firefox ESR already installed"
        return 0
    fi
    
    # Check if regular Firefox (non-snap) is installed
    if browser_dpkg_is_installed firefox; then
        if command -v snap &>/dev/null 2>&1 && snap list firefox &>/dev/null 2>&1; then
            :
        else
            log "✓ Firefox (APT) already installed"
            return 0
        fi
    fi
    
    log "Installing Firefox..."

    local os_id=""
    if [ -r /etc/os-release ]; then
        os_id=$(awk -F= '$1=="ID" {gsub(/\"/, "", $2); print $2; exit}' /etc/os-release 2>/dev/null || true)
    fi
    
    # Add Mozilla team PPA for Ubuntu (avoids Snap)
    if [ "$os_id" = "ubuntu" ]; then
        if ! command -v add-apt-repository &>/dev/null 2>&1; then
            DEBIAN_FRONTEND=noninteractive apt-get install -y software-properties-common >/dev/null 2>&1 || true
        fi

        if command -v add-apt-repository &>/dev/null 2>&1; then
            add-apt-repository -y ppa:mozillateam/ppa 2>/dev/null || true

            # Prefer PPA packages and disable the snap wrapper package
            cat > /etc/apt/preferences.d/mozilla-firefox << 'EOF'
Package: *
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 1001

Package: firefox
Pin: version 1:1snap*
Pin-Priority: -1
EOF
        else
            log "⚠ add-apt-repository not available; skipping PPA setup"
        fi
    fi
    
    apt-get update -qq
    
    # Try firefox-esr first (Debian/PPAs), then firefox.
    if browser_apt_has_candidate firefox-esr; then
        if DEBIAN_FRONTEND=noninteractive apt-get install -y firefox-esr; then
            log "✓ Firefox ESR installed"
            return 0
        fi
        log "⚠ Failed to install firefox-esr (will try firefox)"
    fi

    if browser_apt_has_candidate firefox; then
        local firefox_candidate
        firefox_candidate="$(browser_apt_candidate_version firefox)"
        if [ "$os_id" = "ubuntu" ] && printf '%s' "$firefox_candidate" | grep -qi 'snap'; then
            log "⚠ Firefox candidate appears to be snap wrapper ($firefox_candidate); skipping"
            return 1
        fi

        if DEBIAN_FRONTEND=noninteractive apt-get install -y firefox; then
            log "✓ Firefox installed"
            return 0
        fi
        log "⚠ Failed to install firefox"
    fi

    log "⚠ No installable Firefox packages found; skipping"
    return 1
}

# Detect Firefox installation directory
detect_firefox_dir() {
    local dirs=(
        "/usr/lib/firefox-esr"
        "/usr/lib/firefox"
        "/opt/firefox"
    )
    
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ] && { [ -f "$dir/firefox" ] || [ -f "$dir/firefox-bin" ]; }; then
            echo "$dir"
            return 0
        fi
    done
    
    # Fallback: find firefox binary and get its directory
    local firefox_bin
    firefox_bin=$(which firefox-esr 2>/dev/null || which firefox 2>/dev/null)
    if [ -n "$firefox_bin" ]; then
        local real_path
        real_path=$(readlink -f "$firefox_bin")
        dirname "$real_path"
        return 0
    fi
    
    return 1
}

# Generate Firefox autoconfig to disable signature requirements
generate_firefox_autoconfig() {
    local firefox_dir
    firefox_dir=$(detect_firefox_dir)
    
    if [ -z "$firefox_dir" ]; then
        log "⚠ Firefox not detected, skipping autoconfig"
        return 1
    fi
    
    log "Generating autoconfig in $firefox_dir..."
    
    # Create autoconfig.js in defaults/pref
    mkdir -p "$firefox_dir/defaults/pref"
    cat > "$firefox_dir/defaults/pref/autoconfig.js" << 'EOF'
// Autoconfig para OpenPath System
pref("general.config.filename", "mozilla.cfg");
pref("general.config.obscure_value", 0);
EOF
    
    # Create mozilla.cfg (must start with comment line - it's a JS file)
    cat > "$firefox_dir/mozilla.cfg" << 'EOF'
// OpenPath System Configuration
// Disable signature requirement for local extensions
lockPref("xpinstall.signatures.required", false);
lockPref("extensions.langpacks.signatures.required", false);
// Prevent extension blocklist from blocking our extension
lockPref("extensions.blocklist.enabled", false);
EOF
    
    log "✓ Firefox autoconfig generated"
    return 0
}

install_browser_integrations() {
    local ext_source="${1:-$INSTALL_DIR/firefox-extension}"
    local release_source="${2:-$INSTALL_DIR/firefox-release}"
    local install_native_host_enabled=false
    local firefox_best_effort=false
    local chromium_best_effort=true
    local native_host_best_effort=false
    local chromium_ext_id=""

    shift 2 || true

    while [ $# -gt 0 ]; do
        case "$1" in
            --native-host)
                install_native_host_enabled=true
                ;;
            --skip-native-host)
                install_native_host_enabled=false
                ;;
            --firefox-best-effort)
                firefox_best_effort=true
                ;;
            --firefox-required)
                firefox_best_effort=false
                ;;
            --chromium-best-effort)
                chromium_best_effort=true
                ;;
            --chromium-required)
                chromium_best_effort=false
                ;;
            --native-host-best-effort)
                native_host_best_effort=true
                ;;
            --native-host-required)
                native_host_best_effort=false
                ;;
            *)
                log "⚠ Opción de integración de navegador desconocida: $1"
                return 1
                ;;
        esac
        shift
    done

    if ! install_firefox_extension "$ext_source" "$release_source"; then
        if [ "$firefox_best_effort" = true ]; then
            echo "⚠ Extensión Firefox no instalada (se puede reintentar más tarde)"
        else
            return 1
        fi
    fi

    if install_chromium_extension "$ext_source"; then
        chromium_ext_id="$(cat "$(get_chromium_extension_id_file)" 2>/dev/null || true)"
    else
        if [ "$chromium_best_effort" = true ]; then
            echo "⚠ Extensión Chrome/Edge no instalada (se puede reintentar más tarde)"
        else
            return 1
        fi
    fi

    if [ "$install_native_host_enabled" = true ]; then
        if ! install_native_host "$ext_source/native" "$chromium_ext_id"; then
            if [ "$native_host_best_effort" = true ]; then
                echo "⚠ Native host no instalado (se puede reintentar más tarde)"
            else
                return 1
            fi
        fi
    fi

    return 0
}

render_firefox_native_host_manifest() {
    local manifest_template="$1"
    local firefox_manifest_path="$2"
    local native_host_path="$3"

    if [ ! -f "$manifest_template" ]; then
        log "⚠ Native host manifest template not found: $manifest_template"
        return 1
    fi

    sed "s|/usr/local/bin/openpath-native-host.py|$native_host_path|g" \
        "$manifest_template" > "$firefox_manifest_path"
}

write_chromium_native_host_manifest() {
    local manifest_path="$1"
    local native_host_path="$2"
    local chromium_origin="$3"

    cat > "$manifest_path" << EOF
{
    "name": "$OPENPATH_FIREFOX_NATIVE_HOST_NAME",
    "description": "OpenPath System Native Messaging Host",
    "path": "$native_host_path",
    "type": "stdio",
    "allowed_origins": ["$chromium_origin"]
}
EOF
}

# Install native messaging host for the extension
install_native_host() {
    local native_source="${1:-$INSTALL_DIR/firefox-extension/native}"
    local chromium_ext_id="${2:-}"
    local native_manifest_dir
    native_manifest_dir="$(get_firefox_native_host_dir)"
    local native_script_dir
    native_script_dir="$(get_native_host_install_dir)"
    local native_host_path="$native_script_dir/$OPENPATH_NATIVE_HOST_SCRIPT_NAME"
    local firefox_manifest_template="$native_source/$OPENPATH_FIREFOX_NATIVE_HOST_FILENAME"
    local firefox_manifest_path="$native_manifest_dir/$OPENPATH_FIREFOX_NATIVE_HOST_FILENAME"
    
    if [ ! -d "$native_source" ]; then
        log "⚠ Native host directory not found: $native_source"
        return 1
    fi
    
    log "Installing native messaging host..."
    
    # Create directories
    mkdir -p "$native_manifest_dir"
    mkdir -p "$native_script_dir"
    
    # Copy Python script
    cp "$native_source/$OPENPATH_NATIVE_HOST_SCRIPT_NAME" "$native_host_path"
    chmod +x "$native_host_path"

    if ! render_firefox_native_host_manifest \
        "$firefox_manifest_template" \
        "$firefox_manifest_path" \
        "$native_host_path"; then
        return 1
    fi

    if [ -n "$chromium_ext_id" ]; then
        local chromium_origin="chrome-extension://$chromium_ext_id/"
        local chromium_manifest_dirs=(
            "$(get_chromium_native_host_dir)"
            "$(get_chrome_native_host_dir)"
            "$(get_edge_native_host_dir)"
        )

        for manifest_dir in "${chromium_manifest_dirs[@]}"; do
            mkdir -p "$manifest_dir"
            write_chromium_native_host_manifest \
                "$manifest_dir/$OPENPATH_CHROMIUM_NATIVE_HOST_FILENAME" \
                "$native_host_path" \
                "$chromium_origin"
        done
    fi
    
    log "✓ Native messaging host installed"
    return 0
}

# Remove Firefox extension (for uninstall)
remove_firefox_extension() {
    local ext_id="$FIREFOX_MANAGED_EXTENSION_ID"
    local firefox_app_id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
    local ext_dir="/usr/share/mozilla/extensions/$firefox_app_id/$ext_id"
    
    log "Removing Firefox extension..."
    
    # Remove extension directory
    rm -rf "$ext_dir" 2>/dev/null || true
    
    # Remove from policies.json
    if [ -f "$FIREFOX_POLICIES" ]; then
        mutate_firefox_policies "remove_managed_extension" "$ext_id"
    fi
    
    # Remove native host
    rm -f "$(get_firefox_native_host_dir)/$OPENPATH_FIREFOX_NATIVE_HOST_FILENAME" 2>/dev/null || true
    rm -f "$(get_chromium_native_host_dir)/$OPENPATH_CHROMIUM_NATIVE_HOST_FILENAME" 2>/dev/null || true
    rm -f "$(get_chrome_native_host_dir)/$OPENPATH_CHROMIUM_NATIVE_HOST_FILENAME" 2>/dev/null || true
    rm -f "$(get_edge_native_host_dir)/$OPENPATH_CHROMIUM_NATIVE_HOST_FILENAME" 2>/dev/null || true
    rm -f "$(get_native_host_install_dir)/$OPENPATH_NATIVE_HOST_SCRIPT_NAME" 2>/dev/null || true

    local chromium_ext_id_file
    chromium_ext_id_file="$(get_chromium_extension_id_file)"
    if [ -f "$chromium_ext_id_file" ]; then
        local chromium_ext_id
        chromium_ext_id="$(cat "$chromium_ext_id_file" 2>/dev/null || true)"
        if [ -n "$chromium_ext_id" ]; then
            rm -f "$(get_chrome_external_extensions_dir)/$chromium_ext_id.json" 2>/dev/null || true
            rm -f "$(get_edge_external_extensions_dir)/$chromium_ext_id.json" 2>/dev/null || true
        fi
    fi

    rm -rf "$(get_chromium_extension_artifacts_dir)" 2>/dev/null || true
    
    # Remove autoconfig
    local firefox_dir
    firefox_dir=$(detect_firefox_dir 2>/dev/null)
    if [ -n "$firefox_dir" ]; then
        rm -f "$firefox_dir/defaults/pref/autoconfig.js" 2>/dev/null || true
        rm -f "$firefox_dir/mozilla.cfg" 2>/dev/null || true
    fi
    
    log "✓ Firefox extension removed"
}
