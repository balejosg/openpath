#!/bin/bash

# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.

################################################################################
# openpath-self-update.sh - Agent self-update mechanism
# Part of the OpenPath DNS system
#
# Downloads and installs the latest version of the agent from GitHub Releases.
# Preserves configuration files and enrolled state during update.
#
# Usage:
#   openpath self-update          # Check and update if newer version available
#   openpath self-update --force  # Force reinstall even if same version
#   openpath self-update --check  # Only check, don't install
################################################################################

set -euo pipefail

# shellcheck source=../../lib/common.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/../../lib"

if [ -f "$LIB_DIR/common.sh" ]; then
    # shellcheck source=/dev/null
    source "$LIB_DIR/common.sh"
elif [ -f "/usr/local/lib/openpath/lib/common.sh" ]; then
    # shellcheck source=/dev/null
    source "/usr/local/lib/openpath/lib/common.sh"
else
    # Backward-compatible fallback for older installations.
    # shellcheck source=/dev/null
    source /usr/local/lib/openpath/common.sh 2>/dev/null || true
fi

if ! declare -F log >/dev/null 2>&1; then
    log() { echo "$*"; }
    log_warn() { echo "$*" >&2; }
    log_error() { echo "$*" >&2; }
    log_debug() { :; }
fi

# =============================================================================
# Configuration
# =============================================================================

GITHUB_REPO="${OPENPATH_GITHUB_REPO:-balejosg/openpath}"
GITHUB_API="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
DOWNLOAD_DIR="/tmp/openpath-update"
BACKUP_DIR="/tmp/openpath-update-backup"
CURRENT_VERSION="${VERSION:-0.0.0}"

# Files to preserve during update (never overwritten)
PRESERVE_FILES=(
    "/etc/openpath/whitelist-url.conf"
    "/etc/openpath/classroom.conf"
    "/etc/openpath/overrides.conf"
    "/etc/openpath/config-overrides.conf"
    "/var/lib/openpath/whitelist.txt"
    "/var/lib/openpath/whitelist-domains.conf"
    "/var/lib/openpath/resolv.conf.backup"
    "/var/lib/openpath/resolv.conf.symlink.backup"
    "/var/lib/openpath/integrity.sha256"
)

# =============================================================================
# Functions
# =============================================================================

usage() {
    echo "Usage: openpath self-update [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --check    Only check for updates, don't install"
    echo "  --force    Force reinstall even if same version"
    echo "  --help     Show this help"
}

# Require root
require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "Error: self-update must be run as root" >&2
        exit 1
    fi
}

# Get latest release version from GitHub
get_latest_version() {
    local response
    response=$(curl -sS --connect-timeout 10 --max-time 30 "$GITHUB_API" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Cannot reach GitHub API"
        return 1
    fi

    local tag
    tag=$(echo "$response" | grep -oP '"tag_name":\s*"\K[^"]+' | head -1)

    if [ -z "$tag" ]; then
        log_error "Cannot parse latest release tag"
        return 1
    fi

    # Strip leading 'v' if present
    echo "${tag#v}"
}

# Get download URL for the .deb package from latest release
get_deb_download_url() {
    local response
    response=$(curl -sS --connect-timeout 10 --max-time 30 "$GITHUB_API" 2>/dev/null)

    # Look for .deb asset
    local deb_url
    deb_url=$(echo "$response" | grep -oP '"browser_download_url":\s*"\K[^"]+\.deb' | head -1)

    if [ -z "$deb_url" ]; then
        log_error "No .deb package found in latest release"
        return 1
    fi

    echo "$deb_url"
}

# Compare two semantic versions. Returns:
#   0 = equal, 1 = first is greater, 2 = second is greater
compare_versions() {
    local v1="$1" v2="$2"

    if [ "$v1" = "$v2" ]; then
        return 0
    fi

    # Use sort -V for version comparison
    local higher
    higher=$(printf '%s\n%s' "$v1" "$v2" | sort -V | tail -1)

    if [ "$higher" = "$v1" ]; then
        return 1  # v1 is greater
    else
        return 2  # v2 is greater
    fi
}

# Backup config files before update
backup_config() {
    log "Backing up configuration..."
    mkdir -p "$BACKUP_DIR"

    for f in "${PRESERVE_FILES[@]}"; do
        if [ -f "$f" ]; then
            local relative="${f#/}"
            mkdir -p "$BACKUP_DIR/$(dirname "$relative")"
            cp -p "$f" "$BACKUP_DIR/$relative"
            log_debug "  Backed up: $f"
        fi
    done
}

# Restore config files after update
restore_config() {
    log "Restoring configuration..."

    for f in "${PRESERVE_FILES[@]}"; do
        local relative="${f#/}"
        local backup="$BACKUP_DIR/$relative"
        if [ -f "$backup" ]; then
            mkdir -p "$(dirname "$f")"
            cp -p "$backup" "$f"
            log_debug "  Restored: $f"
        fi
    done
}

# Download and install the update
install_update() {
    local deb_url="$1"
    local new_version="$2"

    log "Downloading OpenPath v${new_version}..."
    mkdir -p "$DOWNLOAD_DIR"
    local deb_file="$DOWNLOAD_DIR/openpath-${new_version}.deb"

    if ! curl -sS -L --connect-timeout 15 --max-time 120 -o "$deb_file" "$deb_url"; then
        log_error "Download failed"
        return 1
    fi

    # Verify the download is a valid deb package
    if ! dpkg-deb --info "$deb_file" >/dev/null 2>&1; then
        log_error "Downloaded file is not a valid .deb package"
        rm -f "$deb_file"
        return 1
    fi

    log "Package downloaded: $(du -h "$deb_file" | cut -f1)"

    # Backup configuration
    backup_config

    # Install the package
    log "Installing OpenPath v${new_version}..."
    if dpkg -i "$deb_file" 2>&1; then
        log "✓ Package installed successfully"
    else
        log_warn "dpkg reported issues, running apt-get -f install..."
        apt-get -f install -y 2>&1 || true
    fi

    # Restore preserved configuration
    restore_config

    # Regenerate integrity hashes for the new version
    if [ -f "/usr/local/bin/dnsmasq-watchdog.sh" ]; then
        source /usr/local/lib/openpath/lib/common.sh 2>/dev/null || true
        # The watchdog will regenerate hashes on next run if missing
        rm -f "/var/lib/openpath/integrity.sha256"
        log "Integrity hashes will be regenerated on next watchdog run"
    fi

    # Restart services
    log "Restarting services..."
    systemctl daemon-reload
    systemctl restart openpath-dnsmasq.timer 2>/dev/null || true
    systemctl restart dnsmasq-watchdog.timer 2>/dev/null || true
    systemctl restart openpath-sse-listener.service 2>/dev/null || true
    systemctl restart captive-portal-detector.service 2>/dev/null || true

    # Run a quick update to re-apply current whitelist
    /usr/local/bin/openpath-update.sh 2>/dev/null &

    # Cleanup
    rm -rf "$DOWNLOAD_DIR" "$BACKUP_DIR"

    log "✓ OpenPath updated to v${new_version}"
    echo ""
    echo "✓ Actualización completada: v${CURRENT_VERSION} → v${new_version}"
    echo "  Los servicios se han reiniciado automáticamente."
}

# =============================================================================
# Main
# =============================================================================

main() {
    local mode="update"

    while [ $# -gt 0 ]; do
        case "$1" in
            --check)  mode="check" ;;
            --force)  mode="force" ;;
            --help)   usage; exit 0 ;;
            *)        echo "Unknown option: $1"; usage; exit 1 ;;
        esac
        shift
    done

    [ "$mode" != "check" ] && require_root

    echo "OpenPath Self-Update"
    echo "  Current version: v${CURRENT_VERSION}"
    echo ""

    # Get latest version
    echo "Checking for updates..."
    local latest_version
    latest_version=$(get_latest_version) || {
        echo "✗ Cannot check for updates (no internet or GitHub unreachable)"
        exit 1
    }

    echo "  Latest version:  v${latest_version}"
    echo ""

    # Compare versions
    local cmp_result=0
    compare_versions "$latest_version" "$CURRENT_VERSION" || cmp_result=$?

    case "$cmp_result" in
        0)  # Equal
            if [ "$mode" = "force" ]; then
                echo "Same version installed. Forcing reinstall..."
            else
                echo "✓ Ya tienes la última versión (v${CURRENT_VERSION})"
                exit 0
            fi
            ;;
        1)  # Latest is greater (update available)
            echo "⬆ Actualización disponible: v${CURRENT_VERSION} → v${latest_version}"
            ;;
        2)  # Current is greater (newer than release)
            if [ "$mode" = "force" ]; then
                echo "Current version is newer than release. Forcing reinstall..."
            else
                echo "✓ Tu versión (v${CURRENT_VERSION}) es más reciente que el último release (v${latest_version})"
                exit 0
            fi
            ;;
    esac

    # Check-only mode
    if [ "$mode" = "check" ]; then
        exit 0
    fi

    # Get download URL and install
    local deb_url
    deb_url=$(get_deb_download_url) || {
        echo "✗ No se encontró paquete .deb en el último release"
        exit 1
    }

    install_update "$deb_url" "$latest_version"
}

main "$@"
