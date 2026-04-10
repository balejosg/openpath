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
# Downloads and installs the latest version of the agent from an API-hosted
# package manifest when available, with GitHub Releases as a compatibility
# fallback. Preserves configuration files and enrolled state during update.
#
# Usage:
#   openpath self-update          # Check and update if newer version available
#   openpath self-update --force  # Force reinstall even if same version
#   openpath self-update --check  # Only check, don't install
################################################################################

set -euo pipefail

# Load common library (installed path first, source-tree + legacy fallback)
INSTALL_DIR="/usr/local/lib/openpath"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$INSTALL_DIR/lib/common.sh" ]; then
    # shellcheck source=/usr/local/lib/openpath/lib/common.sh
    source "$INSTALL_DIR/lib/common.sh"
elif [ -f "$SCRIPT_DIR/../../lib/common.sh" ]; then
    # shellcheck source=../../lib/common.sh
    source "$SCRIPT_DIR/../../lib/common.sh"
elif [ -f "/usr/local/lib/openpath/common.sh" ]; then
    # shellcheck source=/usr/local/lib/openpath/common.sh
    source "/usr/local/lib/openpath/common.sh"
else
    echo "ERROR: common.sh not found" >&2
    exit 1
fi

# =============================================================================
# Configuration
# =============================================================================

GITHUB_REPO="${OPENPATH_GITHUB_REPO:-balejosg/openpath}"
DOWNLOAD_DIR="/tmp/openpath-update"
BACKUP_DIR="/tmp/openpath-update-backup"
CURRENT_VERSION="${VERSION:-0.0.0}"
API_URL_CONF="${ETC_CONFIG_DIR}/api-url.conf"
LINUX_AGENT_MANIFEST_PATH="${OPENPATH_LINUX_AGENT_MANIFEST_PATH:-/api/agent/linux/latest.json}"
PACKAGE_CACHE_DIR="${OPENPATH_AGENT_PACKAGE_CACHE_DIR:-$VAR_STATE_DIR/packages}"
LATEST_VERSION=""
DOWNLOAD_URL=""
MIN_SUPPORTED_VERSION="0.0.0"
MIN_DIRECT_UPGRADE_VERSION="0.0.0"
UPDATE_SOURCE="github-release"
DOWNLOAD_AUTH_HEADER=""
UPDATE_API_BASE_URL=""
BRIDGE_VERSIONS=()
UPDATE_SEQUENCE=()

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

parse_json_string_field() {
    local response="$1"
    local field_name="$2"
    printf '%s\n' "$response" | grep -oP "\"${field_name}\":\\s*\"\\K[^\"]+" | head -1 || true
}

parse_json_string_array_field() {
    local response="$1"
    local field_name="$2"
    local array_block=""

    array_block=$(printf '%s' "$response" | tr '\n' ' ' | sed -nE "s/.*\"${field_name}\"[[:space:]]*:[[:space:]]*\\[([^]]*)\\].*/\\1/p")
    if [ -z "$array_block" ]; then
        return 0
    fi

    printf '%s\n' "$array_block" | grep -oP '"\K[^"]+' || true
}

extract_url_origin() {
    local url="$1"
    printf '%s\n' "$url" | sed -nE 's#^(https?://[^/]+).*$#\1#p'
}

get_configured_api_base_url() {
    if [ ! -r "$API_URL_CONF" ]; then
        return 1
    fi

    local api_url
    api_url=$(tr -d '\r\n' < "$API_URL_CONF" 2>/dev/null || true)
    if [ -z "$api_url" ]; then
        return 1
    fi

    printf '%s\n' "${api_url%/}"
}

build_absolute_download_url() {
    local origin="$1"
    local candidate="$2"

    if [[ "$candidate" =~ ^https?:// ]]; then
        printf '%s\n' "$candidate"
    elif [[ "$candidate" == /* ]]; then
        printf '%s\n' "${origin}${candidate}"
    elif [ -n "$origin" ]; then
        printf '%s\n' "${origin}/${candidate}"
    else
        return 1
    fi
}

refresh_update_metadata() {
    local manifest_url="${OPENPATH_SELF_UPDATE_API:-}"
    local manifest_token="${OPENPATH_SELF_UPDATE_API_TOKEN:-}"
    local auth_header=""
    local response=""
    local origin=""
    local api_base=""
    local machine_token=""
    local managed_manifest_requested=0

    if [ -n "$manifest_token" ]; then
        auth_header="Authorization: Bearer ${manifest_token}"
    fi

    if [ -z "$manifest_url" ]; then
        api_base=$(get_configured_api_base_url || true)
        machine_token=$(get_machine_token_from_whitelist_url_file || true)
        if [ -n "$api_base" ] && [ -n "$machine_token" ]; then
            manifest_url="${api_base}${LINUX_AGENT_MANIFEST_PATH}"
            if [ -z "$auth_header" ]; then
                auth_header="Authorization: Bearer ${machine_token}"
            fi
            origin="$api_base"
            managed_manifest_requested=1
        fi
    else
        origin=$(extract_url_origin "$manifest_url")
        managed_manifest_requested=1
    fi

    if [ -z "$manifest_url" ]; then
        manifest_url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
        origin="https://github.com"
    fi

    if [ -n "$auth_header" ]; then
        response=$(curl -sS --connect-timeout 10 --max-time 30 -H "$auth_header" "$manifest_url" 2>/dev/null)
    else
        response=$(curl -sS --connect-timeout 10 --max-time 30 "$manifest_url" 2>/dev/null)
    fi

    if [ -z "$response" ]; then
        log_error "Cannot reach update manifest"
        return 1
    fi

    local manifest_version=""
    local manifest_download_path=""
    manifest_version=$(parse_json_string_field "$response" "version")
    manifest_download_path=$(parse_json_string_field "$response" "downloadPath")

    if [ -n "$manifest_version" ] && [ -n "$manifest_download_path" ]; then
        UPDATE_SOURCE="api-manifest"
        LATEST_VERSION="$manifest_version"
        DOWNLOAD_AUTH_HEADER="$auth_header"
        UPDATE_API_BASE_URL="$origin"
        DOWNLOAD_URL=$(build_absolute_download_url "$origin" "$manifest_download_path") || {
            log_error "Cannot resolve Linux agent download URL from API manifest"
            return 1
        }
        MIN_SUPPORTED_VERSION=$(parse_json_string_field "$response" "minSupportedVersion")
        MIN_DIRECT_UPGRADE_VERSION=$(parse_json_string_field "$response" "minDirectUpgradeVersion")
        mapfile -t BRIDGE_VERSIONS < <(parse_json_string_array_field "$response" "bridgeVersions" | sort -uV)
        [ -z "$MIN_SUPPORTED_VERSION" ] && MIN_SUPPORTED_VERSION="0.0.0"
        [ -z "$MIN_DIRECT_UPGRADE_VERSION" ] && MIN_DIRECT_UPGRADE_VERSION="0.0.0"
        return 0
    fi

    if [ "$managed_manifest_requested" -eq 1 ]; then
        log_warn "Managed Linux update manifest was unavailable or incomplete; falling back to GitHub releases"
        manifest_url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
        origin="https://github.com"
        auth_header=""

        response=$(curl -sS --connect-timeout 10 --max-time 30 "$manifest_url" 2>/dev/null)
        if [ -z "$response" ]; then
            log_error "Cannot reach fallback GitHub release metadata"
            return 1
        fi
    fi

    local github_tag=""
    local github_download_url=""
    github_tag=$(parse_json_string_field "$response" "tag_name")
    github_download_url=$(printf '%s\n' "$response" | grep -oP '"browser_download_url":\s*"\K[^"]+\.deb' | head -1)

    if [ -z "$github_tag" ]; then
        log_error "Cannot parse latest release tag"
        return 1
    fi

    if [ -z "$github_download_url" ]; then
        log_error "No .deb package found in latest release"
        return 1
    fi

    UPDATE_SOURCE="github-release"
    LATEST_VERSION="${github_tag#v}"
    DOWNLOAD_URL="$github_download_url"
    DOWNLOAD_AUTH_HEADER=""
    UPDATE_API_BASE_URL=""
    BRIDGE_VERSIONS=()
    MIN_SUPPORTED_VERSION="0.0.0"
    MIN_DIRECT_UPGRADE_VERSION="0.0.0"
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

read_installed_version() {
    if [ -r "$INSTALL_DIR/VERSION" ]; then
        tr -d '\r\n' < "$INSTALL_DIR/VERSION"
        return 0
    fi

    printf '%s\n' "$CURRENT_VERSION"
}

cached_package_path_for_version() {
    local version="$1"
    printf '%s\n' "$PACKAGE_CACHE_DIR/openpath-dnsmasq_${version}-1_amd64.deb"
}

cleanup_update_workspace() {
    rm -rf "$DOWNLOAD_DIR" "$BACKUP_DIR"
}

verify_deb_package() {
    local deb_file="$1"
    dpkg-deb --info "$deb_file" >/dev/null 2>&1
}

download_url_to_file() {
    local source_url="$1"
    local destination_file="$2"

    mkdir -p "$(dirname "$destination_file")"

    if [ -n "$DOWNLOAD_AUTH_HEADER" ]; then
        if ! curl -sS -L --connect-timeout 15 --max-time 120 -H "$DOWNLOAD_AUTH_HEADER" -o "$destination_file" "$source_url"; then
            log_error "Download failed: $source_url" >&2
            return 1
        fi
    else
        if ! curl -sS -L --connect-timeout 15 --max-time 120 -o "$destination_file" "$source_url"; then
            log_error "Download failed: $source_url" >&2
            return 1
        fi
    fi

    if ! verify_deb_package "$destination_file"; then
        log_error "Downloaded file is not a valid .deb package" >&2
        rm -f "$destination_file"
        return 1
    fi

    return 0
}

build_managed_package_url_for_version() {
    local version="$1"

    if [ "$UPDATE_SOURCE" != "api-manifest" ] || [ -z "$UPDATE_API_BASE_URL" ]; then
        return 1
    fi

    printf '%s/api/agent/linux/package?version=%s\n' "${UPDATE_API_BASE_URL%/}" "$version"
}

ensure_cached_package_for_version() {
    local version="$1"
    local cached_file=""
    local source_url=""

    cached_file=$(cached_package_path_for_version "$version")
    if [ -f "$cached_file" ] && verify_deb_package "$cached_file"; then
        printf '%s\n' "$cached_file"
        return 0
    fi

    rm -f "$cached_file"

    if [ "$version" = "$LATEST_VERSION" ]; then
        source_url="$DOWNLOAD_URL"
    else
        source_url=$(build_managed_package_url_for_version "$version" || true)
    fi

    if [ -z "$source_url" ]; then
        return 1
    fi

    # Callers capture stdout, so keep it reserved for the cache path.
    log "Caching OpenPath package v${version}..." >&2
    download_url_to_file "$source_url" "$cached_file" || return 1
    printf '%s\n' "$cached_file"
}

install_deb_package_file() {
    local deb_file="$1"
    local target_version="$2"
    local action_label="${3:-update}"

    log "Installing OpenPath v${target_version} (${action_label})..."
    if dpkg -i "$deb_file" 2>&1; then
        log "✓ Package installed successfully"
    else
        log_warn "dpkg reported issues, running apt-get -f install..."
        if ! apt-get -f install -y 2>&1; then
            log_error "Package repair failed after dpkg -i"
            return 1
        fi
    fi

    if ! dpkg -s openpath-dnsmasq 2>/dev/null | grep -q '^Status: install ok installed'; then
        log_error "Updated package is not fully installed"
        return 1
    fi

    return 0
}

restart_updated_services() {
    log "Restarting services..."
    systemctl daemon-reload
    systemctl restart dnsmasq 2>/dev/null || true
    systemctl restart openpath-dnsmasq.timer 2>/dev/null || true
    systemctl restart dnsmasq-watchdog.timer 2>/dev/null || true
    systemctl restart openpath-sse-listener.service 2>/dev/null || true
    systemctl restart captive-portal-detector.service 2>/dev/null || true
}

verify_updated_installation() {
    local expected_version="$1"
    local installed_version=""

    installed_version=$(read_installed_version)
    if [ "$installed_version" != "$expected_version" ]; then
        log_error "Installed version mismatch after update: expected v${expected_version}, found v${installed_version}"
        return 1
    fi

    if ! dpkg -s openpath-dnsmasq 2>/dev/null | grep -q '^Status: install ok installed'; then
        log_error "OpenPath package is not fully installed after update"
        return 1
    fi

    for _ in $(seq 1 10); do
        if systemctl is-active --quiet dnsmasq; then
            return 0
        fi
        sleep 1
    done

    log_error "dnsmasq did not become active after installing v${expected_version}"
    return 1
}

finalize_updated_package() {
    local target_version="$1"

    restore_config

    if [ -f "/usr/local/bin/dnsmasq-watchdog.sh" ]; then
        source /usr/local/lib/openpath/lib/common.sh 2>/dev/null || true
        rm -f "/var/lib/openpath/integrity.sha256"
        log "Integrity hashes will be regenerated on next watchdog run"
    fi

    restart_updated_services

    /usr/local/bin/openpath-update.sh 2>/dev/null &

    verify_updated_installation "$target_version"
}

attempt_agent_package_rollback() {
    local previous_version="$1"
    local rollback_package=""

    rollback_package=$(ensure_cached_package_for_version "$previous_version" || true)
    if [ -z "$rollback_package" ] || [ ! -f "$rollback_package" ]; then
        log_error "Rollback package for v${previous_version} is unavailable"
        return 1
    fi

    log_warn "Attempting rollback to OpenPath v${previous_version}..."
    if ! install_deb_package_file "$rollback_package" "$previous_version" "rollback"; then
        log_error "Rollback package installation failed"
        return 1
    fi

    if ! finalize_updated_package "$previous_version"; then
        log_error "Rollback completed but health checks still failed"
        return 1
    fi

    cleanup_update_workspace
    log_warn "Rollback to v${previous_version} completed"
    return 0
}

resolve_update_sequence() {
    local current_version="$1"
    local target_version="$2"
    local bridge_version=""
    local filtered_bridges=()

    UPDATE_SEQUENCE=()

    for bridge_version in "${BRIDGE_VERSIONS[@]}"; do
        local cmp_current=0
        local cmp_target=0

        [ -n "$bridge_version" ] || continue

        compare_versions "$bridge_version" "$current_version" || cmp_current=$?
        if [ "$cmp_current" -ne 1 ]; then
            continue
        fi

        compare_versions "$bridge_version" "$target_version" || cmp_target=$?
        if [ "$cmp_target" -eq 1 ]; then
            continue
        fi

        filtered_bridges+=("$bridge_version")
    done

    if [ "${#filtered_bridges[@]}" -gt 0 ]; then
        mapfile -t UPDATE_SEQUENCE < <(printf '%s\n' "${filtered_bridges[@]}" | sort -uV)
    fi

    if [ "${#UPDATE_SEQUENCE[@]}" -eq 0 ]; then
        UPDATE_SEQUENCE=("$target_version")
        return 0
    fi

    local last_index=$(( ${#UPDATE_SEQUENCE[@]} - 1 ))
    if [ "${UPDATE_SEQUENCE[$last_index]}" != "$target_version" ]; then
        UPDATE_SEQUENCE+=("$target_version")
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

stop_active_services_for_update() {
    log "Stopping active services before update..."

    systemctl stop openpath-sse-listener.service 2>/dev/null || true
    systemctl stop captive-portal-detector.service 2>/dev/null || true
    systemctl stop openpath-dnsmasq.timer 2>/dev/null || true
    systemctl stop dnsmasq-watchdog.timer 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true

    if command -v pkill >/dev/null 2>&1; then
        pkill -x dnsmasq 2>/dev/null || true
    fi

    if command -v fuser >/dev/null 2>&1; then
        fuser -k 53/udp 2>/dev/null || true
        fuser -k 53/tcp 2>/dev/null || true
    fi

    sleep 1
}

install_update() {
    local new_version="$1"
    local previous_version="$2"
    local target_package=""

    target_package=$(ensure_cached_package_for_version "$new_version" || true)
    if [ -z "$target_package" ] || [ ! -f "$target_package" ]; then
        log_error "Unable to cache target package for v${new_version}"
        return 1
    fi

    if [ "$previous_version" != "$new_version" ]; then
        if ! ensure_cached_package_for_version "$previous_version" >/dev/null 2>&1; then
            if [ "$UPDATE_SOURCE" = "api-manifest" ]; then
                log_error "Unable to cache rollback package for current version v${previous_version}"
                return 1
            fi
            log_warn "Rollback package for v${previous_version} is unavailable; continuing without versioned rollback"
        fi
    fi

    log "Package ready: $(du -h "$target_package" | cut -f1)"

    backup_config
    stop_active_services_for_update

    if ! install_deb_package_file "$target_package" "$new_version" "update"; then
        if [ "$previous_version" != "$new_version" ]; then
            log_warn "Install failed; attempting rollback to v${previous_version}"
            attempt_agent_package_rollback "$previous_version" || true
        fi
        return 1
    fi

    if ! finalize_updated_package "$new_version"; then
        if [ "$previous_version" != "$new_version" ]; then
            log_warn "Health checks failed after update; attempting rollback to v${previous_version}"
            attempt_agent_package_rollback "$previous_version" || true
        fi
        return 1
    fi

    cleanup_update_workspace

    log "✓ OpenPath updated to v${new_version}"
    echo ""
    echo "✓ Actualización completada: v${previous_version} → v${new_version}"
    echo "  Los servicios se han reiniciado automáticamente."
}

# =============================================================================
# Main
# =============================================================================

main() {
    local mode="update"
    local current_version=""

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

    current_version=$(read_installed_version)

    echo "OpenPath Self-Update"
    echo "  Current version: v${current_version}"
    echo ""

    # Get latest version and package source
    echo "Checking for updates..."
    refresh_update_metadata || {
        echo "✗ Cannot check for updates (manifest unreachable or invalid)"
        exit 1
    }

    echo "  Source:          ${UPDATE_SOURCE}"
    echo "  Latest version:  v${LATEST_VERSION}"
    echo ""

    # Compare versions
    local cmp_result=0
    compare_versions "$LATEST_VERSION" "$current_version" || cmp_result=$?

    local min_support_result=0
    compare_versions "$current_version" "$MIN_SUPPORTED_VERSION" || min_support_result=$?
    if [ "$min_support_result" -eq 2 ]; then
        echo "✗ Tu versión (v${current_version}) está por debajo del mínimo soportado para auto-update (v${MIN_SUPPORTED_VERSION})"
        exit 1
    fi

    resolve_update_sequence "$current_version" "$LATEST_VERSION"

    local min_direct_result=0
    compare_versions "$current_version" "$MIN_DIRECT_UPGRADE_VERSION" || min_direct_result=$?
    if [ "$min_direct_result" -eq 2 ] && [ "${#UPDATE_SEQUENCE[@]}" -le 1 ]; then
        echo "✗ Tu versión (v${current_version}) está por debajo del mínimo de actualización directa (v${MIN_DIRECT_UPGRADE_VERSION})"
        echo "  Se requiere una actualización puente o recuperación manual."
        exit 1
    fi

    if [ "${#UPDATE_SEQUENCE[@]}" -gt 1 ]; then
        echo "  Bridge path:     v$(printf '%s' "${UPDATE_SEQUENCE[0]}")"
        local sequence_index=1
        while [ "$sequence_index" -lt "${#UPDATE_SEQUENCE[@]}" ]; do
            printf ' -> v%s' "${UPDATE_SEQUENCE[$sequence_index]}"
            sequence_index=$((sequence_index + 1))
        done
        echo ""
        echo ""
    fi

    case "$cmp_result" in
        0)  # Equal
            if [ "$mode" = "force" ]; then
                echo "Same version installed. Forcing reinstall..."
            else
                echo "✓ Ya tienes la última versión (v${current_version})"
                exit 0
            fi
            ;;
        1)  # Latest is greater (update available)
            echo "⬆ Actualización disponible: v${current_version} → v${LATEST_VERSION}"
            ;;
        2)  # Current is greater (newer than release)
            if [ "$mode" = "force" ]; then
                echo "Current version is newer than release. Forcing reinstall..."
            else
                echo "✓ Tu versión (v${current_version}) es más reciente que el último release (v${LATEST_VERSION})"
                exit 0
            fi
            ;;
    esac

    # Check-only mode
    if [ "$mode" = "check" ]; then
        exit 0
    fi

    local target_version=""
    for target_version in "${UPDATE_SEQUENCE[@]}"; do
        local sequence_cmp=0

        if [ "$mode" = "force" ] && [ "$target_version" = "$LATEST_VERSION" ]; then
            install_update "$target_version" "$current_version"
            current_version=$(read_installed_version)
            continue
        fi

        compare_versions "$target_version" "$current_version" || sequence_cmp=$?
        if [ "$sequence_cmp" -ne 1 ]; then
            continue
        fi

        install_update "$target_version" "$current_version"
        current_version=$(read_installed_version)
    done
}

if [ "${OPENPATH_SELF_UPDATE_SOURCE_ONLY:-0}" = "1" ]; then
    return 0 2>/dev/null || exit 0
fi

main "$@"
