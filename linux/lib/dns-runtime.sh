#!/bin/bash

get_first_whitelisted_domain() {
    local whitelist_file="${1:-${WHITELIST_FILE:-}}"
    [ -n "$whitelist_file" ] && [ -f "$whitelist_file" ] || return 1

    local candidate
    while IFS= read -r candidate; do
        candidate=$(printf '%s' "$candidate" | tr '[:upper:]' '[:lower:]' | tr -d '\r\n' | sed 's/[[:space:]]//g; s/^\.*//; s/\.*$//')
        [ -n "$candidate" ] || continue
        if ! declare -F validate_domain >/dev/null 2>&1 || validate_domain "$candidate"; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done < <(
        awk '
            BEGIN { section = "whitelist" }
            /^[[:space:]]*##[[:space:]]*WHITELIST[[:space:]]*$/ { section = "whitelist"; next }
            /^[[:space:]]*##[[:space:]]*BLOCKED-SUBDOMAINS[[:space:]]*$/ { section = "blocked"; next }
            /^[[:space:]]*##[[:space:]]*BLOCKED-PATHS[[:space:]]*$/ { section = "blocked"; next }
            /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
            section == "whitelist" { print }
        ' "$whitelist_file" 2>/dev/null
    )

    return 1
}

dns_probe_file_contains_domain() {
    local domain="$1"
    local whitelist_file="${2:-${WHITELIST_FILE:-}}"
    [ -n "$domain" ] && [ -n "$whitelist_file" ] && [ -f "$whitelist_file" ] || return 1

    local normalized
    normalized=$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]' | tr -d '\r\n' | sed 's/[[:space:]]//g; s/^\.*//; s/\.*$//')
    [ -n "$normalized" ] || return 1

    awk -v domain="$normalized" '
        /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
        {
            line = tolower($0)
            gsub(/[[:space:]\r\n]/, "", line)
            sub(/^\.+/, "", line)
            sub(/\.+$/, "", line)
            if (line == domain) {
                found = 1
                exit
            }
        }
        END { exit found ? 0 : 1 }
    ' "$whitelist_file" 2>/dev/null
}

select_allowed_dns_probe_domain() {
    local whitelist_file="${1:-${WHITELIST_FILE:-}}"
    local domain

    if domain=$(get_first_whitelisted_domain "$whitelist_file"); then
        printf '%s\n' "$domain"
        return 0
    fi

    if declare -F get_openpath_protected_domains >/dev/null 2>&1; then
        while IFS= read -r domain; do
            [ -n "$domain" ] || continue
            printf '%s\n' "$domain"
            return 0
        done < <(get_openpath_protected_domains)
    fi

    printf '%s\n' "github.com"
}

select_blocked_dns_probe_domain() {
    local whitelist_file="${1:-${WHITELIST_FILE:-}}"
    local candidate

    for candidate in facebook.com wikipedia.org example.com reddit.com duckduckgo.com youtube.com instagram.com tiktok.com; do
        if declare -F is_openpath_protected_domain >/dev/null 2>&1 && is_openpath_protected_domain "$candidate"; then
            continue
        fi
        if dns_probe_file_contains_domain "$candidate" "$whitelist_file"; then
            continue
        fi
        printf '%s\n' "$candidate"
        return 0
    done

    printf '%s\n' "blocked-test.invalid"
}

resolve_local_dns_probe() {
    local domain="$1"
    [ -n "$domain" ] || return 1

    timeout 3 dig @127.0.0.1 "$domain" +short +time=2 +tries=1 2>/dev/null || true
}

dns_probe_result_is_public() {
    local result="${1:-}"

    printf '%s\n' "$result" | awk '
        /^[[:space:]]*$/ { next }
        $0 == "0.0.0.0" || $0 == "::" { next }
        $0 == "192.0.2.1" || $0 == "100::" { next }
        { found = 1; exit }
        END { exit found ? 0 : 1 }
    '
}

dns_probe_result_is_blocked() {
    local result="${1:-}"

    if dns_probe_result_is_public "$result"; then
        return 1
    fi
    return 0
}

# Free port 53 (stop systemd-resolved)
free_port_53() {
    log "Freeing port 53..."

    # Stop systemd-resolved socket and service
    systemctl stop systemd-resolved.socket 2>/dev/null || true
    systemctl disable systemd-resolved.socket 2>/dev/null || true
    systemctl stop systemd-resolved 2>/dev/null || true
    systemctl disable systemd-resolved 2>/dev/null || true

    # Wait for port to be released
    local retries=30
    while [ $retries -gt 0 ]; do
        if ! ss -tulpn 2>/dev/null | grep -q ":53 "; then
            log "✓ Port 53 freed"
            return 0
        fi
        sleep 1
        retries=$((retries - 1))
    done

    log "⚠ Port 53 still occupied after 30 seconds"
    return 1
}

# Configure /etc/resolv.conf to use local dnsmasq
configure_resolv_conf() {
    log "Configuring /etc/resolv.conf..."

    # Unprotect if protected
    chattr -i /etc/resolv.conf 2>/dev/null || true

    # Backup if symlink
    if [ -L /etc/resolv.conf ]; then
        local target
        target=$(readlink -f /etc/resolv.conf)
        echo "$target" > "$CONFIG_DIR/resolv.conf.symlink.backup"
        rm -f /etc/resolv.conf
    elif [ -f /etc/resolv.conf ]; then
        cp /etc/resolv.conf "$CONFIG_DIR/resolv.conf.backup"
    fi

    cat > /etc/resolv.conf << 'EOF'
# Generado por openpath
# DNS local (dnsmasq)
nameserver 127.0.0.1
options edns0 trust-ad
search lan
EOF

    chattr +i /etc/resolv.conf 2>/dev/null || true

    log "✓ /etc/resolv.conf configured"
}

# Configure upstream DNS for dnsmasq
configure_upstream_dns() {
    log "Configuring upstream DNS..."

    mkdir -p /run/dnsmasq

    PRIMARY_DNS=$(detect_primary_dns)

    echo "$PRIMARY_DNS" > "$ORIGINAL_DNS_FILE"

    cat > /run/dnsmasq/resolv.conf << EOF
# DNS upstream para dnsmasq
nameserver $PRIMARY_DNS
nameserver ${FALLBACK_DNS_SECONDARY:-8.8.4.4}
EOF

    log "✓ Upstream DNS configured: $PRIMARY_DNS"
}

# Create DNS upstream initialization script
create_dns_init_script() {
    local fallback_primary="${FALLBACK_DNS_PRIMARY:-8.8.8.8}"
    local fallback_secondary="${FALLBACK_DNS_SECONDARY:-8.8.4.4}"

    cat > "$SCRIPTS_DIR/dnsmasq-init-resolv.sh" << EOF
#!/bin/bash
# Regenerate /run/dnsmasq/resolv.conf on each boot

FALLBACK_DNS_PRIMARY="${fallback_primary}"
FALLBACK_DNS_SECONDARY="${fallback_secondary}"

mkdir -p /run/dnsmasq

if [ -f /var/lib/openpath/original-dns.conf ]; then
    PRIMARY_DNS=\$(cat /var/lib/openpath/original-dns.conf | head -1)
else
    if command -v nmcli >/dev/null 2>&1; then
        PRIMARY_DNS=\$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS\[1\]" | awk '{print \$2}' | head -1)
    fi
    [ -z "\$PRIMARY_DNS" ] && PRIMARY_DNS=\$(ip route | grep default | awk '{print \$3}' | head -1)
    [ -z "\$PRIMARY_DNS" ] && PRIMARY_DNS="\$FALLBACK_DNS_PRIMARY"
fi

cat > /run/dnsmasq/resolv.conf << DNSEOF
nameserver \$PRIMARY_DNS
nameserver \$FALLBACK_DNS_SECONDARY
DNSEOF

echo "dnsmasq-init-resolv: DNS upstream configurado a \$PRIMARY_DNS"
EOF
    chmod +x "$SCRIPTS_DIR/dnsmasq-init-resolv.sh"
}

# Create tmpfiles.d config for /run/dnsmasq
create_tmpfiles_config() {
    cat > /etc/tmpfiles.d/openpath-dnsmasq.conf << 'EOF'
# Create /run/dnsmasq directory on each boot
d /run/dnsmasq 0755 root root -
EOF
}

# Restore original DNS
restore_dns() {
    log "Restoring original DNS..."

    chattr -i /etc/resolv.conf 2>/dev/null || true

    if [ -f "$CONFIG_DIR/resolv.conf.symlink.backup" ]; then
        local target
        target=$(cat "$CONFIG_DIR/resolv.conf.symlink.backup")
        ln -sf "$target" /etc/resolv.conf
    elif [ -f "$CONFIG_DIR/resolv.conf.backup" ]; then
        cp "$CONFIG_DIR/resolv.conf.backup" /etc/resolv.conf
    else
        cat > /etc/resolv.conf << EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
EOF
    fi

    systemctl enable systemd-resolved 2>/dev/null || true
    systemctl start systemd-resolved 2>/dev/null || true

    log "✓ DNS restored"
}
