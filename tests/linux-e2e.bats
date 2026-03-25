#!/usr/bin/env bats
################################################################################
# linux-e2e.bats - Guardrails for Linux E2E lifecycle coverage
################################################################################

load 'test_helper'

@test "linux self-update script supports overriding release metadata for test harnesses" {
    run grep -nF 'OPENPATH_SELF_UPDATE_API' "$PROJECT_DIR/linux/scripts/runtime/openpath-self-update.sh"
    [ "$status" -eq 0 ]
}

@test "linux packaged updates keep the installed uninstaller available" {
    run grep -nF 'cp "$LINUX_DIR/uninstall.sh" "$BUILD_DIR/usr/local/lib/openpath/uninstall.sh"' "$PROJECT_DIR/linux/scripts/build/build-deb.sh"
    [ "$status" -eq 0 ]
}

@test "linux self-update does not ignore package repair failures" {
    run grep -nF 'apt-get -f install -y 2>&1 || true' "$PROJECT_DIR/linux/scripts/runtime/openpath-self-update.sh"
    [ "$status" -ne 0 ]
}

@test "linux debian postinst treats firefox extension installation as best effort" {
    run grep -nF 'install_firefox_extension /usr/share/openpath/firefox-extension || echo "⚠ Extensión Firefox no instalada (se puede reintentar más tarde)"' "$PROJECT_DIR/linux/debian-package/DEBIAN/postinst"
    [ "$status" -eq 0 ]
}

@test "linux debian postinst treats chromium extension installation as best effort" {
    run grep -nF 'install_chromium_extension /usr/share/openpath/firefox-extension || echo "⚠ Extensión Chrome/Edge no instalada (se puede reintentar más tarde)"' "$PROJECT_DIR/linux/debian-package/DEBIAN/postinst"
    [ "$status" -eq 0 ]
}

@test "linux deb build includes browser native host assets" {
    run grep -nF 'cp -r "$ROOT_DIR/firefox-extension/native" "$BUILD_DIR/usr/share/openpath/firefox-extension/"' "$PROJECT_DIR/linux/scripts/build/build-deb.sh"
    [ "$status" -eq 0 ]
}

@test "linux uninstall restores resolv.conf with a copy fallback when symlink replacement is blocked" {
    run grep -nF 'cp /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf' "$PROJECT_DIR/linux/uninstall.sh"
    [ "$status" -eq 0 ]
}

@test "linux lifecycle e2e covers agent self-update and uninstall verification" {
    run grep -nF "Testing agent self-update mechanism (openpath-self-update.sh)..." "$PROJECT_DIR/tests/e2e/ci/run-linux-e2e.sh"
    [ "$status" -eq 0 ]

    run grep -nF "Verifying Linux uninstall removes installed state..." "$PROJECT_DIR/tests/e2e/ci/run-linux-e2e.sh"
    [ "$status" -eq 0 ]

    run grep -nF "/usr/local/lib/openpath/uninstall.sh --auto-yes" "$PROJECT_DIR/tests/e2e/ci/run-linux-e2e.sh"
    [ "$status" -eq 0 ]
}

@test "windows installer stages browser extension assets when available" {
    run grep -nF '$OpenPathRoot\browser-extension\firefox' "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]
}

@test "windows installer stages managed Chromium metadata when available" {
    run grep -nF '$OpenPathRoot\browser-extension\chromium-managed' "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]

    run grep -nF 'managed CRX + update manifest pipeline' "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]
}

@test "windows browser policies force-install the staged Firefox extension" {
    run grep -nF 'ExtensionSettings' "$PROJECT_DIR/windows/lib/Browser.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'install_url' "$PROJECT_DIR/windows/lib/Browser.psm1"
    [ "$status" -eq 0 ]
}

@test "windows browser policies configure managed Chromium force-install metadata" {
    run grep -nF 'ExtensionInstallForcelist' "$PROJECT_DIR/windows/lib/Browser.psm1"
    [ "$status" -eq 0 ]

    run grep -nF '/api/extensions/chromium/updates.xml' "$PROJECT_DIR/windows/lib/Browser.psm1"
    [ "$status" -eq 0 ]
}

@test "firefox extension workspace exposes managed Chromium build tooling" {
    run grep -nF '"build:chromium-managed": "node build-chromium-managed.mjs"' "$PROJECT_DIR/firefox-extension/package.json"
    [ "$status" -eq 0 ]

    run test -f "$PROJECT_DIR/firefox-extension/build-chromium-managed.mjs"
    [ "$status" -eq 0 ]
}
