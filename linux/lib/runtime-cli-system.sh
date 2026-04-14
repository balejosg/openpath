#!/bin/bash
################################################################################
# runtime-cli-system.sh - Non-enrollment runtime commands for openpath CLI
################################################################################

cmd_status() {
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Sistema dnsmasq URL Whitelist v$VERSION${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""

    echo -e "${YELLOW}Servicios:${NC}"
    for svc in dnsmasq openpath-dnsmasq.timer openpath-agent-update.timer dnsmasq-watchdog.timer captive-portal-detector openpath-sse-listener; do
        if systemctl is-active --quiet "$svc" 2>/dev/null; then
            echo -e "  $svc: ${GREEN}● activo${NC}"
        else
            echo -e "  $svc: ${RED}● inactivo${NC}"
        fi
    done

    echo ""
    echo -e "${YELLOW}DNS:${NC}"
    if timeout 3 dig @127.0.0.1 google.com +short >/dev/null 2>&1; then
        echo -e "  Resolución: ${GREEN}● funcional${NC}"
    else
        echo -e "  Resolución: ${RED}● fallando${NC}"
    fi

    if [ -f /run/dnsmasq/resolv.conf ]; then
        local upstream
        upstream=$(grep "^nameserver" /run/dnsmasq/resolv.conf | head -1 | awk '{print $2}')
        echo "  DNS upstream: $upstream"
    fi

    echo ""
    echo -e "${YELLOW}Whitelist:${NC}"
    if [ -f "$WHITELIST_FILE" ]; then
        local domains
        domains=$(grep -cv "^#\|^$" "$WHITELIST_FILE" 2>/dev/null || echo "0")
        echo "  Dominios: $domains"
    fi

    local api_url=""
    local classroom=""
    local classroom_id=""
    local whitelist_url=""
    api_url=$(read_single_line_file "$ETC_CONFIG_DIR/api-url.conf" || true)
    classroom=$(read_single_line_file "$ETC_CONFIG_DIR/classroom.conf" || true)
    classroom_id=$(read_single_line_file "$ETC_CONFIG_DIR/classroom-id.conf" || true)
    whitelist_url=$(read_single_line_file "$WHITELIST_URL_CONF" || true)

    echo ""
    echo -e "${YELLOW}Aula:${NC}"

    local enrolled="NO"
    if [ -n "$api_url" ] && [ -n "$whitelist_url" ] && is_tokenized_whitelist_url "$whitelist_url"; then
        if [ -n "$classroom" ] || [ -n "$classroom_id" ]; then
            enrolled="YES"
        fi
    fi

    if [ "$enrolled" = "YES" ]; then
        echo -e "  Enrolled: ${GREEN}✓ YES${NC}"
    else
        echo -e "  Enrolled: ${RED}✗ NO${NC}"
    fi

    if [ -n "$classroom" ]; then
        echo "  Aula: $classroom"
    elif [ -n "$classroom_id" ]; then
        echo "  Aula ID: $classroom_id"
    else
        echo "  Aula: no configurada"
    fi

    if [ -n "$api_url" ]; then
        echo "  API URL: $api_url"
    else
        echo "  API URL: no configurada"
    fi

    local agent_update_state_file="$VAR_STATE_DIR/agent-update-state.json"
    echo ""
    echo -e "${YELLOW}Agent Update:${NC}"
    if [ -f "$agent_update_state_file" ]; then
        local update_status=""
        local update_check=""
        local update_success=""
        update_status=$(grep -oP '"status":\s*"\K[^"]+' "$agent_update_state_file" 2>/dev/null | head -1 || true)
        update_check=$(grep -oP '"lastCheckAt":\s*"\K[^"]+' "$agent_update_state_file" 2>/dev/null | head -1 || true)
        update_success=$(grep -oP '"lastSuccessAt":\s*"\K[^"]+' "$agent_update_state_file" 2>/dev/null | head -1 || true)
        echo "  Estado: ${update_status:-desconocido}"
        echo "  Ultimo check: ${update_check:-nunca}"
        echo "  Ultimo exito: ${update_success:-nunca}"
    else
        echo "  Estado: sin historial"
    fi

    if [ -n "$whitelist_url" ]; then
        if is_tokenized_whitelist_url "$whitelist_url"; then
            echo "  Whitelist URL: tokenizada"
        else
            echo "  Whitelist URL: no tokenizada"
        fi
    else
        echo "  Whitelist URL: no configurada"
    fi

    if systemctl is-active --quiet openpath-sse-listener.service 2>/dev/null; then
        echo -e "  SSE listener: ${GREEN}● activo${NC}"
    else
        echo -e "  SSE listener: ${YELLOW}● inactivo${NC}"
    fi

    echo ""
}

cmd_update() {
    echo -e "${BLUE}Actualizando whitelist...${NC}"
    /usr/local/bin/openpath-update.sh
}

cmd_test() {
    echo -e "${BLUE}Probando DNS...${NC}"
    echo ""

    for domain in google.com github.com duckduckgo.com; do
        echo -n "  $domain: "
        local result
        result=$(timeout 3 dig @127.0.0.1 "$domain" +short 2>/dev/null | head -1)
        if [ -n "$result" ]; then
            echo -e "${GREEN}✓${NC} ($result)"
        else
            echo -e "${RED}✗${NC}"
        fi
    done
    echo ""
}

cmd_logs() {
    tail -f "$LOG_FILE"
}

cmd_log() {
    local lines="${1:-50}"
    if ! [[ "$lines" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}Error: '$lines' is not a valid number of lines${NC}"
        echo "Uso: openpath log [N]"
        exit 1
    fi
    tail -n "$lines" "$LOG_FILE"
}

cmd_domains() {
    local filter="${1:-}"

    if [ ! -f "$WHITELIST_FILE" ]; then
        echo -e "${RED}Whitelist no encontrado${NC}"
        exit 1
    fi

    if [ -n "$filter" ]; then
        grep -i "$filter" "$WHITELIST_FILE" | grep -v "^#" | grep -v "^$" | sort
    else
        grep -v "^#" "$WHITELIST_FILE" | grep -v "^$" | sort
    fi
}

cmd_check() {
    local domain="$1"
    [ -z "$domain" ] && { echo "Uso: whitelist check <dominio>"; exit 1; }

    echo -e "${BLUE}Verificando: $domain${NC}"
    echo ""

    if grep -qi "^${domain}$" "$WHITELIST_FILE" 2>/dev/null; then
        echo -e "  En whitelist: ${GREEN}✓ SÍ${NC}"
    else
        echo -e "  En whitelist: ${YELLOW}✗ NO${NC}"
    fi

    echo -n "  Resuelve: "
    local result
    result=$(timeout 3 dig @127.0.0.1 "$domain" +short 2>/dev/null | head -1)
    if [ -n "$result" ]; then
        echo -e "${GREEN}✓${NC} → $result"
    else
        echo -e "${RED}✗${NC}"
    fi
    echo ""
}

cmd_health() {
    local failed=0
    local remote_disabled=false

    if [ -f "$SYSTEM_DISABLED_FLAG" ]; then
        remote_disabled=true
    fi

    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  OpenPath Health Check v$VERSION${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""

    echo -e "${YELLOW}DNS Resolution:${NC}"
    if timeout 3 dig @127.0.0.1 google.com +short >/dev/null 2>&1; then
        echo -e "  Whitelisted domain (google.com): ${GREEN}✓ resolves${NC}"
    else
        echo -e "  Whitelisted domain (google.com): ${RED}✗ FAILED${NC}"
        failed=1
    fi

    if ! timeout 3 dig @127.0.0.1 blocked-test.invalid +short 2>/dev/null | grep -q .; then
        echo -e "  Blocked domain (blocked-test.invalid): ${GREEN}✓ blocked${NC}"
    else
        echo -e "  Blocked domain (blocked-test.invalid): ${RED}✗ NOT BLOCKED${NC}"
        failed=1
    fi
    echo ""

    echo -e "${YELLOW}System State:${NC}"
    if [ "$remote_disabled" = true ]; then
        echo -e "  Enforcement: ${YELLOW}⚠ fail-open (system disabled remotely)${NC}"
    else
        echo -e "  Enforcement: ${GREEN}✓ enforced${NC}"
    fi
    echo ""

    echo -e "${YELLOW}Firewall:${NC}"
    if [ "$remote_disabled" = true ]; then
        echo -e "  DNS blocking rules: ${YELLOW}⚠ bypassed (system disabled remotely)${NC}"
        echo -e "  Loopback rule: ${YELLOW}⚠ bypassed (system disabled remotely)${NC}"
    else
        if check_firewall_status >/dev/null 2>&1; then
            echo -e "  DNS blocking rules: ${GREEN}✓ active${NC}"
        else
            echo -e "  DNS blocking rules: ${RED}✗ MISSING${NC}"
            failed=1
        fi

        if has_firewall_loopback_rule >/dev/null 2>&1; then
            echo -e "  Loopback rule: ${GREEN}✓ present${NC}"
        else
            echo -e "  Loopback rule: ${YELLOW}⚠ not found${NC}"
        fi

        if verify_firewall_rules >/dev/null 2>&1; then
            echo -e "  Critical firewall rules: ${GREEN}✓ complete${NC}"
        else
            echo -e "  Critical firewall rules: ${RED}✗ incomplete${NC}"
            failed=1
        fi
    fi
    echo ""

    echo -e "${YELLOW}Services:${NC}"
    for svc in dnsmasq openpath-dnsmasq.timer dnsmasq-watchdog.timer captive-portal-detector openpath-sse-listener; do
        if systemctl is-active --quiet "$svc" 2>/dev/null; then
            echo -e "  $svc: ${GREEN}✓ running${NC}"
        else
            echo -e "  $svc: ${RED}✗ NOT running${NC}"
            failed=1
        fi
    done
    echo ""

    echo -e "${YELLOW}Whitelist:${NC}"
    if [ -f "$WHITELIST_FILE" ]; then
        local age
        age=$(($(date +%s) - $(stat -c %Y "$WHITELIST_FILE")))
        local domains
        domains=$(grep -cv "^#\|^$" "$WHITELIST_FILE" 2>/dev/null || echo "0")
        echo "  Domains: $domains"
        if [ "$age" -lt 600 ]; then
            echo -e "  Freshness: ${GREEN}✓ fresh (${age}s old)${NC}"
        else
            echo -e "  Freshness: ${YELLOW}⚠ stale (${age}s old)${NC}"
        fi
    else
        echo -e "  File: ${RED}✗ MISSING${NC}"
        failed=1
    fi
    echo ""

    echo -e "${YELLOW}Browser Policies:${NC}"
    if [ -f "$FIREFOX_POLICIES" ]; then
        echo -e "  Firefox policies: ${GREEN}✓ present${NC}"
    else
        echo -e "  Firefox policies: ${YELLOW}⚠ not found${NC}"
    fi
    if find /etc/chromium/policies/managed/openpath.json /etc/chromium-browser/policies/managed/openpath.json /etc/google-chrome/policies/managed/openpath.json -maxdepth 0 2>/dev/null | head -1 | grep -q .; then
        echo -e "  Chromium policies: ${GREEN}✓ present${NC}"
    else
        echo -e "  Chromium policies: ${YELLOW}⚠ not found${NC}"
    fi
    echo ""

    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    if [ "$failed" -eq 0 ]; then
        echo -e "  Overall status: ${GREEN}✓ HEALTHY${NC}"
    else
        echo -e "  Overall status: ${RED}✗ ISSUES DETECTED${NC}"
    fi
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"

    return $failed
}

cmd_force() {
    echo -e "${BLUE}Forzando aplicación de cambios...${NC}"
    echo -e "${YELLOW}Se cerrarán los navegadores${NC}"
    echo ""

    flush_connections
    flush_dns_cache
    force_browser_close

    echo -e "${GREEN}✓ Cambios aplicados${NC}"
}

cmd_enable() {
    echo -e "${BLUE}Habilitando sistema...${NC}"
    enable_services
    /usr/local/bin/openpath-update.sh

    force_browser_close
    flush_connections

    echo -e "${GREEN}✓ Sistema habilitado${NC}"
}

cmd_disable() {
    echo -e "${YELLOW}Deshabilitando sistema...${NC}"

    systemctl stop openpath-dnsmasq.timer
    systemctl stop dnsmasq-watchdog.timer

    enter_disabled_mode "$(head -1 "$ORIGINAL_DNS_FILE" 2>/dev/null || echo "8.8.8.8")"

    echo -e "${GREEN}✓ Sistema deshabilitado${NC}"
}

cmd_restart() {
    echo -e "${BLUE}Reiniciando servicios...${NC}"

    systemctl restart dnsmasq
    systemctl restart openpath-dnsmasq.timer
    systemctl restart dnsmasq-watchdog.timer
    systemctl restart captive-portal-detector.service 2>/dev/null || true
    systemctl restart openpath-sse-listener.service 2>/dev/null || true

    for _ in $(seq 1 5); do
        if systemctl is-active --quiet dnsmasq; then
            break
        fi
        sleep 1
    done

    cmd_status
}

cmd_help() {
    echo -e "${BLUE}openpath - Gestión del sistema OpenPath DNS v$VERSION${NC}"
    echo ""
    echo "Uso: openpath <comando> [opciones]"
    echo ""
    echo "Comandos:"
    echo "  status          Estado del sistema"
    echo "  update          Forzar actualización"
    echo "  test            Probar resolución DNS"
    echo "  logs            Ver logs en tiempo real"
    echo "  log [N]         Ver últimas N líneas del log"
    echo "  domains [texto] Listar dominios (filtrar opcional)"
    echo "  check <dominio> Verificar si dominio está permitido"
    echo "  health          Verificar salud del sistema"
    echo "  force           Forzar aplicación de cambios"
    echo "  enable          Habilitar sistema"
    echo "  disable         Deshabilitar sistema"
    echo "  restart         Reiniciar servicios"
    echo "  setup           Asistente de configuración (solo modo Aula)"
    echo "  rotate-token    Rotar token de descarga (modo Aula)"
    echo "  enroll          Registrar maquina en un aula"
    echo "  self-update     Actualizar agente a la última versión"
    echo "  help            Mostrar esta ayuda"
    echo ""
}
