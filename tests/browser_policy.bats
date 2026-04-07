@test "get_policies_hash returns empty hash without files" {
    source "$PROJECT_DIR/linux/lib/browser.sh"

    run get_policies_hash
    [ "$status" -eq 0 ]
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
    echo '{"policies": {}}' > "$FIREFOX_POLICIES"

    source "$PROJECT_DIR/linux/lib/browser.sh"

    run get_policies_hash
    [ "$status" -eq 0 ]
    [ -n "$output" ]
}

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

    python3 -c "import json; json.load(open('$FIREFOX_POLICIES'))"
    [ $? -eq 0 ]
}

@test "generate_firefox_policies includes WebsiteFilter" {
    BLOCKED_PATHS=("example.com/ads")

    source "$PROJECT_DIR/linux/lib/browser.sh"

    run generate_firefox_policies
    [ "$status" -eq 0 ]

    grep -q "WebsiteFilter" "$FIREFOX_POLICIES"
}

@test "cleanup_browser_policies cleans Firefox" {
    echo '{"policies": {"WebsiteFilter": {"Block": ["test"]}}}' > "$FIREFOX_POLICIES"

    source "$PROJECT_DIR/linux/lib/browser.sh"

    run cleanup_browser_policies
    [ "$status" -eq 0 ]

    grep -q '"policies": {}' "$FIREFOX_POLICIES"
}

@test "cleanup_browser_policies removes Chromium files" {
    echo '{"URLBlocklist": ["test"]}' > "$CHROMIUM_POLICIES_BASE/openpath.json"

    source "$PROJECT_DIR/linux/lib/browser.sh"

    run cleanup_browser_policies
    [ "$status" -eq 0 ]

    [ ! -f "$CHROMIUM_POLICIES_BASE/openpath.json" ]
}

@test "cleanup_browser_policies preserves Firefox managed extension installation" {
    source "$PROJECT_DIR/linux/lib/browser.sh"

    run add_extension_to_policies "monitor-bloqueos@openpath" "$TEST_TMP_DIR/extensions/monitor-bloqueos@openpath"
    [ "$status" -eq 0 ]

    BLOCKED_PATHS=("example.com/ads")

    run cleanup_browser_policies
    [ "$status" -eq 0 ]

    run generate_firefox_policies
    [ "$status" -eq 0 ]

    run apply_search_engine_policies
    [ "$status" -eq 0 ]

    python3 - <<PYEOF
import json

with open("$FIREFOX_POLICIES", "r", encoding="utf-8") as fh:
    policies = json.load(fh)

extension_settings = policies["policies"].get("ExtensionSettings", {})
assert "monitor-bloqueos@openpath" in extension_settings, extension_settings
assert "Extensions" in policies["policies"], policies["policies"]
assert "monitor-bloqueos@openpath" in policies["policies"]["Extensions"].get("Locked", [])
PYEOF
}

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

@test "apply_search_engine_policies can be driven by an overridden browser policy spec" {
    local spec_path="$TEST_TMP_DIR/browser-policy-spec.json"
    export OPENPATH_BROWSER_POLICY_SPEC="$spec_path"
    write_browser_policy_spec_fixture "$spec_path"

    source "$PROJECT_DIR/linux/lib/browser.sh"

    run apply_search_engine_policies
    [ "$status" -eq 0 ]

    python3 - <<PYEOF
import json

with open("$FIREFOX_POLICIES", "r", encoding="utf-8") as fh:
    policies = json.load(fh)

policy_root = policies["policies"]
assert policy_root["SearchEngines"]["Default"] == "Startpage", policy_root["SearchEngines"]
added_names = [engine["Name"] for engine in policy_root["SearchEngines"]["Add"]]
assert "Startpage" in added_names, added_names
assert "*://search.example.test/*" in policy_root["WebsiteFilter"]["Block"], policy_root["WebsiteFilter"]["Block"]
PYEOF
}

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

@test "add_extension_to_policies uses explicit install_url when provided" {
    source "$PROJECT_DIR/linux/lib/browser.sh"

    run add_extension_to_policies \
        "test-ext@test" \
        "$TEST_TMP_DIR/test-ext.xpi" \
        "https://downloads.example/test-ext.xpi"
    [ "$status" -eq 0 ]

    python3 - <<PYEOF
import json

with open("$FIREFOX_POLICIES", "r", encoding="utf-8") as fh:
    policies = json.load(fh)

entry = policies["policies"]["ExtensionSettings"]["test-ext@test"]
assert entry["install_url"] == "https://downloads.example/test-ext.xpi"
assert "https://downloads.example/test-ext.xpi" in policies["policies"]["Extensions"]["Install"]
PYEOF
}

@test "add_extension_to_policies replaces stale install entries for the same extension" {
    source "$PROJECT_DIR/linux/lib/browser.sh"

    run add_extension_to_policies "monitor-bloqueos@openpath" "$TEST_TMP_DIR/unpacked-extension"
    [ "$status" -eq 0 ]

    run add_extension_to_policies \
        "monitor-bloqueos@openpath" \
        "$TEST_TMP_DIR/openpath-firefox-extension.xpi" \
        "https://school.example/api/extensions/firefox/openpath.xpi"
    [ "$status" -eq 0 ]

    python3 - <<PYEOF
import json

with open("$FIREFOX_POLICIES", "r", encoding="utf-8") as fh:
    policies = json.load(fh)

install_entries = policies["policies"]["Extensions"]["Install"]
old_entry = "$TEST_TMP_DIR/unpacked-extension"
assert old_entry not in install_entries, install_entries
assert install_entries.count("https://school.example/api/extensions/firefox/openpath.xpi") == 1
assert policies["policies"]["ExtensionSettings"]["monitor-bloqueos@openpath"]["install_url"] == "https://school.example/api/extensions/firefox/openpath.xpi"
PYEOF
}

@test "remove_firefox_extension removes managed install entry without clearing dynamic policies" {
    source "$PROJECT_DIR/linux/lib/browser.sh"

    run add_extension_to_policies \
        "monitor-bloqueos@openpath" \
        "$TEST_TMP_DIR/openpath.xpi" \
        "https://downloads.example/openpath-managed.xpi"
    [ "$status" -eq 0 ]

    run apply_search_engine_policies
    [ "$status" -eq 0 ]

    run remove_firefox_extension
    [ "$status" -eq 0 ]

    python3 - <<PYEOF
import json

with open("$FIREFOX_POLICIES", "r", encoding="utf-8") as fh:
    policies = json.load(fh)

policy_root = policies["policies"]
assert "monitor-bloqueos@openpath" not in policy_root.get("ExtensionSettings", {})
assert "https://downloads.example/openpath-managed.xpi" not in policy_root.get("Extensions", {}).get("Install", [])
assert "monitor-bloqueos@openpath" not in policy_root.get("Extensions", {}).get("Locked", [])
assert "SearchEngines" in policy_root
assert "DNSOverHTTPS" in policy_root
PYEOF
}

@test "linux browser helpers delegate JSON mutation to the shared browser-json helper" {
    run grep -nF 'browser-json.py mutate-firefox-policies' "$PROJECT_DIR/linux/lib/firefox-policy.sh"
    [ "$status" -eq 0 ]

    run grep -nF 'browser-json.py write-chromium-policy' "$PROJECT_DIR/linux/lib/chromium-managed-extension.sh"
    [ "$status" -eq 0 ]

    run grep -nF 'browser-json.py rewrite-chromium-manifest' "$PROJECT_DIR/linux/lib/chromium-managed-extension.sh"
    [ "$status" -eq 0 ]
}

@test "browser tests are split into responsibility-focused suites" {
    run test -f "$PROJECT_DIR/tests/browser_policy.bats"
    [ "$status" -eq 0 ]

    run test -f "$PROJECT_DIR/tests/browser_firefox_extension.bats"
    [ "$status" -eq 0 ]

    run test -f "$PROJECT_DIR/tests/browser_chromium.bats"
    [ "$status" -eq 0 ]

    run test -f "$PROJECT_DIR/tests/browser_native_host.bats"
    [ "$status" -eq 0 ]
}

@test "browser policy tests consume shared Firefox managed-extension contracts" {
    source "$PROJECT_DIR/linux/lib/browser.sh"

    run browser_contract_fixture_value "browser-firefox-managed-extension.json" "extensionId"
    [ "$status" -eq 0 ]
    [ "$output" = "monitor-bloqueos@openpath" ]
}

@test "browser policy contracts define managed Firefox source precedence" {
    run test -f "$PROJECT_DIR/tests/contracts/browser-firefox-managed-extension.json"
    [ "$status" -eq 0 ]

    run grep -nF '"managedApiInstallUrl"' "$PROJECT_DIR/tests/contracts/browser-firefox-managed-extension.json"
    [ "$status" -eq 0 ]

    run grep -nF '"stagedReleaseInstallUrl"' "$PROJECT_DIR/tests/contracts/browser-firefox-managed-extension.json"
    [ "$status" -eq 0 ]
}
#!/usr/bin/env bats
################################################################################
# browser_policy.bats - Firefox policy and shared browser policy tests
################################################################################

load 'test_helper'
source "$BATS_TEST_DIRNAME/browser_support.bash"
