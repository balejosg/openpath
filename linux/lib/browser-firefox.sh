#!/bin/bash

################################################################################
# browser-firefox.sh - Firefox install and autoconfig helpers
################################################################################

get_firefox_native_host_dir() {
    printf '%s\n' "${FIREFOX_NATIVE_HOST_DIR:-/usr/lib/mozilla/native-messaging-hosts}"
}

get_native_host_install_dir() {
    printf '%s\n' "${OPENPATH_NATIVE_HOST_INSTALL_DIR:-/usr/local/lib/openpath}"
}

browser_dpkg_is_installed() {
    local pkg="$1"
    dpkg-query -W -f='${Status}\n' "$pkg" 2>/dev/null | grep -q '^install ok installed$'
}

browser_apt_candidate_version() {
    local pkg="$1"
    apt-cache policy "$pkg" 2>/dev/null | awk '/Candidate:/ {print $2; exit}'
}

browser_apt_has_candidate() {
    local pkg="$1"
    local candidate
    candidate="$(browser_apt_candidate_version "$pkg")"
    [ -n "$candidate" ] && [ "$candidate" != "(none)" ]
}

install_firefox_esr() {
    log "Verificando instalación de Firefox..."

    if command -v snap &>/dev/null 2>&1 && snap list firefox &>/dev/null 2>&1; then
        log "⚠ Firefox Snap detected - removing..."
        pkill -TERM -f firefox 2>/dev/null || true
        for _ in $(seq 1 5); do
            pgrep -f firefox >/dev/null 2>&1 || break
            sleep 1
        done
        pkill -9 -f firefox 2>/dev/null || true
        snap remove --purge firefox 2>/dev/null || snap remove firefox 2>/dev/null || true
        log "✓ Firefox Snap removed"
    fi

    if browser_dpkg_is_installed firefox-esr; then
        log "✓ Firefox ESR already installed"
        return 0
    fi

    if browser_dpkg_is_installed firefox; then
        if command -v snap &>/dev/null 2>&1 && snap list firefox &>/dev/null 2>&1; then
            :
        else
            log "✓ Firefox (APT) already installed"
            return 0
        fi
    fi

    log "Installing Firefox..."

    local os_id=""
    if [ -r /etc/os-release ]; then
        os_id=$(awk -F= '$1=="ID" {gsub(/"/, "", $2); print $2; exit}' /etc/os-release 2>/dev/null || true)
    fi

    if [ "$os_id" = "ubuntu" ]; then
        if ! command -v add-apt-repository &>/dev/null 2>&1; then
            DEBIAN_FRONTEND=noninteractive apt-get install -y software-properties-common >/dev/null 2>&1 || true
        fi

        if command -v add-apt-repository &>/dev/null 2>&1; then
            add-apt-repository -y ppa:mozillateam/ppa 2>/dev/null || true

            cat > /etc/apt/preferences.d/mozilla-firefox << 'EOF'
Package: *
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 1001

Package: firefox
Pin: version 1:1snap*
Pin-Priority: -1
EOF
        else
            log "⚠ add-apt-repository not available; skipping PPA setup"
        fi
    fi

    apt-get update -qq

    if browser_apt_has_candidate firefox-esr; then
        if DEBIAN_FRONTEND=noninteractive apt-get install -y firefox-esr; then
            log "✓ Firefox ESR installed"
            return 0
        fi
        log "⚠ Failed to install firefox-esr (will try firefox)"
    fi

    if browser_apt_has_candidate firefox; then
        local firefox_candidate
        firefox_candidate="$(browser_apt_candidate_version firefox)"
        if [ "$os_id" = "ubuntu" ] && printf '%s' "$firefox_candidate" | grep -qi 'snap'; then
            log "⚠ Firefox candidate appears to be snap wrapper ($firefox_candidate); skipping"
            return 1
        fi

        if DEBIAN_FRONTEND=noninteractive apt-get install -y firefox; then
            log "✓ Firefox installed"
            return 0
        fi
        log "⚠ Failed to install firefox"
    fi

    log "⚠ No installable Firefox packages found; skipping"
    return 1
}

detect_firefox_dir() {
    local dirs=(
        "/usr/lib/firefox-esr"
        "/usr/lib/firefox"
        "/opt/firefox"
    )

    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ] && { [ -f "$dir/firefox" ] || [ -f "$dir/firefox-bin" ]; }; then
            echo "$dir"
            return 0
        fi
    done

    local firefox_bin
    firefox_bin=$(which firefox-esr 2>/dev/null || which firefox 2>/dev/null)
    if [ -n "$firefox_bin" ]; then
        local real_path
        real_path=$(readlink -f "$firefox_bin")
        dirname "$real_path"
        return 0
    fi

    return 1
}

generate_firefox_autoconfig() {
    local firefox_dir
    firefox_dir=$(detect_firefox_dir)

    if [ -z "$firefox_dir" ]; then
        log "⚠ Firefox not detected, skipping autoconfig"
        return 1
    fi

    log "Generating autoconfig in $firefox_dir..."

    mkdir -p "$firefox_dir/defaults/pref"
    cat > "$firefox_dir/defaults/pref/autoconfig.js" << 'EOF'
// Autoconfig para OpenPath System
pref("general.config.filename", "mozilla.cfg");
pref("general.config.obscure_value", 0);
EOF

    cat > "$firefox_dir/mozilla.cfg" << 'EOF'
// OpenPath System Configuration
// Disable signature requirement for local extensions
lockPref("xpinstall.signatures.required", false);
lockPref("extensions.langpacks.signatures.required", false);
// Prevent extension blocklist from blocking our extension
lockPref("extensions.blocklist.enabled", false);
EOF

    log "✓ Firefox autoconfig generated"
    return 0
}
