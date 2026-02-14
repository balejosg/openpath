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
# firewall.sh - Firewall management functions (iptables)
# Part of the OpenPath DNS system
################################################################################

# Rule criticality levels for error handling
# CRITICAL: System will not function correctly without these
# IMPORTANT: Security/bypass prevention, warn but continue
# OPTIONAL: Nice to have, debug log only

# Add a critical rule - logs error on failure, tracks failure state
# Usage: add_critical_rule "description" iptables -A OUTPUT ...
add_critical_rule() {
    local desc="$1"
    shift

    if "$@" 2>/dev/null; then
        log_debug "✓ [CRITICAL] $desc"
        return 0
    else
        log_error "FAILED [CRITICAL]: $desc"
        log_error "  Command: $*"
        return 1
    fi
}

# Add an important rule - logs warning on failure, continues execution
# Usage: add_important_rule "description" iptables -A OUTPUT ...
add_important_rule() {
    local desc="$1"
    shift

    if "$@" 2>/dev/null; then
        log_debug "✓ [IMPORTANT] $desc"
        return 0
    else
        log_warn "FAILED [IMPORTANT]: $desc (continuing)"
        return 0  # Non-fatal, allow continuation
    fi
}

# Add an optional rule - debug log only on failure
# Usage: add_optional_rule "description" iptables -A OUTPUT ...
add_optional_rule() {
    local desc="$1"
    shift

    if "$@" 2>/dev/null; then
        log_debug "✓ [OPTIONAL] $desc"
        return 0
    else
        log_debug "SKIPPED [OPTIONAL]: $desc"
        return 0  # Non-fatal
    fi
}

# Verify critical firewall rules are in place
# Returns 0 if all critical rules present, 1 otherwise
verify_firewall_rules() {
    local firewall_output
    firewall_output=$(iptables -L OUTPUT -n 2>/dev/null) || {
        log_error "Cannot read firewall rules"
        return 1
    }

    local missing=0

    # Check for loopback accept
    if ! echo "$firewall_output" | grep -q "ACCEPT.*lo"; then
        log_warn "Missing firewall rule: loopback accept"
        missing=$((missing + 1))
    fi

    # Check for localhost DNS accept (127.0.0.1 port 53)
    if ! echo "$firewall_output" | grep -q "ACCEPT.*127.0.0.1.*dpt:53"; then
        log_warn "Missing firewall rule: localhost DNS accept"
        missing=$((missing + 1))
    fi

    # Check for DNS DROP rules (at least 2: UDP and TCP)
    local drop_count
    drop_count=$(echo "$firewall_output" | grep -c "DROP.*dpt:53") || drop_count=0
    if [ "$drop_count" -lt 2 ]; then
        log_warn "Missing firewall rule: DNS DROP (found $drop_count, need 2)"
        missing=$((missing + 1))
    fi

    # Check for final DROP (default deny)
    if ! echo "$firewall_output" | tail -5 | grep -q "DROP.*anywhere.*anywhere"; then
        log_warn "Missing firewall rule: final DROP (default deny)"
        missing=$((missing + 1))
    fi

    if [ "$missing" -gt 0 ]; then
        log_error "Firewall verification failed: $missing critical rules missing"
        return 1
    fi

    log_debug "Firewall verification passed"
    return 0
}

# Activate restrictive firewall
activate_firewall() {
    log "Activating restrictive firewall..."

    local critical_failed=0

    # Validate primary DNS IP
    if ! validate_ip "$PRIMARY_DNS"; then
        log_warn "DNS primario '$PRIMARY_DNS' inválido - usando fallback"
        PRIMARY_DNS="${FALLBACK_DNS_PRIMARY:-8.8.8.8}"
    fi

    # Detect gateway
    local gateway
    gateway=$(ip route | grep default | awk '{print $3}' | head -1)

    # Clear existing rules (optional - ok to fail if no rules exist)
    add_optional_rule "Flush OUTPUT chain" \
        iptables -F OUTPUT

    # =========================================================================
    # CRITICAL RULES - System won't function without these
    # =========================================================================

    # 1. Allow local traffic (loopback) - required for internal communication
    add_critical_rule "Allow loopback traffic" \
        iptables -A OUTPUT -o lo -j ACCEPT || critical_failed=1

    # 2. Allow established connections - required for responses to work
    add_critical_rule "Allow established connections" \
        iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT || critical_failed=1

    # 3. Allow DNS only to localhost (dnsmasq) - core DNS sinkhole functionality
    add_critical_rule "Allow DNS to localhost (UDP)" \
        iptables -A OUTPUT -p udp -d 127.0.0.1 --dport 53 -j ACCEPT || critical_failed=1
    add_critical_rule "Allow DNS to localhost (TCP)" \
        iptables -A OUTPUT -p tcp -d 127.0.0.1 --dport 53 -j ACCEPT || critical_failed=1

    # 4. Allow DNS to upstream server (for dnsmasq to resolve)
    add_critical_rule "Allow DNS to upstream $PRIMARY_DNS (UDP)" \
        iptables -A OUTPUT -p udp -d "$PRIMARY_DNS" --dport 53 -j ACCEPT || critical_failed=1
    add_critical_rule "Allow DNS to upstream $PRIMARY_DNS (TCP)" \
        iptables -A OUTPUT -p tcp -d "$PRIMARY_DNS" --dport 53 -j ACCEPT || critical_failed=1

    # =========================================================================
    # IMPORTANT RULES - Security/bypass prevention, warn but continue
    # =========================================================================

    # 5. If gateway is different from DNS, allow DNS to gateway too
    #    (some routers act as DNS)
    if [ -n "$gateway" ] && [ "$gateway" != "$PRIMARY_DNS" ]; then
        add_optional_rule "Allow DNS to gateway $gateway (UDP)" \
            iptables -A OUTPUT -p udp -d "$gateway" --dport 53 -j ACCEPT
        add_optional_rule "Allow DNS to gateway $gateway (TCP)" \
            iptables -A OUTPUT -p tcp -d "$gateway" --dport 53 -j ACCEPT
    fi

    # 6. Block DNS to any other server - enforces DNS sinkhole
    add_important_rule "Block external DNS (UDP)" \
        iptables -A OUTPUT -p udp --dport 53 -j DROP
    add_important_rule "Block external DNS (TCP)" \
        iptables -A OUTPUT -p tcp --dport 53 -j DROP

    # 7. Block DNS-over-TLS (DoT) - prevents DNS bypass
    add_important_rule "Block DNS-over-TLS (port 853)" \
        iptables -A OUTPUT -p tcp --dport 853 -j DROP

    # 8. Block common VPNs - prevents bypass via VPN tunnels
    add_important_rule "Block OpenVPN (port 1194)" \
        iptables -A OUTPUT -p udp --dport 1194 -j DROP
    add_important_rule "Block WireGuard (port 51820)" \
        iptables -A OUTPUT -p udp --dport 51820 -j DROP
    add_important_rule "Block PPTP (port 1723)" \
        iptables -A OUTPUT -p tcp --dport 1723 -j DROP

    # 9. Block Tor - prevents anonymous browsing bypass
    add_important_rule "Block Tor relay (port 9001)" \
        iptables -A OUTPUT -p tcp --dport 9001 -j DROP
    add_important_rule "Block Tor directory (port 9030)" \
        iptables -A OUTPUT -p tcp --dport 9030 -j DROP

    # =========================================================================
    # OPTIONAL RULES - Functionality, nice to have
    # =========================================================================

    # 10. Allow ICMP (ping) - needed for diagnostics and some portals
    add_optional_rule "Allow ICMP (ping)" \
        iptables -A OUTPUT -p icmp -j ACCEPT

    # 11. Allow DHCP (IP renewal)
    add_optional_rule "Allow DHCP (ports 67-68)" \
        iptables -A OUTPUT -p udp --dport 67:68 -j ACCEPT

    # 12. Allow HTTP/HTTPS (trust DNS sinkhole for enforcement)
    add_optional_rule "Allow HTTP (port 80)" \
        iptables -A OUTPUT -p tcp --dport 80 -j ACCEPT
    add_optional_rule "Allow HTTPS (port 443)" \
        iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT

    # 13. Allow NTP (time synchronization)
    add_optional_rule "Allow NTP (port 123)" \
        iptables -A OUTPUT -p udp --dport 123 -j ACCEPT

    # 14. Allow private networks (for local communication and captive portals)
    add_optional_rule "Allow private network 10.0.0.0/8" \
        iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT
    add_optional_rule "Allow private network 172.16.0.0/12" \
        iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT
    add_optional_rule "Allow private network 192.168.0.0/16" \
        iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT

    # 15. Block everything else (default deny)
    add_critical_rule "Default deny (DROP all)" \
        iptables -A OUTPUT -j DROP || critical_failed=1

    # Persist rules
    save_firewall_rules

    # Check for critical failures
    if [ "$critical_failed" -ne 0 ]; then
        log_error "CRITICAL: Some firewall rules failed to apply"
        log_error "System may not be properly protected"
        return 1
    fi

    # Verify firewall state
    if ! verify_firewall_rules; then
        log_error "Firewall verification failed after activation"
        return 1
    fi

    log "Restrictive firewall activated (DNS: $PRIMARY_DNS, GW: ${gateway:-none})"
    return 0
}

# Deactivate firewall (permissive mode)
deactivate_firewall() {
    log "Deactivating firewall..."

    if ! iptables -F OUTPUT 2>/dev/null; then
        log_warn "Could not flush OUTPUT chain"
    fi

    if ! iptables -P OUTPUT ACCEPT 2>/dev/null; then
        log_warn "Could not set OUTPUT policy to ACCEPT"
    fi

    save_firewall_rules

    log "Firewall deactivated (permissive mode)"
}

# Save firewall rules
save_firewall_rules() {
    if command -v iptables-save >/dev/null 2>&1; then
        mkdir -p /etc/iptables 2>/dev/null
        if iptables-save > /etc/iptables/rules.v4 2>/dev/null; then
            log_debug "Firewall rules saved to /etc/iptables/rules.v4"
        else
            log_warn "Could not save firewall rules (iptables-save failed)"
        fi
    else
        log_debug "iptables-save not available, rules not persisted"
    fi
}

# Flush established connections (force reconnection)
flush_connections() {
    if command -v conntrack >/dev/null 2>&1; then
        local flushed=0
        if conntrack -D -p tcp --dport 443 2>/dev/null; then
            flushed=$((flushed + 1))
        fi
        if conntrack -D -p tcp --dport 80 2>/dev/null; then
            flushed=$((flushed + 1))
        fi
        if [ "$flushed" -gt 0 ]; then
            log "HTTP/HTTPS connections flushed"
        else
            log_debug "No HTTP/HTTPS connections to flush"
        fi
    else
        log_warn "conntrack not available - connections not flushed"
    fi
}

# Flush dnsmasq DNS cache
flush_dns_cache() {
    if systemctl is-active --quiet dnsmasq; then
        if pkill -HUP dnsmasq 2>/dev/null; then
            log "DNS cache flushed"
        else
            log_warn "Could not send HUP to dnsmasq"
        fi
    else
        log_debug "dnsmasq not running, no cache to flush"
    fi
}

# Check firewall status
check_firewall_status() {
    local rules
    rules=$(iptables -L OUTPUT -n 2>/dev/null | grep -c "DROP.*dpt:53" || true)
    if [ "$rules" -ge 2 ]; then
        echo "active"
        return 0
    else
        echo "inactive"
        return 1
    fi
}
