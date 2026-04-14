#!/bin/bash
################################################################################
# install-helpers.sh - Shared installer helper functions
################################################################################

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

reset_apt_package_indexes() {
    apt-get clean >/dev/null 2>&1 || true
    rm -rf /var/lib/apt/lists/*
    mkdir -p /var/lib/apt/lists/partial
}

apt_update_with_retry() {
    local attempt
    local max_attempts=3

    for attempt in $(seq 1 "$max_attempts"); do
        reset_apt_package_indexes

        if apt-get -o Acquire::Retries=3 update -qq; then
            return 0
        fi

        if [ "$attempt" -lt "$max_attempts" ]; then
            echo "  ! apt-get update falló (intento ${attempt}/${max_attempts}); reintentando..."
            sleep "$attempt"
        fi
    done

    echo "  ✗ apt-get update falló tras ${max_attempts} intentos"
    return 1
}

apt_install_with_retry() {
    local package_group="$1"
    shift

    local attempt
    local max_attempts=3

    for attempt in $(seq 1 "$max_attempts"); do
        if "$@" >/dev/null; then
            return 0
        fi

        if [ "$attempt" -lt "$max_attempts" ]; then
            echo "  ! Instalación de ${package_group} falló (intento ${attempt}/${max_attempts}); refrescando índices..."
            apt_update_with_retry
        fi
    done

    echo "  ✗ Instalación de ${package_group} falló tras ${max_attempts} intentos"
    return 1
}
