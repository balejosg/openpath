#!/bin/bash

################################################################################
# install-runtime-steps.sh - Browser/runtime installer workflow steps
################################################################################

step_install_firefox() {
    echo ""
    echo "[10/13] Instalando Firefox..."

    if [ "$INSTALL_FIREFOX" = false ]; then
        echo "⊘ Firefox omitido (--skip-firefox)"
        return 0
    fi

    if install_firefox_esr; then
        echo "✓ Firefox instalado"
    else
        echo "⚠ Firefox no pudo instalarse (continuando)"
    fi
}

step_apply_policies() {
    echo ""
    echo "[11/13] Verificando integraciones de navegadores..."

    echo "✓ Integraciones preparadas"
}

step_install_extension() {
    echo ""
    echo "[12/13] Instalando extensiones del navegador..."

    if [ "$INSTALL_EXTENSION" = true ]; then
        if [ "$INSTALL_NATIVE_HOST" = true ]; then
            if ! is_openpath_request_setup_complete; then
                if ! run_classroom_registration; then
                    echo "✗ ERROR: no se pudo completar el registro requerido para solicitudes del navegador"
                    return 1
                fi
            fi

            require_openpath_request_setup_complete "source install browser request setup" || return 1
        fi

        local staged_ext_dir="$INSTALL_DIR/firefox-extension"
        local staged_release_dir="$INSTALL_DIR/firefox-release"
        local firefox_release_source=""

        rm -rf "$staged_ext_dir"
        rm -rf "$staged_release_dir"
        stage_firefox_installation_bundle "$INSTALLER_SOURCE_DIR/firefox-extension" "$staged_ext_dir"

        if firefox_release_source="$(stage_firefox_release_artifacts "$INSTALLER_SOURCE_DIR" "$staged_release_dir")"; then
            echo "  ✓ Artefactos Firefox Release firmados preparados desde $firefox_release_source"
        fi

        local browser_integration_args=(
            --firefox-required
            --chromium-best-effort
            --native-host-required
        )
        if [ "$INSTALL_NATIVE_HOST" = true ]; then
            browser_integration_args+=(--native-host)
        fi

        install_browser_integrations \
            "$staged_ext_dir" \
            "$staged_release_dir" \
            "${browser_integration_args[@]}"
        echo "✓ Extensiones del navegador instaladas"
    else
        echo "⊘ Extensiones del navegador omitidas (--no-extension)"
    fi
}

step_enable_services() {
    echo ""
    echo "[13/13] Habilitando servicios..."

    enable_services

    echo "Generando hashes de integridad..."
    source "$INSTALL_DIR/lib/common.sh"
    INTEGRITY_HASH_FILE="$VAR_STATE_DIR/integrity.sha256"
    : > "$INTEGRITY_HASH_FILE"
    for f in "${CRITICAL_FILES[@]}"; do
        [ -f "$f" ] && sha256sum "$f" >> "$INTEGRITY_HASH_FILE"
    done
    chmod 600 "$INTEGRITY_HASH_FILE"
    echo "✓ Hashes de integridad generados"

    echo "Ejecutando primera actualización..."
    "$SCRIPTS_DIR/openpath-update.sh" || echo "⚠ Primera actualización falló (el timer lo reintentará)"

    echo "✓ Servicios habilitados"
}

run_smoke_tests() {
    if [ -f "$INSTALLER_SOURCE_DIR/scripts/runtime/smoke-test.sh" ]; then
        cp "$INSTALLER_SOURCE_DIR/scripts/runtime/smoke-test.sh" "$SCRIPTS_DIR/"
        chmod +x "$SCRIPTS_DIR/smoke-test.sh"
    fi

    echo ""
    echo "Ejecutando smoke tests..."
    if "$SCRIPTS_DIR/smoke-test.sh" --quick 2>/dev/null; then
        SMOKE_STATUS="PASSED"
    else
        SMOKE_STATUS="FAILED"
    fi
}

run_classroom_registration() {
    MACHINE_REGISTERED=""
    if is_openpath_request_setup_complete; then
        MACHINE_REGISTERED="REGISTERED"
        return 0
    fi

    if [ -n "$CLASSROOM_NAME" ] && [ -n "$API_URL" ]; then
        echo ""
        echo "Registrando máquina en aula..."

        if register_machine "$(hostname)" "$CLASSROOM_NAME" "" "$VERSION" "$API_URL" "$REGISTRATION_TOKEN"; then
            MACHINE_REGISTERED="REGISTERED"
            if [ -n "$TOKENIZED_URL" ] && is_tokenized_whitelist_url "$TOKENIZED_URL" && persist_openpath_whitelist_url "$TOKENIZED_URL"; then
                WHITELIST_URL="$TOKENIZED_URL"
                if [ -n "$REGISTERED_MACHINE_NAME" ]; then
                    persist_machine_name "$REGISTERED_MACHINE_NAME" || true
                fi
                echo "✓ Máquina registrada en aula: $CLASSROOM_NAME"
                echo "  → Whitelist URL tokenizada guardada"
            else
                MACHINE_REGISTERED="FAILED"
                echo "⚠ Registro exitoso pero no se recibió URL tokenizada"
                return 1
            fi
        else
            MACHINE_REGISTERED="FAILED"
            echo "⚠ Error al registrar máquina"
            echo "  Respuesta: $REGISTER_RESPONSE"
            return 1
        fi
    elif [ "$INSTALL_NATIVE_HOST" = true ]; then
        MACHINE_REGISTERED="FAILED"
        echo "⚠ Modo de solicitudes del navegador requiere configuración de aula"
        return 1
    fi

    return 0
}

print_summary() {
    if [ "$VERBOSE" != true ]; then
        echo ""
        echo "Installation complete."
        echo "Status: dnsmasq=$(systemctl is-active dnsmasq), smoke-tests=$SMOKE_STATUS"
        if [ -n "$MACHINE_REGISTERED" ]; then
            echo "Enrollment: $MACHINE_REGISTERED"
        fi
        echo "Manage with: openpath status"
        echo "Uninstall: sudo $INSTALLER_SOURCE_DIR/uninstall.sh"
        echo ""
        return 0
    fi

    echo ""
    echo "======================================================"
    echo "  ✓ INSTALACIÓN COMPLETADA"
    echo "======================================================"
    echo ""
    echo "Estado:"
    echo "  - dnsmasq: $(systemctl is-active dnsmasq)"
    echo "  - Timer: $(systemctl is-active openpath-dnsmasq.timer)"
    echo "  - Agent Update: $(systemctl is-active openpath-agent-update.timer)"
    echo "  - Watchdog: $(systemctl is-active dnsmasq-watchdog.timer)"
    echo "  - Smoke Tests: $SMOKE_STATUS"
    if [ -n "$MACHINE_REGISTERED" ]; then
        echo "  - Registro Aula: $MACHINE_REGISTERED"
    fi
    echo ""
    echo "Configuración:"
    echo "  - Whitelist: $WHITELIST_URL"
    echo "  - DNS upstream: $PRIMARY_DNS"
    echo ""
    echo "Comando de gestión: openpath"
    echo "  openpath status  - Ver estado"
    echo "  openpath test    - Probar DNS"
    echo "  openpath update  - Forzar actualización"
    echo "  openpath help    - Ver ayuda completa"
    echo ""
    echo "Tests manuales:"
    echo "  sudo smoke-test.sh        - Ejecutar smoke tests completos"
    echo "  sudo smoke-test.sh --quick - Solo tests críticos"
    echo ""
    echo "Desinstalar: sudo $INSTALLER_SOURCE_DIR/uninstall.sh"
    echo ""
}
