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

@test "install.sh hardens sensitive config permissions" {
    run grep -n "chmod 640 \"\$WHITELIST_URL_CONF\"" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n "chmod 600 \"\$HEALTH_API_SECRET_CONF\"" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]
}
