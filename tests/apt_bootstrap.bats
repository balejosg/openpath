#!/usr/bin/env bats
################################################################################
# apt_bootstrap.bats - Behavior tests for apt-bootstrap browser setup flow
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

write_mock_apt_get() {
    local bin_dir="$1"
    local log_file="$2"

    cat > "$bin_dir/apt-get" <<EOF
#!/bin/bash
echo "apt-get:\$*" >> "$log_file"
exit 0
EOF
    chmod +x "$bin_dir/apt-get"
}

write_mock_apt_get_rejecting_legacy_source() {
    local bin_dir="$1"
    local log_file="$2"
    local sources_path="$3"

    cat > "$bin_dir/apt-get" <<EOF
#!/bin/bash
echo "apt-get:\$*" >> "$log_file"
if [ "\${1:-}" = "update" ] \
    && [ -f "$sources_path" ] \
    && grep -q 'https://balejosg.github.io/openpath/apt' "$sources_path"; then
    echo "legacy source still active" >> "$log_file"
    exit 1
fi
exit 0
EOF
    chmod +x "$bin_dir/apt-get"
}

write_mock_apt_cache() {
    local bin_dir="$1"
    local log_file="$2"

    cat > "$bin_dir/apt-cache" <<EOF
#!/bin/bash
echo "apt-cache:\$*" >> "$log_file"
exit 0
EOF
    chmod +x "$bin_dir/apt-cache"
}

write_mock_curl() {
    local bin_dir="$1"
    local log_file="$2"

    cat > "$bin_dir/curl" <<EOF
#!/bin/bash
echo "curl:\$*" >> "$log_file"

output_file=""
while [ "\$#" -gt 0 ]; do
    case "\$1" in
        -o)
            output_file="\$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

if [ -n "\$output_file" ]; then
    cat > "\$output_file" <<'SCRIPT'
#!/bin/bash
exit 0
SCRIPT
fi

exit 0
EOF
    chmod +x "$bin_dir/curl"
}

write_mock_openpath() {
    local bin_dir="$1"
    local log_file="$2"
    local setup_status="$3"
    local setup_state="${4:-none}"

    cat > "$bin_dir/openpath" <<EOF
#!/bin/bash
echo "openpath:\$*" >> "$log_file"
if [ "\${1:-}" = "setup" ]; then
    if [ "$setup_state" = "complete" ]; then
        etc_dir="\${OPENPATH_ETC_CONFIG_DIR:-/etc/openpath}"
        mkdir -p "\$etc_dir"
        printf '%s' 'https://control.example' > "\$etc_dir/api-url.conf"
        printf '%s' 'https://control.example/w/token123/whitelist.txt' > "\$etc_dir/whitelist-url.conf"
        printf '%s' 'cls_123' > "\$etc_dir/classroom-id.conf"
    fi
    exit $setup_status
fi
exit 0
EOF
    chmod +x "$bin_dir/openpath"
}

write_mock_browser_setup() {
    local script_path="$1"
    local log_file="$2"

    cat > "$script_path" <<EOF
#!/bin/bash
echo "browser-setup:\$*" >> "$log_file"
exit 0
EOF
    chmod +x "$script_path"
}

@test "apt-bootstrap removes stale legacy OpenPath APT source before apt-get update" {
    local bin_dir="$TEST_TMP_DIR/bin"
    local log_file="$TEST_TMP_DIR/apt-bootstrap.log"
    local browser_setup_script="$TEST_TMP_DIR/openpath-browser-setup.sh"
    local sources_path="$TEST_TMP_DIR/openpath.list"

    mkdir -p "$bin_dir"
    cat > "$sources_path" <<'EOF'
# OpenPath System APT Repository
deb [signed-by=/usr/share/keyrings/openpath.gpg] https://balejosg.github.io/openpath/apt stable main
EOF

    write_mock_id "$bin_dir"
    write_mock_apt_get_rejecting_legacy_source "$bin_dir" "$log_file" "$sources_path"
    write_mock_apt_cache "$bin_dir" "$log_file"
    write_mock_curl "$bin_dir" "$log_file"
    write_mock_openpath "$bin_dir" "$log_file" "0"
    write_mock_browser_setup "$browser_setup_script" "$log_file"

    run env \
        PATH="$bin_dir:$PATH" \
        OPENPATH_APT_SOURCES_PATH="$sources_path" \
        OPENPATH_APT_REPO_URL="http://repo.local/apt" \
        OPENPATH_BROWSER_SETUP_SCRIPT="$browser_setup_script" \
        bash "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh" --skip-setup

    [ "$status" -eq 0 ]
    [ ! -e "$sources_path" ]
    run grep -n "legacy source still active" "$log_file"
    [ "$status" -ne 0 ]
}

@test "apt-bootstrap skips browser setup helper when classroom setup is skipped" {
    local bin_dir="$TEST_TMP_DIR/bin"
    local log_file="$TEST_TMP_DIR/apt-bootstrap.log"
    local browser_setup_script="$TEST_TMP_DIR/openpath-browser-setup.sh"

    mkdir -p "$bin_dir"
    write_mock_id "$bin_dir"
    write_mock_apt_get "$bin_dir" "$log_file"
    write_mock_apt_cache "$bin_dir" "$log_file"
    write_mock_curl "$bin_dir" "$log_file"
    write_mock_openpath "$bin_dir" "$log_file" "0"
    write_mock_browser_setup "$browser_setup_script" "$log_file"

    run env \
        PATH="$bin_dir:$PATH" \
        OPENPATH_APT_REPO_URL="http://repo.local/apt" \
        OPENPATH_BROWSER_SETUP_SCRIPT="$browser_setup_script" \
        bash "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh" --skip-setup

    [ "$status" -eq 0 ]
    run grep -n "browser-setup:" "$log_file"
    [ "$status" -ne 0 ]
}

@test "apt-bootstrap fails hard after classroom setup failure and skips browser setup" {
    local bin_dir="$TEST_TMP_DIR/bin"
    local log_file="$TEST_TMP_DIR/apt-bootstrap.log"
    local browser_setup_script="$TEST_TMP_DIR/openpath-browser-setup.sh"
    local token_file="$TEST_TMP_DIR/token.txt"

    mkdir -p "$bin_dir"
    printf '%s\n' 'test-token' > "$token_file"

    write_mock_id "$bin_dir"
    write_mock_apt_get "$bin_dir" "$log_file"
    write_mock_apt_cache "$bin_dir" "$log_file"
    write_mock_curl "$bin_dir" "$log_file"
    write_mock_openpath "$bin_dir" "$log_file" "1"
    write_mock_browser_setup "$browser_setup_script" "$log_file"

    run env \
        PATH="$bin_dir:$PATH" \
        OPENPATH_APT_REPO_URL="http://repo.local/apt" \
        OPENPATH_BROWSER_SETUP_SCRIPT="$browser_setup_script" \
        bash "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh" \
        --api-url "https://school.example" \
        --classroom "Aula 101" \
        --token-file "$token_file"

    [ "$status" -ne 0 ]
    [[ "$output" == *"ERROR: Classroom setup failed."* ]]
    run grep -n "openpath:setup" "$log_file"
    [ "$status" -eq 0 ]
    run grep -n "browser-setup:" "$log_file"
    [ "$status" -ne 0 ]
}

@test "apt-bootstrap fails when classroom setup exits zero but request state is incomplete" {
    local bin_dir="$TEST_TMP_DIR/bin"
    local log_file="$TEST_TMP_DIR/apt-bootstrap.log"
    local browser_setup_script="$TEST_TMP_DIR/openpath-browser-setup.sh"
    local token_file="$TEST_TMP_DIR/token.txt"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$bin_dir" "$etc_dir"
    printf '%s\n' 'test-token' > "$token_file"

    write_mock_id "$bin_dir"
    write_mock_apt_get "$bin_dir" "$log_file"
    write_mock_apt_cache "$bin_dir" "$log_file"
    write_mock_curl "$bin_dir" "$log_file"
    write_mock_openpath "$bin_dir" "$log_file" "0"
    write_mock_browser_setup "$browser_setup_script" "$log_file"

    run env \
        PATH="$bin_dir:$PATH" \
        OPENPATH_APT_REPO_URL="http://repo.local/apt" \
        OPENPATH_BROWSER_SETUP_SCRIPT="$browser_setup_script" \
        OPENPATH_ETC_CONFIG_DIR="$etc_dir" \
        bash "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh" \
        --api-url "https://school.example" \
        --classroom "Aula 101" \
        --token-file "$token_file"

    [ "$status" -ne 0 ]
    [[ "$output" == *"ERROR: Classroom setup incomplete."* ]]
    run grep -n "browser-setup:" "$log_file"
    [ "$status" -ne 0 ]
}

@test "apt-bootstrap runs browser setup only after complete request setup state exists" {
    local bin_dir="$TEST_TMP_DIR/bin"
    local log_file="$TEST_TMP_DIR/apt-bootstrap.log"
    local browser_setup_script="$TEST_TMP_DIR/openpath-browser-setup.sh"
    local etc_dir="$TEST_TMP_DIR/etc/openpath"

    mkdir -p "$bin_dir" "$etc_dir"

    write_mock_id "$bin_dir"
    write_mock_apt_get "$bin_dir" "$log_file"
    write_mock_apt_cache "$bin_dir" "$log_file"
    write_mock_curl "$bin_dir" "$log_file"
    write_mock_openpath "$bin_dir" "$log_file" "0" "complete"
    write_mock_browser_setup "$browser_setup_script" "$log_file"

    run env \
        PATH="$bin_dir:$PATH" \
        OPENPATH_APT_REPO_URL="http://repo.local/apt" \
        OPENPATH_BROWSER_SETUP_SCRIPT="$browser_setup_script" \
        OPENPATH_ETC_CONFIG_DIR="$etc_dir" \
        bash "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh" \
        --api-url "https://school.example" \
        --classroom-id "cls_123" \
        --enrollment-token "enroll-token"

    [ "$status" -eq 0 ]
    run grep -n "openpath:setup" "$log_file"
    [ "$status" -eq 0 ]
    run grep -n "browser-setup:" "$log_file"
    [ "$status" -eq 0 ]
}

@test "apt-bootstrap fails hard when enrollment-token classroom setup fails" {
    local bin_dir="$TEST_TMP_DIR/bin"
    local log_file="$TEST_TMP_DIR/apt-bootstrap.log"
    local browser_setup_script="$TEST_TMP_DIR/openpath-browser-setup.sh"

    mkdir -p "$bin_dir"

    write_mock_id "$bin_dir"
    write_mock_apt_get "$bin_dir" "$log_file"
    write_mock_apt_cache "$bin_dir" "$log_file"
    write_mock_curl "$bin_dir" "$log_file"
    write_mock_openpath "$bin_dir" "$log_file" "1"
    write_mock_browser_setup "$browser_setup_script" "$log_file"

    run env \
        PATH="$bin_dir:$PATH" \
        OPENPATH_APT_REPO_URL="http://repo.local/apt" \
        OPENPATH_BROWSER_SETUP_SCRIPT="$browser_setup_script" \
        bash "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh" \
        --api-url "https://school.example" \
        --classroom-id "cls_123" \
        --enrollment-token "expired-token"

    [ "$status" -ne 0 ]
    [[ "$output" == *"ERROR: Classroom setup failed."* ]]
    run grep -n "openpath:setup" "$log_file"
    [ "$status" -eq 0 ]
    run grep -n "browser-setup:" "$log_file"
    [ "$status" -ne 0 ]
}

@test "apt-bootstrap defaults to compact progress and exposes verbose output" {
    local bin_dir="$TEST_TMP_DIR/bin"
    local log_file="$TEST_TMP_DIR/apt-bootstrap.log"
    local browser_setup_script="$TEST_TMP_DIR/openpath-browser-setup.sh"

    mkdir -p "$bin_dir"
    write_mock_id "$bin_dir"
    write_mock_apt_get "$bin_dir" "$log_file"
    write_mock_apt_cache "$bin_dir" "$log_file"
    write_mock_curl "$bin_dir" "$log_file"
    write_mock_openpath "$bin_dir" "$log_file" "0"
    write_mock_browser_setup "$browser_setup_script" "$log_file"

    run env \
        PATH="$bin_dir:$PATH" \
        OPENPATH_APT_REPO_URL="http://repo.local/apt" \
        OPENPATH_BROWSER_SETUP_SCRIPT="$browser_setup_script" \
        bash "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh" --skip-setup

    [ "$status" -eq 0 ]
    [[ "$output" == *"Progress 1/5: Installing bootstrap dependencies"* ]]
    [[ "$output" != *"OK Dependencies ready"* ]]

    run env \
        PATH="$bin_dir:$PATH" \
        OPENPATH_APT_REPO_URL="http://repo.local/apt" \
        OPENPATH_BROWSER_SETUP_SCRIPT="$browser_setup_script" \
        bash "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh" --skip-setup --verbose

    [ "$status" -eq 0 ]
    [[ "$output" == *"OK Dependencies ready"* ]]
}
