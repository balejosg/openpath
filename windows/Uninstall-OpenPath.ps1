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
# - Write-Host is intentional for interactive uninstaller
# - BOM not required for UTF-8 (files are already UTF-8 without BOM)
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseBOMForUnicodeEncodedFile', '')]

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Uninstalls the OpenPath DNS system for Windows
.DESCRIPTION
    Removes firewall rules, scheduled tasks, browser policies, 
    and restores original DNS settings.
.PARAMETER KeepAcrylic
    Keep Acrylic DNS Proxy installed
.PARAMETER KeepLogs
    Keep log files
#>

param(
    [switch]$KeepAcrylic,
    [switch]$KeepLogs
)

$ErrorActionPreference = "Stop"
$OpenPathRoot = "C:\OpenPath"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  OpenPath DNS para Windows - Desinstalador" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Import modules if available
if (Test-Path "$OpenPathRoot\lib\Common.psm1") {
    Import-Module "$OpenPathRoot\lib\Common.psm1" -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$OpenPathRoot\lib\DNS.psm1") {
    Import-Module "$OpenPathRoot\lib\DNS.psm1" -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$OpenPathRoot\lib\Firewall.psm1") {
    Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$OpenPathRoot\lib\Browser.psm1") {
    Import-Module "$OpenPathRoot\lib\Browser.psm1" -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$OpenPathRoot\lib\Services.psm1") {
    Import-Module "$OpenPathRoot\lib\Services.psm1" -Force -ErrorAction SilentlyContinue
}

# Step 1: Remove scheduled tasks
Write-Host "[1/6] Eliminando tareas programadas..." -ForegroundColor Yellow
Get-ScheduledTask -TaskName "OpenPath-*" -ErrorAction SilentlyContinue | 
    Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "  Tareas eliminadas" -ForegroundColor Green

# Step 2: Remove firewall rules
Write-Host "[2/6] Eliminando reglas de firewall..." -ForegroundColor Yellow
Get-NetFirewallRule -DisplayName "OpenPath-DNS-*" -ErrorAction SilentlyContinue | 
    Remove-NetFirewallRule -ErrorAction SilentlyContinue
Write-Host "  Reglas eliminadas" -ForegroundColor Green

# Step 3: Restore DNS
Write-Host "[3/6] Restaurando configuración DNS..." -ForegroundColor Yellow
Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object {
    Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ResetServerAddresses -ErrorAction SilentlyContinue
}
Clear-DnsClientCache
Write-Host "  DNS restaurado" -ForegroundColor Green

# Step 4: Remove browser policies
Write-Host "[4/6] Eliminando políticas de navegadores..." -ForegroundColor Yellow

# Firefox
$firefoxPolicies = @(
    "$env:ProgramFiles\Mozilla Firefox\distribution\policies.json",
    "${env:ProgramFiles(x86)}\Mozilla Firefox\distribution\policies.json"
)
foreach ($path in $firefoxPolicies) {
    if (Test-Path $path) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
    }
}

# Chrome/Edge registry
$regPaths = @(
    "HKLM:\SOFTWARE\Policies\Google\Chrome\URLBlocklist",
    "HKLM:\SOFTWARE\Policies\Microsoft\Edge\URLBlocklist"
)
foreach ($path in $regPaths) {
    if (Test-Path $path) {
        Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "  Políticas eliminadas" -ForegroundColor Green

# Step 5: Stop and optionally remove Acrylic
Write-Host "[5/6] Deteniendo Acrylic DNS..." -ForegroundColor Yellow
$acrylicService = Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($acrylicService) {
    Stop-Service -Name $acrylicService.Name -Force -ErrorAction SilentlyContinue
    
    if (-not $KeepAcrylic) {
        # Uninstall Acrylic service
        $acrylicPath = "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"
        if (Test-Path "$acrylicPath\AcrylicService.exe") {
            & "$acrylicPath\AcrylicService.exe" /UNINSTALL 2>$null
        }
        Write-Host "  Acrylic detenido y desinstalado" -ForegroundColor Green
    }
    else {
        Write-Host "  Acrylic detenido (mantenido instalado)" -ForegroundColor Green
    }
}
else {
    Write-Host "  Acrylic no encontrado" -ForegroundColor Yellow
}

# Step 6: Remove whitelist files
Write-Host "[6/6] Eliminando archivos..." -ForegroundColor Yellow
if (Test-Path $OpenPathRoot) {
    if ($KeepLogs) {
        # Keep logs directory
        Get-ChildItem $OpenPathRoot -Exclude "data" | Remove-Item -Recurse -Force
        Get-ChildItem "$OpenPathRoot\data" -Exclude "logs" | Remove-Item -Recurse -Force
        Write-Host "  Archivos eliminados (logs conservados)" -ForegroundColor Green
    }
    else {
        Remove-Item $OpenPathRoot -Recurse -Force
        Write-Host "  Archivos eliminados" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  DESINSTALACIÓN COMPLETADA" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "El sistema ha sido restaurado a su estado original."
Write-Host "Puede ser necesario reiniciar para aplicar todos los cambios."
Write-Host ""
