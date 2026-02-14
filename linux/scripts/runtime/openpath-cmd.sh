#!/bin/bash

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
# openpath - Comando unificado de gestión
# Parte del sistema OpenPath DNS
################################################################################

# Cargar librerías
INSTALL_DIR="/usr/local/lib/openpath"
source "$INSTALL_DIR/lib/common.sh" 2>/dev/null || {
    echo "ERROR: Sistema no instalado correctamente"
    exit 1
}

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Comandos que requieren root
ROOT_COMMANDS="update health force enable disable restart rotate-token enroll"

# Auto-elevar a root si el comando lo requiere
auto_elevate() {
    local cmd="${1:-status}"
    if [[ " $ROOT_COMMANDS " =~ \ $cmd\  ]] && [ "$EUID" -ne 0 ]; then
        exec sudo "$0" "$@"
    fi
}

# Llamar auto-elevación con los argumentos originales
auto_elevate "$@"

# Mostrar estado
cmd_status() {
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Sistema dnsmasq URL Whitelist v$VERSION${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
    
    echo -e "${YELLOW}Servicios:${NC}"
    for svc in dnsmasq openpath-dnsmasq.timer dnsmasq-watchdog.timer captive-portal-detector openpath-sse-listener; do
        if systemctl is-active --quiet $svc 2>/dev/null; then
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
    echo ""
}

# Forzar actualización
cmd_update() {
    echo -e "${BLUE}Actualizando whitelist...${NC}"
    /usr/local/bin/openpath-update.sh
}

# Test DNS
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

# Ver logs
cmd_logs() {
    tail -f "$LOG_FILE"
}

cmd_log() {
    local lines="${1:-50}"
    # Validate numeric input
    if ! [[ "$lines" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}Error: '$lines' is not a valid number of lines${NC}"
        echo "Uso: openpath log [N]"
        exit 1
    fi
    tail -n "$lines" "$LOG_FILE"
}

# Listar dominios
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

# Verificar dominio
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

# Comprehensive health check
cmd_health() {
    local failed=0

    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  OpenPath Health Check v$VERSION${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""

    # DNS resolution test
    echo -e "${YELLOW}DNS Resolution:${NC}"
    if timeout 3 dig @127.0.0.1 google.com +short >/dev/null 2>&1; then
        echo -e "  Whitelisted domain (google.com): ${GREEN}✓ resolves${NC}"
    else
        echo -e "  Whitelisted domain (google.com): ${RED}✗ FAILED${NC}"
        failed=1
    fi

    # DNS blocking test (non-whitelisted domain should NOT resolve)
    if ! timeout 3 dig @127.0.0.1 blocked-test.invalid +short 2>/dev/null | grep -q .; then
        echo -e "  Blocked domain (blocked-test.invalid): ${GREEN}✓ blocked${NC}"
    else
        echo -e "  Blocked domain (blocked-test.invalid): ${RED}✗ NOT BLOCKED${NC}"
        failed=1
    fi
    echo ""

    # Firewall test
    echo -e "${YELLOW}Firewall:${NC}"
    if iptables -L OUTPUT -n 2>/dev/null | grep -q "dpt:53"; then
        echo -e "  DNS blocking rules: ${GREEN}✓ active${NC}"
    else
        echo -e "  DNS blocking rules: ${RED}✗ MISSING${NC}"
        failed=1
    fi

    if iptables -L OUTPUT -n 2>/dev/null | grep -q "ACCEPT.*lo"; then
        echo -e "  Loopback rule: ${GREEN}✓ present${NC}"
    else
        echo -e "  Loopback rule: ${YELLOW}⚠ not found${NC}"
    fi
    echo ""

    # Services test
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

    # Whitelist freshness
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

    # Browser policies check
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

    # Final result
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    if [ "$failed" -eq 0 ]; then
        echo -e "  Overall status: ${GREEN}✓ HEALTHY${NC}"
    else
        echo -e "  Overall status: ${RED}✗ ISSUES DETECTED${NC}"
    fi
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"

    return $failed
}

# Registrar maquina en un aula
cmd_enroll() {
    local classroom="" classroom_id="" api_url="" token="" enrollment_token=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --classroom)  classroom="$2"; shift 2 ;;
            --classroom-id) classroom_id="$2"; shift 2 ;;
            --api-url)    api_url="$2"; shift 2 ;;
            --token)      token="$2"; shift 2 ;;
            --enrollment-token) enrollment_token="$2"; shift 2 ;;
            *)            echo -e "${RED}Opcion desconocida: $1${NC}"; exit 1 ;;
        esac
    done
    
    # Validate required params
    [[ -z "$api_url" ]]   && { echo -e "${RED}Error: --api-url requerido${NC}"; exit 1; }
    api_url="${api_url%/}"

    if [[ -n "$enrollment_token" ]]; then
        [[ -z "$classroom_id" ]] && { echo -e "${RED}Error: --classroom-id requerido con --enrollment-token${NC}"; exit 1; }
    else
        [[ -z "$classroom" ]] && { echo -e "${RED}Error: --classroom requerido${NC}"; exit 1; }
        [[ -z "$token" ]]     && { echo -e "${RED}Error: --token requerido${NC}"; exit 1; }
    fi
    
    echo -e "${BLUE}Registrando en aula...${NC}"
    
    # Step 1: Validate token
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
    
    # Step 2: Save config
    mkdir -p "$ETC_CONFIG_DIR"
    echo "$api_url"   > "$ETC_CONFIG_DIR/api-url.conf"
    if [[ -n "$classroom" ]]; then
        echo "$classroom" > "$ETC_CONFIG_DIR/classroom.conf"
    fi
    if [[ -n "$classroom_id" ]]; then
        echo "$classroom_id" > "$ETC_CONFIG_DIR/classroom-id.conf"
    fi
    
    # Step 3: Generate API secret if missing
    if [[ ! -f "$ETC_CONFIG_DIR/api-secret.conf" ]] || [[ ! -s "$ETC_CONFIG_DIR/api-secret.conf" ]]; then
        local secret
        secret=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)
        echo "$secret" > "$ETC_CONFIG_DIR/api-secret.conf"
        chmod 600 "$ETC_CONFIG_DIR/api-secret.conf"
    fi
    
    # Step 4: Register with API
    local hostname version response
    hostname=$(hostname)
    version=$(dpkg -s openpath-dnsmasq 2>/dev/null | grep "^Version:" | awk '{print $2}' || echo "unknown")

    local payload

    if [[ -n "$enrollment_token" ]]; then
        payload=$(HN="$hostname" CID="$classroom_id" VER="$version" python3 -c 'import json,os
print(json.dumps({"hostname": os.environ.get("HN",""), "classroomId": os.environ.get("CID",""), "version": os.environ.get("VER","unknown")}))
')
        response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $enrollment_token" \
            -d "$payload" \
            "$api_url/api/machines/register" 2>/dev/null)
    else
        payload=$(HN="$hostname" CNAME="$classroom" VER="$version" python3 -c 'import json,os
print(json.dumps({"hostname": os.environ.get("HN",""), "classroomName": os.environ.get("CNAME",""), "version": os.environ.get("VER","unknown")}))
')
        response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $token" \
            -d "$payload" \
            "$api_url/api/machines/register" 2>/dev/null)
    fi

    local tokenized_url
    tokenized_url=$(echo "$response" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  if d.get("success") is True and isinstance(d.get("whitelistUrl"), str) and d.get("whitelistUrl"):
    print(d.get("whitelistUrl"))
except Exception:
  pass
')

    if [[ -n "$tokenized_url" ]]; then
        echo "$tokenized_url" > "$WHITELIST_URL_CONF"
        echo -e "  Registro: ${GREEN}exitoso${NC}"
        echo "  URL: $tokenized_url"
    else
        echo -e "${RED}Error al registrar maquina${NC}"
        echo "  Respuesta: $response"
        exit 1
    fi
    
    # Step 5: Apply immediately
    echo -e "  Aplicando configuracion..."
    /usr/local/bin/openpath-update.sh || echo -e "${YELLOW}Primera actualizacion fallo (el timer lo reintentara)${NC}"
    
    if [[ -n "$classroom" ]]; then
        echo -e "${GREEN}✓ Registrado en aula: $classroom${NC}"
    else
        echo -e "${GREEN}✓ Registrado en aula${NC}"
    fi
}

# Forzar aplicación
cmd_force() {
    source "$INSTALL_DIR/lib/firewall.sh"
    source "$INSTALL_DIR/lib/browser.sh"
    
    echo -e "${BLUE}Forzando aplicación de cambios...${NC}"
    echo -e "${YELLOW}Se cerrarán los navegadores${NC}"
    echo ""
    
    flush_connections
    flush_dns_cache
    force_browser_close
    
    echo -e "${GREEN}✓ Cambios aplicados${NC}"
}

# Habilitar
cmd_enable() {
    source "$INSTALL_DIR/lib/services.sh"
    source "$INSTALL_DIR/lib/firewall.sh"
    source "$INSTALL_DIR/lib/browser.sh"

    echo -e "${BLUE}Habilitando sistema...${NC}"
    enable_services
    /usr/local/bin/openpath-update.sh

    # Forzar cierre de navegadores y limpieza de conexiones
    force_browser_close
    flush_connections

    echo -e "${GREEN}✓ Sistema habilitado${NC}"
}

# Deshabilitar
cmd_disable() {
    source "$INSTALL_DIR/lib/firewall.sh"
    source "$INSTALL_DIR/lib/browser.sh"
    
    echo -e "${YELLOW}Deshabilitando sistema...${NC}"
    
    systemctl stop openpath-dnsmasq.timer
    systemctl stop dnsmasq-watchdog.timer
    
    deactivate_firewall
    cleanup_browser_policies
    
    # dnsmasq passthrough
    cat > "$DNSMASQ_CONF" << EOF
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
server=$(head -1 "$ORIGINAL_DNS_FILE" 2>/dev/null || echo "8.8.8.8")
EOF
    
    systemctl restart dnsmasq
    force_browser_close
    
    echo -e "${GREEN}✓ Sistema deshabilitado${NC}"
}

# Reiniciar
cmd_restart() {
    echo -e "${BLUE}Reiniciando servicios...${NC}"
    
    systemctl restart dnsmasq
    systemctl restart openpath-dnsmasq.timer
    systemctl restart dnsmasq-watchdog.timer
    systemctl restart captive-portal-detector.service 2>/dev/null || true
    systemctl restart openpath-sse-listener.service 2>/dev/null || true
    
    # Esperar a que dnsmasq esté listo (máx 5 segundos)
    for _ in $(seq 1 5); do
        if systemctl is-active --quiet dnsmasq; then
            break
        fi
        sleep 1
    done
    
    cmd_status
}

# Rotar token de descarga
cmd_rotate_token() {
    if [ ! -f "$ETC_CONFIG_DIR/api-url.conf" ]; then
        echo -e "${RED}Error: No está configurado el modo Aula${NC}"
        echo "  Solo las máquinas registradas en un aula pueden rotar su token"
        exit 1
    fi
    
    local api_url
    api_url=$(cat "$ETC_CONFIG_DIR/api-url.conf")
    local hostname
    hostname=$(hostname)
    local secret=""
    if [ -f "$ETC_CONFIG_DIR/api-secret.conf" ]; then
        secret=$(cat "$ETC_CONFIG_DIR/api-secret.conf")
    fi
    
    if [ -z "$secret" ]; then
        echo -e "${RED}Error: No se encontró el secreto de API${NC}"
        echo "  Archivo esperado: $ETC_CONFIG_DIR/api-secret.conf"
        exit 1
    fi
    
    echo -e "${BLUE}Rotando token de descarga...${NC}"
    
    local response
    response=$(timeout 30 curl -s -X POST \
        -H "Authorization: Bearer $secret" \
        -H "Content-Type: application/json" \
        "$api_url/api/machines/$hostname/rotate-download-token" 2>/dev/null)
    
    if echo "$response" | grep -q '"success":true'; then
        local new_url
        new_url=$(echo "$response" | grep -o '"whitelistUrl":"[^"]*"' | sed 's/"whitelistUrl":"//;s/"$//')
        if [ -n "$new_url" ]; then
            echo "$new_url" > "$WHITELIST_URL_CONF"
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

# Ayuda
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
    echo "  rotate-token    Rotar token de descarga (modo Aula)"
    echo "  enroll          Registrar maquina en un aula"
    echo "  help            Mostrar esta ayuda"
    echo ""
}

# Procesar comando
case "${1:-status}" in
    status)     cmd_status ;;
    update)     cmd_update ;;
    test)       cmd_test ;;
    logs)       cmd_logs ;;
    log)        cmd_log "$2" ;;
    domains)    cmd_domains "$2" ;;
    check)      cmd_check "$2" ;;
    health)     cmd_health ;;
    force)      cmd_force ;;
    enable)     cmd_enable ;;
    disable)    cmd_disable ;;
    restart)    cmd_restart ;;
    rotate-token) cmd_rotate_token ;;
    enroll)     shift; cmd_enroll "$@" ;;
    help|--help|-h) cmd_help ;;
    *)
        echo -e "${RED}Comando desconocido: $1${NC}"
        cmd_help
        exit 1
        ;;
esac
