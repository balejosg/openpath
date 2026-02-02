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
# smoke-test.sh - Tests de validación post-instalación
# Parte del sistema OpenPath DNS v3.4
#
# Verifica que el sistema funciona correctamente después de instalar.
# Retorna 0 si todo OK, 1 si hay fallos críticos.
#
# Uso:
#   sudo ./smoke-test.sh           # Test completo
#   sudo ./smoke-test.sh --quick   # Solo tests críticos
################################################################################

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Contadores
PASSED=0
FAILED=0
WARNINGS=0

# Modo rápido
QUICK_MODE=false
[[ "$1" == "--quick" ]] && QUICK_MODE=true

# ============== Funciones de Test ==============

test_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    ((PASSED++))
}

test_fail() {
    echo -e "  ${RED}✗${NC} $1"
    ((FAILED++))
}

test_warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

test_section() {
    echo ""
    echo -e "${BLUE}[$1]${NC} $2"
}

# ============== Tests Críticos ==============

test_dnsmasq_running() {
    test_section "1/6" "dnsmasq service"
    
    if systemctl is-active --quiet dnsmasq; then
        test_pass "dnsmasq está activo"
    else
        test_fail "dnsmasq no está activo"
        return 1
    fi
}

test_port_53() {
    test_section "2/6" "Puerto 53"
    
    if ss -ulnp 2>/dev/null | grep -q ":53 "; then
        local proc
        proc=$(ss -ulnp 2>/dev/null | grep ":53 " | grep -oP 'users:\(\("\K[^"]+')
        test_pass "Puerto 53 UDP escuchando ($proc)"
    else
        # In Docker/CI environments, DNS may work via --dns flag without local port 53
        # This is a warning, not a failure - actual DNS tests verify functionality
        test_warn "Puerto 53 UDP no está escuchando (puede ser normal en Docker/CI)"
    fi
}

test_dns_resolves_whitelisted() {
    test_section "3/6" "DNS resuelve dominios whitelisteados"
    
    # Estos dominios deberían estar siempre whitelisteados
    local test_domains=("google.com" "github.com")
    local all_ok=true
    
    for domain in "${test_domains[@]}"; do
        local result
        result=$(timeout 3 dig @127.0.0.1 "$domain" +short 2>/dev/null | head -1)
        if [ -n "$result" ]; then
            test_pass "$domain → $result"
        else
            test_fail "$domain no resuelve"
            all_ok=false
        fi
    done
    
    $all_ok
}

test_dns_blocks_unknown() {
    test_section "4/6" "DNS bloquea dominios no whitelisteados"
    
    # Dominios que NO deberían existir/resolver
    local blocked_domains=("thisdomaindoesnotexist12345.com" "malware-test-blocked.net")
    local all_ok=true
    
    for domain in "${blocked_domains[@]}"; do
        local result
        result=$(timeout 3 dig @127.0.0.1 "$domain" +short 2>/dev/null | head -1)
        if [ -z "$result" ] || [ "$result" == "127.0.0.1" ] || [ "$result" == "0.0.0.0" ]; then
            test_pass "$domain bloqueado correctamente"
        else
            test_warn "$domain resuelve a $result (debería estar bloqueado)"
            all_ok=false
        fi
    done
    
    $all_ok
}

test_firewall_rules() {
    test_section "5/6" "Reglas de firewall"
    
    if ! command -v iptables &>/dev/null; then
        test_warn "iptables no disponible"
        return 0
    fi
    
    # Verificar que hay reglas en OUTPUT
    local rules_count
    rules_count=$(iptables -L OUTPUT -n 2>/dev/null | wc -l)
    if [ "$rules_count" -gt 3 ]; then
        test_pass "Firewall configurado ($((rules_count - 2)) reglas en OUTPUT)"
    else
        test_warn "Firewall puede no estar configurado (pocas reglas)"
    fi
    
    # Verificar bloqueo de puertos DNS externos
    if iptables -L OUTPUT -n 2>/dev/null | grep -q "dpt:53"; then
        test_pass "Bloqueo de DNS externo configurado"
    else
        test_warn "No se detectó bloqueo de DNS externo"
    fi
}

test_config_files() {
    test_section "6/6" "Archivos de configuración"
    
    local all_ok=true
    
    if [ -f /etc/dnsmasq.d/openpath.conf ]; then
        test_pass "/etc/dnsmasq.d/openpath.conf existe"
    else
        test_fail "Configuración dnsmasq no encontrada"
        all_ok=false
    fi
    
    if [ -f /var/lib/openpath/whitelist.txt ]; then
        local count
        count=$(grep -cv "^#\|^$" /var/lib/openpath/whitelist.txt 2>/dev/null || echo "0")
        test_pass "Whitelist descargada ($count dominios)"
    else
        test_warn "Whitelist no descargada aún (el timer lo hará)"
    fi
    
    # Config in /etc/ (Debian FHS compliant)
    if [ -f /etc/openpath/whitelist-url.conf ]; then
        test_pass "URL de whitelist configurada"
    else
        test_fail "URL de whitelist no configurada"
        all_ok=false
    fi
    
    $all_ok
}

# ============== Main ==============

main() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Smoke Tests - OpenPath System v3.4${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    
    # Tests críticos (siempre se ejecutan)
    test_dnsmasq_running
    test_port_53
    
    if [ "$QUICK_MODE" = false ]; then
        # Tests completos
        test_dns_resolves_whitelisted
        test_dns_blocks_unknown
        test_firewall_rules
        test_config_files
    fi
    
    # Resumen
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "  Resultados: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}, ${YELLOW}$WARNINGS warnings${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
    
    if [ "$FAILED" -gt 0 ]; then
        echo -e "${RED}✗ SMOKE TESTS FAILED${NC}"
        echo ""
        echo "El sistema puede no funcionar correctamente."
        echo "Ejecuta 'openpath status' para más detalles."
        return 1
    elif [ "$WARNINGS" -gt 0 ]; then
        echo -e "${YELLOW}⚠ SMOKE TESTS PASSED WITH WARNINGS${NC}"
        echo ""
        return 0
    else
        echo -e "${GREEN}✓ SMOKE TESTS PASSED${NC}"
        echo ""
        return 0
    fi
}

# Verificar root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Ejecutar con sudo"
    exit 1
fi

main "$@"
