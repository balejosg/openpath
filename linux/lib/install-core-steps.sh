#!/bin/bash

################################################################################
# install-core-steps.sh - Core installer workflow steps
################################################################################

run_pre_install_validation() {
    local errors=0
    local warnings=0

    echo ""
    echo "[Preflight] Validando requisitos del sistema..."

    if [ "$EUID" -ne 0 ]; then
        echo "  ✗ Requiere privilegios root"
        errors=$((errors + 1))
    else
        echo "  ✓ Privilegios root detectados"
    fi

    if [ ! -d /run/systemd/system ]; then
        echo "  ✗ systemd no está activo (requerido para timers/servicios)"
        errors=$((errors + 1))
    else
        echo "  ✓ systemd activo"
    fi

    if ! command -v apt-get >/dev/null 2>&1; then
        echo "  ✗ apt-get no disponible (se requiere distribución Debian/Ubuntu)"
        errors=$((errors + 1))
    else
        echo "  ✓ apt-get disponible"
    fi

    if ! command -v systemctl >/dev/null 2>&1; then
        echo "  ✗ systemctl no disponible"
        errors=$((errors + 1))
    else
        echo "  ✓ systemctl disponible"
    fi

    local free_mb
    free_mb=$(df -Pm / | awk 'NR==2 {print $4}')
    if [ -n "$free_mb" ] && [ "$free_mb" -lt 200 ]; then
        echo "  ✗ Espacio insuficiente en / (${free_mb}MB libres, mínimo 200MB)"
        errors=$((errors + 1))
    else
        echo "  ✓ Espacio en disco suficiente"
    fi

    if ! ip -o link show up 2>/dev/null | grep -q "state UP"; then
        echo "  ⚠ No se detecta interfaz de red activa"
        warnings=$((warnings + 1))
    else
        echo "  ✓ Interfaz de red activa detectada"
    fi

    if ! timeout 5 getent hosts github.com >/dev/null 2>&1; then
        echo "  ⚠ DNS/Internet no verificado (continuará igualmente)"
        warnings=$((warnings + 1))
    else
        echo "  ✓ Resolución DNS funcional"
    fi

    if ss -lntu 2>/dev/null | grep -qE '[:.]53\s'; then
        echo "  ⚠ Puerto 53 ya en uso (se intentará liberar durante la instalación)"
        warnings=$((warnings + 1))
    else
        echo "  ✓ Puerto 53 disponible"
    fi

    if [ "$errors" -gt 0 ]; then
        echo ""
        echo "✗ Preflight fallido: ${errors} error(es), ${warnings} advertencia(s)"
        echo "  Corrija los errores o use --skip-preflight bajo su propio riesgo"
        exit 1
    fi

    if [ "$warnings" -gt 0 ]; then
        echo "  ✓ Preflight completado con ${warnings} advertencia(s)"
    else
        echo "  ✓ Preflight completado sin advertencias"
    fi
}

step_install_libraries() {
    echo "[1/13] Instalando librerías..."
    mkdir -p "$INSTALL_DIR/lib"
    mkdir -p "$INSTALL_DIR/libexec"
    mkdir -p "$CONFIG_DIR"

    cp "$INSTALLER_SOURCE_DIR/lib/"*.sh "$INSTALL_DIR/lib/"
    cp "$INSTALLER_SOURCE_DIR/libexec/browser-json.py" "$INSTALL_DIR/libexec/"
    cp "$INSTALLER_SOURCE_DIR/../runtime/browser-policy-spec.json" "$INSTALL_DIR/libexec/"
    cp "$INSTALLER_SOURCE_DIR/uninstall.sh" "$INSTALL_DIR/uninstall.sh"

    chmod +x "$INSTALL_DIR/lib/"*.sh
    chmod +x "$INSTALL_DIR/libexec/browser-json.py"
    chmod +x "$INSTALL_DIR/uninstall.sh"
    echo "✓ Librerías instaladas"

    source "$INSTALL_DIR/lib/common.sh"
    load_libraries
}

step_install_dependencies() {
    echo ""
    echo "[2/13] Instalando dependencias..."

    apt_update_with_retry
    DEBIAN_FRONTEND=noninteractive apt_install_with_retry "dependencias base" \
        apt-get install -y \
        iptables ipset curl iproute2 \
        libcap2-bin dnsutils conntrack python3

    RUNLEVEL=1 apt_install_with_retry "dnsmasq" \
        apt-get install -y dnsmasq

    if [ -d /etc/default ]; then
        grep -q "IGNORE_RESOLVCONF" /etc/default/dnsmasq 2>/dev/null || \
            echo "IGNORE_RESOLVCONF=yes" >> /etc/default/dnsmasq
    fi

    setcap 'cap_net_bind_service,cap_net_admin=+ep' /usr/sbin/dnsmasq 2>/dev/null || true
    echo "✓ Dependencias instaladas"
}

step_free_port_53() {
    echo ""
    echo "[3/13] Liberando puerto 53..."

    free_port_53
    echo "✓ Puerto 53 liberado"
}

step_detect_dns() {
    echo ""
    echo "[4/13] Detectando DNS primario..."

    PRIMARY_DNS=$(detect_primary_dns)
    echo "$PRIMARY_DNS" > "$CONFIG_DIR/original-dns.conf"
    echo "✓ DNS primario: $PRIMARY_DNS"
}

step_install_scripts() {
    echo ""
    echo "[5/13] Instalando scripts..."

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-update.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-update.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/dnsmasq-watchdog.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/dnsmasq-watchdog.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/captive-portal-detector.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/captive-portal-detector.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-sse-listener.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-sse-listener.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-browser-setup.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-browser-setup.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-cmd.sh" "$SCRIPTS_DIR/openpath"
    chmod +x "$SCRIPTS_DIR/openpath"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-self-update.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-self-update.sh"

    cp "$INSTALLER_SOURCE_DIR/scripts/runtime/openpath-agent-update.sh" "$SCRIPTS_DIR/"
    chmod +x "$SCRIPTS_DIR/openpath-agent-update.sh"

    create_dns_init_script

    mkdir -p "$ETC_CONFIG_DIR"
    chown root:root "$ETC_CONFIG_DIR" "$CONFIG_DIR" 2>/dev/null || true
    chmod 755 "$ETC_CONFIG_DIR" 2>/dev/null || true

    if [ -n "$WHITELIST_URL" ]; then
        if ! persist_openpath_whitelist_url "$WHITELIST_URL"; then
            echo "✗ ERROR: whitelist URL inválida"
            exit 1
        fi
    else
        echo "  → Whitelist URL no configurada todavía"
    fi

    if persist_openpath_health_api_config "$HEALTH_API_URL" "$HEALTH_API_SECRET"; then
        if [ -n "$HEALTH_API_URL" ]; then
            echo "  → Health API URL configurada"
        fi
        if [ -n "$HEALTH_API_SECRET" ]; then
            echo "  → Health API secret configurado"
        fi
    else
        echo "✗ ERROR: configuración health API inválida"
        exit 1
    fi

    if [ -n "$CLASSROOM_NAME" ] && [ -n "$API_URL" ]; then
        if ! persist_openpath_classroom_runtime_config "$API_URL" "$CLASSROOM_NAME" ""; then
            echo "✗ ERROR: configuración de aula inválida"
            exit 1
        fi

        if [ -n "$HEALTH_API_SECRET" ]; then
            cp "$HEALTH_API_SECRET_CONF" "$ETC_CONFIG_DIR/api-secret.conf"
            chown root:root "$ETC_CONFIG_DIR/api-secret.conf" 2>/dev/null || true
            chmod 600 "$ETC_CONFIG_DIR/api-secret.conf"
        fi
        echo "  → Modo Aula configurado: $CLASSROOM_NAME"
    fi

    echo "✓ Scripts instalados"
}

step_configure_sudoers() {
    echo ""
    echo "[6/13] Configurando permisos sudo..."

    if [[ ! -d /etc/sudoers.d ]]; then
        mkdir -p /etc/sudoers.d
        chmod 755 /etc/sudoers.d
    fi

    cat > /etc/sudoers.d/openpath << 'EOF'
# Permitir a todos los usuarios ejecutar comandos de LECTURA sin contraseña
# Estos son seguros: no modifican configuración ni desactivan protecciones
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath status
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath test
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath check *
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath health
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath domains
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath domains *
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath log
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath log *
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath logs
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath help

# Comandos de sistema (solo internos, no expuestos al usuario)
ALL ALL=(root) NOPASSWD: /usr/local/bin/openpath-update.sh
ALL ALL=(root) NOPASSWD: /usr/local/bin/dnsmasq-watchdog.sh

# NOTA: Los siguientes comandos REQUIEREN contraseña de root:
# openpath update, enable, disable, force, restart, rotate-token, enroll, setup
EOF

    chmod 440 /etc/sudoers.d/openpath
    echo "✓ Permisos sudo configurados"
}

step_create_services() {
    echo ""
    echo "[7/13] Creando servicios systemd..."

    create_systemd_services
    create_logrotate_config
    create_tmpfiles_config

    echo "✓ Servicios creados"
}

step_configure_dns() {
    echo ""
    echo "[8/13] Configurando DNS..."

    configure_upstream_dns
    configure_resolv_conf

    echo "✓ DNS configurado"
}

step_configure_dnsmasq() {
    echo ""
    echo "[9/13] Configurando dnsmasq..."

    if [ -f /etc/dnsmasq.conf ]; then
        sed -i 's/^no-resolv/#no-resolv/g' /etc/dnsmasq.conf 2>/dev/null || true
        sed -i 's/^cache-size=/#cache-size=/g' /etc/dnsmasq.conf 2>/dev/null || true
    fi

    cat > /etc/dnsmasq.d/openpath.conf << EOF
# Configuración inicial - será sobrescrita por dnsmasq-whitelist.sh
no-resolv
resolv-file=/run/dnsmasq/resolv.conf
listen-address=127.0.0.1
bind-interfaces
cache-size=1000
server=$PRIMARY_DNS
EOF

    systemctl reset-failed dnsmasq 2>/dev/null || true
    systemctl restart dnsmasq

    echo "  Esperando a que dnsmasq esté activo..."
    for _ in $(seq 1 5); do
        if systemctl is-active --quiet dnsmasq; then
            break
        fi
        sleep 1
    done

    if systemctl is-active --quiet dnsmasq; then
        echo "✓ dnsmasq activo"
    else
        echo "✗ ERROR: dnsmasq no arrancó"
        journalctl -u dnsmasq -n 10 --no-pager
        exit 1
    fi
}
