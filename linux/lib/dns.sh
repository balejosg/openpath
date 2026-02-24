#!/bin/bash
set -o pipefail

# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

################################################################################
# dns.sh - DNS management functions
# Part of the OpenPath DNS system
################################################################################

# =============================================================================
# Security: Domain Validation
# =============================================================================

# Validate domain name format to prevent injection attacks
# Enhanced validation matching shared/src/schemas/index.ts DomainSchema
# Returns 0 if valid, 1 if invalid
validate_domain() {
    local domain="$1"
    local check_domain="$domain"

    # Empty domain is invalid
    [ -z "$domain" ] && return 1

    # Min length 4 characters (a.bc)
    [ ${#domain} -lt 4 ] && return 1

    # Max length 253 characters (DNS limit)
    [ ${#domain} -gt 253 ] && return 1

    # Support wildcard prefix for whitelist patterns
    if [[ "$domain" == \*.* ]]; then
        check_domain="${domain:2}"
    fi

    # Reject bare wildcards (*.  without domain)
    if [[ "$domain" == "*." ]] || [[ "$domain" == "*" ]]; then
        return 1
    fi

    # Reject .local TLD (mDNS conflicts cause local network issues)
    if [[ "$domain" =~ \.local$ ]]; then
        return 1
    fi

    # Cannot have consecutive dots
    [[ "$check_domain" =~ \.\. ]] && return 1

    # Validate each label
    IFS='.' read -ra labels <<< "$check_domain"
    local num_labels=${#labels[@]}

    # Must have at least 2 labels (domain.tld)
    [ "$num_labels" -lt 2 ] && return 1

    for i in "${!labels[@]}"; do
        local label="${labels[$i]}"
        local is_tld=$((i == num_labels - 1))

        # Each label max 63 chars
        [ ${#label} -gt 63 ] && return 1
        [ ${#label} -lt 1 ] && return 1

        # Cannot start or end with hyphen
        [[ "$label" == -* ]] && return 1
        [[ "$label" == *- ]] && return 1

        if [ "$is_tld" -eq 1 ]; then
            # TLD: letters only, 2-63 chars
            [ ${#label} -lt 2 ] && return 1
            [[ ! "$label" =~ ^[a-zA-Z]+$ ]] && return 1
        else
            # Regular label: alphanumeric and hyphens
            [[ ! "$label" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$ ]] && return 1
        fi
    done

    return 0
}

# Sanitize domain - remove any potentially dangerous characters
# This is a defense-in-depth measure
sanitize_domain() {
    local domain="$1"
    # Remove any character that isn't alphanumeric, dot, or hyphen
    echo "$domain" | tr -cd 'a-zA-Z0-9.-'
}

# =============================================================================

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
    
    # Crear nuevo resolv.conf
    cat > /etc/resolv.conf << 'EOF'
# Generado por openpath
# DNS local (dnsmasq)
nameserver 127.0.0.1
options edns0 trust-ad
search lan
EOF
    
    # Protect against overwriting
    chattr +i /etc/resolv.conf 2>/dev/null || true
    
    log "✓ /etc/resolv.conf configured"
}

# Configure upstream DNS for dnsmasq
configure_upstream_dns() {
    log "Configuring upstream DNS..."
    
    # Create directory
    mkdir -p /run/dnsmasq
    
    # Detect primary DNS
    PRIMARY_DNS=$(detect_primary_dns)
    
    # Save for future reference
    echo "$PRIMARY_DNS" > "$ORIGINAL_DNS_FILE"
    
    # Crear resolv.conf para dnsmasq
    cat > /run/dnsmasq/resolv.conf << EOF
# DNS upstream para dnsmasq
nameserver $PRIMARY_DNS
nameserver ${FALLBACK_DNS_SECONDARY:-8.8.4.4}
EOF
    
    log "✓ Upstream DNS configured: $PRIMARY_DNS"
}

# Create DNS upstream initialization script
create_dns_init_script() {
    # Write with variable substitution for fallback DNS values
    local fallback_primary="${FALLBACK_DNS_PRIMARY:-8.8.8.8}"
    local fallback_secondary="${FALLBACK_DNS_SECONDARY:-8.8.4.4}"

    cat > "$SCRIPTS_DIR/dnsmasq-init-resolv.sh" << EOF
#!/bin/bash
# Regenerate /run/dnsmasq/resolv.conf on each boot

# Configurable fallback DNS (baked in at install time)
FALLBACK_DNS_PRIMARY="${fallback_primary}"
FALLBACK_DNS_SECONDARY="${fallback_secondary}"

mkdir -p /run/dnsmasq

# Read saved DNS
if [ -f /var/lib/openpath/original-dns.conf ]; then
    PRIMARY_DNS=\$(cat /var/lib/openpath/original-dns.conf | head -1)
else
    # Detect via NetworkManager
    if command -v nmcli >/dev/null 2>&1; then
        PRIMARY_DNS=\$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS\[1\]" | awk '{print \$2}' | head -1)
    fi
    # Fallback to gateway
    [ -z "\$PRIMARY_DNS" ] && PRIMARY_DNS=\$(ip route | grep default | awk '{print \$3}' | head -1)
    # Absolute fallback
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

# Write a temporary dnsmasq config that forwards all queries upstream.
# Used for captive portal authentication (fail-open DNS passthrough).
# Args:
#   1) upstream DNS IP (required)
#   2) output path (optional; defaults to $DNSMASQ_CONF)
write_dnsmasq_passthrough_config() {
    local upstream_dns="$1"
    local conf_path="${2:-$DNSMASQ_CONF}"

    if [ -z "${upstream_dns:-}" ]; then
        log_warn "write_dnsmasq_passthrough_config: upstream DNS is empty"
        return 1
    fi

    cat > "$conf_path" << EOF
# OPENPATH PORTAL MODE - DNS passthrough (temporary)
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
cache-size=1000
server=$upstream_dns
EOF

    return 0
}

# Generate dnsmasq configuration
generate_dnsmasq_config() {
    log "Generating dnsmasq configuration..."
    
    local temp_conf="${DNSMASQ_CONF}.tmp"
    
    # Header with base config (NO date so hash is stable)
    cat > "$temp_conf" << EOF
# =============================================
# OpenPath - dnsmasq DNS Sinkhole v$VERSION
# =============================================

# Base configuration
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
cache-size=1000
max-cache-ttl=300
neg-ttl=60

# =============================================
# DEFAULT BLOCK (MUST BE FIRST)
# Everything not explicitly listed → NXDOMAIN
# =============================================
address=/#/

# =============================================
# ESSENTIAL DOMAINS (always allowed)
# Required for system operation
# =============================================

# Whitelist download (GitHub)
server=/raw.githubusercontent.com/${PRIMARY_DNS}
server=/github.com/${PRIMARY_DNS}
server=/githubusercontent.com/${PRIMARY_DNS}

# Captive portal detection
server=/detectportal.firefox.com/${PRIMARY_DNS}
server=/connectivity-check.ubuntu.com/${PRIMARY_DNS}
server=/captive.apple.com/${PRIMARY_DNS}
server=/www.msftconnecttest.com/${PRIMARY_DNS}
server=/clients3.google.com/${PRIMARY_DNS}

# NTP (time synchronization)
server=/ntp.ubuntu.com/${PRIMARY_DNS}
server=/time.google.com/${PRIMARY_DNS}

EOF
    
    # Add allowed domains from whitelist
    {
        echo "# ============================================="
        echo "# WHITELIST DOMAINS (${#WHITELIST_DOMAINS[@]} domains)"
        echo "# ============================================="
    } >> "$temp_conf"

    local valid_count=0
    local invalid_count=0
    for domain in "${WHITELIST_DOMAINS[@]}"; do
        # SECURITY: Validate domain before adding to config
        if validate_domain "$domain"; then
            # Sanitize as defense-in-depth
            local safe_domain
            safe_domain=$(sanitize_domain "$domain")
            echo "server=/${safe_domain}/${PRIMARY_DNS}" >> "$temp_conf"
            valid_count=$((valid_count + 1))
        else
            log_warn "Skipping invalid domain: $domain"
            invalid_count=$((invalid_count + 1))
        fi
    done

    if [ "$invalid_count" -gt 0 ]; then
        log_warn "Skipped $invalid_count invalid domains"
    fi

    echo "" >> "$temp_conf"

    # Add blocked subdomains (explicitly, just in case)
    if [ ${#BLOCKED_SUBDOMAINS[@]} -gt 0 ]; then
        echo "# Blocked subdomains (NXDOMAIN)" >> "$temp_conf"
        for blocked in "${BLOCKED_SUBDOMAINS[@]}"; do
            # SECURITY: Validate blocked subdomain too
            if validate_domain "$blocked"; then
                local safe_blocked
                safe_blocked=$(sanitize_domain "$blocked")
                echo "address=/${safe_blocked}/" >> "$temp_conf"
            else
                log_warn "Skipping invalid blocked subdomain: $blocked"
            fi
        done
        echo "" >> "$temp_conf"
    fi
    
    # Move to final location
    mv "$temp_conf" "$DNSMASQ_CONF"
    
    log "✓ dnsmasq configuration generated: ${#WHITELIST_DOMAINS[@]} domains + essentials"
}

# Validate dnsmasq configuration
validate_dnsmasq_config() {
    local output
    output=$(dnsmasq --test 2>&1)
    if echo "$output" | grep -qi "syntax check OK\|sintaxis correcta"; then
        return 0
    else
        log "ERROR: Invalid dnsmasq configuration: $output"
        return 1
    fi
}

# Restart dnsmasq
restart_dnsmasq() {
    log "Restarting dnsmasq..."
    
    if ! validate_dnsmasq_config; then
        return 1
    fi
    
    if timeout 30 systemctl restart dnsmasq; then
        # Wait for dnsmasq to be active (max 5 seconds)
        for _ in $(seq 1 5); do
            if systemctl is-active --quiet dnsmasq; then
                log "✓ dnsmasq restarted successfully"
                return 0
            fi
            sleep 1
        done
    fi
    
    log "ERROR: Failed to restart dnsmasq"
    return 1
}

# Verify DNS is working
verify_dns() {
    if timeout 5 dig @127.0.0.1 google.com +short +time=3 >/dev/null 2>&1; then
        return 0
    fi
    return 1
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
    
    # Re-enable systemd-resolved
    systemctl enable systemd-resolved 2>/dev/null || true
    systemctl start systemd-resolved 2>/dev/null || true
    
    log "✓ DNS restored"
}
