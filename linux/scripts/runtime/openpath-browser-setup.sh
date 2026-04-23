#!/bin/bash

################################################################################
# openpath-browser-setup.sh - Ensure Firefox + managed extension are configured
# Part of the OpenPath DNS system
################################################################################

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/usr/local/lib/openpath}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

default_browser_setup_source() {
    local install_source="$1"
    local package_source="$2"

    if [ -d "$install_source" ]; then
        printf '%s\n' "$install_source"
        return 0
    fi

    printf '%s\n' "$package_source"
}

FIREFOX_EXTENSION_SOURCE="${OPENPATH_BROWSER_SETUP_EXTENSION_SOURCE:-$(default_browser_setup_source "$INSTALL_DIR/firefox-extension" "/usr/share/openpath/firefox-extension")}"
FIREFOX_RELEASE_SOURCE="${OPENPATH_BROWSER_SETUP_RELEASE_SOURCE:-$(default_browser_setup_source "$INSTALL_DIR/firefox-release" "/usr/share/openpath/firefox-release")}"
FIREFOX_EXTENSION_ID="${OPENPATH_FIREFOX_EXTENSION_ID:-monitor-bloqueos@openpath}"
FIREFOX_APP_ID="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="${OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS:-60}"
FIREFOX_EXTENSION_REGISTRATION_MIN_PROBES="${OPENPATH_FIREFOX_EXTENSION_REGISTRATION_MIN_PROBES:-3}"
# First-run managed extension downloads can land near the end of the probe on slow runners.
FIREFOX_ACTIVATION_PROBE_TIMEOUT_SECONDS="${OPENPATH_FIREFOX_ACTIVATION_PROBE_TIMEOUT_SECONDS:-60}"

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

read_browser_setup_api_base_url() {
    local api_url_conf="${OPENPATH_API_URL_CONF:-$ETC_CONFIG_DIR/api-url.conf}"
    local api_url=""

    api_url="$(read_single_line_file "$api_url_conf" 2>/dev/null || true)"
    api_url="${api_url%/}"
    if [ -z "$api_url" ]; then
        return 1
    fi

    printf '%s\n' "$api_url"
}

read_firefox_policy_install_url() {
    if declare -F read_firefox_managed_extension_install_url >/dev/null 2>&1; then
        read_firefox_managed_extension_install_url "$FIREFOX_POLICIES" "$FIREFOX_EXTENSION_ID"
        return $?
    fi

    run_browser_json_helper \
        read-firefox-managed-install-url \
        --policies-file "$FIREFOX_POLICIES" \
        --extension-id "$FIREFOX_EXTENSION_ID"
}

verify_firefox_managed_api_payload() {
    local api_base_url=""
    local install_url=""
    local expected_install_url=""

    api_base_url="$(read_browser_setup_api_base_url)" || return 1
    install_url="$(read_firefox_policy_install_url 2>/dev/null || true)"
    expected_install_url="${api_base_url}/api/extensions/firefox/openpath.xpi"

    [ "$install_url" = "$expected_install_url" ]
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

    if verify_firefox_managed_api_payload; then
        return 0
    fi

    log_error "Firefox extension payload not available after setup"
    return 1
}

resolve_firefox_binary_path() {
    local firefox_dir=""
    local candidate=""

    firefox_dir="$(detect_firefox_dir 2>/dev/null || true)"
    if [ -n "$firefox_dir" ]; then
        for candidate in "$firefox_dir/firefox" "$firefox_dir/firefox-bin"; do
            if [ -x "$candidate" ]; then
                printf '%s\n' "$candidate"
                return 0
            fi
        done
    fi

    candidate="$(command -v firefox-esr 2>/dev/null || command -v firefox 2>/dev/null || true)"
    if [ -n "$candidate" ]; then
        printf '%s\n' "$candidate"
        return 0
    fi

    return 1
}

resolve_firefox_activation_user() {
    if [ -n "${OPENPATH_FIREFOX_PROFILE_USER:-}" ]; then
        printf '%s\n' "$OPENPATH_FIREFOX_PROFILE_USER"
        return 0
    fi

    if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
        printf '%s\n' "$SUDO_USER"
        return 0
    fi

    id -un 2>/dev/null || printf '%s\n' "root"
}

resolve_firefox_activation_home() {
    local activation_user="$1"
    local home_dir=""

    if [ -n "${OPENPATH_FIREFOX_PROFILE_HOME:-}" ]; then
        printf '%s\n' "$OPENPATH_FIREFOX_PROFILE_HOME"
        return 0
    fi

    if [ -n "$activation_user" ] && command -v getent >/dev/null 2>&1; then
        home_dir="$(getent passwd "$activation_user" | cut -d: -f6 || true)"
    fi

    if [ -z "$home_dir" ]; then
        home_dir="${HOME:-}"
    fi

    [ -n "$home_dir" ] || return 1
    printf '%s\n' "$home_dir"
}

firefox_profile_has_extension_registration() {
    local profile_home="$1"
    local extension_id="$2"
    local firefox_profile_root="$profile_home/.mozilla/firefox"

    python3 - "$firefox_profile_root" "$extension_id" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
extension_id = sys.argv[2]

if not root.exists():
    raise SystemExit(1)

def prefs_has_uuid(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    marker = 'user_pref("extensions.webextensions.uuids",'
    if marker not in text:
        return False
    return extension_id in text

def extensions_json_has_addon(path: Path) -> bool:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return False
    addons = payload.get("addons")
    if not isinstance(addons, list):
        return False
    return any(isinstance(addon, dict) and addon.get("id") == extension_id for addon in addons)

for profile in root.glob("*"):
    if not profile.is_dir():
        continue
    if prefs_has_uuid(profile / "prefs.js") or extensions_json_has_addon(profile / "extensions.json"):
        raise SystemExit(0)

raise SystemExit(1)
PY
}

run_firefox_activation_probe() {
    local firefox_binary="$1"
    local activation_user="$2"
    local profile_home="$3"
    local screenshot_path="/tmp/openpath-firefox-extension-activation.png"
    local current_user=""

    force_browser_close || true
    current_user="$(id -un 2>/dev/null || true)"

    if [ "$(id -u)" -eq 0 ] \
        && [ -n "$activation_user" ] \
        && [ "$activation_user" != "root" ] \
        && [ "$activation_user" != "$current_user" ] \
        && { [ -n "${SUDO_USER:-}" ] || [ -n "${OPENPATH_FIREFOX_PROFILE_USER:-}" ]; } \
        && command -v sudo >/dev/null 2>&1; then
        sudo -H -u "$activation_user" \
            env HOME="$profile_home" \
            timeout --kill-after=5s "${FIREFOX_ACTIVATION_PROBE_TIMEOUT_SECONDS}s" "$firefox_binary" --headless --screenshot "$screenshot_path" about:blank \
            >/dev/null 2>&1
        return $?
    fi

    HOME="$profile_home" timeout --kill-after=5s "${FIREFOX_ACTIVATION_PROBE_TIMEOUT_SECONDS}s" "$firefox_binary" --headless --screenshot "$screenshot_path" about:blank \
        >/dev/null 2>&1
}

write_firefox_extension_ready_marker() {
    local activation_user="$1"
    local profile_home="$2"
    local marker_path="${FIREFOX_EXTENSION_READY_FILE:-$VAR_STATE_DIR/firefox-extension-ready}"

    mkdir -p "$(dirname "$marker_path")"
    {
        printf 'extension_id=%s\n' "$FIREFOX_EXTENSION_ID"
        printf 'user=%s\n' "$activation_user"
        printf 'profile_home=%s\n' "$profile_home"
        printf 'verified_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    } > "$marker_path"
    chmod 600 "$marker_path" 2>/dev/null || true
}

verify_firefox_extension_registered() {
    local firefox_binary=""
    local activation_user=""
    local profile_home=""
    local deadline=0
    local activation_status=0
    local activation_attempts=0
    local marker_path="${FIREFOX_EXTENSION_READY_FILE:-$VAR_STATE_DIR/firefox-extension-ready}"

    rm -f "$marker_path" 2>/dev/null || true

    firefox_binary="$(resolve_firefox_binary_path)" || {
        log_error "Firefox executable not found after browser setup"
        return 1
    }
    activation_user="$(resolve_firefox_activation_user)"
    profile_home="$(resolve_firefox_activation_home "$activation_user")" || {
        log_error "Firefox profile home could not be resolved for extension verification"
        return 1
    }

    deadline=$((SECONDS + FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS))
    while [ "$SECONDS" -le "$deadline" ] || [ "$activation_attempts" -lt "$FIREFOX_EXTENSION_REGISTRATION_MIN_PROBES" ]; do
        if firefox_profile_has_extension_registration "$profile_home" "$FIREFOX_EXTENSION_ID"; then
            write_firefox_extension_ready_marker "$activation_user" "$profile_home"
            return 0
        fi

        activation_attempts=$((activation_attempts + 1))
        if run_firefox_activation_probe "$firefox_binary" "$activation_user" "$profile_home"; then
            activation_status=0
        else
            activation_status=$?
        fi

        if firefox_profile_has_extension_registration "$profile_home" "$FIREFOX_EXTENSION_ID"; then
            write_firefox_extension_ready_marker "$activation_user" "$profile_home"
            return 0
        fi

        if [ "$activation_status" -ne 0 ] \
            && [ "$SECONDS" -gt "$deadline" ] \
            && [ "$activation_attempts" -ge "$FIREFOX_EXTENSION_REGISTRATION_MIN_PROBES" ]; then
            break
        fi

        sleep 1
    done

    log_error "Firefox did not register managed extension: $FIREFOX_EXTENSION_ID"
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
    verify_firefox_extension_registered || return 1
}

main() {
    load_common_runtime
    if ! load_libraries; then
        load_browser_runtime
    fi
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
        --native-host-required; then
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
