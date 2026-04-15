#!/bin/bash

################################################################################
# firewall-rule-helpers.sh - iptables rule wrapper helpers
################################################################################

add_critical_rule() {
    local desc="$1"
    shift

    if "$@" 2>/dev/null; then
        log_debug "✓ [CRITICAL] $desc"
        return 0
    fi

    log_error "FAILED [CRITICAL]: $desc"
    log_error "  Command: $*"
    return 1
}

add_important_rule() {
    local desc="$1"
    shift

    if "$@" 2>/dev/null; then
        log_debug "✓ [IMPORTANT] $desc"
        return 0
    fi

    log_warn "FAILED [IMPORTANT]: $desc (continuing)"
    return 0
}

add_optional_rule() {
    local desc="$1"
    shift

    if "$@" 2>/dev/null; then
        log_debug "✓ [OPTIONAL] $desc"
        return 0
    fi

    log_debug "SKIPPED [OPTIONAL]: $desc"
    return 0
}
