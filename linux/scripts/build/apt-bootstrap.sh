#!/bin/bash
################################################################################
# apt-bootstrap.sh - One-liner bootstrap for classroom mode (novice-friendly)
#
# Usage:
#   curl -fsSL https://balejosg.github.io/openpath/apt/apt-bootstrap.sh | sudo bash
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
################################################################################

set -euo pipefail

APT_REPO_URL="https://balejosg.github.io/openpath/apt"
APT_SETUP_URL="$APT_REPO_URL/apt-setup.sh"

TRACK="stable"
SKIP_SETUP=false
API_URL=""
CLASSROOM=""
CLASSROOM_ID=""
TOKEN_FILE=""
TOKEN_STDIN=false
ENROLLMENT_TOKEN=""

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
    echo "  --help               Show this help"
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

echo "=============================================="
echo "  OpenPath Classroom Bootstrap"
echo "=============================================="
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: run as root (use sudo)"
    exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
    echo "ERROR: apt-get not found (Debian/Ubuntu required)"
    exit 1
fi

echo "[1/4] Installing bootstrap dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg >/dev/null
echo "  OK Dependencies ready"

echo "[2/4] Configuring OpenPath APT repository ($TRACK)..."
setup_script="$(mktemp)"
trap 'rm -f "$setup_script"' EXIT
curl -fsSL --proto '=https' --tlsv1.2 "$APT_SETUP_URL" -o "$setup_script"
bash "$setup_script" "--$TRACK"
echo "  OK Repository configured"

echo "[3/4] Installing openpath-dnsmasq..."
apt-get install -y openpath-dnsmasq
echo "  OK Package installed"

if [ "$SKIP_SETUP" = true ]; then
    echo "[4/4] Classroom setup skipped (--skip-setup)"
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

echo "[4/4] Running classroom setup..."
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

if ! "${setup_cmd[@]}"; then
    echo ""
    echo "WARNING: Classroom setup could not be completed right now."
    echo "  OpenPath is installed. Retry when API/token are available:"
    echo ""
    echo "    sudo openpath setup"
    echo ""
    openpath status || true
    exit 0
fi

echo ""
echo "OK Classroom setup completed"
openpath status || true
openpath health || true
