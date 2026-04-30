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

write_timeout_requires_kill_after() {
    local bin_dir="$1"
    local calls_file="$2"

    cat > "$bin_dir/timeout" <<EOF
#!/bin/bash
echo "\$*" >> "$calls_file"
case " \$* " in
    *" --kill-after=5s "*)
        shift
        shift
        exec "\$@"
        ;;
    *)
        echo "timeout missing --kill-after=5s" >&2
        exit 99
        ;;
esac
EOF
    chmod +x "$bin_dir/timeout"
}

write_timeout_runs_probe_then_times_out() {
    local bin_dir="$1"
    local calls_file="$2"

    cat > "$bin_dir/timeout" <<EOF
#!/bin/bash
echo "\$*" >> "$calls_file"
case " \$* " in
    *" --kill-after=5s "*)
        shift
        shift
        "\$@" || true
        exit 124
        ;;
    *)
        echo "timeout missing --kill-after=5s" >&2
        exit 99
        ;;
esac
EOF
    chmod +x "$bin_dir/timeout"
}

write_timeout_first_probe_exceeds_deadline_then_registers() {
    local bin_dir="$1"
    local calls_file="$2"

    cat > "$bin_dir/timeout" <<EOF
#!/bin/bash
echo "\$*" >> "$calls_file"
case " \$* " in
    *" --kill-after=5s "*)
        shift
        shift
        count_file="\${HOME:-}/.mozilla/firefox/openpath-test-timeout-count"
        mkdir -p "\$(dirname "\$count_file")"
        run_count=0
        if [ -f "\$count_file" ]; then
            run_count=\$(cat "\$count_file" 2>/dev/null || echo 0)
        fi
        run_count=\$((run_count + 1))
        echo "\$run_count" > "\$count_file"
        if [ "\$run_count" -eq 1 ]; then
            OPENPATH_FAKE_FIREFOX_MODE=policy-only "\$@" || true
            sleep 2
            exit 124
        fi
        "\$@" || true
        exit 124
        ;;
    *)
        echo "timeout missing --kill-after=5s" >&2
        exit 99
        ;;
esac
EOF
    chmod +x "$bin_dir/timeout"
}

write_fake_common_sh() {
    local target="$1"

    cat > "$target" <<'EOF'
#!/bin/bash
set -euo pipefail

export INSTALL_DIR="${INSTALL_DIR:-/usr/local/lib/openpath}"
export SCRIPTS_DIR="${SCRIPTS_DIR:-/usr/local/bin}"
ETC_CONFIG_DIR="${ETC_CONFIG_DIR:-/etc/openpath}"
VAR_STATE_DIR="${VAR_STATE_DIR:-/tmp/openpath-browser-setup-test-state-$$}"
LOG_FILE="${LOG_FILE:-/var/log/openpath.log}"
export FIREFOX_POLICIES="${FIREFOX_POLICIES:-/etc/firefox/policies/policies.json}"
export FIREFOX_EXTENSIONS_ROOT="${FIREFOX_EXTENSIONS_ROOT:-/usr/share/mozilla/extensions}"
export WHITELIST_URL_CONF="${WHITELIST_URL_CONF:-$ETC_CONFIG_DIR/whitelist-url.conf}"

log() { echo "$1"; }
log_error() { echo "$1" >&2; }

read_single_line_file() {
    local file="$1"
    [ -r "$file" ] || return 1
    tr -d '\r\n' < "$file"
}

is_tokenized_whitelist_url() {
    local url="$1"
    [[ "$url" =~ /w/[^/]+/whitelist\.txt($|[?#].*) ]]
}

is_openpath_request_setup_complete() {
    local api_url=""
    local whitelist_url=""
    local classroom=""
    local classroom_id=""
    api_url=$(read_single_line_file "$ETC_CONFIG_DIR/api-url.conf" || true)
    whitelist_url=$(read_single_line_file "$WHITELIST_URL_CONF" || true)
    classroom=$(read_single_line_file "$ETC_CONFIG_DIR/classroom.conf" || true)
    classroom_id=$(read_single_line_file "$ETC_CONFIG_DIR/classroom-id.conf" || true)

    [ -n "$api_url" ] || return 1
    [ -n "$whitelist_url" ] && is_tokenized_whitelist_url "$whitelist_url" || return 1
    [ -n "$classroom" ] || [ -n "$classroom_id" ]
}

describe_openpath_request_setup_missing() {
    echo "request setup incomplete"
}

require_openpath_request_setup_complete() {
    if is_openpath_request_setup_complete; then
        return 0
    fi
    echo "request setup incomplete" >&2
    return 1
}
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
    cat > "$firefox_dir/firefox" <<'FIREFOX'
#!/bin/bash
profile_root="\${HOME:-}/.mozilla/firefox/openpath-test.default"
explicit_profile=0
while [ "\$#" -gt 0 ]; do
    case "\$1" in
        --profile|-profile|--Profile|-Profile)
            if [ -n "\${2:-}" ]; then
                profile_root="\$2"
                explicit_profile=1
                shift 2
                continue
            fi
            ;;
    esac
    shift
done
mkdir -p "\$profile_root"
count_file="\${HOME:-}/.mozilla/firefox/openpath-test-run-count"
mkdir -p "\$(dirname "\$count_file")"
run_count=0
if [ -f "\$count_file" ]; then
    run_count=\$(cat "\$count_file" 2>/dev/null || echo 0)
fi
run_count=\$((run_count + 1))
echo "\$run_count" > "\$count_file"
case "\${OPENPATH_FAKE_FIREFOX_MODE:-success}" in
    policy-only|missing-firefox)
        ;;
    snap-registration)
        snap_profile_root="\${HOME:-}/snap/firefox/common/.mozilla/firefox/openpath-test.default"
        mkdir -p "\$snap_profile_root"
        cat > "\$snap_profile_root/extensions.json" <<'JSON'
{"addons":[{"id":"monitor-bloqueos@openpath","rootURI":"moz-extension://openpath-test-uuid/"}]}
JSON
        ;;
    delayed-registration)
        if [ "\$run_count" -ge 2 ]; then
            cat > "\$profile_root/extensions.json" <<'JSON'
{"addons":[{"id":"monitor-bloqueos@openpath","rootURI":"moz-extension://openpath-test-uuid/"}]}
JSON
        fi
        ;;
    third-registration)
        if [ "\$run_count" -ge 3 ]; then
            cat > "\$profile_root/extensions.json" <<'JSON'
{"addons":[{"id":"monitor-bloqueos@openpath","rootURI":"moz-extension://openpath-test-uuid/"}]}
JSON
        fi
        ;;
    requires-profile-registration)
        if [ "\$explicit_profile" -eq 1 ]; then
            cat > "\$profile_root/extensions.json" <<'JSON'
{"addons":[{"id":"monitor-bloqueos@openpath","rootURI":"moz-extension://openpath-test-uuid/"}]}
JSON
        fi
        ;;
    *)
        cat > "\$profile_root/extensions.json" <<'JSON'
{"addons":[{"id":"monitor-bloqueos@openpath","rootURI":"moz-extension://openpath-test-uuid/"}]}
JSON
        ;;
esac
exit 0
FIREFOX
    chmod +x "$firefox_dir/firefox"
    return 0
}

install_browser_integrations() {
    local ext_source="$1"
    local release_source="$2"
    shift 2
    echo "install_browser_integrations:\$ext_source|\$release_source|\$*" >> "$calls_file"

    if [ "$mode" = "missing-native" ]; then
        if [[ " \$* " == *" --native-host-best-effort "* ]]; then
            return 0
        fi
        echo "native host missing" >&2
        return 1
    fi

    if [[ " \$* " == *" --native-host "* ]]; then
        local native_manifest_dir="\${FIREFOX_NATIVE_HOST_DIR:-$TEST_TMP_DIR/lib/mozilla/native-messaging-hosts}"
        local native_script_dir="\${OPENPATH_NATIVE_HOST_INSTALL_DIR:-$TEST_TMP_DIR/local/lib/openpath}"
        mkdir -p "\$native_manifest_dir" "\$native_script_dir"
        cat > "\$native_manifest_dir/whitelist_native_host.json" <<'JSON'
{"name":"whitelist_native_host","path":"/usr/local/lib/openpath/openpath-native-host.py","type":"stdio","allowed_extensions":["monitor-bloqueos@openpath"]}
JSON
        echo '#!/usr/bin/env python3' > "\$native_script_dir/openpath-native-host.py"
        chmod +x "\$native_script_dir/openpath-native-host.py"
    fi

    if [ "$mode" = "success" ]; then
        local app_id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
        local ext_dir="$ext_root/\$app_id/monitor-bloqueos@openpath"
        mkdir -p "\$ext_dir"
        touch "\$ext_dir/manifest.json"
        mkdir -p "\$(dirname "$policies_file")"
        cat > "$policies_file" <<'JSON'
{"policies":{"ExtensionSettings":{"monitor-bloqueos@openpath":{"installation_mode":"force_installed","install_url":"https://control.example/api/extensions/firefox/openpath.xpi"}}}}
JSON
    elif [ "$mode" = "managed-api" ]; then
        mkdir -p "\$(dirname "$policies_file")"
        cat > "$policies_file" <<'JSON'
{"policies":{"ExtensionSettings":{"monitor-bloqueos@openpath":{"installation_mode":"force_installed","install_url":"https://control.example/api/extensions/firefox/openpath.xpi"}}}}
JSON
    elif [ "$mode" = "policy-only" ]; then
        mkdir -p "\$(dirname "$policies_file")"
        cat > "$policies_file" <<'JSON'
{"policies":{"ExtensionSettings":{"monitor-bloqueos@openpath":{"installation_mode":"force_installed","install_url":"https://control.example/api/extensions/firefox/openpath.xpi"}}}}
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

force_browser_close() {
    return 0
}

get_firefox_extensions_root() {
    echo "$ext_root"
}

get_firefox_native_host_dir() {
    echo "\${FIREFOX_NATIVE_HOST_DIR:-$TEST_TMP_DIR/lib/mozilla/native-messaging-hosts}"
}

get_native_host_install_dir() {
    echo "\${OPENPATH_NATIVE_HOST_INSTALL_DIR:-$TEST_TMP_DIR/local/lib/openpath}"
}

run_browser_json_helper() {
    python3 "$PROJECT_DIR/linux/libexec/browser-json.py" "\$@"
}
EOF
}

@test "browser request readiness facts reject policy-only firefox setup" {
    local policies_file="$TEST_TMP_DIR/firefox-policies.json"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"
    mkdir -p "$(dirname "$policies_file")" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    cat > "$policies_file" <<'JSON'
{"policies":{"ExtensionSettings":{"monitor-bloqueos@openpath":{"installation_mode":"force_installed","install_url":"https://control.example/api/extensions/firefox/openpath.xpi"}}}}
JSON

    export ETC_CONFIG_DIR="$etc_dir"
    export WHITELIST_URL_CONF="$etc_dir/whitelist-url.conf"
    export FIREFOX_POLICIES="$policies_file"
    export FIREFOX_EXTENSION_ID="monitor-bloqueos@openpath"

    read_single_line_file() {
        local file="$1"
        [ -r "$file" ] || return 1
        tr -d '\r\n' < "$file"
    }
    log() { echo "$1"; }
    log_error() { echo "$1" >&2; }
    detect_firefox_dir() { echo "$TEST_TMP_DIR/usr/lib/firefox-esr"; }
    resolve_firefox_extensions_root_dir() { echo "$TEST_TMP_DIR/share/mozilla/extensions"; }
    resolve_firefox_binary_path() { echo "$TEST_TMP_DIR/usr/lib/firefox-esr/firefox"; }
    verify_firefox_extension_registered() { return 1; }
    get_firefox_native_host_dir() { echo "$TEST_TMP_DIR/lib/mozilla/native-messaging-hosts"; }
    get_native_host_install_dir() { echo "$TEST_TMP_DIR/local/lib/openpath"; }
    run_browser_json_helper() {
        python3 "$PROJECT_DIR/linux/libexec/browser-json.py" "$@"
    }

    mkdir -p "$TEST_TMP_DIR/usr/lib/firefox-esr" "$TEST_TMP_DIR/share/mozilla/extensions" "$TEST_TMP_DIR/lib/mozilla/native-messaging-hosts" "$TEST_TMP_DIR/local/lib/openpath"
    touch "$TEST_TMP_DIR/usr/lib/firefox-esr/firefox"
    touch "$TEST_TMP_DIR/lib/mozilla/native-messaging-hosts/whitelist_native_host.json"
    touch "$TEST_TMP_DIR/local/lib/openpath/openpath-native-host.py"

    source "$PROJECT_DIR/linux/lib/browser-request-readiness.sh"

    run collect_openpath_browser_request_readiness
    [ "$status" -eq 1 ]
    [[ "$output" == *"ready=false"* ]]
    [[ "$output" != *"fact.firefox_policy=ready"* ]]
    [[ "$output" == *"fact.firefox_registration=missing"* ]]
    [[ "$output" == *"failure_reason=firefox_registration_missing"* ]]
}

@test "browser request readiness facts require linux native host proof" {
    local policies_file="$TEST_TMP_DIR/firefox-policies.json"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local app_id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
    mkdir -p "$(dirname "$policies_file")" "$etc_dir" "$ext_root/$app_id/monitor-bloqueos@openpath" "$TEST_TMP_DIR/usr/lib/firefox-esr"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    touch "$TEST_TMP_DIR/usr/lib/firefox-esr/firefox"
    touch "$ext_root/$app_id/monitor-bloqueos@openpath/manifest.json"
    cat > "$policies_file" <<'JSON'
{"policies":{"ExtensionSettings":{"monitor-bloqueos@openpath":{"installation_mode":"force_installed"}}}}
JSON

    export ETC_CONFIG_DIR="$etc_dir"
    export WHITELIST_URL_CONF="$etc_dir/whitelist-url.conf"
    export FIREFOX_POLICIES="$policies_file"
    export FIREFOX_EXTENSION_ID="monitor-bloqueos@openpath"

    read_single_line_file() {
        local file="$1"
        [ -r "$file" ] || return 1
        tr -d '\r\n' < "$file"
    }
    log() { echo "$1"; }
    log_error() { echo "$1" >&2; }
    detect_firefox_dir() { echo "$TEST_TMP_DIR/usr/lib/firefox-esr"; }
    resolve_firefox_extensions_root_dir() { echo "$ext_root"; }
    resolve_firefox_binary_path() { echo "$TEST_TMP_DIR/usr/lib/firefox-esr/firefox"; }
    verify_firefox_extension_registered() { return 0; }
    get_firefox_native_host_dir() { echo "$TEST_TMP_DIR/lib/mozilla/native-messaging-hosts"; }
    get_native_host_install_dir() { echo "$TEST_TMP_DIR/local/lib/openpath"; }
    run_browser_json_helper() {
        python3 "$PROJECT_DIR/linux/libexec/browser-json.py" "$@"
    }

    source "$PROJECT_DIR/linux/lib/browser-request-readiness.sh"

    run collect_openpath_browser_request_readiness
    [ "$status" -eq 1 ]
    [[ "$output" == *"fact.firefox_registration=ready"* ]]
    [[ "$output" == *"fact.firefox_native_host=missing"* ]]
    [[ "$output" == *"failure_reason=firefox_native_host_missing"* ]]
}

@test "openpath-browser-setup installs firefox integrations without applying Firefox browser policies" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    rm -rf "$TEST_TMP_DIR/home" "$fake_install" "$fake_scripts" "$firefox_dir" "$ext_root" "$(dirname "$policies_file")"
    rm -rf "$TEST_TMP_DIR/home" "$fake_install" "$fake_scripts" "$firefox_dir" "$ext_root" "$(dirname "$policies_file")"
    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "success"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]

    run cat "$calls_file"
    [ "$status" -eq 0 ]
    [[ "$output" == *"install_firefox_esr"* ]]
    [[ "$output" == *"install_browser_integrations:"* ]]
    [[ "$output" == *"--native-host"* ]]
    [[ "$output" == *"--firefox-required"* ]]
    [[ "$output" == *"--chromium-best-effort"* ]]
    [[ "$output" == *"--native-host-required"* ]]
    [[ "$output" != *"apply_search_engine_policies"* ]]
}

@test "source installer no longer labels a browser policy application step" {
    run grep -nF 'Aplicando politicas de navegadores' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -ne 0 ]
}

@test "openpath-browser-setup fails before installing integrations when request setup is incomplete" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "success"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 1 ]
    [[ "$output" == *"request setup"* ]]
    if [ -f "$calls_file" ]; then
        run grep -n "install_browser_integrations" "$calls_file"
        [ "$status" -ne 0 ]
    fi
}

@test "openpath-browser-setup can install only Firefox before request setup exists" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "success"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh" --install-firefox-only

    [ "$status" -eq 0 ]
    run cat "$calls_file"
    [ "$status" -eq 0 ]
    [[ "$output" == *"install_firefox_esr"* ]]
    [[ "$output" != *"install_browser_integrations:"* ]]
    [[ "$output" != *"apply_search_engine_policies"* ]]
}

@test "openpath-browser-setup accepts managed api firefox policy payload" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "managed-api"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FAKE_FIREFOX_MODE="managed-api" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Firefox browser setup is ready"* ]]
}

@test "openpath-browser-setup fails when policy exists but firefox never registers extension" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"
    local expected_activation_user=""

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    expected_activation_user="$(id -un)"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "policy-only"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FAKE_FIREFOX_MODE="policy-only" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="1" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 1 ]
    [[ "$output" == *"Firefox did not register managed extension"* ]]
    [[ "$output" == *"probe_attempt=1"* ]]
    [[ "$output" == *"activation_user=$expected_activation_user"* ]]
    [[ "$output" == *"profile_home=$TEST_TMP_DIR/home"* ]]
    [[ "$output" == *"registration_source=missing"* ]]
}

@test "openpath-browser-setup activates firefox with a persistent profile path" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"
    local expected_profile="$TEST_TMP_DIR/home/.mozilla/firefox/openpath.default"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "managed-api"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FAKE_FIREFOX_MODE="requires-profile-registration" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="1" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Firefox browser setup is ready"* ]]
    [ -f "$expected_profile/extensions.json" ]
}

@test "openpath-browser-setup retries firefox activation while waiting for managed extension registration" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "managed-api"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FAKE_FIREFOX_MODE="delayed-registration" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="3" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Firefox browser setup is ready"* ]]
    [[ "$output" == *"registration_source=extensions.json"* ]]
    [ "$(cat "$TEST_TMP_DIR/home/.mozilla/firefox/openpath-test-run-count")" -ge 2 ]
}

@test "openpath-browser-setup hard-kills firefox activation probes after timeout" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local timeout_calls_file="$TEST_TMP_DIR/timeout.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    write_mock_id "$bin_dir"
    write_timeout_requires_kill_after "$bin_dir" "$timeout_calls_file"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "managed-api"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FAKE_FIREFOX_MODE="delayed-registration" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="3" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]
    grep -F -- '--kill-after=5s' "$timeout_calls_file"
    grep -F -- ' 60s ' "$timeout_calls_file"
}

@test "openpath-browser-setup accepts registration written before activation probe timeout" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local timeout_calls_file="$TEST_TMP_DIR/timeout.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/class""room-id.conf"
    write_mock_id "$bin_dir"
    write_timeout_runs_probe_then_times_out "$bin_dir" "$timeout_calls_file"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "managed-api"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FAKE_FIREFOX_MODE="success" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="3" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Firefox browser setup is ready"* ]]
    grep -F -- '--kill-after=5s' "$timeout_calls_file"
}

@test "openpath-browser-setup retries when first activation timeout exceeds registration deadline" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local timeout_calls_file="$TEST_TMP_DIR/timeout.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/class""room-id.conf"
    write_mock_id "$bin_dir"
    write_timeout_first_probe_exceeds_deadline_then_registers "$bin_dir" "$timeout_calls_file"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "managed-api"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FAKE_FIREFOX_MODE="delayed-registration" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="1" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Firefox browser setup is ready"* ]]
    [ "$(wc -l < "$timeout_calls_file")" -ge 2 ]
}

@test "openpath-browser-setup allows a third firefox activation probe for slow managed extension registration" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/class""room-id.conf"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "managed-api"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FAKE_FIREFOX_MODE="third-registration" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="1" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Firefox browser setup is ready"* ]]
    [ "$(cat "$TEST_TMP_DIR/home/.mozilla/firefox/openpath-test-run-count")" -ge 3 ]
}

@test "openpath-browser-setup accepts registration written under snap firefox profile root" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "managed-api"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FAKE_FIREFOX_MODE="snap-registration" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_EXTENSION_REGISTRATION_TIMEOUT_SECONDS="1" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Firefox browser setup is ready"* ]]
}

@test "openpath-browser-setup requires native host for firefox managed blocking" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "missing-native"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 1 ]
    [[ "$output" == *"native host missing"* ]]
    [[ "$output" == *"Failed to configure Firefox browser integrations"* ]]
}

@test "openpath-browser-setup fails when firefox integration is still missing after reconciliation" {
    local fake_install="$TEST_TMP_DIR/install"
    local fake_scripts="$TEST_TMP_DIR/scripts"
    local firefox_dir="$TEST_TMP_DIR/usr/lib/firefox-esr"
    local ext_root="$TEST_TMP_DIR/share/mozilla/extensions"
    local policies_file="$TEST_TMP_DIR/etc/firefox/policies/policies.json"
    local calls_file="$TEST_TMP_DIR/browser-setup.calls"
    local bin_dir="$TEST_TMP_DIR/bin"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$fake_install/lib" "$fake_scripts" "$ext_root" "$bin_dir" "$etc_dir"
    printf '%s' 'https://control.example' > "$etc_dir/api-url.conf"
    printf '%s' 'https://control.example/w/token123/whitelist.txt' > "$etc_dir/whitelist-url.conf"
    printf '%s' 'cls_123' > "$etc_dir/classroom-id.conf"
    write_mock_id "$bin_dir"
    write_fake_common_sh "$fake_install/lib/common.sh"
    write_fake_browser_sh "$fake_install/lib/browser.sh" "$calls_file" "$firefox_dir" "$ext_root" "$policies_file" "missing-firefox"

    run env \
        PATH="$bin_dir:$PATH" \
        HOME="$TEST_TMP_DIR/home" \
        OPENPATH_FIREFOX_PROFILE_HOME="$TEST_TMP_DIR/home" \
        INSTALL_DIR="$fake_install" \
        SCRIPTS_DIR="$fake_scripts" \
        ETC_CONFIG_DIR="$etc_dir" \
        FIREFOX_POLICIES="$policies_file" \
        FIREFOX_EXTENSIONS_ROOT="$ext_root" \
        bash "$PROJECT_DIR/linux/scripts/runtime/openpath-browser-setup.sh"

    [ "$status" -eq 1 ]
}
