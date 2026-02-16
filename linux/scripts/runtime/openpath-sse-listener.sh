#!/bin/bash

# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.

################################################################################
# openpath-sse-listener.sh - SSE listener daemon for instant rule updates
# Part of the OpenPath DNS system
#
# Maintains a persistent connection to the API's Server-Sent Events (SSE)
# endpoint. When a whitelist rule change is detected, immediately triggers
# openpath-update.sh to apply the new rules without waiting for the
# 15-minute fallback timer.
#
# Reconnects automatically with exponential backoff on connection failure.
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

OPENPATH_ETC="${OPENPATH_ETC:-/etc/openpath}"
OPENPATH_RUN="${OPENPATH_RUN:-/run/openpath}"
PID_FILE="${OPENPATH_RUN}/sse-listener.pid"
LAST_UPDATE_FILE="${OPENPATH_RUN}/sse-last-update"
UPDATE_SCRIPT="/usr/local/bin/openpath-update.sh"

# Read machine token from the whitelist URL configuration
get_machine_token() {
    local whitelist_url_file="${OPENPATH_ETC}/whitelist-url.conf"

    if [ ! -f "$whitelist_url_file" ]; then
        log "⚠ No whitelist-url.conf found, cannot start SSE listener"
        return 1
    fi

    local whitelist_url
    whitelist_url=$(cat "$whitelist_url_file" 2>/dev/null | tr -d '[:space:]')

    if [ -z "$whitelist_url" ]; then
        log "⚠ Empty whitelist URL, cannot start SSE listener"
        return 1
    fi

    # Extract token from URL: /w/<TOKEN>/whitelist.txt
    local token
    token=$(echo "$whitelist_url" | grep -oP '/w/\K[^/]+' 2>/dev/null || true)

    if [ -z "$token" ]; then
        log "⚠ Cannot extract machine token from whitelist URL"
        return 1
    fi

    echo "$token"
}

# Derive the SSE endpoint URL from the whitelist URL
get_sse_url() {
    local whitelist_url_file="${OPENPATH_ETC}/whitelist-url.conf"
    local whitelist_url
    whitelist_url=$(cat "$whitelist_url_file" 2>/dev/null | tr -d '[:space:]')

    # Extract base URL (everything before /w/)
    local base_url
    base_url=$(echo "$whitelist_url" | grep -oP '^https?://[^/]+' 2>/dev/null || true)

    if [ -z "$base_url" ]; then
        log "⚠ Cannot extract base URL from whitelist URL"
        return 1
    fi

    echo "${base_url}/api/machines/events"
}

# =============================================================================
# Update Trigger (with debounce)
# =============================================================================

trigger_update() {
    local now
    now=$(date +%s)

    # Debounce: skip if we updated recently
    if [ -f "$LAST_UPDATE_FILE" ]; then
        local last_update
        last_update=$(cat "$LAST_UPDATE_FILE" 2>/dev/null || echo "0")
        local elapsed=$((now - last_update))

        if [ "$elapsed" -lt "${SSE_UPDATE_COOLDOWN:-10}" ]; then
            log "↳ SSE: Skipping update (last update ${elapsed}s ago, cooldown ${SSE_UPDATE_COOLDOWN:-10}s)"
            return 0
        fi
    fi

    log "⚡ SSE: Whitelist change detected — triggering immediate update"
    echo "$now" > "$LAST_UPDATE_FILE"

    # Run update in background so we don't block the SSE listener
    if [ -x "$UPDATE_SCRIPT" ]; then
        "$UPDATE_SCRIPT" &
    else
        log "⚠ SSE: Update script not found at $UPDATE_SCRIPT"
    fi
}

# =============================================================================
# SSE Connection Loop
# =============================================================================

run_sse_listener() {
    local sse_url
    sse_url=$(get_sse_url) || exit 1

    local backoff="${SSE_RECONNECT_MIN:-5}"
    local max_backoff="${SSE_RECONNECT_MAX:-60}"

    log "✓ SSE listener starting (endpoint: ${sse_url})"

    # Ensure runtime directory exists
    mkdir -p "$OPENPATH_RUN"
    echo $$ > "$PID_FILE"

    # Clean up PID file on exit
    trap 'rm -f "$PID_FILE"; log "SSE listener stopped"' EXIT

    while true; do
        log "↳ SSE: Connecting..."

        # Use curl in streaming mode (-N disables output buffering)
        # --max-time 0 means no timeout (keep connection open forever)
        # -s silent mode, -S show errors
        # --retry 0 so curl doesn't retry internally (we handle reconnects)
        local token
        token=$(get_machine_token) || exit 1

        curl -N -sS \
            --retry 0 \
            --connect-timeout 15 \
            -H "Authorization: Bearer $token" \
            "$sse_url" 2>/dev/null | while IFS= read -r line; do

            # Reset backoff on any successful data
            backoff="${SSE_RECONNECT_MIN:-5}"

            # SSE format: "data: {json}\n\n"
            if [[ "$line" == data:* ]]; then
                local payload="${line#data: }"

                # Check for whitelist-changed event
                if echo "$payload" | grep -q '"whitelist-changed"' 2>/dev/null; then
                    trigger_update
                elif echo "$payload" | grep -q '"connected"' 2>/dev/null; then
                    log "✓ SSE: Connected to API — listening for rule changes"
                fi
            fi
        done

        # curl exited (connection lost or server closed)
        local exit_code=$?
        log "⚠ SSE: Connection lost (exit code: ${exit_code}) — reconnecting in ${backoff}s"

        sleep "$backoff"

        # Exponential backoff (capped at max)
        backoff=$((backoff * 2))
        if [ "$backoff" -gt "$max_backoff" ]; then
            backoff="$max_backoff"
        fi
    done
}

# =============================================================================
# Main
# =============================================================================

# Ensure we're running as root (required for systemd services)
if [ "$(id -u)" -ne 0 ] && [ "${OPENPATH_TEST:-}" != "1" ]; then
    echo "Error: This script must be run as root" >&2
    exit 1
fi

run_sse_listener
