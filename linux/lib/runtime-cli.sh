#!/bin/bash

################################################################################
# runtime-cli.sh - Runtime command helpers for the unified openpath CLI
################################################################################

read_prompt_value() {
    local __result_var="$1"
    local prompt="$2"
    local input=""

    if [ -t 0 ]; then
        read -r -p "$prompt" input || return 1
    elif [ -r /dev/tty ]; then
        read -r -p "$prompt" input < /dev/tty || return 1
    else
        return 1
    fi

    printf -v "$__result_var" '%s' "$input"
    return 0
}

read_prompt_secret() {
    local __result_var="$1"
    local prompt="$2"
    local input=""

    if [ -t 0 ]; then
        read -r -s -p "$prompt" input || return 1
        echo ""
    elif [ -r /dev/tty ]; then
        read -r -s -p "$prompt" input < /dev/tty || return 1
        echo ""
    else
        return 1
    fi

    printf -v "$__result_var" '%s' "$input"
    return 0
}

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

cmd_enroll() {
    local classroom="" classroom_id="" api_url="" token="" enrollment_token="" machine_name=""
    local token_file=""
    local token_from_stdin=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --classroom)  classroom="$2"; shift 2 ;;
            --classroom-id) classroom_id="$2"; shift 2 ;;
            --api-url)    api_url="$2"; shift 2 ;;
            --token)      token="$2"; shift 2 ;;
            --token-file) token_file="$2"; shift 2 ;;
            --token-stdin) token_from_stdin=true; shift ;;
            --enrollment-token) enrollment_token="$2"; shift 2 ;;
            --machine-name) machine_name="$2"; shift 2 ;;
            *)            echo -e "${RED}Opcion desconocida: $1${NC}"; exit 1 ;;
        esac
    done

    [[ -z "$api_url" ]] && { echo -e "${RED}Error: --api-url requerido${NC}"; exit 1; }
    api_url="${api_url%/}"

    local token_source_count=0
    [ -n "$token" ] && token_source_count=$((token_source_count + 1))
    [ -n "$token_file" ] && token_source_count=$((token_source_count + 1))
    [ "$token_from_stdin" = true ] && token_source_count=$((token_source_count + 1))

    if [[ -n "$enrollment_token" ]]; then
        if [ "$token_source_count" -gt 0 ]; then
            echo -e "${RED}Error: --enrollment-token no se puede combinar con opciones de token de registro${NC}"
            exit 1
        fi
        [[ -z "$classroom_id" ]] && { echo -e "${RED}Error: --classroom-id requerido con --enrollment-token${NC}"; exit 1; }
    else
        [[ -z "$classroom" ]] && { echo -e "${RED}Error: --classroom requerido${NC}"; exit 1; }
        if [ "$token_source_count" -eq 0 ]; then
            echo -e "${RED}Error: requiere --token, --token-file o --token-stdin${NC}"
            exit 1
        fi
        if [ "$token_source_count" -gt 1 ]; then
            echo -e "${RED}Error: usa solo una opcion de token (--token, --token-file o --token-stdin)${NC}"
            exit 1
        fi

        if [ -n "$token_file" ]; then
            if [ ! -r "$token_file" ]; then
                echo -e "${RED}Error: no se puede leer el archivo de token: $token_file${NC}"
                exit 1
            fi
            token=$(tr -d '\r\n' < "$token_file")
        fi

        if [ "$token_from_stdin" = true ]; then
            if [ -t 0 ]; then
                echo -e "${RED}Error: --token-stdin requiere token por entrada estandar${NC}"
                exit 1
            fi
            IFS= read -r token || true
            token="${token%$'\r'}"
        fi

        [[ -z "$token" ]] && { echo -e "${RED}Error: token vacio${NC}"; exit 1; }
    fi

    echo -e "${BLUE}Registrando en aula...${NC}"

    if [[ -z "$enrollment_token" ]]; then
        local validate_response
        validate_response=$(curl -fsS -X POST \
            -H "Content-Type: application/json" \
            -d "{\"token\":\"$token\"}" \
            "$api_url/api/setup/validate-token" 2>/dev/null) || {
            echo -e "${RED}Error: No se pudo validar el token (API no accesible)${NC}"
            exit 1
        }

        local is_valid
        is_valid=$(echo "$validate_response" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print("true" if d.get("valid") is True else "false")
except Exception:
  print("false")
')

        if [[ "$is_valid" != "true" ]]; then
            echo -e "${RED}Error: Token de registro invalido${NC}"
            exit 1
        fi
        echo -e "  Token: ${GREEN}valido${NC}"
    fi

    local hostname version
    hostname=$(hostname)
    if [[ -n "$machine_name" ]]; then
        machine_name=$(normalize_machine_name_value "$machine_name")
    else
        machine_name="$hostname"
    fi

    [[ -z "$machine_name" ]] && { echo -e "${RED}Error: nombre de maquina invalido${NC}"; exit 1; }
    version=$(dpkg -s openpath-dnsmasq 2>/dev/null | grep "^Version:" | awk '{print $2}' || echo "unknown")

    local auth_token=""
    if [[ -n "$enrollment_token" ]]; then
        auth_token="$enrollment_token"
    else
        auth_token="$token"
    fi

    if register_machine "$machine_name" "$classroom" "$classroom_id" "$version" "$api_url" "$auth_token"; then
        if [[ -z "${TOKENIZED_URL:-}" ]] || ! is_tokenized_whitelist_url "$TOKENIZED_URL"; then
            echo -e "${RED}Error: la API no devolvio una whitelist URL tokenizada valida${NC}"
            echo "  Respuesta: ${REGISTER_RESPONSE:-sin respuesta}"
            exit 1
        fi

        local persisted_classroom="$classroom"
        local persisted_classroom_id="$classroom_id"
        if [[ -n "$REGISTERED_CLASSROOM_NAME" ]]; then
            persisted_classroom="$REGISTERED_CLASSROOM_NAME"
        fi
        if [[ -n "$REGISTERED_CLASSROOM_ID" ]]; then
            persisted_classroom_id="$REGISTERED_CLASSROOM_ID"
        fi

        if ! persist_openpath_enrollment_state "$api_url" "$persisted_classroom" "$persisted_classroom_id" "$TOKENIZED_URL"; then
            echo -e "${RED}Error: no se pudo persistir el estado de enrolado${NC}"
            exit 1
        fi
        persist_machine_name "${REGISTERED_MACHINE_NAME:-$machine_name}" || true

        classroom="$persisted_classroom"
        classroom_id="$persisted_classroom_id"

        echo -e "  Registro: ${GREEN}exitoso${NC}"
        echo "  URL: $TOKENIZED_URL"
    else
        echo -e "${RED}Error al registrar maquina${NC}"
        echo "  Respuesta: $REGISTER_RESPONSE"
        exit 1
    fi

    reset_cached_whitelist_state

    echo -e "  Aplicando configuracion..."
    systemctl restart openpath-sse-listener.service 2>/dev/null || true
    /usr/local/bin/openpath-update.sh || echo -e "${YELLOW}Primera actualizacion fallo (el timer lo reintentara)${NC}"

    if [[ -n "$classroom" ]]; then
        echo -e "${GREEN}✓ Registrado en aula: $classroom${NC}"
    elif [[ -n "$classroom_id" ]]; then
        echo -e "${GREEN}✓ Registrado en aula ID: $classroom_id${NC}"
    else
        echo -e "${GREEN}✓ Registrado en aula${NC}"
    fi
}

reset_cached_whitelist_state() {
    rm -f \
        "$WHITELIST_FILE" \
        "${WHITELIST_FILE}.etag" \
        "$SYSTEM_DISABLED_FLAG" \
        "$DNSMASQ_CONF_HASH" \
        "$BROWSER_POLICIES_HASH"
}

cmd_setup() {
    local api_url=""
    local classroom=""
    local classroom_id=""
    local token_file=""
    local token_from_stdin=false
    local token_prompt=""
    local enrollment_token=""
    local machine_name=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --api-url)      api_url="$2"; shift 2 ;;
            --classroom)    classroom="$2"; shift 2 ;;
            --classroom-id) classroom_id="$2"; shift 2 ;;
            --token-file)   token_file="$2"; shift 2 ;;
            --token-stdin)  token_from_stdin=true; shift ;;
            --enrollment-token) enrollment_token="$2"; shift 2 ;;
            --machine-name) machine_name="$2"; shift 2 ;;
            --help)
                echo "Uso: openpath setup [--api-url URL] [--classroom AULA] [--token-file ARCHIVO|--token-stdin]"
                echo "   o: openpath setup --api-url URL --classroom-id ID --enrollment-token TOKEN [--machine-name NOMBRE]"
                echo "Si no pasas argumentos, se inicia modo interactivo."
                return 0
                ;;
            *)
                echo -e "${RED}Opcion desconocida: $1${NC}"
                return 1
                ;;
        esac
    done

    if [[ -z "$api_url" ]]; then
        if ! read_prompt_value api_url "API URL (ej: https://openpath.centro.edu): "; then
            echo -e "${RED}Error: no hay entrada interactiva para solicitar API URL${NC}"
            echo "  Usa --api-url o ejecuta en una terminal interactiva"
            return 1
        fi
    fi
    api_url="${api_url%/}"
    [[ -z "$api_url" ]] && { echo -e "${RED}Error: API URL vacia${NC}"; return 1; }

    if [[ -z "$classroom" ]] && [[ -z "$enrollment_token" ]]; then
        if ! read_prompt_value classroom "Nombre del aula (ej: Aula-101): "; then
            echo -e "${RED}Error: no hay entrada interactiva para solicitar el aula${NC}"
            echo "  Usa --classroom o ejecuta en una terminal interactiva"
            return 1
        fi
    fi

    if [[ -n "$enrollment_token" ]]; then
        if [[ -z "$classroom_id" ]]; then
            echo -e "${RED}Error: --classroom-id requerido con --enrollment-token${NC}"
            return 1
        fi
        if [ -n "$token_file" ] || [ "$token_from_stdin" = true ]; then
            echo -e "${RED}Error: --enrollment-token no se puede combinar con --token-file/--token-stdin${NC}"
            return 1
        fi

        if [ -n "$machine_name" ]; then
            "$0" enroll --api-url "$api_url" --classroom-id "$classroom_id" --enrollment-token "$enrollment_token" --machine-name "$machine_name"
            return $?
        fi
        "$0" enroll --api-url "$api_url" --classroom-id "$classroom_id" --enrollment-token "$enrollment_token"
        return $?
    fi

    [[ -z "$classroom" ]] && { echo -e "${RED}Error: aula vacia${NC}"; return 1; }

    local token_source_count=0
    [ -n "$token_file" ] && token_source_count=$((token_source_count + 1))
    [ "$token_from_stdin" = true ] && token_source_count=$((token_source_count + 1))

    if [ "$token_source_count" -gt 1 ]; then
        echo -e "${RED}Error: usa solo una opcion de token (--token-file o --token-stdin)${NC}"
        return 1
    fi

    if [ "$token_source_count" -eq 0 ]; then
        if ! read_prompt_secret token_prompt "Token de registro: "; then
            echo -e "${RED}Error: sin terminal interactiva; usa --token-file o --token-stdin${NC}"
            return 1
        fi

        if [[ -z "$token_prompt" ]]; then
            echo -e "${RED}Error: token vacio${NC}"
            return 1
        fi

        local token_tmp
        token_tmp=$(mktemp)
        chmod 600 "$token_tmp"
        printf '%s' "$token_prompt" > "$token_tmp"

        if [ -n "$machine_name" ]; then
            "$0" enroll --classroom "$classroom" --api-url "$api_url" --token-file "$token_tmp" --machine-name "$machine_name"
        else
            "$0" enroll --classroom "$classroom" --api-url "$api_url" --token-file "$token_tmp"
        fi
        local enroll_status=$?
        rm -f "$token_tmp"
        return $enroll_status
    fi

    if [ -n "$token_file" ]; then
        if [ -n "$machine_name" ]; then
            "$0" enroll --classroom "$classroom" --api-url "$api_url" --token-file "$token_file" --machine-name "$machine_name"
            return $?
        fi
        "$0" enroll --classroom "$classroom" --api-url "$api_url" --token-file "$token_file"
        return $?
    fi

    if [ -n "$machine_name" ]; then
        "$0" enroll --classroom "$classroom" --api-url "$api_url" --token-stdin --machine-name "$machine_name"
        return $?
    fi

    "$0" enroll --classroom "$classroom" --api-url "$api_url" --token-stdin
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

cmd_rotate_token() {
    if [ ! -f "$ETC_CONFIG_DIR/api-url.conf" ]; then
        echo -e "${RED}Error: No está configurado el modo Aula${NC}"
        echo "  Solo las máquinas registradas en un aula pueden rotar su token"
        exit 1
    fi

    local api_url
    api_url=$(cat "$ETC_CONFIG_DIR/api-url.conf")
    local hostname
    hostname=$(get_registered_machine_name)
    local auth_token=""
    local auth_source="token de máquina"
    auth_token=$(get_machine_token_from_whitelist_url_file 2>/dev/null || true)
    if [ -z "$auth_token" ] && [ -f "$ETC_CONFIG_DIR/api-secret.conf" ]; then
        auth_token=$(cat "$ETC_CONFIG_DIR/api-secret.conf")
        auth_source="secreto legacy"
    fi

    if [ -z "$auth_token" ]; then
        echo -e "${RED}Error: No se encontró credencial para rotar el token${NC}"
        echo "  Se esperaba un token derivable desde $WHITELIST_URL_CONF"
        echo "  Fallback legacy: $ETC_CONFIG_DIR/api-secret.conf"
        exit 1
    fi

    echo -e "${BLUE}Rotando token de descarga...${NC}"
    echo "  Autenticación: $auth_source"

    local response
    response=$(timeout 30 curl -s -X POST \
        -H "Authorization: Bearer $auth_token" \
        -H "Content-Type: application/json" \
        "$api_url/api/machines/$hostname/rotate-download-token" 2>/dev/null)

    if echo "$response" | grep -q '"success":true'; then
        local new_url
        new_url=$(echo "$response" | grep -o '"whitelistUrl":"[^"]*"' | sed 's/"whitelistUrl":"//;s/"$//')
        if [ -n "$new_url" ] && is_tokenized_whitelist_url "$new_url" && persist_openpath_whitelist_url "$new_url"; then
            echo -e "${GREEN}✓ Token rotado exitosamente${NC}"
            echo "  Nueva URL guardada en $WHITELIST_URL_CONF"
        else
            echo -e "${RED}✗ Rotación exitosa pero no se recibió nueva URL${NC}"
            exit 1
        fi
    else
        echo -e "${RED}✗ Error al rotar token${NC}"
        echo "  Respuesta: $response"
        exit 1
    fi
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
