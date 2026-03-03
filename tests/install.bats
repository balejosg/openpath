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

@test "install.sh supports --skip-firefox option" {
    run grep -n -- "--skip-firefox" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]
}

@test "install.sh hardens sensitive config permissions" {
    run grep -n "chmod 640 \"\$WHITELIST_URL_CONF\"" "$PROJECT_DIR/linux/install.sh"
    [ "$status" -eq 0 ]

    run grep -n "chmod 600 \"\$HEALTH_API_SECRET_CONF\"" "$PROJECT_DIR/linux/install.sh"
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

@test "apt bootstrap supports enrollment token flags" {
    run grep -n -- "--classroom-id" "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
    [ "$status" -eq 0 ]

    run grep -n -- "--enrollment-token" "$PROJECT_DIR/linux/scripts/build/apt-bootstrap.sh"
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
