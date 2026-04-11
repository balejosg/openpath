#!/usr/bin/env bats
################################################################################
# install.bats - Tests for linux/install.sh
################################################################################

load 'test_helper'

@test "install.sh runs preflight validation by default" {
    run grep -n "run_pre_install_validation" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n "SKIP_PREFLIGHT" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]
}

@test "install.sh supports --skip-preflight option" {
    run grep -n -- "--skip-preflight" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]
}

@test "linux installers share the generic progress helper" {
    run test -f "$PROJECT_DIR/linux/lib/progress.sh"
    [ "$status" -eq 0 ]

    run grep -n 'source "$INSTALLER_SOURCE_DIR/lib/progress.sh"' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'source "$SCRIPT_DIR/lib/progress.sh"' "$PROJECT_DIR/linux/quick-install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'openpath_show_progress' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'openpath_show_progress' "$PROJECT_DIR/linux/quick-install.sh"
    [ "$status" -eq 0 ]

}

@test "install.sh supports --skip-firefox option" {
    run grep -n -- "--skip-firefox" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]
}

@test "install.sh hardens sensitive config permissions" {
    run grep -n "persist_openpath_whitelist_url" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'chmod "\$mode" "\$temp_file"' "$PROJECT_DIR/linux/lib/common.sh"
    [ "$status" -eq 0 ]

    run grep -n 'persist_openpath_health_api_config' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'write_openpath_config_file "\$HEALTH_API_SECRET_CONF" "\$health_api_secret" 600' "$PROJECT_DIR/linux/lib/common.sh"
    [ "$status" -eq 0 ]
}

@test "linux installers and runtime reuse shared config persistence helpers" {
    run grep -n "persist_openpath_whitelist_url" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n "persist_openpath_health_api_config" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n "persist_openpath_whitelist_url" "$PROJECT_DIR/linux/debian-package/DEBIAN/postinst"
    [ "$status" -eq 0 ]

    run grep -n "persist_openpath_health_api_config" "$PROJECT_DIR/linux/debian-package/DEBIAN/postinst"
    [ "$status" -eq 0 ]

    run grep -n "persist_openpath_enrollment_state" "$PROJECT_DIR/linux/lib/runtime-cli.sh"
    [ "$status" -eq 0 ]

    run grep -n 'source "\$INSTALL_DIR/lib/runtime-cli.sh"' "$PROJECT_DIR/linux/scripts/runtime/openpath-cmd.sh"
    [ "$status" -eq 0 ]
}

@test "apt bootstrap script exists" {
    run test -f "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]
}

@test "apt bootstrap script runs classroom setup wizard" {
    run grep -n "openpath setup" "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]
}

@test "apt bootstrap script runs the browser setup helper after package install" {
    run grep -n "OPENPATH_BROWSER_SETUP_SCRIPT" "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]

    run grep -n "openpath-browser-setup.sh" "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]
}

@test "apt bootstrap supports enrollment token flags" {
    run grep -n -- "--classroom-id" "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]

    run grep -n -- "--enrollment-token" "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]
}

@test "apt bootstrap supports pinning an explicit package version" {
    run grep -n -- "--package-version" "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]
}

@test "apt bootstrap preserves HTTPS hardening while allowing explicit local repo overrides" {
    run grep -n 'if \[\[ "\$APT_SETUP_URL" == https://\* \]\]; then' "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]

    run grep -n -- "--proto '=https' --tlsv1.2" "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]

    run grep -n 'curl -fsSL "\$APT_SETUP_URL" -o "\$setup_script"' "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]
}

@test "apt scripts support overriding the repository URL for runtime contracts" {
    run grep -n 'OPENPATH_APT_REPO_URL' "$PROJECT_DIR/linux/scripts/build/apt-setup.sh"
    [ "$status" -eq 0 ]

    run grep -n 'OPENPATH_APT_REPO_URL' "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]
}

@test "apt setup installs the keyring idempotently" {
    run grep -n 'gpg --batch --yes --dearmor -o "\$KEYRING_PATH"' "$PROJECT_DIR/linux/scripts/build/apt-setup.sh"
    [ "$status" -eq 0 ]
}

@test "linux installer contracts runner exposes installer-only mode" {
    run grep -n -- '--installer-only' "$PROJECT_DIR/tests/e2e/ci/run-linux-e2e.sh"
    [ "$status" -eq 0 ]

    run grep -n 'OPENPATH_INSTALLER_CONTRACT_MODE' "$PROJECT_DIR/tests/e2e/docker-e2e-runner.sh"
    [ "$status" -eq 0 ]

    run grep -n '/usr/local/lib/openpath/uninstall.sh --auto-yes' "$PROJECT_DIR/tests/e2e/ci/run-linux-e2e.sh"
    [ "$status" -eq 0 ]
}

@test "linux installers ship the browser setup helper" {
    run grep -n 'openpath-browser-setup.sh' "$PROJECT_DIR/linux/scripts/build/build-deb.sh"
    [ "$status" -eq 0 ]

    run grep -n 'openpath-browser-setup.sh' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]
}

@test "package scripts expose linux installer contract commands" {
    run grep -n '"test:installer:linux"' "$PROJECT_DIR/package.json"
    [ "$status" -eq 0 ]

    run grep -n '"test:installer:apt"' "$PROJECT_DIR/package.json"
    [ "$status" -eq 0 ]

    run grep -n '"test:installer:contracts"' "$PROJECT_DIR/package.json"
    [ "$status" -eq 0 ]
}

@test "apt bootstrap fails clearly when the selected track does not advertise openpath-dnsmasq" {
    run grep -n 'apt-cache show openpath-dnsmasq' "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]

    run grep -n 'APT repository metadata does not advertise openpath-dnsmasq' "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]

    run grep -n 'stable track is still serving the legacy whitelist-dnsmasq package' "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]
}

@test "active apt clients use raw GitHub instead of legacy GitHub Pages" {
    run grep -n 'https://raw.githubusercontent.com/balejosg/openpath/gh-pages/apt' "$PROJECT_DIR/linux/scripts/build/apt-setup.sh"
    [ "$status" -eq 0 ]

    run grep -n 'https://raw.githubusercontent.com/balejosg/openpath/gh-pages/apt' "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]

    run grep -n 'https://raw.githubusercontent.com/balejosg/openpath/gh-pages/apt' "$PROJECT_DIR/api/src/config.ts"
    [ "$status" -eq 0 ]

    run grep -n 'balejosg.github.io' "$PROJECT_DIR/linux/scripts/build/apt-setup.sh"
    [ "$status" -ne 0 ]

    run grep -n 'balejosg.github.io' "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -ne 0 ]

    run grep -n 'balejosg.github.io' "$PROJECT_DIR/api/src/config.ts"
    [ "$status" -ne 0 ]
}

@test "protected control-plane domains no longer include legacy GitHub Pages" {
    run grep -n 'raw.githubusercontent.com' "$PROJECT_DIR/linux/lib/common.sh"
    [ "$status" -eq 0 ]

    run grep -n 'raw.githubusercontent.com' "$PROJECT_DIR/windows/lib/Common.psm1"
    [ "$status" -eq 0 ]

    run grep -n 'balejosg.github.io' "$PROJECT_DIR/linux/lib/common.sh"
    [ "$status" -ne 0 ]

    run grep -n 'balejosg.github.io' "$PROJECT_DIR/windows/lib/Common.psm1"
    [ "$status" -ne 0 ]
}

@test "stable deb publish workflow re-signs existing APT suites before exporting the public key" {
    run grep -n 'uses: ./.github/workflows/reusable-deb-publish.yml' "$PROJECT_DIR/.github/workflows/build-deb.yml"
    [ "$status" -eq 0 ]

    run grep -n 'for suite in stable unstable; do' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]

    run grep -n 'reprepro export "\$suite"' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]
}

@test "stable deb publish workflow removes the legacy whitelist package before publishing" {
    run grep -n 'reprepro remove stable whitelist-dnsmasq || true' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]

    run grep -n 'remove-legacy-stable-package: true' "$PROJECT_DIR/.github/workflows/build-deb.yml"
    [ "$status" -eq 0 ]
}

@test "stable deb publish workflow validates the exported Packages metadata" {
    run grep -n 'Published APT metadata missing openpath-dnsmasq' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]

    run grep -n 'Legacy whitelist package leaked into stable metadata' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]

    run grep -n 'validate-published-metadata: true' "$PROJECT_DIR/.github/workflows/build-deb.yml"
    [ "$status" -eq 0 ]
}

@test "deb publish workflow serializes apt repository updates across suites" {
    run grep -n 'group: openpath-apt-publish' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]
}

@test "deb publish workflow syncs deployed apt state back to gh-pages" {
    run grep -n 'git -C gh-pages add -A' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]

    run grep -n 'git -C gh-pages push origin HEAD:gh-pages' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]
}

@test "deb publish workflow validates carried-forward stable metadata on every publish" {
    run grep -n 'Existing stable metadata missing openpath-dnsmasq' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]

    run grep -n 'Existing stable metadata leaked whitelist-dnsmasq' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]
}

@test "stable deb publish workflow requires a persistent APT signing key" {
    run grep -n 'Missing APT_GPG_PRIVATE_KEY' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]

    run grep -n 'No GPG secret found, creating ephemeral key' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -ne 0 ]
}

@test "prerelease deb publish workflow re-signs existing APT suites before exporting the public key" {
    run grep -n 'uses: ./.github/workflows/reusable-deb-publish.yml' "$PROJECT_DIR/.github/workflows/prerelease-deb.yml"
    [ "$status" -eq 0 ]

    run grep -n 'for suite in stable unstable; do' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]

    run grep -n 'reprepro export "\$suite"' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]
}

@test "prerelease deb publish workflow requires a persistent APT signing key" {
    run grep -n 'Missing APT_GPG_PRIVATE_KEY' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -eq 0 ]

    run grep -n 'No GPG secret found, creating ephemeral key' "$PROJECT_DIR/.github/workflows/reusable-deb-publish.yml"
    [ "$status" -ne 0 ]
}

@test "APT signing key maintainer runbook documents the repository secret" {
    run grep -n 'gh secret set APT_GPG_PRIVATE_KEY --repo balejosg/openpath' "$PROJECT_DIR/docs/apt-signing-key.md"
    [ "$status" -eq 0 ]
}

@test "installer contracts workflow publishes a required summary check" {
    run grep -n 'name: Installer Contracts Success' "$PROJECT_DIR/.github/workflows/installer-contracts.yml"
    [ "$status" -eq 0 ]

    run grep -n 'npm run test:installer:contracts' "$PROJECT_DIR/.github/workflows/release-scripts.yml"
    [ "$status" -eq 0 ]

    run grep -n '/openpath/linux/uninstall.sh --auto-yes' "$PROJECT_DIR/tests/e2e/ci/run-linux-apt-contracts.sh"
    [ "$status" -eq 0 ]
}

@test "debconf templates use openpath-dnsmasq namespace" {
    run grep -n "^Template: openpath-dnsmasq/whitelist-url" "$PROJECT_DIR/linux/debian-package/DEBIAN/templates"
    [ "$status" -eq 0 ]

    run grep -n "^Template: openpath-dnsmasq/health-api-url" "$PROJECT_DIR/linux/debian-package/DEBIAN/templates"
    [ "$status" -eq 0 ]

    run grep -n "^Template: openpath-dnsmasq/health-api-secret" "$PROJECT_DIR/linux/debian-package/DEBIAN/templates"
    [ "$status" -eq 0 ]
}

@test "postinst reads canonical debconf keys" {
    run grep -n "db_get openpath-dnsmasq/whitelist-url" "$PROJECT_DIR/linux/debian-package/DEBIAN/postinst"
    [ "$status" -eq 0 ]

    run grep -n "db_get openpath-dnsmasq/health-api-url" "$PROJECT_DIR/linux/debian-package/DEBIAN/postinst"
    [ "$status" -eq 0 ]

    run grep -n "db_get openpath-dnsmasq/health-api-secret" "$PROJECT_DIR/linux/debian-package/DEBIAN/postinst"
    [ "$status" -eq 0 ]
}

@test "postinst ignores debconf fallback error strings when canonical whitelist key is empty" {
    local helper_script="$TEST_TMP_DIR/run-postinst-safe-debconf.sh"
    local state_dir="$TEST_TMP_DIR/postinst-state"

    mkdir -p "$state_dir"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -euo pipefail

project_dir="$1"
state_dir="$2"
extracted_script="$state_dir/postinst-helpers.sh"

log_file="$state_dir/db-get.log"
: > "$log_file"

db_get() {
    printf '%s\n' "$1" >> "$log_file"
    case "$1" in
        openpath-dnsmasq/whitelist-url)
            RET=""
            return 0
            ;;
        whitelist-dnsmasq/whitelist-url)
            RET="10 whitelist-dnsmasq/whitelist-url doesn't exist"
            return 10
            ;;
        *)
            RET=""
            return 0
            ;;
    esac
}

awk '/^safe_db_get\(\) \{/,/^}/' \
    "$project_dir/linux/debian-package/DEBIAN/postinst" > "$extracted_script"
source "$extracted_script"

value="$(safe_db_get openpath-dnsmasq/whitelist-url whitelist-dnsmasq/whitelist-url)"
printf 'value=%s\n' "$value"
cat "$log_file"
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$state_dir"

    [ "$status" -eq 0 ]
    [[ "$output" == *"value="* ]]
    [[ "$output" == *"openpath-dnsmasq/whitelist-url"* ]]
    [[ "$output" != *"whitelist-dnsmasq/whitelist-url"* ]]
    [[ "$output" != *"doesn't exist"* ]]
}

@test "postinst falls back to legacy whitelist debconf key only when canonical lookup fails" {
    local helper_script="$TEST_TMP_DIR/run-postinst-legacy-debconf-fallback.sh"
    local state_dir="$TEST_TMP_DIR/postinst-state"

    mkdir -p "$state_dir"

    cat > "$helper_script" <<'EOF'
#!/bin/bash
set -euo pipefail

project_dir="$1"
state_dir="$2"
extracted_script="$state_dir/postinst-helpers.sh"
log_file="$state_dir/db-get.log"

: > "$log_file"

db_get() {
    printf '%s\n' "$1" >> "$log_file"
    case "$1" in
        openpath-dnsmasq/whitelist-url)
            RET=""
            return 10
            ;;
        whitelist-dnsmasq/whitelist-url)
            RET="https://legacy.example.test/w/token/whitelist.txt"
            return 0
            ;;
        *)
            RET=""
            return 0
            ;;
    esac
}

awk '/^safe_db_get\(\) \{/,/^}/' \
    "$project_dir/linux/debian-package/DEBIAN/postinst" > "$extracted_script"
source "$extracted_script"

value="$(safe_db_get openpath-dnsmasq/whitelist-url whitelist-dnsmasq/whitelist-url)"
printf 'value=%s\n' "$value"
cat "$log_file"
EOF
    chmod +x "$helper_script"

    run "$helper_script" "$PROJECT_DIR" "$state_dir"

    [ "$status" -eq 0 ]
    [[ "$output" == *"value=https://legacy.example.test/w/token/whitelist.txt"* ]]
    [[ "$output" == *"openpath-dnsmasq/whitelist-url"* ]]
    [[ "$output" == *"whitelist-dnsmasq/whitelist-url"* ]]
}

@test "install.sh apt dependencies match debian control Depends" {
    local control_file="$PROJECT_DIR/linux/debian-package/DEBIAN/control"
    local install_file="$PROJECT_DIR/linux/install.sh"

    local depends_csv
    depends_csv=$(grep -E '^Depends:' "$control_file" | sed 's/^Depends:[[:space:]]*//')
    [ -n "$depends_csv" ]

    local control_pkgs
    control_pkgs=$(csv_to_lines "$depends_csv")

    # Every deb dependency must be installed by install.sh
    while IFS= read -r pkg; do
        [ -n "$pkg" ] || continue
        run grep -Eq "(^|[[:space:]])${pkg}([[:space:]]|$)" "$install_file"
        [ "$status" -eq 0 ]
    done <<< "$control_pkgs"

    # install.sh should not silently accumulate extra apt dependencies vs the deb
    local install_pkgs
    install_pkgs=$(
        awk '
            /apt-get install -y[[:space:]]*\\$/ {in=1; next}
            in {
                line=$0
                sub(/>.*/, "", line)
                gsub(/\\\\/, "", line)
                print line
                if ($0 ~ />\\/dev\\/null/) in=0
            }
            /apt-get install -y dnsmasq/ { print "dnsmasq" }
        ' "$install_file" \
            | tr -s '[:space:]' '\n' \
            | grep -v '^$' \
            | sort -u
    )

    while IFS= read -r pkg; do
        [ -n "$pkg" ] || continue
        echo "$control_pkgs" | grep -qx "$pkg"
    done <<< "$install_pkgs"
}

@test "linux package no longer requires iptables-persistent on modern Ubuntu hosts" {
    run grep -n 'iptables-persistent' "$PROJECT_DIR/linux/debian-package/DEBIAN/control"
    [ "$status" -ne 0 ]

    run grep -n 'iptables-persistent' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -ne 0 ]

    run grep -n 'netfilter-persistent' "$PROJECT_DIR/linux/debian-package/DEBIAN/control"
    [ "$status" -ne 0 ]
}

@test "install.sh hardens apt operations against stale package indexes" {
    run grep -n "apt_update_with_retry()" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n "rm -rf /var/lib/apt/lists/\\*" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n -- "-o Acquire::Retries=3 update -qq" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n "apt_install_with_retry()" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]
}

@test "install.sh preserves the source tree after loading installed libraries" {
    run grep -n 'INSTALLER_SOURCE_DIR="\$SCRIPT_DIR"' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'cp "\$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-update.sh"' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]
}

@test "install.sh stages unattended linux agent updater runtime" {
    run grep -n 'cp "\$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-agent-update.sh"' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]
}

@test "linux installers support quiet progress with explicit verbose mode" {
    run grep -n 'VERBOSE=false' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n -- '--verbose' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'show_progress()' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'INSTALLER_STEP_TOTAL=15' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'run_installer_step 1 "\$INSTALLER_STEP_TOTAL" "Instalando librerias" step_install_libraries' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'ORIGINAL_ARGS=("\$@")' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'exec sudo "\$0" "\${ORIGINAL_ARGS\[@\]}"' "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n -- '--verbose' "$PROJECT_DIR/linux/quick-install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'installer_args+=(--verbose)' "$PROJECT_DIR/linux/quick-install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'EXTRA_INSTALLER_ARGS+=("\$1")' "$PROJECT_DIR/linux/quick-install.sh"
    [ "$status" -eq 0 ]

    run grep -n 'installer_args+=("\${EXTRA_INSTALLER_ARGS\[@\]}")' "$PROJECT_DIR/linux/quick-install.sh"
    [ "$status" -eq 0 ]
}
