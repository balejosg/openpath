#!/bin/bash
################################################################################
# apt-bootstrap.sh - One-liner bootstrap for classroom mode (novice-friendly)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/balejosg/openpath/gh-pages/apt/apt-bootstrap.sh | sudo bash
#
# Optional flags:
#   --unstable      Use unstable track
#   --skip-setup    Install package only (skip classroom setup)
#   --api-url URL   Non-interactive setup input
#   --classroom N  Non-interactive setup input
#   --classroom-id C Use classroom-id with enrollment token flow
#   --token-file F  Read registration token from file
#   --token-stdin   Read registration token from stdin
#   --enrollment-token T  Classroom enrollment token
#   --package-version V Install an explicit openpath-dnsmasq version
################################################################################

set -euo pipefail

LEGACY_GITHUB_PAGES_APT_REPO_URL="https://balejosg.github.io/openpath/apt"
RAW_GITHUB_CONTENT_APT_REPO_URL="https://raw.githubusercontent.com/balejosg/openpath/gh-pages/apt"
APT_REPO_URL="${OPENPATH_APT_REPO_URL:-$RAW_GITHUB_CONTENT_APT_REPO_URL}"
if [ "${APT_REPO_URL%/}" = "$LEGACY_GITHUB_PAGES_APT_REPO_URL" ]; then
    APT_REPO_URL="$RAW_GITHUB_CONTENT_APT_REPO_URL"
fi
APT_SETUP_URL="$APT_REPO_URL/apt-setup.sh"
APT_SOURCES_PATH="${OPENPATH_APT_SOURCES_PATH:-/etc/apt/sources.list.d/openpath.list}"

TRACK="stable"
SKIP_SETUP=false
API_URL=""
CLASSROOM=""
CLASSROOM_ID=""
TOKEN_FILE=""
TOKEN_STDIN=false
ENROLLMENT_TOKEN=""
PACKAGE_VERSION=""
BROWSER_SETUP_SCRIPT="${OPENPATH_BROWSER_SETUP_SCRIPT:-/usr/local/bin/openpath-browser-setup.sh}"
VERBOSE=false

log_verbose() {
    if [ "$VERBOSE" = true ]; then
        printf '%s\n' "$*"
    fi
}

show_progress() {
    local current="$1"
    local total="$2"
    local label="$3"
    local percent=$((current * 100 / total))

    if [ "$VERBOSE" = true ]; then
        printf '[%s/%s] %s\n' "$current" "$total" "$label"
        return 0
    fi

    if [ -t 1 ]; then
        local width=24
        local filled=$((percent * width / 100))
        local empty=$((width - filled))
        local bar
        bar="$(printf '%*s' "$filled" '' | tr ' ' '#')$(printf '%*s' "$empty" '' | tr ' ' '-')"
        printf '\r[%s] %3d%% %s/%s %s' "$bar" "$percent" "$current" "$total" "$label"
        if [ "$current" -eq "$total" ]; then
            printf '\n'
        fi
    else
        printf 'Progress %s/%s: %s\n' "$current" "$total" "$label"
    fi
}

run_maybe_verbose() {
    if [ "$VERBOSE" = true ]; then
        "$@"
        return $?
    fi

    local output_file
    output_file="$(mktemp)"
    if "$@" >"$output_file" 2>&1; then
        rm -f "$output_file"
        return 0
    fi

    [ -t 1 ] && printf '\n'
    cat "$output_file"
    rm -f "$output_file"
    return 1
}

remove_legacy_openpath_apt_source() {
    if [ -f "$APT_SOURCES_PATH" ] \
        && grep -Fq "$LEGACY_GITHUB_PAGES_APT_REPO_URL" "$APT_SOURCES_PATH"; then
        rm -f "$APT_SOURCES_PATH"
        log_verbose "  Removed legacy OpenPath APT source: $APT_SOURCES_PATH"
    fi
}

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --stable             Use stable track (default)"
    echo "  --unstable           Use unstable track"
    echo "  --skip-setup         Install package only (skip classroom setup)"
    echo "  --api-url URL        API URL for classroom setup"
    echo "  --classroom NAME     Classroom name for setup"
    echo "  --classroom-id ID    Classroom ID for enrollment token setup"
    echo "  --token-file FILE    Read registration token from file"
    echo "  --token-stdin        Read registration token from stdin"
    echo "  --enrollment-token T Classroom enrollment token"
    echo "  --package-version V  Install explicit openpath-dnsmasq version"
    echo "  --verbose            Show detailed installer output"
    echo "  --help               Show this help"
}

run_browser_setup_helper() {
    show_progress 5 5 "Ensuring Firefox browser setup"

    if [ ! -x "$BROWSER_SETUP_SCRIPT" ]; then
        echo "ERROR: Browser setup helper not found at $BROWSER_SETUP_SCRIPT"
        exit 1
    fi

    if ! run_maybe_verbose "$BROWSER_SETUP_SCRIPT"; then
        echo "ERROR: Firefox browser setup did not complete successfully."
        exit 1
    fi

    log_verbose "  OK Firefox browser setup ready"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --stable)
            TRACK="stable"
            shift
            ;;
        --unstable)
            TRACK="unstable"
            shift
            ;;
        --skip-setup)
            SKIP_SETUP=true
            shift
            ;;
        --api-url)
            API_URL="$2"
            shift 2
            ;;
        --classroom)
            CLASSROOM="$2"
            shift 2
            ;;
        --classroom-id)
            CLASSROOM_ID="$2"
            shift 2
            ;;
        --token-file)
            TOKEN_FILE="$2"
            shift 2
            ;;
        --token-stdin)
            TOKEN_STDIN=true
            shift
            ;;
        --enrollment-token)
            ENROLLMENT_TOKEN="$2"
            shift 2
            ;;
        --package-version)
            PACKAGE_VERSION="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

if [ "$VERBOSE" = true ]; then
    echo "=============================================="
    echo "  OpenPath Classroom Bootstrap"
    echo "=============================================="
    echo ""
else
    echo "Installing OpenPath..."
fi

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: run as root (use sudo)"
    exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
    echo "ERROR: apt-get not found (Debian/Ubuntu required)"
    exit 1
fi

show_progress 1 5 "Installing bootstrap dependencies"
export DEBIAN_FRONTEND=noninteractive
remove_legacy_openpath_apt_source
run_maybe_verbose apt-get update -qq
run_maybe_verbose apt-get install -y -qq ca-certificates curl gnupg
log_verbose "  OK Dependencies ready"

show_progress 2 5 "Configuring OpenPath APT repository ($TRACK)"
setup_script="$(mktemp)"
trap 'rm -f "$setup_script"' EXIT
if [[ "$APT_SETUP_URL" == https://* ]]; then
    curl -fsSL --proto '=https' --tlsv1.2 "$APT_SETUP_URL" -o "$setup_script"
else
    curl -fsSL "$APT_SETUP_URL" -o "$setup_script"
fi
run_maybe_verbose bash "$setup_script" "--$TRACK"
log_verbose "  OK Repository configured"

show_progress 3 5 "Validating and installing openpath-dnsmasq"
if ! apt-cache show openpath-dnsmasq >/dev/null 2>&1; then
    echo "ERROR: APT repository metadata does not advertise openpath-dnsmasq."
    if [ "$TRACK" = "stable" ] && apt-cache show whitelist-dnsmasq >/dev/null 2>&1; then
        echo "  The stable track is still serving the legacy whitelist-dnsmasq package."
    fi
    echo "  Retry after the selected track is republished."
    echo "  Temporary workaround (development builds only):"
    echo "    curl -fsSL $APT_REPO_URL/apt-bootstrap.sh | sudo bash -s -- --unstable"
    exit 1
fi

if [ -n "$PACKAGE_VERSION" ]; then
    PACKAGE_DEB_VERSION="${PACKAGE_VERSION}-1"
    if ! apt-cache show "openpath-dnsmasq=$PACKAGE_DEB_VERSION" >/dev/null 2>&1; then
        echo "ERROR: Requested openpath-dnsmasq version $PACKAGE_DEB_VERSION is not available on the $TRACK track."
        echo "  Refusing to install an implicit fallback package version."
        echo "  Publish the requested package first or update the enrollment manifest."
        exit 1
    fi
    run_maybe_verbose apt-get install -y "openpath-dnsmasq=$PACKAGE_DEB_VERSION"
else
    run_maybe_verbose apt-get install -y openpath-dnsmasq
fi
log_verbose "  OK Package installed"

if [ "$SKIP_SETUP" = true ]; then
    show_progress 4 5 "Classroom setup skipped"
    log_verbose "Classroom setup skipped (--skip-setup)"
    run_browser_setup_helper
    echo "Run manually later: sudo openpath setup"
    exit 0
fi

if [ -n "$ENROLLMENT_TOKEN" ] && [ -z "$CLASSROOM_ID" ]; then
    echo "ERROR: --classroom-id is required when using --enrollment-token"
    exit 1
fi

if [ -n "$ENROLLMENT_TOKEN" ] && { [ -n "$TOKEN_FILE" ] || [ "$TOKEN_STDIN" = true ]; }; then
    echo "ERROR: --enrollment-token cannot be combined with --token-file or --token-stdin"
    exit 1
fi

show_progress 4 5 "Running classroom setup"
setup_cmd=(openpath setup)

if [ -n "$API_URL" ]; then
    setup_cmd+=(--api-url "$API_URL")
fi
if [ -n "$CLASSROOM" ]; then
    setup_cmd+=(--classroom "$CLASSROOM")
fi
if [ -n "$CLASSROOM_ID" ]; then
    setup_cmd+=(--classroom-id "$CLASSROOM_ID")
fi
if [ -n "$TOKEN_FILE" ]; then
    setup_cmd+=(--token-file "$TOKEN_FILE")
fi
if [ "$TOKEN_STDIN" = true ]; then
    setup_cmd+=(--token-stdin)
fi
if [ -n "$ENROLLMENT_TOKEN" ]; then
    setup_cmd+=(--enrollment-token "$ENROLLMENT_TOKEN")
fi

if ! run_maybe_verbose "${setup_cmd[@]}"; then
    if [ -n "$ENROLLMENT_TOKEN" ]; then
        echo ""
        echo "ERROR: Enrollment-token classroom setup failed."
        echo "  Generate a fresh enrollment command and rerun it."
        echo ""
        exit 1
    fi

    echo ""
    echo "WARNING: Classroom setup could not be completed right now."
    echo "  OpenPath is installed. Retry when API/token are available:"
    echo ""
    echo "    sudo openpath setup"
    echo ""
    run_browser_setup_helper
    if [ "$VERBOSE" = true ]; then
        openpath status || true
    fi
    exit 0
fi

run_browser_setup_helper

echo ""
echo "OK Classroom setup completed"
if [ "$VERBOSE" = true ]; then
    openpath status || true
    openpath health || true
fi
