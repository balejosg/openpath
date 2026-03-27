# OpenPath DNS para Windows

Sistema de control de acceso a internet mediante DNS sinkhole para Windows, usando Acrylic DNS Proxy.

## Características

✅ **DNS Sinkhole** - Bloquea todos los dominios excepto whitelist  
✅ **Acrylic DNS Proxy** - Servidor DNS local con soporte wildcards  
✅ **Windows Firewall** - Bloquea DNS externo, VPNs, Tor  
✅ **Bloqueo de salida DoH** - Bloquea IPs conocidas de resolutores DNS-over-HTTPS por 443  
✅ **Políticas de navegadores** - Firefox y Chrome/Edge  
✅ **Auto-instalación de extensión Firefox** - Copia y fuerza la instalación de la extensión incluida cuando el instalador dispone de sus assets  
✅ **Actualización automática** - Cada 15 minutos vía Task Scheduler  
✅ **Fail-safe por whitelist caducada** - Modo restrictivo seguro cuando la caché expira sin conexión  
✅ **Baseline de integridad** - Detecta manipulación de scripts/módulos e intenta restauración acotada  
✅ **Rollback por checkpoints** - Guarda checkpoints rotativos de whitelist para recuperación del watchdog  
✅ **Watchdog** - Auto-recuperación de fallos

## Requisitos

- Windows 10/11 o Windows Server 2016+
- PowerShell 5.1+
- Privilegios de administrador

## Instalación Rápida

```powershell
# Ejecutar como Administrador
.\Install-OpenPath.ps1 -WhitelistUrl "http://tu-servidor:3000/export/grupo.txt"

# Modo aula (no interactivo, token corto de inscripción)
.\Install-OpenPath.ps1 -ApiUrl "https://api.example.com" -ClassroomId "<classroom-id>" -EnrollmentToken "<token>" -Unattended

# Opcional: omitir validación previa en entornos controlados
.\Install-OpenPath.ps1 -WhitelistUrl "http://tu-servidor:3000/export/grupo.txt" -SkipPreflight
```

El instalador ejecuta `scripts\Pre-Install-Validation.ps1` por defecto antes de aplicar cambios.

Si usas el modal de aulas en la React SPA, se genera un one-liner para descargar y ejecutar
`/api/enroll/<classroomId>/windows.ps1` directamente.

## Comandos Operativos

```powershell
# Punto de entrada unificado
.\OpenPath.ps1 status
.\OpenPath.ps1 update
.\OpenPath.ps1 health

# Operaciones de aula
.\OpenPath.ps1 enroll -Classroom "Aula-01" -ApiUrl "https://api.example.com" -RegistrationToken "<token>"
.\OpenPath.ps1 enroll -ApiUrl "https://api.example.com" -ClassroomId "<classroom-id>" -EnrollmentToken "<token>" -Unattended
.\OpenPath.ps1 rotate-token -Secret "<shared-secret>"
```

## Verificar Instalación

```powershell
# Probar DNS (debe resolver)
nslookup <dominio-permitido> 127.0.0.1

# Probar sinkhole (debe fallar)
nslookup facebook.com 127.0.0.1

# Ver tareas programadas
Get-ScheduledTask -TaskName "OpenPath-*"

# Ver reglas de firewall
Get-NetFirewallRule -DisplayName "OpenPath-*"
```

## Notas Sobre La Extensión Del Navegador

- Firefox Release: OpenPath solo fuerza la instalación cuando existe una distribución firmada. Las fuentes soportadas son `firefoxExtensionId` + `firefoxExtensionInstallUrl` en `config.json` (por ejemplo una URL `latest.xpi` de AMO) o artefactos firmados copiados en `C:\OpenPath\browser-extension\firefox-release\`.
- Los assets de desarrollo de Firefox se pueden seguir copiando en `C:\OpenPath\browser-extension\firefox`, pero no se usan para la auto-instalación en Firefox Release porque el bundle descomprimido no está firmado.
- Si no hay una distribución firmada de Firefox configurada, OpenPath mantiene las políticas de bloqueo del navegador y omite la auto-instalación de la extensión dejando una advertencia en `C:\OpenPath\data\logs\openpath.log`.
- Chrome y Edge: OpenPath ahora deja la metadata del rollout gestionado en `C:\OpenPath\browser-extension\chromium-managed` y puede publicar un pipeline `CRX + manifiesto de actualización` cuando `firefox-extension/build/chromium-managed/` exista en el servidor. Genera esos artefactos con `npm run build:chromium-managed --workspace=@openpath/firefox-extension`.
- El despliegue en Edge/Chrome sigue dependiendo de las restricciones de política enterprise del navegador en Windows. Si faltan los artefactos Chromium gestionados, OpenPath omite la instalación forzada y mantiene solo las políticas de bloqueo del navegador.
- Chrome y Edge no managed: si configuras `chromeExtensionStoreUrl` y/o `edgeExtensionStoreUrl`, el instalador deja accesos `.url` en `C:\OpenPath\browser-extension\chromium-unmanaged\` y, en modo interactivo, abre la página de la tienda correspondiente para que el usuario complete la instalación manualmente.

### Despliegue gestionado de Edge/Chrome en Windows

Usa este flujo cuando quieras que el instalador de Windows deje también la extensión provisionada
automáticamente en Microsoft Edge y Google Chrome:

1. Genera los artefactos Chromium gestionados en el servidor o fuente del paquete OpenPath:

   ```bash
   npm run build:chromium-managed --workspace=@openpath/firefox-extension
   ```

2. Conserva `build/chromium-managed/metadata.json` junto al paquete de la API. El bootstrap de
   Windows ahora busca la metadata Chromium tanto en `browser-extension\chromium-managed\` como en
   `firefox-extension\build\chromium-managed\`, replicando la misma lógica de fallback de Firefox
   Release.
3. Configura `apiUrl` en `C:\OpenPath\data\config.json` con la URL pública base de la API
   OpenPath. Windows usa ese valor para construir `https://.../api/extensions/chromium/updates.xml`.
4. Durante la instalación, OpenPath copia `metadata.json` en
   `C:\OpenPath\browser-extension\chromium-managed\` y escribe `ExtensionInstallForcelist` para:
   - `HKLM\SOFTWARE\Policies\Google\Chrome`
   - `HKLM\SOFTWARE\Policies\Microsoft\Edge`

Después el navegador descarga el CRX desde la API de OpenPath (`/api/extensions/chromium/openpath.crx`)
usando ese manifiesto de actualización. Si falta `apiUrl` o faltan los artefactos Chromium
gestionados, OpenPath mantiene las políticas de bloqueo del navegador pero omite la instalación
automática de la extensión.

### Instalación guiada en Edge/Chrome no managed

Si el equipo no está gestionado por políticas enterprise, OpenPath no intenta forzar la extensión.
En su lugar:

1. Configura una o ambas URLs de tienda en `config.json` o al ejecutar el instalador:

   ```powershell
   .\Install-OpenPath.ps1 `
     -ChromeExtensionStoreUrl "https://chromewebstore.google.com/detail/..." `
     -EdgeExtensionStoreUrl "https://microsoftedge.microsoft.com/addons/detail/..."
   ```

2. OpenPath genera accesos:
   - `C:\OpenPath\browser-extension\chromium-unmanaged\Install OpenPath for Google Chrome.url`
   - `C:\OpenPath\browser-extension\chromium-unmanaged\Install OpenPath for Microsoft Edge.url`
3. En modo interactivo, si detecta `chrome.exe` o `msedge.exe`, abre automáticamente esas páginas.
4. En `-Unattended`, no abre ninguna ventana; solo deja los enlaces para instalación posterior.

Este flujo mantiene la instalación iniciada por el usuario, que es el camino soportado fuera de
entornos gestionados.

## Estructura

```
C:\OpenPath\
├── OpenPath.ps1               # Comando operativo unificado
├── Install-OpenPath.ps1        # Instalador
├── Uninstall-OpenPath.ps1      # Desinstalador
├── Rotate-Token.ps1            # Rotación de token
├── lib\
│   ├── Common.psm1             # Funciones comunes
│   ├── DNS.psm1                # Gestión Acrylic
│   ├── Firewall.psm1           # Windows Firewall
│   ├── Browser.psm1            # Políticas navegadores
│   └── Services.psm1           # Task Scheduler
├── scripts\
│   ├── Update-OpenPath.ps1     # Actualización periódica
│   ├── Enroll-Machine.ps1      # Registro/re-registro de máquina
│   ├── Start-SSEListener.ps1   # Listener SSE en tiempo real
│   └── Test-DNSHealth.ps1      # Watchdog
└── data\
    ├── config.json             # Configuración
    ├── whitelist.txt           # Whitelist local
    └── logs\                   # Logs
```

## Configuración

Editar `C:\OpenPath\data\config.json`:

```json
{
  "apiUrl": "https://api.example.com",
  "whitelistUrl": "http://servidor:3000/export/grupo.txt",
  "updateIntervalMinutes": 15,
  "primaryDNS": "8.8.8.8",
  "enableFirewall": true,
  "enableBrowserPolicies": true,
  "enableStaleFailsafe": true,
  "staleWhitelistMaxAgeHours": 24,
  "enableIntegrityChecks": true,
  "enableDohIpBlocking": true,
  "enableCheckpointRollback": true,
  "maxCheckpoints": 3,
  "healthApiSecret": "secreto-compartido-opcional",
  "firefoxExtensionId": "monitor-bloqueos@openpath",
  "firefoxExtensionInstallUrl": "https://addons.mozilla.org/firefox/downloads/latest/monitor-bloqueos@openpath/latest.xpi",
  "chromeExtensionStoreUrl": "https://chromewebstore.google.com/detail/<extension-id>",
  "edgeExtensionStoreUrl": "https://microsoftedge.microsoft.com/addons/detail/<extension-id>"
}
```

Si prefieres copiar un XPI firmado local para Firefox Release, coloca `metadata.json` y
`openpath-firefox-extension.xpi` en `C:\OpenPath\browser-extension\firefox-release\`.
Cuando `metadata.json` no incluye `installUrl`, OpenPath usa el XPI copiado mediante una URL
de política `file:///`.

## Desinstalación

```powershell
# Ejecutar como Administrador
.\Uninstall-OpenPath.ps1
```

## Troubleshooting

### DNS no resuelve

```powershell
# Verificar servicio Acrylic
Get-Service -DisplayName "*Acrylic*"

# Reiniciar Acrylic
Restart-Service -DisplayName "*Acrylic*"

# Ver logs
Get-Content C:\OpenPath\data\logs\openpath.log -Tail 50
```

### Firewall bloqueando

```powershell
# Verificar reglas
Get-NetFirewallRule -DisplayName "OpenPath-*" | Format-Table

# Deshabilitar temporalmente
Get-NetFirewallRule -DisplayName "OpenPath-*" | Disable-NetFirewallRule
```

## Compatibilidad con Linux

Este sistema es el equivalente Windows del [sistema Linux](../README.md) basado en dnsmasq. Ambos sistemas:

- Usan el mismo formato de whitelist
- Son compatibles con la [interfaz web](../react-spa/) para gestión centralizada
- Implementan la misma lógica de sinkhole DNS

## Licencia

AGPL-3.0-or-later
