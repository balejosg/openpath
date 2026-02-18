# OpenPath DNS para Windows

Sistema de control de acceso a internet mediante DNS sinkhole para Windows, usando Acrylic DNS Proxy.

## Características

✅ **DNS Sinkhole** - Bloquea todos los dominios excepto whitelist  
✅ **Acrylic DNS Proxy** - Servidor DNS local con soporte wildcards  
✅ **Windows Firewall** - Bloquea DNS externo, VPNs, Tor  
✅ **Bloqueo de salida DoH** - Bloquea IPs conocidas de resolutores DNS-over-HTTPS por 443  
✅ **Políticas de navegadores** - Firefox y Chrome/Edge  
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

El instalador ejecuta `tests\Pre-Install-Validation.ps1` por defecto antes de aplicar cambios.

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
nslookup google.com 127.0.0.1

# Probar sinkhole (debe fallar)
nslookup facebook.com 127.0.0.1

# Ver tareas programadas
Get-ScheduledTask -TaskName "OpenPath-*"

# Ver reglas de firewall
Get-NetFirewallRule -DisplayName "OpenPath-*"
```

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
  "healthApiSecret": "secreto-compartido-opcional"
}
```

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
- Son compatibles con la [SPA](../spa/) para gestión centralizada
- Implementan la misma lógica de sinkhole DNS

## Licencia

AGPL-3.0-or-later
