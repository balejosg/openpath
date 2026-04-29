#!/bin/bash

################################################################################
# sse-update-coalescer.sh - Coalesces SSE-triggered whitelist updates
################################################################################

sse_last_update_file() {
    printf '%s/sse-last-update\n' "${OPENPATH_RUN:-/run/openpath}"
}

sse_pending_update_file() {
    printf '%s/sse-pending-update\n' "${OPENPATH_RUN:-/run/openpath}"
}

sse_update_cooldown() {
    local cooldown="${SSE_UPDATE_COOLDOWN:-10}"
    if [[ "$cooldown" =~ ^[0-9]+$ ]]; then
        printf '%s\n' "$cooldown"
    else
        printf '10\n'
    fi
}

sse_read_last_update() {
    local last_update_file
    last_update_file="$(sse_last_update_file)"

    if [ ! -f "$last_update_file" ]; then
        printf '0\n'
        return 0
    fi

    local last_update
    last_update="$(cat "$last_update_file" 2>/dev/null || true)"
    if [[ "$last_update" =~ ^[0-9]+$ ]]; then
        printf '%s\n' "$last_update"
    else
        printf '0\n'
    fi
}

sse_run_update_now() {
    local update_command="$1"
    local now="${2:-$(date +%s)}"
    local last_update_file pending_update_file
    last_update_file="$(sse_last_update_file)"
    pending_update_file="$(sse_pending_update_file)"

    mkdir -p "${OPENPATH_RUN:-/run/openpath}"
    rm -f "$pending_update_file"

    log "⚡ SSE: Whitelist change detected — triggering immediate update"
    echo "$now" > "$last_update_file"

    if [ -x "$update_command" ]; then
        "$update_command" &
    else
        log "⚠ SSE: Update script not found at $update_command"
    fi
}

sse_schedule_deferred_update() {
    local update_command="$1"
    local delay="$2"
    local pending_update_file
    pending_update_file="$(sse_pending_update_file)"

    if [ -f "$pending_update_file" ]; then
        log "↳ SSE: Deferred update already scheduled"
        return 0
    fi

    mkdir -p "${OPENPATH_RUN:-/run/openpath}"
    date +%s > "$pending_update_file"
    log "↳ SSE: Scheduling deferred update in ${delay}s"

    (
        sleep "$delay"
        rm -f "$pending_update_file"
        sse_trigger_update "$update_command"
    ) &
}

sse_trigger_update() {
    local update_command="$1"
    local now="${2:-$(date +%s)}"
    local cooldown last_update elapsed
    cooldown="$(sse_update_cooldown)"
    last_update="$(sse_read_last_update)"

    elapsed=$((now - last_update))
    if [ "$elapsed" -lt 0 ]; then
        elapsed="$cooldown"
    fi

    if [ "$elapsed" -lt "$cooldown" ]; then
        local remaining=$((cooldown - elapsed))
        log "↳ SSE: Deferring update (last update ${elapsed}s ago, cooldown ${cooldown}s)"
        sse_schedule_deferred_update "$update_command" "$remaining"
        return 0
    fi

    sse_run_update_now "$update_command" "$now"
}
