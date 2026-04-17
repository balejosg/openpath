#!/bin/bash
################################################################################
# install-helpers.sh - Shared installer helper functions
################################################################################

_install_helpers_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=apt.sh
source "$_install_helpers_dir/apt.sh"

log_verbose() {
    if [ "${VERBOSE:-false}" = true ]; then
        printf '%s\n' "$*"
    fi
}

log_notice() {
    printf '%s\n' "$*"
}

show_progress() {
    openpath_show_progress "$1" "$2" "$3" "${VERBOSE:-false}"
}

replay_quiet_warnings() {
    local output_file="$1"
    if grep -Eq 'ADVERTENCIA|WARNING|WARN|ERROR|Error|error|fall[oó]|fallida|fallido|no pudo|no se pudo|⚠|✗' "$output_file"; then
        [ -t 1 ] && printf '\n'
        grep -E 'ADVERTENCIA|WARNING|WARN|ERROR|Error|error|fall[oó]|fallida|fallido|no pudo|no se pudo|⚠|✗' "$output_file"
    fi
}

run_quietly() {
    local output_file
    output_file="$(mktemp)"

    if "$@" >"$output_file" 2>&1; then
        replay_quiet_warnings "$output_file"
        rm -f "$output_file"
        return 0
    fi

    [ -t 1 ] && printf '\n'
    cat "$output_file"
    rm -f "$output_file"
    return 1
}

run_installer_step() {
    local current="$1"
    local total="$2"
    local label="$3"
    local step_function="$4"

    show_progress "$current" "$total" "$label"
    if [ "${VERBOSE:-false}" = true ]; then
        "$step_function"
    else
        run_quietly "$step_function"
    fi
}
