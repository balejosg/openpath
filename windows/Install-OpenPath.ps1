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

# PSScriptAnalyzer suppressions:
# - Write-Host is intentional for interactive installer
# - BOM not required for UTF-8 (files are already UTF-8 without BOM)
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseBOMForUnicodeEncodedFile', '')]

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs the OpenPath DNS system for Windows
.DESCRIPTION
    Installs Acrylic DNS Proxy, configures firewall, browser policies,
    and scheduled tasks for automatic whitelist updates.
.PARAMETER WhitelistUrl
    URL to download the whitelist from
.PARAMETER SkipAcrylic
    Skip Acrylic DNS installation (if already installed)
.PARAMETER EnrollmentToken
    Short-lived classroom enrollment token for non-interactive setup
.PARAMETER ClassroomId
    Classroom ID used with EnrollmentToken mode
.PARAMETER Unattended
    Fail fast if required parameters are missing (no prompts)
.PARAMETER ChromeExtensionStoreUrl
    Optional Chrome Web Store URL used for non-managed guided installs
.PARAMETER EdgeExtensionStoreUrl
    Optional Microsoft Edge Add-ons URL used for non-managed guided installs
.EXAMPLE
    .\Install-Whitelist.ps1 -WhitelistUrl "http://server:3000/export/grupo.txt"
#>

[CmdletBinding()]
param(
    [string]$WhitelistUrl = "",
    [switch]$SkipAcrylic,
    [switch]$SkipPreflight,
    [string]$Classroom = "",
    [string]$ApiUrl = "",
    [string]$RegistrationToken = "",
    [string]$EnrollmentToken = "",
    [string]$ClassroomId = "",
    [string]$MachineName = "",
    [string]$FirefoxExtensionId = "",
    [string]$FirefoxExtensionInstallUrl = "",
    [string]$ChromeExtensionStoreUrl = "",
    [string]$EdgeExtensionStoreUrl = "",
    [switch]$Unattended,
    [string]$HealthApiSecret = ""
)

$ErrorActionPreference = "Stop"
$OpenPathRoot = "C:\OpenPath"
$scriptDir = $PSScriptRoot
$apiBaseUrl = if ($ApiUrl) { $ApiUrl.TrimEnd('/') } else { '' }
$installerHelperRoot = Join-Path $scriptDir 'lib\install'

. (Join-Path $installerHelperRoot 'Installer.ChromiumGuidance.ps1')
. (Join-Path $installerHelperRoot 'Installer.Dns.ps1')
. (Join-Path $installerHelperRoot 'Installer.Staging.ps1')
. (Join-Path $installerHelperRoot 'Installer.Enrollment.ps1')

function Write-InstallerNotice {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [string]$ForegroundColor = ''
    )

    if ($ForegroundColor) {
        Write-Host $Message -ForegroundColor $ForegroundColor
    }
    else {
        Write-Host $Message
    }
}

function Write-InstallerVerbose {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    Write-Verbose $Message
}

function Show-InstallerProgress {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Step,

        [Parameter(Mandatory = $true)]
        [int]$Total,

        [Parameter(Mandatory = $true)]
        [string]$Status
    )

    $percentComplete = [Math]::Min(100, [Math]::Max(0, [int](($Step / $Total) * 100)))
    if ($VerbosePreference -eq 'Continue') {
        Write-Verbose "[$Step/$Total] $Status"
        return
    }

    if ([Console]::IsOutputRedirected) {
        Write-Host "Progress ${Step}/${Total}: $Status"
        return
    }

    Write-Progress -Activity 'Installing OpenPath' -Status $Status -PercentComplete $percentComplete
}

# Verify that modules exist at the expected location
if (-not (Test-Path "$scriptDir\lib\*.psm1")) {
    # Try parent directory (in case script is run from workspace root)
    $parentDir = Split-Path $scriptDir -Parent
    if (Test-Path "$parentDir\windows\lib\*.psm1") {
        $scriptDir = "$parentDir\windows"
    }
    else {
        Write-Host "ERROR: Modules not found in $scriptDir\lib\" -ForegroundColor Red
        Write-Host "  Ensure lib\*.psm1 files are in the same directory as the installer" -ForegroundColor Yellow
        exit 1
    }
}

$enrollmentContext = Resolve-OpenPathInstallerEnrollmentContext `
    -ApiBaseUrl $apiBaseUrl `
    -Classroom $Classroom `
    -ClassroomId $ClassroomId `
    -RegistrationToken $RegistrationToken `
    -EnrollmentToken $EnrollmentToken `
    -Unattended:$Unattended

$classroomModeRequested = [bool]$enrollmentContext.ClassroomModeRequested
$RegistrationToken = [string]$enrollmentContext.RegistrationToken
$EnrollmentToken = [string]$enrollmentContext.EnrollmentToken

if (-not $HealthApiSecret -and $env:OPENPATH_HEALTH_API_SECRET) {
    $HealthApiSecret = $env:OPENPATH_HEALTH_API_SECRET
}

if (-not $FirefoxExtensionId -and $env:OPENPATH_FIREFOX_EXTENSION_ID) {
    $FirefoxExtensionId = [string]$env:OPENPATH_FIREFOX_EXTENSION_ID
}

if (-not $FirefoxExtensionInstallUrl -and $env:OPENPATH_FIREFOX_EXTENSION_INSTALL_URL) {
    $FirefoxExtensionInstallUrl = [string]$env:OPENPATH_FIREFOX_EXTENSION_INSTALL_URL
}

if (-not $ChromeExtensionStoreUrl -and $env:OPENPATH_CHROME_EXTENSION_STORE_URL) {
    $ChromeExtensionStoreUrl = [string]$env:OPENPATH_CHROME_EXTENSION_STORE_URL
}

if (-not $EdgeExtensionStoreUrl -and $env:OPENPATH_EDGE_EXTENSION_STORE_URL) {
    $EdgeExtensionStoreUrl = [string]$env:OPENPATH_EDGE_EXTENSION_STORE_URL
}

if (($FirefoxExtensionId -and -not $FirefoxExtensionInstallUrl) -or ($FirefoxExtensionInstallUrl -and -not $FirefoxExtensionId)) {
    Write-Host "ERROR: -FirefoxExtensionId and -FirefoxExtensionInstallUrl must be provided together" -ForegroundColor Red
    exit 1
}

$usesEnrollmentToken = [bool]$EnrollmentToken
$usesRegistrationToken = [bool]$RegistrationToken

if ($VerbosePreference -eq 'Continue') {
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  OpenPath DNS para Windows - Instalador" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    if ($classroomModeRequested) {
        Write-Host "Classroom mode: enabled"
        if ($Classroom) {
            Write-Host "Classroom: $Classroom"
        }
        if ($ClassroomId) {
            Write-Host "Classroom ID: $ClassroomId"
        }
        Write-Host "API URL: $apiBaseUrl"
        if ($usesEnrollmentToken) {
            Write-Host "Enrollment auth: enrollment token"
        }
        elseif ($usesRegistrationToken) {
            Write-Host "Enrollment auth: registration token"
        }
        if ($HealthApiSecret) {
            Write-Host "Health API secret: configured"
        }
        if ($FirefoxExtensionId -and $FirefoxExtensionInstallUrl) {
            Write-Host "Firefox signed extension: configured via install URL"
        }
        if ($ChromeExtensionStoreUrl -or $EdgeExtensionStoreUrl) {
            Write-Host "Chromium store guidance: configured for unmanaged installs"
        }
    }
    elseif ($WhitelistUrl) {
        Write-Host "URL: $WhitelistUrl"
    }
    else {
        Write-Host "Mode: Standalone (no whitelist URL configured)"
    }

    if (-not $classroomModeRequested -and $FirefoxExtensionId -and $FirefoxExtensionInstallUrl) {
        Write-Host "Firefox signed extension: configured via install URL"
    }
    if (-not $classroomModeRequested -and ($ChromeExtensionStoreUrl -or $EdgeExtensionStoreUrl)) {
        Write-Host "Chromium store guidance: configured for unmanaged installs"
    }
    Write-Host ""
}
else {
    Write-InstallerNotice "Installing OpenPath DNS for Windows..."
}

if ($SkipPreflight) {
    Write-InstallerVerbose "[Preflight] Omitido por -SkipPreflight"
}
else {
    $validationScript = Join-Path $scriptDir "scripts\Pre-Install-Validation.ps1"
    if (Test-Path $validationScript) {
        Show-InstallerProgress -Step 0 -Total 7 -Status 'Ejecutando validacion previa'
        $validationOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validationScript 2>&1
        if ($LASTEXITCODE -ne 0) {
            $validationOutput | ForEach-Object { Write-Host $_ }
            Write-Host "ERROR: Pre-install validation failed" -ForegroundColor Red
            exit 1
        }
        if ($VerbosePreference -eq 'Continue') {
            $validationOutput | ForEach-Object { Write-Verbose "$_" }
        }
        Write-InstallerVerbose "[Preflight] Validacion completada"
    }
    else {
        Write-Warning "[Preflight] Omitido: paquete sin script de validacion previa"
    }
}

# Step 1: Create directory structure
Show-InstallerProgress -Step 1 -Total 7 -Status 'Creando estructura de directorios'
Initialize-OpenPathInstallDirectories -OpenPathRoot $OpenPathRoot

# Step 2: Copy modules and scripts
Show-InstallerProgress -Step 2 -Total 7 -Status 'Copiando modulos y scripts'
Copy-OpenPathInstallerRuntime `
    -OpenPathRoot $OpenPathRoot `
    -ScriptDir $scriptDir `
    -Unattended:$Unattended `
    -ChromeExtensionStoreUrl $ChromeExtensionStoreUrl `
    -EdgeExtensionStoreUrl $EdgeExtensionStoreUrl `
    -FirefoxExtensionId $FirefoxExtensionId `
    -FirefoxExtensionInstallUrl $FirefoxExtensionInstallUrl

# Import modules
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force
Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force

# Step 3: Create configuration
Show-InstallerProgress -Step 3 -Total 7 -Status 'Creando configuracion'

# Detect primary DNS
$primaryDNS = Get-InstallerPrimaryDNS

$agentVersion = "0.0.0"
if ($env:OPENPATH_VERSION) {
    $agentVersion = [string]$env:OPENPATH_VERSION
}
else {
    $versionFilePath = Join-Path (Split-Path $scriptDir -Parent) "VERSION"
    if (Test-Path $versionFilePath) {
        try {
            $versionFromFile = (Get-Content $versionFilePath -Raw).Trim()
            if ($versionFromFile) {
                $agentVersion = $versionFromFile
            }
        }
        catch {
            # Keep default when version file cannot be read
        }
    }
}

$config = @{
    whitelistUrl = $WhitelistUrl
    version = $agentVersion
    updateIntervalMinutes = 15
    watchdogIntervalMinutes = 1
    primaryDNS = $primaryDNS
    acrylicPath = "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"
    enableFirewall = $true
    enableBrowserPolicies = $true
    enableStaleFailsafe = $true
    staleWhitelistMaxAgeHours = 24
    enableIntegrityChecks = $true
    enableKnownDnsIpBlocking = $true
    enableDohIpBlocking = $true
    dohResolverIps = @(Get-DefaultDohResolverIps)
    vpnBlockRules = @(Get-DefaultVpnBlockRules)
    torBlockPorts = @(Get-DefaultTorBlockPorts)
    enableCheckpointRollback = $true
    maxCheckpoints = 3
    sseReconnectMin = 5
    sseReconnectMax = 60
    sseUpdateCooldown = 10
    installedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
}

if ($apiBaseUrl) {
    $config.apiUrl = $apiBaseUrl
}
if ($Classroom) {
    $config.classroom = $Classroom
}
if ($ClassroomId) {
    $config.classroomId = $ClassroomId
}
if ($HealthApiSecret) {
    $config.healthApiSecret = $HealthApiSecret
}
if ($FirefoxExtensionId -and $FirefoxExtensionInstallUrl) {
    $config.firefoxExtensionId = $FirefoxExtensionId
    $config.firefoxExtensionInstallUrl = $FirefoxExtensionInstallUrl
}
if ($ChromeExtensionStoreUrl) {
    $config.chromeExtensionStoreUrl = $ChromeExtensionStoreUrl
}
if ($EdgeExtensionStoreUrl) {
    $config.edgeExtensionStoreUrl = $EdgeExtensionStoreUrl
}

$config | ConvertTo-Json -Depth 10 | Set-Content "$OpenPathRoot\data\config.json" -Encoding UTF8
Write-InstallerVerbose "  DNS upstream: $primaryDNS"

Import-Module "$OpenPathRoot\lib\DNS.psm1" -Force
Import-Module "$OpenPathRoot\lib\Browser.psm1" -Force
Import-Module "$OpenPathRoot\lib\Services.psm1" -Force

try {
    Register-OpenPathFirefoxNativeHost -Config $config -ClearWhitelist | Out-Null
}
catch {
    Write-Host "  ADVERTENCIA: No se pudo registrar el host nativo de Firefox: $_" -ForegroundColor Yellow
}

# Step 4: Install Acrylic DNS
Show-InstallerProgress -Step 4 -Total 7 -Status 'Instalando Acrylic DNS Proxy'

if (-not $SkipAcrylic) {
    if (Test-AcrylicInstalled) {
        Write-InstallerVerbose "  Acrylic ya instalado"
    }
    else {
        $installed = Install-AcrylicDNS
        if ($installed) {
            Write-InstallerVerbose "  Acrylic instalado"
        }
        else {
            Write-Host "  ADVERTENCIA: No se pudo instalar Acrylic automaticamente" -ForegroundColor Yellow
            Write-Host "  Descarga manual: https://mayakron.altervista.org/support/acrylic/Home.htm" -ForegroundColor Yellow
        }
    }
}
else {
    Write-Host "  Instalacion de Acrylic omitida" -ForegroundColor Yellow
}

# Configure Acrylic
Set-AcrylicConfiguration

# Step 5: Configure DNS
Show-InstallerProgress -Step 5 -Total 7 -Status 'Configurando DNS local'
Set-LocalDNS
Write-InstallerVerbose "  DNS configurado a 127.0.0.1"

# Step 6: Register scheduled tasks
Show-InstallerProgress -Step 6 -Total 7 -Status 'Registrando tareas programadas'
Register-OpenPathTask -UpdateIntervalMinutes 15 -WatchdogIntervalMinutes 1
if (Start-OpenPathTask -TaskType SSE) {
    Write-InstallerVerbose "  Listener SSE iniciado"
}
else {
    Write-Host "  ADVERTENCIA: No se pudo iniciar el listener SSE automaticamente" -ForegroundColor Yellow
}
Write-InstallerVerbose "  Tareas registradas"

# Register machine in classroom mode
$machineRegistered = "NOT_REQUESTED"
if ($classroomModeRequested) {
    $enrollmentResult = Invoke-OpenPathInstallerEnrollment `
        -OpenPathRoot $OpenPathRoot `
        -ApiBaseUrl $apiBaseUrl `
        -Classroom $Classroom `
        -ClassroomId $ClassroomId `
        -EnrollmentToken $EnrollmentToken `
        -RegistrationToken $RegistrationToken `
        -MachineName $MachineName `
        -Unattended:$Unattended

    $machineRegistered = [string]$enrollmentResult.MachineRegistered
    if ($enrollmentResult.WhitelistUrl) {
        $WhitelistUrl = [string]$enrollmentResult.WhitelistUrl
    }
}

try {
    $nativeHostConfig = Get-OpenPathConfig
    Sync-OpenPathFirefoxNativeHostState -Config $nativeHostConfig -ClearWhitelist | Out-Null
}
catch {
    Write-Host "  ADVERTENCIA: No se pudo sincronizar el estado del host nativo de Firefox: $_" -ForegroundColor Yellow
}

# Step 7: First update
Show-InstallerProgress -Step 7 -Total 7 -Status 'Ejecutando primera actualizacion'

$shouldRunFirstUpdate = $true
if ($classroomModeRequested -and $machineRegistered -ne "REGISTERED") {
    Write-Host "  ADVERTENCIA: Registro no completado; se omite primera actualizacion" -ForegroundColor Yellow
    $shouldRunFirstUpdate = $false
}

if ($shouldRunFirstUpdate) {
    try {
        & "$OpenPathRoot\scripts\Update-OpenPath.ps1"
        Write-InstallerVerbose "  Primera actualizacion completada"
    }
    catch {
        Write-Host "  ADVERTENCIA: Primera actualizacion fallida (se reintentara)" -ForegroundColor Yellow
    }
}

# Create integrity backup and baseline (best effort)
try {
    if (Save-OpenPathIntegrityBackup) {
        if (New-OpenPathIntegrityBaseline) {
            Write-InstallerVerbose "  Baseline de integridad generada"
        }
    }
}
catch {
    Write-Host "  ADVERTENCIA: No se pudo inicializar baseline de integridad" -ForegroundColor Yellow
}

# Verify installation
if ($VerbosePreference -eq 'Continue') {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  Verificando instalacion..." -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
}

$checks = @()

# Check Acrylic
if (Test-AcrylicInstalled) {
    $checks += @{Name = "Acrylic DNS"; Status = "OK"}
}
else {
    $checks += @{Name = "Acrylic DNS"; Status = "WARN"}
}

# Check DNS
if (Test-DNSResolution) {
    $checks += @{Name = "Resolucion DNS"; Status = "OK"}
}
else {
    $checks += @{Name = "Resolucion DNS"; Status = "FAIL"}
}

# Check Firewall
if (Test-FirewallActive) {
    $checks += @{Name = "Firewall"; Status = "OK"}
}
else {
    $checks += @{Name = "Firewall"; Status = "WARN"}
}

# Check Tasks
$tasks = Get-ScheduledTask -TaskName "OpenPath-*" -ErrorAction SilentlyContinue
if ($tasks.Count -ge 2) {
    $checks += @{Name = "Tareas programadas"; Status = "OK"}
}
else {
    $checks += @{Name = "Tareas programadas"; Status = "WARN"}
}

foreach ($check in $checks) {
    $color = switch ($check.Status) {
        "OK" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
    }
    Write-Host "  $($check.Name): $($check.Status)" -ForegroundColor $color
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  INSTALACION COMPLETADA" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Configuracion:"
if ($classroomModeRequested) {
    if ($Classroom) {
        Write-Host "  - Classroom: $Classroom"
    }
    if ($ClassroomId) {
        Write-Host "  - Classroom ID: $ClassroomId"
    }
    Write-Host "  - Enrollment: $machineRegistered"
}
Write-Host "  - Whitelist: $WhitelistUrl"
Write-Host "  - Agent version: $agentVersion"
Write-Host "  - DNS upstream: $primaryDNS"
Write-Host "  - Actualizacion: SSE real-time + cada 15 min (fallback)"
Write-Host ""
$dnsProbeDomain = '<allowed-domain>'
try {
    $resolvedProbeDomain = @((Get-OpenPathDnsProbeDomains) | Select-Object -First 1)[0]
    if ($resolvedProbeDomain) {
        $dnsProbeDomain = $resolvedProbeDomain
    }
}
catch {
    # Keep placeholder when no probe domain can be derived
}
if ($VerbosePreference -eq 'Continue') {
    Write-Host "Comandos utiles:"
    Write-Host "  .\OpenPath.ps1 status          # Estado del agente"
    Write-Host "  .\OpenPath.ps1 update          # Forzar actualizacion"
    Write-Host "  .\OpenPath.ps1 health          # Ejecutar watchdog"
    Write-Host "  .\OpenPath.ps1 self-update --check  # Comprobar actualizacion de agente"
    Write-Host "  nslookup $dnsProbeDomain 127.0.0.1  # Probar DNS"
    Write-Host "  Get-ScheduledTask OpenPath-*  # Ver tareas"
    if ($classroomModeRequested) {
        Write-Host "  .\OpenPath.ps1 rotate-token -Secret <secret>  # Rotar token"
        Write-Host "  .\OpenPath.ps1 enroll -Classroom <aula> -ApiUrl <url> -RegistrationToken <token>"
        Write-Host "  .\OpenPath.ps1 enroll -ApiUrl <url> -ClassroomId <id> -EnrollmentToken <token> -Unattended"
    }
    Write-Host ""
}
else {
    Write-Host "Comando de gestion: .\OpenPath.ps1 status"
    Write-Host ""
}
if ($VerbosePreference -ne 'Continue' -and -not [Console]::IsOutputRedirected) {
    Write-Progress -Activity 'Installing OpenPath' -Completed
}
Write-Host "Desinstalar: .\Uninstall-OpenPath.ps1"
Write-Host ""
