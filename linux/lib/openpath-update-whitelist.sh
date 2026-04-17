#!/bin/bash

################################################################################
# openpath-update-whitelist.sh - Whitelist download and emergency mode helpers
################################################################################

get_whitelist_url() {
    if [ -f "$WHITELIST_URL_CONF" ]; then
        cat "$WHITELIST_URL_CONF"
    else
        echo "${WHITELIST_URL:-$DEFAULT_WHITELIST_URL}"
    fi
}

append_fail_safe_allow_domain() {
    local domain="$1"

    if validate_domain "$domain"; then
        local safe_domain
        safe_domain=$(sanitize_domain "$domain")
        echo "server=/${safe_domain}/${PRIMARY_DNS}" >> "$DNSMASQ_CONF"
        log "Fail-safe allows control-plane domain: $safe_domain"
    else
        log_warn "Fail-safe cannot allow invalid control-plane domain: ${domain:-<empty>}"
    fi
}

validate_whitelist_content() {
    local file="$1"
    local first_line=""
    local valid_lines
    local has_openpath_sections=false

    first_line=$(grep -v '^[[:space:]]*$' "$file" | head -n 1 2>/dev/null || true)
    if ! echo "$first_line" | grep -iq "^#.*DESACTIVADO"; then
        valid_lines=$(grep -cP '^[a-zA-Z0-9*].*\.[a-zA-Z]{2,}' "$file" 2>/dev/null || true)
        valid_lines="${valid_lines:-0}"
        if grep -Eq '^## (WHITELIST|BLOCKED-SUBDOMAINS|BLOCKED-PATHS)$' "$file" 2>/dev/null; then
            has_openpath_sections=true
        fi

        if [ "$valid_lines" -lt "${MIN_VALID_DOMAINS:-5}" ]; then
            if [ "$valid_lines" -gt 0 ] && [ "$has_openpath_sections" = true ]; then
                return 0
            fi
            log_warn "Downloaded whitelist does not look valid ($valid_lines domain-like lines, need ${MIN_VALID_DOMAINS:-5})"
            return 1
        fi
    fi

    local total_lines
    total_lines=$(wc -l < "$file" 2>/dev/null || echo 0)
    if [ "$total_lines" -gt "${MAX_DOMAINS:-500}" ]; then
        log_warn "Whitelist has $total_lines lines, truncating to ${MAX_DOMAINS:-500}"
        local truncated="${file}.truncated"
        head -n "${MAX_DOMAINS:-500}" "$file" > "$truncated"
        mv "$truncated" "$file"
    fi

    return 0
}

download_whitelist() {
    log "Downloading whitelist from: $WHITELIST_URL"

    local temp_file="${WHITELIST_FILE}.tmp"
    local headers_file="${WHITELIST_FILE}.headers.tmp"
    local etag_file="${WHITELIST_FILE}.etag"
    local current_etag=""

    if [ -f "$etag_file" ]; then
        current_etag=$(tr -d '\r\n' < "$etag_file" 2>/dev/null || true)
    fi

    local curl_args=(
        -L -f -sS --compressed
        --connect-timeout 15
        -D "$headers_file"
        -o "$temp_file"
    )

    if [ -n "$current_etag" ]; then
        curl_args+=(-H "If-None-Match: $current_etag")
    fi

    if timeout 30 curl "${curl_args[@]}" "$WHITELIST_URL" 2>/dev/null; then
        local status=""
        local new_etag=""

        while IFS= read -r line; do
            if [[ "$line" =~ ^HTTP/[^[:space:]]+[[:space:]]+([0-9]{3}) ]]; then
                status="${BASH_REMATCH[1]}"
            elif [[ "$line" =~ ^[Ee][Tt][Aa][Gg]: ]]; then
                new_etag="${line#*:}"
                new_etag="${new_etag//$'\r'/}"
                new_etag="${new_etag#"${new_etag%%[![:space:]]*}"}"
                new_etag="${new_etag%"${new_etag##*[![:space:]]}"}"
            fi
        done < "$headers_file"

        if [ "$status" = "304" ]; then
            rm -f "$temp_file" "$headers_file"
            log "✓ Whitelist unchanged (ETag match)"
            return 0
        fi

        if [ -s "$temp_file" ]; then
            if validate_whitelist_content "$temp_file"; then
                mv "$temp_file" "$WHITELIST_FILE"
                rm -f "$headers_file"
                if [ -n "$new_etag" ]; then
                    printf '%s\n' "$new_etag" > "$etag_file" 2>/dev/null || true
                fi
                log "✓ Whitelist downloaded successfully"
                return 0
            fi

            log_warn "Whitelist content validation failed - rejecting download"
            rm -f "$temp_file" "$headers_file"
            return 1
        fi
    fi

    rm -f "$temp_file" "$headers_file"
    log "⚠ Error downloading whitelist"
    return 1
}

check_emergency_disable() {
    if [ -f "$WHITELIST_FILE" ]; then
        local first_line
        first_line=$(grep -v '^[[:space:]]*$' "$WHITELIST_FILE" | head -n 1)
        if echo "$first_line" | grep -iq "^#.*DESACTIVADO"; then
            return 0
        fi
    fi
    return 1
}
