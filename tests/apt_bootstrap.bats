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

    cat > "$bin_dir/openpath" <<EOF
#!/bin/bash
echo "openpath:\$*" >> "$log_file"
if [ "\${1:-}" = "setup" ]; then
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

@test "apt-bootstrap runs browser setup helper even when classroom setup is skipped" {
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
    [ "$status" -eq 0 ]
}

@test "apt-bootstrap still runs browser setup helper after a soft classroom setup failure" {
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

    [ "$status" -eq 0 ]
    run grep -n "openpath:setup" "$log_file"
    [ "$status" -eq 0 ]
    run grep -n "browser-setup:" "$log_file"
    [ "$status" -eq 0 ]
}
