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
.EXAMPLE
    .\Install-Whitelist.ps1 -WhitelistUrl "http://server:3000/export/grupo.txt"
#>

param(
    [string]$WhitelistUrl = "",
    [switch]$SkipAcrylic,
    [switch]$SkipPreflight,
    [string]$Classroom = "",
    [string]$ApiUrl = "",
    [string]$RegistrationToken = "",
    [string]$HealthApiSecret = ""
)

$ErrorActionPreference = "Stop"
$OpenPathRoot = "C:\OpenPath"
$scriptDir = $PSScriptRoot

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

# Validate classroom mode parameters
if ($Classroom -and $ApiUrl) {
    # Resolve token: command-line param → env var → interactive prompt
    if (-not $RegistrationToken) {
        if ($env:OPENPATH_TOKEN) {
            $RegistrationToken = $env:OPENPATH_TOKEN
        } else {
            $RegistrationToken = Read-Host "Enter registration token"
        }
    }

    if (-not $RegistrationToken) {
        Write-Host "ERROR: Registration token is required in classroom mode" -ForegroundColor Red
        Write-Host "  Provide via -RegistrationToken, `$env:OPENPATH_TOKEN, or interactive prompt" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "Validating registration token..." -ForegroundColor Yellow
    try {
        $validateBody = @{ token = $RegistrationToken } | ConvertTo-Json
        $validateResponse = Invoke-RestMethod -Uri "$ApiUrl/api/setup/validate-token" `
            -Method Post -Body $validateBody -ContentType "application/json" -ErrorAction Stop
        
        if (-not $validateResponse.valid) {
            Write-Host "ERROR: Invalid registration token" -ForegroundColor Red
            exit 1
        }
        Write-Host "  Registration token validated" -ForegroundColor Green
    }
    catch {
        Write-Host "ERROR: Failed to validate registration token: $_" -ForegroundColor Red
        exit 1
    }
}

if (-not $HealthApiSecret -and $env:OPENPATH_HEALTH_API_SECRET) {
    $HealthApiSecret = $env:OPENPATH_HEALTH_API_SECRET
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  OpenPath DNS para Windows - Instalador" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
if ($Classroom -and $ApiUrl) {
    Write-Host "Classroom Mode: $Classroom"
    Write-Host "API URL: $ApiUrl"
    if ($HealthApiSecret) {
        Write-Host "Health API secret: configured"
    }
    else {
        Write-Host "Health API secret: not configured (health reports may be rejected if SHARED_SECRET is required)" -ForegroundColor Yellow
    }
}
elseif ($WhitelistUrl) {
    Write-Host "URL: $WhitelistUrl"
}
else {
    Write-Host "Mode: Standalone (no whitelist URL configured)"
}
Write-Host ""

if ($SkipPreflight) {
    Write-Host "[Preflight] Omitido por -SkipPreflight" -ForegroundColor Yellow
    Write-Host ""
}
else {
    $validationScript = Join-Path $scriptDir "tests\Pre-Install-Validation.ps1"
    if (Test-Path $validationScript) {
        Write-Host "[Preflight] Ejecutando validación previa..." -ForegroundColor Yellow
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validationScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Pre-install validation failed" -ForegroundColor Red
            exit 1
        }
        Write-Host "[Preflight] Validación completada" -ForegroundColor Green
    }
    else {
        Write-Host "[Preflight] ADVERTENCIA: Script no encontrado ($validationScript)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Step 1: Create directory structure
Write-Host "[1/7] Creando estructura de directorios..." -ForegroundColor Yellow

$dirs = @(
    "$OpenPathRoot\lib",
    "$OpenPathRoot\scripts",
    "$OpenPathRoot\data\logs"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}
Write-Host "  Estructura creada en $OpenPathRoot" -ForegroundColor Green

# Lock down permissions: only SYSTEM and Administrators
Write-Host "  Aplicando permisos restrictivos..." -ForegroundColor Yellow
try {
    $acl = Get-Acl $OpenPathRoot
    $acl.SetAccessRuleProtection($true, $false) # Disable inheritance, remove inherited rules
    # Remove all existing rules
    $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) } | Out-Null
    # Grant SYSTEM full control
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "NT AUTHORITY\SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($systemRule)
    # Grant Administrators full control
    $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "BUILTIN\Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($adminRule)
    Set-Acl $OpenPathRoot $acl
    Write-Host "  Permisos aplicados (solo SYSTEM y Administradores)" -ForegroundColor Green
}
catch {
    Write-Host "  ADVERTENCIA: No se pudieron restringir permisos: $_" -ForegroundColor Yellow
}

# Step 2: Copy modules and scripts
Write-Host "[2/7] Copiando módulos y scripts..." -ForegroundColor Yellow

# Copy lib modules
Get-ChildItem "$scriptDir\lib\*.psm1" -ErrorAction SilentlyContinue | 
    Copy-Item -Destination "$OpenPathRoot\lib\" -Force

# Copy scripts
Get-ChildItem "$scriptDir\scripts\*.ps1" -ErrorAction SilentlyContinue | 
    Copy-Item -Destination "$OpenPathRoot\scripts\" -Force

# Copy root operational scripts
$rootScripts = @('OpenPath.ps1', 'Rotate-Token.ps1')
foreach ($rootScript in $rootScripts) {
    $sourcePath = Join-Path $scriptDir $rootScript
    if (Test-Path $sourcePath) {
        Copy-Item $sourcePath -Destination (Join-Path $OpenPathRoot $rootScript) -Force
    }
}

Write-Host "  Módulos copiados" -ForegroundColor Green

# Import modules
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force
Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force

# Step 3: Create configuration
Write-Host "[3/7] Creando configuración..." -ForegroundColor Yellow

# Detect primary DNS
$primaryDNS = (Get-DnsClientServerAddress -AddressFamily IPv4 | 
    Where-Object { $_.ServerAddresses -and $_.ServerAddresses[0] -ne "127.0.0.1" } |
    Select-Object -First 1).ServerAddresses[0]

if (-not $primaryDNS) {
    $primaryDNS = "8.8.8.8"
}

$config = @{
    whitelistUrl = $WhitelistUrl
    updateIntervalMinutes = 15
    watchdogIntervalMinutes = 1
    primaryDNS = $primaryDNS
    acrylicPath = "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"
    enableFirewall = $true
    enableBrowserPolicies = $true
    enableStaleFailsafe = $true
    staleWhitelistMaxAgeHours = 24
    enableIntegrityChecks = $true
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

if ($Classroom -and $ApiUrl) {
    $config.classroom = $Classroom
    $config.apiUrl = $ApiUrl
}
if ($HealthApiSecret) {
    $config.healthApiSecret = $HealthApiSecret
}

$config | ConvertTo-Json -Depth 10 | Set-Content "$OpenPathRoot\data\config.json" -Encoding UTF8
Write-Host "  DNS upstream: $primaryDNS" -ForegroundColor Green

Import-Module "$OpenPathRoot\lib\DNS.psm1" -Force
Import-Module "$OpenPathRoot\lib\Browser.psm1" -Force
Import-Module "$OpenPathRoot\lib\Services.psm1" -Force

# Step 4: Install Acrylic DNS
Write-Host "[4/7] Instalando Acrylic DNS Proxy..." -ForegroundColor Yellow

if (-not $SkipAcrylic) {
    if (Test-AcrylicInstalled) {
        Write-Host "  Acrylic ya instalado" -ForegroundColor Green
    }
    else {
        $installed = Install-AcrylicDNS
        if ($installed) {
            Write-Host "  Acrylic instalado" -ForegroundColor Green
        }
        else {
            Write-Host "  ADVERTENCIA: No se pudo instalar Acrylic automáticamente" -ForegroundColor Yellow
            Write-Host "  Descarga manual: https://mayakron.altervista.org/support/acrylic/Home.htm" -ForegroundColor Yellow
        }
    }
}
else {
    Write-Host "  Instalación de Acrylic omitida" -ForegroundColor Yellow
}

# Configure Acrylic
Set-AcrylicConfiguration

# Step 5: Configure DNS
Write-Host "[5/7] Configurando DNS local..." -ForegroundColor Yellow
Set-LocalDNS
Write-Host "  DNS configurado a 127.0.0.1" -ForegroundColor Green

# Step 6: Register scheduled tasks
Write-Host "[6/7] Registrando tareas programadas..." -ForegroundColor Yellow
Register-OpenPathTask -UpdateIntervalMinutes 15 -WatchdogIntervalMinutes 1
Write-Host "  Tareas registradas" -ForegroundColor Green

# Step 7: First update
Write-Host "[7/7] Ejecutando primera actualización..." -ForegroundColor Yellow

try {
    & "$OpenPathRoot\scripts\Update-OpenPath.ps1"
    Write-Host "  Primera actualización completada" -ForegroundColor Green
}
catch {
    Write-Host "  ADVERTENCIA: Primera actualización fallida (se reintentará)" -ForegroundColor Yellow
}

# Create integrity backup and baseline (best effort)
try {
    if (Save-OpenPathIntegrityBackup) {
        if (New-OpenPathIntegrityBaseline) {
            Write-Host "  Baseline de integridad generada" -ForegroundColor Green
        }
    }
}
catch {
    Write-Host "  ADVERTENCIA: No se pudo inicializar baseline de integridad" -ForegroundColor Yellow
}

# Register machine in classroom mode
$machineRegistered = ""
if ($Classroom -and $ApiUrl) {
    Write-Host ""
    Write-Host "Registering machine in classroom..." -ForegroundColor Yellow

    $enrollScript = "$OpenPathRoot\scripts\Enroll-Machine.ps1"
    if (-not (Test-Path $enrollScript)) {
        $machineRegistered = "FAILED"
        Write-Host "  Enrollment script not found: $enrollScript" -ForegroundColor Yellow
    }
    else {
        try {
            $enrollResult = & $enrollScript `
                -Classroom $Classroom `
                -ApiUrl $ApiUrl `
                -RegistrationToken $RegistrationToken `
                -OpenPathRoot $OpenPathRoot `
                -SkipTokenValidation

            if ($enrollResult -and $enrollResult.Success) {
                $machineRegistered = "REGISTERED"
                if ($enrollResult.WhitelistUrl) {
                    $WhitelistUrl = [string]$enrollResult.WhitelistUrl
                }
                Write-Host "  Machine registration completed" -ForegroundColor Green
            }
            else {
                $machineRegistered = "FAILED"
                Write-Host "  Failed to register machine" -ForegroundColor Yellow
            }
        }
        catch {
            $machineRegistered = "FAILED"
            Write-Host "  Error registering machine: $_" -ForegroundColor Yellow
        }
    }
}

# Verify installation
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Verificando instalación..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$checks = @()

# Check Acrylic
if (Test-AcrylicInstalled) {
    $checks += @{Name = "Acrylic DNS"; Status = "OK"}
}
else {
    $checks += @{Name = "Acrylic DNS"; Status = "WARN"}
}

# Check DNS
if (Test-DNSResolution -Domain "google.com") {
    $checks += @{Name = "Resolución DNS"; Status = "OK"}
}
else {
    $checks += @{Name = "Resolución DNS"; Status = "FAIL"}
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
Write-Host "  INSTALACIÓN COMPLETADA" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Configuración:"
if ($Classroom -and $ApiUrl) {
    Write-Host "  - Classroom: $Classroom"
    Write-Host "  - Registration: $machineRegistered"
}
Write-Host "  - Whitelist: $WhitelistUrl"
Write-Host "  - DNS upstream: $primaryDNS"
Write-Host "  - Actualización: SSE real-time + cada 15 min (fallback)"
Write-Host ""
Write-Host "Comandos útiles:"
Write-Host "  .\OpenPath.ps1 status          # Estado del agente"
Write-Host "  .\OpenPath.ps1 update          # Forzar actualización"
Write-Host "  .\OpenPath.ps1 health          # Ejecutar watchdog"
Write-Host "  nslookup google.com 127.0.0.1  # Probar DNS"
Write-Host "  Get-ScheduledTask OpenPath-*  # Ver tareas"
if ($Classroom -and $ApiUrl) {
    Write-Host "  .\OpenPath.ps1 rotate-token -Secret <secret>  # Rotar token"
    Write-Host "  .\OpenPath.ps1 enroll -Classroom <aula> -ApiUrl <url> -RegistrationToken <token>"
}
Write-Host ""
Write-Host "Desinstalar: .\Uninstall-OpenPath.ps1"
Write-Host ""
