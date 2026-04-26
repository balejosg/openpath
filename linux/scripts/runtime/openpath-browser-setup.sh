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
export FIREFOX_EXTENSION_SOURCE FIREFOX_RELEASE_SOURCE FIREFOX_EXTENSION_ID
FIREFOX_APP_ID="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
export FIREFOX_APP_ID
FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="${OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS:-60}"
FIREFOX_EXTENSION_REGISTRATION_MIN_PROBES="${OPENPATH_FIREFOX_EXTENSION_REGISTRATION_MIN_PROBES:-3}"
# First-run managed extension downloads can land near the end of the probe on slow runners.
FIREFOX_ACTIVATION_PROBE_TIMEOUT_SECONDS="${OPENPATH_FIREFOX_ACTIVATION_PROBE_TIMEOUT_SECONDS:-60}"
INSTALL_FIREFOX_ONLY=false

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --install-firefox-only)
                INSTALL_FIREFOX_ONLY=true
                ;;
            --help|-h)
                echo "Usage: $0 [--install-firefox-only]"
                exit 0
                ;;
            *)
                echo "ERROR: unknown option: $1" >&2
                exit 1
                ;;
        esac
        shift
    done
}

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

load_browser_request_readiness_runtime() {
    if declare -F collect_openpath_browser_request_readiness >/dev/null 2>&1; then
        return 0
    fi

    if [ -f "$INSTALL_DIR/lib/browser-request-readiness.sh" ]; then
        # shellcheck source=/usr/local/lib/openpath/lib/browser-request-readiness.sh
        source "$INSTALL_DIR/lib/browser-request-readiness.sh"
        return 0
    fi

    if [ -f "$SCRIPT_DIR/../../lib/browser-request-readiness.sh" ]; then
        # shellcheck source=../../lib/browser-request-readiness.sh
        source "$SCRIPT_DIR/../../lib/browser-request-readiness.sh"
        return 0
    fi

    log_error "Required browser request readiness runtime not found"
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

resolve_firefox_activation_profile_dir() {
    local profile_home="$1"
    local firefox_root="$profile_home/.mozilla/firefox"
    local profiles_ini="$firefox_root/profiles.ini"
    local profile_dir=""

    if [ -n "${OPENPATH_FIREFOX_PROFILE_DIR:-}" ]; then
        printf '%s\n' "$OPENPATH_FIREFOX_PROFILE_DIR"
        return 0
    fi

    if [ -f "$profiles_ini" ]; then
        profile_dir="$(
            python3 - "$firefox_root" "$profiles_ini" <<'PY' 2>/dev/null || true
import configparser
import sys
from pathlib import Path

root = Path(sys.argv[1])
profiles_ini = Path(sys.argv[2])
parser = configparser.RawConfigParser()
parser.read(profiles_ini, encoding="utf-8")

sections = [section for section in parser.sections() if section.lower().startswith("profile")]
selected = None
for section in sections:
    if parser.get(section, "Default", fallback="") == "1":
        selected = section
        break
if selected is None and sections:
    selected = sections[0]

if selected:
    profile_path = parser.get(selected, "Path", fallback="").strip()
    is_relative = parser.get(selected, "IsRelative", fallback="1").strip()
    if profile_path:
        path = root / profile_path if is_relative != "0" else Path(profile_path)
        print(path)
PY
        )"
    fi

    if [ -n "$profile_dir" ]; then
        printf '%s\n' "$profile_dir"
        return 0
    fi

    printf '%s\n' "$firefox_root/openpath.default"
    return 0
}

ensure_firefox_activation_profile() {
    local activation_user="$1"
    local profile_home="$2"
    local firefox_root="$profile_home/.mozilla/firefox"
    local profiles_ini="$firefox_root/profiles.ini"
    local profile_dir=""
    local current_user=""

    profile_dir="$(resolve_firefox_activation_profile_dir "$profile_home")" || return 1
    current_user="$(id -un 2>/dev/null || true)"

    if [ "$(id -u)" -eq 0 ] \
        && [ -n "$activation_user" ] \
        && [ "$activation_user" != "root" ] \
        && [ "$activation_user" != "$current_user" ] \
        && { [ -n "${SUDO_USER:-}" ] || [ -n "${OPENPATH_FIREFOX_PROFILE_USER:-}" ]; } \
        && command -v sudo >/dev/null 2>&1; then
        sudo -H -u "$activation_user" env HOME="$profile_home" mkdir -p "$profile_dir" || return 1
        if [ ! -f "$profiles_ini" ]; then
            sudo -H -u "$activation_user" env HOME="$profile_home" sh -c '
                mkdir -p "$(dirname "$1")"
                cat > "$1" <<EOF
[General]
StartWithLastProfile=1
Version=2

[Profile0]
Name=openpath
IsRelative=1
Path=openpath.default
Default=1
EOF
            ' sh "$profiles_ini" || true
        fi
    else
        mkdir -p "$profile_dir" || return 1
        if [ ! -f "$profiles_ini" ] && [ "$profile_dir" = "$firefox_root/openpath.default" ]; then
            mkdir -p "$firefox_root"
            cat > "$profiles_ini" <<'EOF'
[General]
StartWithLastProfile=1
Version=2

[Profile0]
Name=openpath
IsRelative=1
Path=openpath.default
Default=1
EOF
        fi
    fi

    printf '%s\n' "$profile_dir"
}

detect_firefox_extension_registration() {
    local profile_home="$1"
    local extension_id="$2"

    python3 - "$profile_home" "$extension_id" <<'PY'
import json
import sys
from pathlib import Path

profile_home = Path(sys.argv[1])
extension_id = sys.argv[2]

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

candidate_roots = []
for root in (
    profile_home / ".mozilla/firefox",
    profile_home / "snap/firefox/common/.mozilla/firefox",
):
    if root not in candidate_roots:
        candidate_roots.append(root)

for root in candidate_roots:
    if not root.exists():
        continue
    for profile in root.glob("*"):
        if not profile.is_dir():
            continue
        if prefs_has_uuid(profile / "prefs.js"):
            print(f"prefs.js\t{profile}")
            raise SystemExit(0)
        if extensions_json_has_addon(profile / "extensions.json"):
            print(f"extensions.json\t{profile}")
            raise SystemExit(0)

raise SystemExit(1)
PY
}

firefox_profile_has_extension_registration() {
    local profile_home="$1"
    local extension_id="$2"

    detect_firefox_extension_registration "$profile_home" "$extension_id" >/dev/null
}

log_firefox_registration_probe() {
    local probe_attempt="$1"
    local activation_user="$2"
    local profile_home="$3"
    local probe_exit_status="$4"
    local registration_source="$5"
    local registration_profile="$6"

    log \
        "Firefox registration probe_attempt=$probe_attempt activation_user=$activation_user profile_home=$profile_home probe_exit_status=$probe_exit_status registration_source=$registration_source registration_profile=$registration_profile"
}

run_firefox_activation_probe() {
    local firefox_binary="$1"
    local activation_user="$2"
    local profile_home="$3"
    local screenshot_path="/tmp/openpath-firefox-extension-activation.png"
    local current_user=""
    local activation_profile=""

    force_browser_close || true
    current_user="$(id -un 2>/dev/null || true)"
    activation_profile="$(ensure_firefox_activation_profile "$activation_user" "$profile_home")" || return 1

    if [ "$(id -u)" -eq 0 ] \
        && [ -n "$activation_user" ] \
        && [ "$activation_user" != "root" ] \
        && [ "$activation_user" != "$current_user" ] \
        && { [ -n "${SUDO_USER:-}" ] || [ -n "${OPENPATH_FIREFOX_PROFILE_USER:-}" ]; } \
        && command -v sudo >/dev/null 2>&1; then
        sudo -H -u "$activation_user" \
            env HOME="$profile_home" \
            timeout --kill-after=5s "${FIREFOX_ACTIVATION_PROBE_TIMEOUT_SECONDS}s" "$firefox_binary" --headless --profile "$activation_profile" --screenshot "$screenshot_path" about:blank \
            >/dev/null 2>&1
        return $?
    fi

    HOME="$profile_home" timeout --kill-after=5s "${FIREFOX_ACTIVATION_PROBE_TIMEOUT_SECONDS}s" "$firefox_binary" --headless --profile "$activation_profile" --screenshot "$screenshot_path" about:blank \
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
    local registration_info=""
    local registration_source="missing"
    local registration_profile=""

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
        registration_info="$(detect_firefox_extension_registration "$profile_home" "$FIREFOX_EXTENSION_ID" 2>/dev/null || true)"
        if [ -n "$registration_info" ]; then
            registration_source="${registration_info%%$'\t'*}"
            registration_profile="${registration_info#*$'\t'}"
            log_firefox_registration_probe 0 "$activation_user" "$profile_home" 0 "$registration_source" "$registration_profile"
            write_firefox_extension_ready_marker "$activation_user" "$profile_home"
            return 0
        fi

        activation_attempts=$((activation_attempts + 1))
        if run_firefox_activation_probe "$firefox_binary" "$activation_user" "$profile_home"; then
            activation_status=0
        else
            activation_status=$?
        fi

        registration_source="missing"
        registration_profile=""
        registration_info="$(detect_firefox_extension_registration "$profile_home" "$FIREFOX_EXTENSION_ID" 2>/dev/null || true)"
        if [ -n "$registration_info" ]; then
            registration_source="${registration_info%%$'\t'*}"
            registration_profile="${registration_info#*$'\t'}"
        fi
        log_firefox_registration_probe "$activation_attempts" "$activation_user" "$profile_home" "$activation_status" "$registration_source" "$registration_profile"

        if [ "$registration_source" != "missing" ]; then
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

    log_error \
        "Firefox did not register managed extension: $FIREFOX_EXTENSION_ID activation_user=$activation_user profile_home=$profile_home probe_attempt=$activation_attempts registration_source=$registration_source"
    return 1
}

verify_firefox_setup() {
    local firefox_dir=""

    firefox_dir="$(detect_firefox_dir 2>/dev/null || true)"
    if [ -z "$firefox_dir" ]; then
        log_error "Firefox installation directory not found after browser setup"
        return 1
    fi

    require_openpath_browser_request_readiness || return 1
}

main() {
    parse_args "$@"
    load_common_runtime
    if ! load_libraries; then
        load_browser_runtime
    fi
    load_browser_request_readiness_runtime
    require_root

    log "Ensuring Firefox is installed..."
    if ! install_firefox_esr; then
        log_error "Failed to install Firefox"
        exit 1
    fi

    if [ "$INSTALL_FIREFOX_ONLY" = true ]; then
        log "Firefox installation is ready"
        exit 0
    fi

    require_openpath_request_setup_complete "browser request setup"

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
