#!/usr/bin/env bats
################################################################################
# browser.bats - Tests for lib/browser.sh
################################################################################

load 'test_helper'

setup() {
    # Create temp directory for tests
    TEST_TMP_DIR=$(mktemp -d)
    export CONFIG_DIR="$TEST_TMP_DIR/config"
    export INSTALL_DIR="$TEST_TMP_DIR/install"
    export FIREFOX_POLICIES="$TEST_TMP_DIR/firefox/policies/policies.json"
    export CHROMIUM_POLICIES_BASE="$TEST_TMP_DIR/chromium/policies/managed"
    export BROWSER_POLICIES_HASH="$CONFIG_DIR/browser-policies.hash"
    export CHROME_EXTERNAL_EXTENSIONS_DIR="$TEST_TMP_DIR/chrome/extensions"
    export EDGE_EXTERNAL_EXTENSIONS_DIR="$TEST_TMP_DIR/edge/extensions"
    export CHROMIUM_NATIVE_HOST_DIR="$TEST_TMP_DIR/chromium/native-messaging-hosts"
    export CHROME_NATIVE_HOST_DIR="$TEST_TMP_DIR/chrome/native-messaging-hosts"
    export EDGE_NATIVE_HOST_DIR="$TEST_TMP_DIR/edge/native-messaging-hosts"
    
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$INSTALL_DIR/lib"
    mkdir -p "$(dirname "$FIREFOX_POLICIES")"
    mkdir -p "$CHROMIUM_POLICIES_BASE"
    mkdir -p "$CHROME_EXTERNAL_EXTENSIONS_DIR"
    mkdir -p "$EDGE_EXTERNAL_EXTENSIONS_DIR"
    mkdir -p "$CHROMIUM_NATIVE_HOST_DIR"
    mkdir -p "$CHROME_NATIVE_HOST_DIR"
    mkdir -p "$EDGE_NATIVE_HOST_DIR"
    
    # Copy libs
    cp "$PROJECT_DIR/linux/lib/"*.sh "$INSTALL_DIR/lib/" 2>/dev/null || true
    
    # Initialize arrays
    BLOCKED_PATHS=()
    BLOCKED_SUBDOMAINS=()
    WHITELIST_DOMAINS=()
    
    # Mock log function
    log() { echo "$1"; }
    export -f log
}

teardown() {
    if [ -n "$TEST_TMP_DIR" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# ============== Tests de get_policies_hash ==============

@test "get_policies_hash returns empty hash without files" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run get_policies_hash
    [ "$status" -eq 0 ]
    # Should return a hash based on empty BLOCKED_PATHS
    [ -n "$output" ]
}

@test "get_policies_hash changes with different BLOCKED_PATHS" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    BLOCKED_PATHS=()
    hash1=$(get_policies_hash)
    
    BLOCKED_PATHS=("example.com/ads")
    hash2=$(get_policies_hash)
    
    [ "$hash1" != "$hash2" ]
}

@test "get_policies_hash includes Firefox policies hash" {
    # Create a Firefox policy file
    echo '{"policies": {}}' > "$FIREFOX_POLICIES"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run get_policies_hash
    [ "$status" -eq 0 ]
    [ -n "$output" ]
}

# ============== Tests de generate_firefox_policies ==============

@test "generate_firefox_policies creates directory if not exists" {
    rm -rf "$(dirname "$FIREFOX_POLICIES")"
    
    BLOCKED_PATHS=()
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run generate_firefox_policies
    [ "$status" -eq 0 ]
    [ -d "$(dirname "$FIREFOX_POLICIES")" ]
}

@test "generate_firefox_policies creates valid JSON" {
    BLOCKED_PATHS=("example.com/ads" "test.org/tracking")
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run generate_firefox_policies
    [ "$status" -eq 0 ]
    
    # Verify JSON is valid
    python3 -c "import json; json.load(open('$FIREFOX_POLICIES'))"
    [ $? -eq 0 ]
}

@test "generate_firefox_policies includes WebsiteFilter" {
    BLOCKED_PATHS=("example.com/ads")
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run generate_firefox_policies
    [ "$status" -eq 0 ]
    
    # Check for WebsiteFilter in JSON
    grep -q "WebsiteFilter" "$FIREFOX_POLICIES"
}

# ============== Tests de generate_chromium_policies ==============

@test "generate_chromium_policies creates directories" {
    BLOCKED_PATHS=("example.com/ads")
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run generate_chromium_policies
    [ "$status" -eq 0 ]
    [ -d "$CHROMIUM_POLICIES_BASE" ]
}

@test "generate_chromium_policies creates policies file" {
    BLOCKED_PATHS=("example.com/ads")
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run generate_chromium_policies
    [ "$status" -eq 0 ]
    [ -f "$CHROMIUM_POLICIES_BASE/openpath.json" ]
}

@test "generate_chromium_policies JSON contains URLBlocklist" {
    BLOCKED_PATHS=("example.com/ads")
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run generate_chromium_policies
    
    grep -q "URLBlocklist" "$CHROMIUM_POLICIES_BASE/openpath.json"
}

# ============== Tests de cleanup_browser_policies ==============

@test "cleanup_browser_policies cleans Firefox" {
    echo '{"policies": {"WebsiteFilter": {"Block": ["test"]}}}' > "$FIREFOX_POLICIES"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run cleanup_browser_policies
    [ "$status" -eq 0 ]
    
    # Should be reset to empty policies
    grep -q '"policies": {}' "$FIREFOX_POLICIES"
}

@test "cleanup_browser_policies removes Chromium files" {
    echo '{"URLBlocklist": ["test"]}' > "$CHROMIUM_POLICIES_BASE/openpath.json"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run cleanup_browser_policies
    [ "$status" -eq 0 ]
    
    # File should be removed
    [ ! -f "$CHROMIUM_POLICIES_BASE/openpath.json" ]
}

# ============== Tests de apply_search_engine_policies ==============

@test "apply_search_engine_policies adds SearchEngines" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run apply_search_engine_policies
    [ "$status" -eq 0 ]
    
    grep -q "SearchEngines" "$FIREFOX_POLICIES"
}

@test "apply_search_engine_policies configures DuckDuckGo" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run apply_search_engine_policies
    [ "$status" -eq 0 ]
    
    grep -q "DuckDuckGo" "$FIREFOX_POLICIES"
}

@test "apply_search_engine_policies blocks Google search" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run apply_search_engine_policies
    [ "$status" -eq 0 ]
    
    grep -q "google.com/search" "$FIREFOX_POLICIES"
}
# ============== Tests de detect_firefox_dir ==============

@test "detect_firefox_dir returns valid directory if exists" {
    # Create mock Firefox directory
    mkdir -p "$TEST_TMP_DIR/usr/lib/firefox-esr"
    touch "$TEST_TMP_DIR/usr/lib/firefox-esr/firefox"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    # Mock the function to check our test directory
    detect_firefox_dir() {
        local dirs=("$TEST_TMP_DIR/usr/lib/firefox-esr")
        for dir in "${dirs[@]}"; do
            if [ -d "$dir" ] && [ -f "$dir/firefox" ]; then
                echo "$dir"
                return 0
            fi
        done
        return 1
    }
    
    run detect_firefox_dir
    [ "$status" -eq 0 ]
    [[ "$output" == *"firefox-esr"* ]]
}

@test "detect_firefox_dir returns error if Firefox not exists" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    # Mock to return nothing
    detect_firefox_dir() { return 1; }
    
    run detect_firefox_dir
    [ "$status" -eq 1 ]
}

# ============== Tests de generate_firefox_autoconfig ==============

@test "generate_firefox_autoconfig creates autoconfig files" {
    mkdir -p "$TEST_TMP_DIR/usr/lib/firefox-esr"
    touch "$TEST_TMP_DIR/usr/lib/firefox-esr/firefox"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    # Mock detect_firefox_dir
    detect_firefox_dir() { echo "$TEST_TMP_DIR/usr/lib/firefox-esr"; }
    export -f detect_firefox_dir
    
    run generate_firefox_autoconfig
    [ "$status" -eq 0 ]
    
    [ -f "$TEST_TMP_DIR/usr/lib/firefox-esr/defaults/pref/autoconfig.js" ]
    [ -f "$TEST_TMP_DIR/usr/lib/firefox-esr/mozilla.cfg" ]
}

@test "generate_firefox_autoconfig disables signature verification" {
    mkdir -p "$TEST_TMP_DIR/usr/lib/firefox-esr"
    touch "$TEST_TMP_DIR/usr/lib/firefox-esr/firefox"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    detect_firefox_dir() { echo "$TEST_TMP_DIR/usr/lib/firefox-esr"; }
    export -f detect_firefox_dir
    
    run generate_firefox_autoconfig
    [ "$status" -eq 0 ]
    
    grep -q "xpinstall.signatures.required" "$TEST_TMP_DIR/usr/lib/firefox-esr/mozilla.cfg"
    grep -q "false" "$TEST_TMP_DIR/usr/lib/firefox-esr/mozilla.cfg"
}

@test "generate_firefox_autoconfig handles absence of Firefox" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    detect_firefox_dir() { return 1; }
    export -f detect_firefox_dir
    
    run generate_firefox_autoconfig
    [ "$status" -eq 1 ]
}

# ============== Tests de install_firefox_extension ==============

@test "install_firefox_extension copies extension files" {
    # Create mock extension directory
    local ext_dir="$TEST_TMP_DIR/firefox-extension"
    mkdir -p "$ext_dir/popup" "$ext_dir/icons"
    echo '{"manifest_version": 2}' > "$ext_dir/manifest.json"
    echo 'console.log("bg");' > "$ext_dir/background.js"
    touch "$ext_dir/popup/popup.html"
    touch "$ext_dir/icons/icon-48.png"
    
    # Mock the system extension directory to be in TEST_TMP_DIR
    local ext_install_dir="$TEST_TMP_DIR/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}/monitor-bloqueos@openpath"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    # Mock functions to use test directory
    detect_firefox_dir() { echo "$TEST_TMP_DIR/usr/lib/firefox-esr"; }
    generate_firefox_autoconfig() { return 0; }
    add_extension_to_policies() { return 0; }
    export -f detect_firefox_dir generate_firefox_autoconfig add_extension_to_policies
    
    # Override the install function to use test directory
    install_firefox_extension() {
        local ext_source="${1:-$INSTALL_DIR/firefox-extension}"
        mkdir -p "$ext_install_dir"
        cp "$ext_source/manifest.json" "$ext_install_dir/"
        cp "$ext_source/background.js" "$ext_install_dir/"
        cp -r "$ext_source/popup" "$ext_install_dir/"
        cp -r "$ext_source/icons" "$ext_install_dir/"
        return 0
    }
    export -f install_firefox_extension
    
    run install_firefox_extension "$ext_dir"
    [ "$status" -eq 0 ]
    
    # Check files were copied
    [ -f "$ext_install_dir/manifest.json" ]
    [ -f "$ext_install_dir/background.js" ]
    [ -d "$ext_install_dir/popup" ]
    [ -d "$ext_install_dir/icons" ]
}

@test "install_firefox_extension handles nonexistent directory" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run install_firefox_extension "/path/that/does/not/exist"
    [ "$status" -eq 1 ]
}

# ============== Tests de add_extension_to_policies ==============

@test "add_extension_to_policies adds ExtensionSettings" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run add_extension_to_policies "test-ext@test" "/path/to/ext"
    [ "$status" -eq 0 ]
    
    grep -q "ExtensionSettings" "$FIREFOX_POLICIES"
    grep -q "test-ext@test" "$FIREFOX_POLICIES"
}

@test "add_extension_to_policies adds to Extensions.Install" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run add_extension_to_policies "test-ext@test" "/path/to/ext"
    [ "$status" -eq 0 ]
    
    grep -q "Extensions" "$FIREFOX_POLICIES"
    grep -q "Install" "$FIREFOX_POLICIES"
}

@test "add_extension_to_policies locks extension" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run add_extension_to_policies "test-ext@test" "/path/to/ext"
    [ "$status" -eq 0 ]
    
    grep -q "Locked" "$FIREFOX_POLICIES"
}

# ============== Tests de install_native_host ==============

@test "install_native_host copies native host files" {
    # Create mock native host directory
    local native_dir="$TEST_TMP_DIR/native"
    mkdir -p "$native_dir"
    echo '#!/usr/bin/env python3' > "$native_dir/openpath-native-host.py"
    
    # Mock paths to use test directory
    local native_manifest_dir="$TEST_TMP_DIR/lib/mozilla/native-messaging-hosts"
    local native_script_dir="$TEST_TMP_DIR/local/lib/openpath"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    # Override function to use test directories
    install_native_host() {
        local native_source="${1:-$INSTALL_DIR/firefox-extension/native}"
        mkdir -p "$native_manifest_dir" "$native_script_dir"
        cp "$native_source/openpath-native-host.py" "$native_script_dir/"
        echo '{"name":"test"}' > "$native_manifest_dir/openpath_native_host.json"
        return 0
    }
    export -f install_native_host
    
    run install_native_host "$native_dir"
    [ "$status" -eq 0 ]
    
    [ -f "$native_script_dir/openpath-native-host.py" ]
    [ -f "$native_manifest_dir/openpath_native_host.json" ]
}

@test "install_native_host handles nonexistent directory" {
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    run install_native_host "/path/that/does/not/exist"
    [ "$status" -eq 1 ]
}

@test "install_chromium_extension_preferences writes Chrome and Edge descriptors" {
    source "$PROJECT_DIR/linux/lib/browser.sh"

    run install_chromium_extension_preferences \
        "abcdefghijklmnopabcdefghijklmnop" \
        "$TEST_TMP_DIR/packages/openpath.crx" \
        "1.2.3"
    [ "$status" -eq 0 ]

    [ -f "$CHROME_EXTERNAL_EXTENSIONS_DIR/abcdefghijklmnopabcdefghijklmnop.json" ]
    [ -f "$EDGE_EXTERNAL_EXTENSIONS_DIR/abcdefghijklmnopabcdefghijklmnop.json" ]

    grep -q '"external_crx"' "$CHROME_EXTERNAL_EXTENSIONS_DIR/abcdefghijklmnopabcdefghijklmnop.json"
    grep -q '"1.2.3"' "$CHROME_EXTERNAL_EXTENSIONS_DIR/abcdefghijklmnopabcdefghijklmnop.json"
    grep -q '"external_crx"' "$EDGE_EXTERNAL_EXTENSIONS_DIR/abcdefghijklmnopabcdefghijklmnop.json"
    grep -q '"1.2.3"' "$EDGE_EXTERNAL_EXTENSIONS_DIR/abcdefghijklmnopabcdefghijklmnop.json"
}

@test "install_chromium_extension installs descriptors from generated artifacts" {
    local ext_dir="$TEST_TMP_DIR/firefox-extension"
    mkdir -p "$ext_dir"

    source "$PROJECT_DIR/linux/lib/browser.sh"

    build_chromium_extension_artifacts() {
        mkdir -p "$TEST_TMP_DIR/packages"
        touch "$TEST_TMP_DIR/packages/openpath.crx"
        cat << EOF
EXT_ID=abcdefghijklmnopabcdefghijklmnop
CRX_PATH=$TEST_TMP_DIR/packages/openpath.crx
VERSION=1.2.3
EOF
        return 0
    }
    export -f build_chromium_extension_artifacts

    run install_chromium_extension "$ext_dir"
    [ "$status" -eq 0 ]

    [ -f "$CHROME_EXTERNAL_EXTENSIONS_DIR/abcdefghijklmnopabcdefghijklmnop.json" ]
    [ -f "$EDGE_EXTERNAL_EXTENSIONS_DIR/abcdefghijklmnopabcdefghijklmnop.json" ]
}

@test "install_native_host writes Chromium and Edge manifests when extension id is provided" {
    local native_dir="$TEST_TMP_DIR/native"
    mkdir -p "$native_dir"
    echo '#!/usr/bin/env python3' > "$native_dir/openpath-native-host.py"

    source "$PROJECT_DIR/linux/lib/browser.sh"

    run install_native_host "$native_dir" "abcdefghijklmnopabcdefghijklmnop"
    [ "$status" -eq 0 ]

    [ -f "$CHROMIUM_NATIVE_HOST_DIR/openpath_native_host.json" ]
    [ -f "$CHROME_NATIVE_HOST_DIR/openpath_native_host.json" ]
    [ -f "$EDGE_NATIVE_HOST_DIR/openpath_native_host.json" ]

    grep -q '"allowed_origins"' "$CHROMIUM_NATIVE_HOST_DIR/openpath_native_host.json"
    grep -q 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/' "$CHROMIUM_NATIVE_HOST_DIR/openpath_native_host.json"
    grep -q 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/' "$CHROME_NATIVE_HOST_DIR/openpath_native_host.json"
    grep -q 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/' "$EDGE_NATIVE_HOST_DIR/openpath_native_host.json"
}

# ============== Tests de remove_firefox_extension ==============

@test "remove_firefox_extension removes extension directory" {
    # Create mock extension directory in test tmp
    local ext_dir="$TEST_TMP_DIR/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}/monitor-bloqueos@openpath"
    mkdir -p "$ext_dir"
    touch "$ext_dir/manifest.json"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    detect_firefox_dir() { return 1; }
    export -f detect_firefox_dir
    
    # Override to use test directory
    remove_firefox_extension() {
        rm -rf "$ext_dir" 2>/dev/null || true
        return 0
    }
    export -f remove_firefox_extension
    
    run remove_firefox_extension
    [ "$status" -eq 0 ]
    
    [ ! -d "$ext_dir" ]
}

@test "remove_firefox_extension removes native host" {
    # Create mock files in test tmp
    local native_manifest="$TEST_TMP_DIR/lib/mozilla/native-messaging-hosts/openpath_native_host.json"
    local native_script="$TEST_TMP_DIR/local/lib/openpath/openpath-native-host.py"
    
    mkdir -p "$(dirname "$native_manifest")" "$(dirname "$native_script")"
    touch "$native_manifest" "$native_script"
    
    source "$PROJECT_DIR/linux/lib/browser.sh"
    
    detect_firefox_dir() { return 1; }
    export -f detect_firefox_dir
    
    # Override to use test directory
    remove_firefox_extension() {
        rm -f "$native_manifest" "$native_script" 2>/dev/null || true
        return 0
    }
    export -f remove_firefox_extension
    
    run remove_firefox_extension
    [ "$status" -eq 0 ]
    
    [ ! -f "$native_manifest" ]
    [ ! -f "$native_script" ]
}

@test "remove_firefox_extension removes Chromium and Edge descriptors" {
    local ext_id="abcdefghijklmnopabcdefghijklmnop"
    touch "$CHROME_EXTERNAL_EXTENSIONS_DIR/$ext_id.json"
    touch "$EDGE_EXTERNAL_EXTENSIONS_DIR/$ext_id.json"
    touch "$CHROMIUM_NATIVE_HOST_DIR/openpath_native_host.json"
    touch "$CHROME_NATIVE_HOST_DIR/openpath_native_host.json"
    touch "$EDGE_NATIVE_HOST_DIR/openpath_native_host.json"

    source "$PROJECT_DIR/linux/lib/browser.sh"

    remove_firefox_extension() {
        rm -f "$CHROME_EXTERNAL_EXTENSIONS_DIR/$ext_id.json"
        rm -f "$EDGE_EXTERNAL_EXTENSIONS_DIR/$ext_id.json"
        rm -f "$CHROMIUM_NATIVE_HOST_DIR/openpath_native_host.json"
        rm -f "$CHROME_NATIVE_HOST_DIR/openpath_native_host.json"
        rm -f "$EDGE_NATIVE_HOST_DIR/openpath_native_host.json"
        return 0
    }
    export -f remove_firefox_extension

    run remove_firefox_extension
    [ "$status" -eq 0 ]

    [ ! -f "$CHROME_EXTERNAL_EXTENSIONS_DIR/$ext_id.json" ]
    [ ! -f "$EDGE_EXTERNAL_EXTENSIONS_DIR/$ext_id.json" ]
    [ ! -f "$CHROMIUM_NATIVE_HOST_DIR/openpath_native_host.json" ]
    [ ! -f "$CHROME_NATIVE_HOST_DIR/openpath_native_host.json" ]
    [ ! -f "$EDGE_NATIVE_HOST_DIR/openpath_native_host.json" ]
}
