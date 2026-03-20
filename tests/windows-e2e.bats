#!/usr/bin/env bats
################################################################################
# windows-e2e.bats - Guardrails for Windows E2E installation coverage
################################################################################

load 'test_helper'

@test "windows e2e runner invokes the real installer" {
    run grep -n "Install-OpenPath\.ps1" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -n -- "-WhitelistUrl" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -n -- "-Unattended" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]
}

@test "windows e2e workflow does not manufacture install state before runner" {
    run grep -n "name: Install Acrylic DNS Proxy" "$PROJECT_DIR/.github/workflows/e2e-tests.yml"
    [ "$status" -ne 0 ]

    run grep -n "name: Prepare installation" "$PROJECT_DIR/.github/workflows/e2e-tests.yml"
    [ "$status" -ne 0 ]

    run grep -n "name: Create test configuration" "$PROJECT_DIR/.github/workflows/e2e-tests.yml"
    [ "$status" -ne 0 ]
}

@test "windows installer entrypoints stay ASCII-safe" {
    run grep -nP "[^\\x00-\\x7F]" "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -ne 0 ]

    run grep -nP "[^\\x00-\\x7F]" "$PROJECT_DIR/windows/Uninstall-OpenPath.ps1"
    [ "$status" -ne 0 ]

    run grep -nP "[^\\x00-\\x7F]" "$PROJECT_DIR/windows/tests/Pre-Install-Validation.ps1"
    [ "$status" -ne 0 ]
}
