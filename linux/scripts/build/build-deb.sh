#!/bin/bash
################################################################################
# build-deb.sh - Build the openpath-dnsmasq Debian package
#
# Usage:
#   ./scripts/build-deb.sh [VERSION] [RELEASE]
#   ./scripts/build-deb.sh 3.5.0 1
#
# Output: build/openpath-dnsmasq_VERSION-RELEASE_amd64.deb
################################################################################

set -e

VERSION="${1:-3.5.0}"
RELEASE="${2:-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# ROOT_DIR is the repo root (3 levels up from linux/scripts/build/)
ROOT_DIR="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
# LINUX_DIR contains the linux-specific files
LINUX_DIR="$ROOT_DIR/linux"
BUILD_DIR="$ROOT_DIR/build/openpath-dnsmasq_${VERSION}-${RELEASE}_amd64"
PACKAGE_NAME="openpath-dnsmasq_${VERSION}-${RELEASE}_amd64.deb"

echo "=============================================="
echo "  Building openpath-dnsmasq ${VERSION}-${RELEASE}"
echo "=============================================="
echo ""

# Clean and create build directory
echo "[1/8] Creating build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy package structure from debian-package template
echo "[2/8] Copying package structure..."
cp -r "$LINUX_DIR/debian-package/"* "$BUILD_DIR/"

# Update version in control file
echo "[3/8] Setting version to ${VERSION}-${RELEASE}..."
sed -i "s/^Version:.*/Version: ${VERSION}-${RELEASE}/" "$BUILD_DIR/DEBIAN/control"

# Copy libraries
echo "[4/8] Copying libraries..."
mkdir -p "$BUILD_DIR/usr/local/lib/openpath/lib"
cp "$LINUX_DIR/lib/"*.sh "$BUILD_DIR/usr/local/lib/openpath/lib/"
chmod +x "$BUILD_DIR/usr/local/lib/openpath/lib/"*.sh

# Copy scripts
echo "[5/8] Copying scripts..."
mkdir -p "$BUILD_DIR/usr/local/bin"
cp "$LINUX_DIR/scripts/runtime/openpath-update.sh" "$BUILD_DIR/usr/local/bin/"
cp "$LINUX_DIR/scripts/runtime/dnsmasq-watchdog.sh" "$BUILD_DIR/usr/local/bin/"
cp "$LINUX_DIR/scripts/runtime/captive-portal-detector.sh" "$BUILD_DIR/usr/local/bin/"
cp "$LINUX_DIR/scripts/runtime/openpath-sse-listener.sh" "$BUILD_DIR/usr/local/bin/"
cp "$LINUX_DIR/scripts/runtime/smoke-test.sh" "$BUILD_DIR/usr/local/bin/"
cp "$LINUX_DIR/scripts/runtime/openpath-self-update.sh" "$BUILD_DIR/usr/local/bin/"
cp "$LINUX_DIR/scripts/runtime/openpath-cmd.sh" "$BUILD_DIR/usr/local/bin/openpath"
chmod +x "$BUILD_DIR/usr/local/bin/"*

# Copy Firefox extension
echo "[6/8] Copying Firefox extension..."
mkdir -p "$BUILD_DIR/usr/share/openpath/firefox-extension"
# Copy extension files (excluding dev/build files)
cp "$ROOT_DIR/firefox-extension/manifest.json" "$BUILD_DIR/usr/share/openpath/firefox-extension/"
mkdir -p "$BUILD_DIR/usr/share/openpath/firefox-extension/dist"
cp "$ROOT_DIR/firefox-extension/dist/background.js" "$BUILD_DIR/usr/share/openpath/firefox-extension/dist/"
cp "$ROOT_DIR/firefox-extension/dist/config.js" "$BUILD_DIR/usr/share/openpath/firefox-extension/dist/"
cp -r "$ROOT_DIR/firefox-extension/popup" "$BUILD_DIR/usr/share/openpath/firefox-extension/"
cp -r "$ROOT_DIR/firefox-extension/icons" "$BUILD_DIR/usr/share/openpath/firefox-extension/"

# Set correct permissions
echo "[7/8] Setting permissions..."
find "$BUILD_DIR" -type d -exec chmod 755 {} \;
find "$BUILD_DIR" -type d -exec chmod g-s,u-s {} \;
find "$BUILD_DIR/DEBIAN" -type f -exec chmod 644 {} \;
chmod 755 "$BUILD_DIR/DEBIAN/postinst"
chmod 755 "$BUILD_DIR/DEBIAN/prerm"
chmod 755 "$BUILD_DIR/DEBIAN/postrm"
chmod 755 "$BUILD_DIR/DEBIAN/config"
chmod 440 "$BUILD_DIR/etc/sudoers.d/openpath"

# Build package
echo "[8/8] Building .deb package..."
dpkg-deb --build --root-owner-group "$BUILD_DIR"

# The .deb is created next to BUILD_DIR as ${BUILD_DIR}.deb
# which is already in $ROOT_DIR/build/, so no mv needed

echo ""
echo "=============================================="
echo "  ✓ Package built successfully!"
echo "=============================================="
echo ""
echo "Output: build/$PACKAGE_NAME"
echo ""
echo "To install locally:"
echo "  sudo dpkg -i build/$PACKAGE_NAME"
echo "  sudo apt-get install -f  # Install dependencies"
echo ""
echo "To check package info:"
echo "  dpkg-deb --info build/$PACKAGE_NAME"
echo "  dpkg-deb --contents build/$PACKAGE_NAME"
