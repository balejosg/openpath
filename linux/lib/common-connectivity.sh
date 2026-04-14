#!/bin/bash
################################################################################
# common-connectivity.sh - Connectivity helpers shared by OpenPath runtime
################################################################################

# URL and expected response for (single) captive portal detection
# Configurable via defaults.conf or environment variables
# NOTE: CAPTIVE_PORTAL_CHECK_URL/CAPTIVE_PORTAL_CHECK_EXPECTED are kept for testability.
CAPTIVE_PORTAL_CHECK_URL="${CAPTIVE_PORTAL_CHECK_URL:-${CAPTIVE_PORTAL_URL:-http://detectportal.firefox.com/success.txt}}"
CAPTIVE_PORTAL_CHECK_EXPECTED="${CAPTIVE_PORTAL_CHECK_EXPECTED:-${CAPTIVE_PORTAL_EXPECTED:-success}}"

# Detect primary DNS dynamically
detect_primary_dns() {
    local dns=""

    # 1. Try to read saved DNS
    if [ -f "$ORIGINAL_DNS_FILE" ]; then
        local saved_dns
        saved_dns=$(head -1 "$ORIGINAL_DNS_FILE")
        if [ -n "$saved_dns" ] && validate_ip "$saved_dns" && timeout 5 dig @"$saved_dns" google.com +short >/dev/null 2>&1; then
            echo "$saved_dns"
            return 0
        fi
    fi

    # 2. NetworkManager
    if command -v nmcli >/dev/null 2>&1; then
        dns=$(nmcli dev show 2>/dev/null | grep -i "IP4.DNS\[1\]" | awk '{print $2}' | head -1)
        if [ -n "$dns" ] && validate_ip "$dns" && timeout 5 dig @"$dns" google.com +short >/dev/null 2>&1; then
            echo "$dns"
            return 0
        fi
    fi

    # 3. systemd-resolved
    if [ -f /run/systemd/resolve/resolv.conf ]; then
        dns=$(grep "^nameserver" /run/systemd/resolve/resolv.conf | head -1 | awk '{print $2}')
        if [ -n "$dns" ] && [ "$dns" != "127.0.0.53" ] && validate_ip "$dns"; then
            if timeout 5 dig @"$dns" google.com +short >/dev/null 2>&1; then
                echo "$dns"
                return 0
            fi
        fi
    fi

    # 4. Gateway as DNS
    local gw
    gw=$(ip route | grep default | awk '{print $3}' | head -1)
    if [ -n "$gw" ] && validate_ip "$gw" && timeout 5 dig @"$gw" google.com +short >/dev/null 2>&1; then
        echo "$gw"
        return 0
    fi

    echo "${FALLBACK_DNS_PRIMARY:-8.8.8.8}"
}

validate_ip() {
    local ip="$1"
    [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]
}

check_internet() {
    if timeout 10 curl -s http://detectportal.firefox.com/success.txt 2>/dev/null | grep -q "success"; then
        return 0
    fi
    if ping -c 1 -W 5 8.8.8.8 >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Get captive portal state.
# Returns one of AUTHENTICATED, PORTAL, NO_NETWORK.
get_captive_portal_state() {
    local timeout_sec="${CAPTIVE_PORTAL_TIMEOUT:-3}"
    local checks_raw="${CAPTIVE_PORTAL_CHECKS:-}"

    if [ -n "$checks_raw" ]; then
        local total=0
        local reachable=0
        local success=0
        local transport_fail=0

        local check
        local -a checks
        IFS='|' read -r -a checks <<< "$checks_raw"

        for check in "${checks[@]}"; do
            [ -z "$check" ] && continue
            total=$((total + 1))

            local url expected
            IFS=',' read -r url expected <<< "$check"
            url="${url//[[:space:]]/}"

            local response rc
            response=$(timeout "$timeout_sec" curl -s -L "$url" 2>/dev/null)
            rc=$?
            if [ "$rc" -ne 0 ]; then
                transport_fail=$((transport_fail + 1))
                continue
            fi

            reachable=$((reachable + 1))
            response=$(printf '%s' "$response" | tr -d '\n\r')
            if [ "$response" = "$expected" ]; then
                success=$((success + 1))
            fi
        done

        if [ "$total" -eq 0 ] || [ "$transport_fail" -ge "$total" ] || [ "$reachable" -eq 0 ] || [ "$reachable" -lt 2 ]; then
            echo "NO_NETWORK"
            return 0
        fi

        local threshold
        threshold=$(((reachable / 2) + 1))
        if [ "$success" -ge "$threshold" ]; then
            echo "AUTHENTICATED"
            return 0
        fi

        echo "PORTAL"
        return 0
    fi

    local response rc
    response=$(timeout "$timeout_sec" curl -s -L "$CAPTIVE_PORTAL_CHECK_URL" 2>/dev/null)
    rc=$?
    if [ "$rc" -ne 0 ]; then
        echo "NO_NETWORK"
        return 0
    fi

    response=$(printf '%s' "$response" | tr -d '\n\r')
    if [ "$response" = "$CAPTIVE_PORTAL_CHECK_EXPECTED" ]; then
        echo "AUTHENTICATED"
        return 0
    fi

    echo "PORTAL"
    return 0
}

check_captive_portal() {
    local state
    state=$(get_captive_portal_state)
    [ "$state" = "PORTAL" ]
}

is_network_authenticated() {
    local state
    state=$(get_captive_portal_state)
    [ "$state" = "AUTHENTICATED" ]
}
