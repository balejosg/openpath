#!/bin/bash

################################################################################
# browser-process.sh - Browser process lifecycle helpers
################################################################################

force_browser_close() {
    log "Closing browsers..."

    local closed=0

    for pattern in "firefox" "chromium" "chrome"; do
        if pgrep -f "$pattern" >/dev/null 2>&1; then
            log "Detectado proceso: $pattern - enviando SIGTERM..."
            pkill -TERM -f "$pattern" 2>/dev/null || true
            closed=$((closed + 1))
        fi
    done

    if [ "$closed" -gt 0 ]; then
        log "Waiting for $closed browser(s) to close..."
        local wait_retries=5
        while [ "$wait_retries" -gt 0 ]; do
            local still_running=0
            for pattern in "firefox" "chromium" "chrome"; do
                if pgrep -f "$pattern" >/dev/null 2>&1; then
                    still_running=1
                    break
                fi
            done
            [ "$still_running" -eq 0 ] && break
            sleep 1
            wait_retries=$((wait_retries - 1))
        done

        for pattern in "firefox" "chromium" "chrome"; do
            if pgrep -f "$pattern" >/dev/null 2>&1; then
                log "Forcing close (SIGKILL): $pattern"
                pkill -9 -f "$pattern" 2>/dev/null || true
            fi
        done

        log "✓ Browsers closed"
    else
        log "No open browsers detected"
    fi
}
