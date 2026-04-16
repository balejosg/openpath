#!/bin/bash

################################################################################
# openpath-browser-setup.sh - Ensure Firefox + managed extension are configured
# Part of the OpenPath DNS system
################################################################################

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/usr/local/lib/openpath}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FIREFOX_EXTENSION_SOURCE="${OPENPATH_BROWSER_SETUP_EXTENSION_SOURCE:-/usr/share/openpath/firefox-extension}"
FIREFOX_RELEASE_SOURCE="${OPENPATH_BROWSER_SETUP_RELEASE_SOURCE:-/usr/share/openpath/firefox-release}"
FIREFOX_EXTENSION_ID="${OPENPATH_FIREFOX_EXTENSION_ID:-monitor-bloqueos@openpath}"
FIREFOX_APP_ID="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"

load_common_runtime() {
    if [ -f "$INSTALL_DIR/lib/common.sh" ]; then
        # shellcheck source=/usr/local/lib/openpath/lib/common.sh
        source "$INSTALL_DIR/lib/common.sh"
        return 0
    fi

    if [ -f "$SCRIPT_DIR/../../lib/common.sh" ]; then
        # shellcheck source=../../lib/common.sh
        source "$SCRIPT_DIR/../../lib/common.sh"
        return 0
    fi

    echo "ERROR: common.sh not found" >&2
    exit 1
}

load_browser_runtime() {
    if [ -f "$INSTALL_DIR/lib/browser.sh" ]; then
        # shellcheck source=/usr/local/lib/openpath/lib/browser.sh
        source "$INSTALL_DIR/lib/browser.sh"
        return 0
    fi

    if [ -f "$SCRIPT_DIR/../../lib/browser.sh" ]; then
        # shellcheck source=../../lib/browser.sh
        source "$SCRIPT_DIR/../../lib/browser.sh"
        return 0
    fi

    log_error "Required browser runtime not found"
    exit 1
}

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        log_error "Browser setup must run as root"
        exit 1
    fi
}

resolve_firefox_extensions_root_dir() {
    if declare -F get_firefox_extensions_root >/dev/null 2>&1; then
        get_firefox_extensions_root
        return 0
    fi

    printf '%s\n' "${FIREFOX_EXTENSIONS_ROOT:-/usr/share/mozilla/extensions}"
}

verify_firefox_policy_contract() {
    if [ ! -f "$FIREFOX_POLICIES" ]; then
        log_error "Firefox policies file not found: $FIREFOX_POLICIES"
        return 1
    fi

    if ! grep -q "ExtensionSettings" "$FIREFOX_POLICIES" 2>/dev/null; then
        log_error "Firefox policies missing ExtensionSettings"
        return 1
    fi

    if ! grep -q "$FIREFOX_EXTENSION_ID" "$FIREFOX_POLICIES" 2>/dev/null; then
        log_error "Firefox policies missing managed extension id: $FIREFOX_EXTENSION_ID"
        return 1
    fi

    return 0
}

verify_firefox_extension_payload() {
    local extensions_root=""
    local unpacked_extension_dir=""

    extensions_root="$(resolve_firefox_extensions_root_dir)"
    unpacked_extension_dir="$extensions_root/$FIREFOX_APP_ID/$FIREFOX_EXTENSION_ID"

    if [ -d "$unpacked_extension_dir" ] && [ -f "$unpacked_extension_dir/manifest.json" ]; then
        return 0
    fi

    if [ -f "$FIREFOX_RELEASE_SOURCE/metadata.json" ]; then
        return 0
    fi

    log_error "Firefox extension payload not available after setup"
    return 1
}

verify_firefox_setup() {
    local firefox_dir=""

    firefox_dir="$(detect_firefox_dir 2>/dev/null || true)"
    if [ -z "$firefox_dir" ]; then
        log_error "Firefox installation directory not found after browser setup"
        return 1
    fi

    verify_firefox_policy_contract || return 1
    verify_firefox_extension_payload || return 1
}

main() {
    load_common_runtime
    load_browser_runtime
    require_root
    require_openpath_request_setup_complete "browser request setup"

    log "Ensuring Firefox is installed..."
    if ! install_firefox_esr; then
        log_error "Failed to install Firefox"
        exit 1
    fi

    log "Ensuring browser integrations are configured..."
    if ! install_browser_integrations \
        "$FIREFOX_EXTENSION_SOURCE" \
        "$FIREFOX_RELEASE_SOURCE" \
        --native-host \
        --firefox-required \
        --chromium-best-effort \
        --native-host-best-effort; then
        log_error "Failed to configure Firefox browser integrations"
        exit 1
    fi

    if ! apply_search_engine_policies; then
        log_error "Failed to apply browser policies"
        exit 1
    fi

    if ! verify_firefox_setup; then
        exit 1
    fi

    log "Firefox browser setup is ready"
}

main "$@"
