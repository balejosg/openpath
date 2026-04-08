#!/usr/bin/env bats
################################################################################
# browser_setup.bats - Tests for the Linux browser setup helper
################################################################################

load 'test_helper'

write_mock_id() {
    local bin_dir="$1"

    cat > "$bin_dir/id" <<'EOF'
#!/bin/bash
if [ "${1:-}" = "-u" ]; then
    echo 0
    exit 0
fi

/usr/bin/id "$@"
EOF
    chmod +x "$bin_dir/id"
}

write_fake_common_sh() {
    local target="$1"

    cat > "$target" <<'EOF'
#!/bin/bash
set -euo pipefail

export INSTALL_DIR="${INSTALL_DIR:-/usr/local/lib/openpath}"
export SCRIPTS_DIR="${SCRIPTS_DIR:-/usr/local/bin}"
ETC_CONFIG_DIR="${ETC_CONFIG_DIR:-/etc/openpath}"
VAR_STATE_DIR="${VAR_STATE_DIR:-/var/lib/openpath}"
LOG_FILE="${LOG_FILE:-/var/log/openpath.log}"
export FIREFOX_POLICIES="${FIREFOX_POLICIES:-/etc/firefox/policies/policies.json}"
export FIREFOX_EXTENSIONS_ROOT="${FIREFOX_EXTENSIONS_ROOT:-/usr/share/mozilla/extensions}"

log() { echo "$1"; }
log_error() { echo "$1" >&2; }
EOF
}

write_fake_browser_sh() {
    local target="$1"
    local calls_file="$2"
    local firefox_dir="$3"
    local ext_root="$4"
    local policies_file="$5"
    local mode="$6"

    cat > "$target" <<EOF
#!/bin/bash

install_firefox_esr() {
    echo "install_firefox_esr" >> "$calls_file"
    mkdir -p "$firefox_dir"
    touch "$firefox_dir/firefox"
    return 0
}

install_browser_integrations() {
    echo "install_browser_integrations:\$1|\$2|\$3|\$4|\$5|\$6" >> "$calls_file"

    if [ "$mode" = "success" ]; then
        local app_id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
        local ext_dir="$ext_root/\$app_id/monitor-bloqueos@openpath"
        mkdir -p "\$ext_dir"
        touch "\$ext_dir/manifest.json"
        mkdir -p "\$(dirname "$policies_file")"
        cat > "$policies_file" <<'JSON'
{"policies":{"ExtensionSettings":{"monitor-bloqueos@openpath":{"installation_mode":"force_installed"}}}}
JSON
    fi

    return 0
}

apply_search_engine_policies() {
    echo "apply_search_engine_policies" >> "$calls_file"
    return 0
}

detect_firefox_dir() {
    if [ "$mode" = "missing-firefox" ]; then
        return 1
    fi

    echo "$firefox_dir"
    return 0
}

get_firefox_extensions_root() {
    echo "$ext_root"
}
EOF
}

@test "openpath-browser-setup installs firefox integrations and policies" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "success"

    run env \
        PATH="$bin_dir:$PATH" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]

    mapfile -t calls < "$calls_file"
    [ "${calls[0]}" = "install_firefox_esr" ]
    [ "${calls[1]}" = "install_browser_integrations:/usr/share/openpath/firefox-extension|/usr/share/openpath/firefox-release|false|false|true|false" ]
    [ "${calls[2]}" = "apply_search_engine_policies" ]
}

@test "openpath-browser-setup fails when firefox integration is still missing after reconciliation" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "missing-firefox"

    run env \
        PATH="$bin_dir:$PATH" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 1 ]
}
