#!/bin/bash
################################################################################
# apt-setup.sh - Set up OpenPath System APT repository on a client machine
#
# Usage (one-liner install):
#   # Stable (recommended):
#   curl -fsSL https://raw.githubusercontent.com/balejosg/openpath/gh-pages/apt/apt-setup.sh | sudo bash
#
#   # Unstable (development builds):
#   curl -fsSL https://raw.githubusercontent.com/balejosg/openpath/gh-pages/apt/apt-setup.sh | sudo bash -s -- --unstable
#
# After running:
#   sudo apt install openpath-dnsmasq
################################################################################

set -euo pipefail

# Configuration
REPO_URL="${OPENPATH_APT_REPO_URL:-https://raw.githubusercontent.com/balejosg/openpath/gh-pages/apt}"
GPG_KEY_URL="$REPO_URL/pubkey.gpg"
KEYRING_PATH="/usr/share/keyrings/openpath.gpg"
SOURCES_PATH="/etc/apt/sources.list.d/openpath.list"

# Default to stable suite
SUITE="stable"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --unstable)
            SUITE="unstable"
            shift
            ;;
        --stable)
            SUITE="stable"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--stable|--unstable]"
            exit 1
            ;;
    esac
done

echo "=============================================="
echo "  OpenPath System APT Repository Setup"
echo "=============================================="
echo ""
echo "  Suite: $SUITE"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root (use sudo)"
    exit 1
fi

# Step 1: Download and install GPG key
echo "[1/3] Downloading GPG key..."
if command -v curl &> /dev/null; then
    curl -fsSL "$GPG_KEY_URL" | gpg --batch --yes --dearmor -o "$KEYRING_PATH"
elif command -v wget &> /dev/null; then
    wget -qO- "$GPG_KEY_URL" | gpg --batch --yes --dearmor -o "$KEYRING_PATH"
else
    echo "ERROR: curl or wget required"
    exit 1
fi
chmod 644 "$KEYRING_PATH"
echo "  ✓ GPG key installed"

# Step 2: Add repository to sources.list
echo "[2/3] Adding repository ($SUITE)..."
cat > "$SOURCES_PATH" << EOF
# OpenPath System APT Repository
# https://github.com/balejosg/openpath
# Suite: $SUITE
deb [signed-by=$KEYRING_PATH] $REPO_URL $SUITE main
EOF
echo "  ✓ Repository added"

# Step 3: Update package lists
echo "[3/3] Updating package lists..."
apt-get update -qq

echo ""
echo "=============================================="
echo "  ✓ Repository configured successfully!"
echo "=============================================="
echo ""
echo "To install the openpath system:"
echo "  sudo apt install openpath-dnsmasq"
echo ""
if [ "$SUITE" = "unstable" ]; then
    echo "⚠️  You are using the UNSTABLE track."
    echo "   Development builds may contain bugs."
    echo "   To switch to stable: re-run with --stable"
    echo ""
fi
echo "To remove:"
echo "  sudo apt remove openpath-dnsmasq     # Keep configuration"
echo "  sudo apt purge openpath-dnsmasq      # Remove everything"
echo ""
