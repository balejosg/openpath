#!/bin/bash

################################################################################
# firewall-snapshot.sh - Firewall snapshot and verification helpers
################################################################################

get_firewall_rules_snapshot() {
    local snapshot

    if snapshot=$(iptables -S OUTPUT 2>/dev/null) && [ -n "$snapshot" ]; then
        printf '%s\n' "$snapshot"
        return 0
    fi

    snapshot=$(iptables -L OUTPUT -n 2>/dev/null) || return 1
    printf '%s\n' "$snapshot"
    return 0
}

firewall_snapshot_is_canonical() {
    local snapshot="$1"
    printf '%s\n' "$snapshot" | grep -Eq -- '(^-P OUTPUT )|(^-A OUTPUT )'
}

firewall_snapshot_has_loopback_rule() {
    local snapshot="$1"

    if firewall_snapshot_is_canonical "$snapshot"; then
        printf '%s\n' "$snapshot" | grep -Eq -- '^-A OUTPUT([[:space:]].*)?[[:space:]]-o lo([[:space:]].*)?[[:space:]]-j ACCEPT$'
        return $?
    fi

    printf '%s\n' "$snapshot" | grep -Eq -- 'ACCEPT.*( lo($|[[:space:]])|/\*[[:space:]]*lo[[:space:]]*\*/)'
}

firewall_snapshot_has_localhost_dns_rule() {
    local snapshot="$1"

    if firewall_snapshot_is_canonical "$snapshot"; then
        printf '%s\n' "$snapshot" | grep -Eq -- '^-A OUTPUT([[:space:]].*)?[[:space:]]-d 127\.0\.0\.1(/32)?([[:space:]].*)?[[:space:]]--dport 53([[:space:]].*)?[[:space:]]-j ACCEPT$'
        return $?
    fi

    printf '%s\n' "$snapshot" | grep -Eq -- 'ACCEPT.*127\.0\.0\.1.*(dpt:53|dpt:domain)'
}

firewall_snapshot_dns_drop_rule_count() {
    local snapshot="$1"

    if firewall_snapshot_is_canonical "$snapshot"; then
        printf '%s\n' "$snapshot" | grep -Ec -- '^-A OUTPUT([[:space:]].*)?[[:space:]]--dport 53([[:space:]].*)?[[:space:]]-j DROP$'
        return 0
    fi

    printf '%s\n' "$snapshot" | grep -Ec -- 'DROP.*(dpt:53|dpt:domain)'
}

firewall_snapshot_has_final_drop_rule() {
    local snapshot="$1"

    if firewall_snapshot_is_canonical "$snapshot"; then
        printf '%s\n' "$snapshot" | grep -Eq -- '^-A OUTPUT -j DROP$'
        return $?
    fi

    printf '%s\n' "$snapshot" | grep -Eq -- 'DROP.*(anywhere|0\.0\.0\.0/0).*(anywhere|0\.0\.0\.0/0)'
}

has_firewall_loopback_rule() {
    local snapshot
    snapshot=$(get_firewall_rules_snapshot) || return 1
    firewall_snapshot_has_loopback_rule "$snapshot"
}

verify_firewall_rules() {
    local firewall_output
    firewall_output=$(get_firewall_rules_snapshot) || {
        log_error "Cannot read firewall rules"
        return 1
    }

    local missing=0

    if ! firewall_snapshot_has_loopback_rule "$firewall_output"; then
        log_warn "Missing firewall rule: loopback accept"
        missing=$((missing + 1))
    fi

    if ! firewall_snapshot_has_localhost_dns_rule "$firewall_output"; then
        log_warn "Missing firewall rule: localhost DNS accept"
        missing=$((missing + 1))
    fi

    local drop_count
    drop_count=$(firewall_snapshot_dns_drop_rule_count "$firewall_output") || drop_count=0
    if [ "$drop_count" -lt 2 ]; then
        log_warn "Missing firewall rule: DNS DROP (found $drop_count, need 2)"
        missing=$((missing + 1))
    fi

    if ! firewall_snapshot_has_final_drop_rule "$firewall_output"; then
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

check_firewall_status() {
    local snapshot
    local rules

    snapshot=$(get_firewall_rules_snapshot 2>/dev/null) || {
        echo "inactive"
        return 1
    }

    rules=$(firewall_snapshot_dns_drop_rule_count "$snapshot")
    if [ "$rules" -ge 2 ]; then
        echo "active"
        return 0
    fi

    echo "inactive"
    return 1
}
