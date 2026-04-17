#!/bin/bash

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
# setup-repo.sh - Set up local APT repository using reprepro
#
# Usage:
#   ./scripts/setup-repo.sh [REPO_DIR] [GPG_KEY_ID]
#   ./scripts/setup-repo.sh /var/www/apt-repo ABCD1234
#
# This is for MAINTAINER use, not for clients.
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/apt.sh
source "$SCRIPT_DIR/../../lib/apt.sh"

REPO_DIR="${1:-./apt-repo}"
GPG_KEY_ID="${2:-}"

echo "=============================================="
echo "  Setting up APT Repository"
echo "=============================================="
echo ""
echo "Repository directory: $REPO_DIR"
echo ""

# Install reprepro if not present
if ! command -v reprepro &> /dev/null; then
    echo "[1/3] Installing reprepro..."
    if [ "$EUID" -eq 0 ]; then
        apt_install_with_retry "reprepro" apt-get install -y reprepro
    else
        echo "WARNING: reprepro not found. Install with: sudo apt install reprepro"
    fi
else
    echo "[1/3] reprepro already installed"
fi

# Create repository structure
echo "[2/3] Creating repository structure..."
mkdir -p "$REPO_DIR/conf"
mkdir -p "$REPO_DIR/pool/main"

# Create distributions file
SIGN_WITH="${GPG_KEY_ID:-default}"
cat > "$REPO_DIR/conf/distributions" << EOF
Origin: Las Encinas IT
Label: Whitelist System
Suite: stable
Codename: stable
Architectures: amd64
Components: main
Description: DNS Whitelist System for Educational Environments
SignWith: $SIGN_WITH
EOF

# Create options file
cat > "$REPO_DIR/conf/options" << EOF
verbose
basedir $REPO_DIR
EOF

echo "[3/3] Repository configured"
echo ""
echo "=============================================="
echo "  ✓ Repository setup complete!"
echo "=============================================="
echo ""
echo "To add a package:"
echo "  reprepro -b $REPO_DIR includedeb stable build/openpath-dnsmasq_*.deb"
echo ""
echo "To list packages:"
echo "  reprepro -b $REPO_DIR list stable"
echo ""
echo "To remove a package:"
echo "  reprepro -b $REPO_DIR remove stable openpath-dnsmasq"
echo ""
echo "To export GPG public key:"
echo "  gpg --armor --export $GPG_KEY_ID > $REPO_DIR/pubkey.gpg"
echo ""
