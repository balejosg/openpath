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

@test "windows installer stages Firefox release extension artifacts when available" {
    run grep -nF '$OpenPathRoot\browser-extension\firefox' "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]

    run grep -nF '$OpenPathRoot\browser-extension\firefox-release' "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]
}

@test "windows browser policies only force-install Firefox from signed distribution settings" {
    run grep -nF 'function Get-OpenPathFirefoxManagedExtensionPolicy' "$PROJECT_DIR/windows/lib/Browser.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'firefoxExtensionInstallUrl' "$PROJECT_DIR/windows/lib/Browser.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'browser-extension\firefox-release' "$PROJECT_DIR/windows/lib/Browser.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'install_url' "$PROJECT_DIR/windows/lib/Browser.psm1"
    [ "$status" -eq 0 ]
}

@test "windows installer explains Firefox Release requires a signed extension distribution" {
    run grep -nF 'Firefox Release extension auto-install requires a signed XPI distribution (AMO, HTTPS URL, or staged signed artifact).' "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]
}

@test "windows installer explains that Chrome and Edge extension rollout requires managed distribution" {
    run grep -nF 'Chrome/Edge extension auto-install is not available on unmanaged Windows; use Firefox auto-install or a managed CRX/update-manifest rollout.' "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]
}
