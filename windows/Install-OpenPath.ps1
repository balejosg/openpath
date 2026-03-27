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

# Validate enrollment parameters
if ($RegistrationToken -and $EnrollmentToken) {
    Write-Host "ERROR: -RegistrationToken and -EnrollmentToken cannot be used together" -ForegroundColor Red
    exit 1
}

if ($ClassroomId -and -not $EnrollmentToken) {
    Write-Host "ERROR: -ClassroomId requires -EnrollmentToken" -ForegroundColor Red
    exit 1
}

if ((($Classroom -or $ClassroomId -or $RegistrationToken -or $EnrollmentToken) -and -not $apiBaseUrl)) {
    Write-Host "ERROR: -ApiUrl is required for classroom enrollment parameters" -ForegroundColor Red
    exit 1
}

$classroomModeRequested = [bool]$apiBaseUrl -and (
    [bool]$Classroom -or
    [bool]$ClassroomId -or
    [bool]$RegistrationToken -or
    [bool]$EnrollmentToken -or
    [bool]$env:OPENPATH_TOKEN -or
    [bool]$env:OPENPATH_ENROLLMENT_TOKEN
)

if ($classroomModeRequested) {
    if (-not $EnrollmentToken -and -not $RegistrationToken -and $env:OPENPATH_ENROLLMENT_TOKEN) {
        $EnrollmentToken = $env:OPENPATH_ENROLLMENT_TOKEN
    }

    if (-not $EnrollmentToken -and -not $RegistrationToken -and $env:OPENPATH_TOKEN) {
        $RegistrationToken = $env:OPENPATH_TOKEN
    }

    if (-not $EnrollmentToken -and -not $RegistrationToken) {
        if ($Unattended) {
            Write-Host "ERROR: Classroom mode requires -EnrollmentToken or -RegistrationToken in unattended mode" -ForegroundColor Red
            exit 1
        }

        if ($ClassroomId) {
            $EnrollmentToken = Read-Host "Enter enrollment token"
        }
        else {
            $RegistrationToken = Read-Host "Enter registration token"
        }
    }

    if ($RegistrationToken -and -not $Classroom) {
        Write-Host "ERROR: -Classroom is required when using -RegistrationToken" -ForegroundColor Red
        exit 1
    }

    if ($RegistrationToken) {
        Write-Host "Validating registration token..." -ForegroundColor Yellow
        try {
            $validateBody = @{ token = $RegistrationToken } | ConvertTo-Json
            $validateResponse = Invoke-RestMethod -Uri "$apiBaseUrl/api/setup/validate-token" `
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
}

if ($RegistrationToken -and $EnrollmentToken) {
    Write-Host "ERROR: Enrollment token and registration token cannot be combined" -ForegroundColor Red
    exit 1
}

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

if ($SkipPreflight) {
    Write-Host "[Preflight] Omitido por -SkipPreflight" -ForegroundColor Yellow
    Write-Host ""
}
else {
    $validationScript = Join-Path $scriptDir "scripts\Pre-Install-Validation.ps1"
    if (Test-Path $validationScript) {
        Write-Host "[Preflight] Ejecutando validacion previa..." -ForegroundColor Yellow
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validationScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Pre-install validation failed" -ForegroundColor Red
            exit 1
        }
        Write-Host "[Preflight] Validacion completada" -ForegroundColor Green
    }
    else {
        Write-Host "[Preflight] Omitido: paquete sin script de validacion previa" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Step 1: Create directory structure
Write-Host "[1/7] Creando estructura de directorios..." -ForegroundColor Yellow

$dirs = @(
    "$OpenPathRoot\lib",
    "$OpenPathRoot\scripts",
    "$OpenPathRoot\data\logs",
    "$OpenPathRoot\browser-extension\firefox",
    "$OpenPathRoot\browser-extension\firefox-release",
    "$OpenPathRoot\browser-extension\chromium-managed",
    "$OpenPathRoot\browser-extension\chromium-unmanaged"
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

$browserExtensionAclPath = "$OpenPathRoot\browser-extension"
if (Test-Path $browserExtensionAclPath) {
    try {
        $browserExtensionAcl = Get-Acl $browserExtensionAclPath
        $usersReadRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            "BUILTIN\Users", "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")
        $browserExtensionAcl.AddAccessRule($usersReadRule)
        Set-Acl $browserExtensionAclPath $browserExtensionAcl
        Write-Host "  Read access granted for browser extension artifacts" -ForegroundColor Green
    }
    catch {
        Write-Host "  ADVERTENCIA: No se pudo habilitar lectura para browser-extension: $_" -ForegroundColor Yellow
    }
}

# Step 2: Copy modules and scripts
Write-Host "[2/7] Copiando modulos y scripts..." -ForegroundColor Yellow

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

# Stage browser extension assets when the installer has access to the source tree.
$browserExtensionCandidates = @(
    (Join-Path $scriptDir 'browser-extension\firefox'),
    (Join-Path $scriptDir 'firefox-extension'),
    (Join-Path (Split-Path $scriptDir -Parent) 'firefox-extension')
)
$browserExtensionSource = $browserExtensionCandidates |
    Where-Object { Test-Path (Join-Path $_ 'manifest.json') } |
    Select-Object -First 1

if ($browserExtensionSource) {
    $browserExtensionTarget = "$OpenPathRoot\browser-extension\firefox"
    $requiredItems = @('manifest.json', 'dist', 'popup', 'icons', 'blocked')
    $missingItems = @(
        $requiredItems | Where-Object { -not (Test-Path (Join-Path $browserExtensionSource $_)) }
    )

    if ($missingItems.Count -eq 0) {
        Remove-Item $browserExtensionTarget -Recurse -Force -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Path $browserExtensionTarget -Force | Out-Null

        foreach ($item in $requiredItems) {
            Copy-Item (Join-Path $browserExtensionSource $item) -Destination $browserExtensionTarget -Recurse -Force
        }

        if (Test-Path (Join-Path $browserExtensionSource 'native')) {
            Copy-Item (Join-Path $browserExtensionSource 'native') -Destination $browserExtensionTarget -Recurse -Force
        }

        Write-Host "  Firefox development extension assets staged in $OpenPathRoot\browser-extension\firefox" -ForegroundColor Green
    }
    else {
        Write-Host "  ADVERTENCIA: Firefox development extension source incomplete ($($missingItems -join ', '))" -ForegroundColor Yellow
    }
}
else {
    Write-Host "  ADVERTENCIA: Firefox development extension source not found; local unsigned bundle staging skipped" -ForegroundColor Yellow
}

$firefoxNativeHostTarget = "$OpenPathRoot\browser-extension\firefox\native"
$nativeHostSourceRoot = Join-Path $scriptDir 'scripts'
$nativeHostArtifacts = @('OpenPath-NativeHost.ps1', 'OpenPath-NativeHost.cmd')
$missingNativeHostArtifacts = @(
    $nativeHostArtifacts | Where-Object { -not (Test-Path (Join-Path $nativeHostSourceRoot $_)) }
)

if ($missingNativeHostArtifacts.Count -eq 0) {
    New-Item -ItemType Directory -Path $firefoxNativeHostTarget -Force | Out-Null
    foreach ($nativeHostArtifact in $nativeHostArtifacts) {
        Copy-Item (Join-Path $nativeHostSourceRoot $nativeHostArtifact) `
            -Destination (Join-Path $firefoxNativeHostTarget $nativeHostArtifact) `
            -Force
    }

    Write-Host "  Firefox native host assets staged in $OpenPathRoot\browser-extension\firefox\native" -ForegroundColor Green
}
else {
    Write-Host "  ADVERTENCIA: Firefox native host artifacts missing ($($missingNativeHostArtifacts -join ', '))" -ForegroundColor Yellow
}

$firefoxReleaseCandidates = @(
    (Join-Path $scriptDir 'browser-extension\firefox-release'),
    (Join-Path $scriptDir 'firefox-extension\build\firefox-release'),
    (Join-Path (Split-Path $scriptDir -Parent) 'firefox-extension\build\firefox-release')
)
$firefoxReleaseSource = $firefoxReleaseCandidates |
    Where-Object { Test-Path (Join-Path $_ 'metadata.json') } |
    Select-Object -First 1

if ($firefoxReleaseSource) {
    $firefoxReleaseTarget = "$OpenPathRoot\browser-extension\firefox-release"
    Remove-Item $firefoxReleaseTarget -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $firefoxReleaseTarget -Force | Out-Null

    Copy-Item (Join-Path $firefoxReleaseSource 'metadata.json') -Destination (Join-Path $firefoxReleaseTarget 'metadata.json') -Force

    $firefoxReleaseXpiSource = Join-Path $firefoxReleaseSource 'openpath-firefox-extension.xpi'
    if (Test-Path $firefoxReleaseXpiSource) {
        Copy-Item $firefoxReleaseXpiSource -Destination (Join-Path $firefoxReleaseTarget 'openpath-firefox-extension.xpi') -Force
    }

    Write-Host "  Signed Firefox Release artifacts staged in $OpenPathRoot\browser-extension\firefox-release" -ForegroundColor Green
}
elseif (-not ($FirefoxExtensionId -and $FirefoxExtensionInstallUrl)) {
    Write-Host "  ADVERTENCIA: Firefox Release extension auto-install requires a signed XPI distribution (AMO, HTTPS URL, or staged signed artifact)." -ForegroundColor Yellow
    Write-Host "  Firefox browser policies will be applied without extension auto-install until a signed distribution is configured." -ForegroundColor Yellow
}

$chromiumManagedCandidates = @(
    (Join-Path $scriptDir 'browser-extension\chromium-managed'),
    (Join-Path $scriptDir 'firefox-extension\build\chromium-managed'),
    (Join-Path (Split-Path $scriptDir -Parent) 'firefox-extension\build\chromium-managed')
)
$chromiumManagedSource = $chromiumManagedCandidates |
    Where-Object { Test-Path (Join-Path $_ 'metadata.json') } |
    Select-Object -First 1

if ($chromiumManagedSource) {
    $chromiumManagedTarget = "$OpenPathRoot\browser-extension\chromium-managed"
    Remove-Item $chromiumManagedTarget -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $chromiumManagedTarget -Force | Out-Null
    Copy-Item (Join-Path $chromiumManagedSource 'metadata.json') -Destination (Join-Path $chromiumManagedTarget 'metadata.json') -Force
    Write-Host "  Chromium managed rollout metadata staged in $OpenPathRoot\browser-extension\chromium-managed" -ForegroundColor Green
}
else {
    Write-Host "  ADVERTENCIA: Chromium managed rollout metadata not found in browser-extension\chromium-managed or firefox-extension\build\chromium-managed; Edge/Chrome managed extension install skipped" -ForegroundColor Yellow
}

function New-OpenPathInternetShortcut {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    $shortcutContent = @(
        '[InternetShortcut]',
        "URL=$Url"
    ) -join [Environment]::NewLine

    Set-Content -Path $Path -Value $shortcutContent -Encoding ASCII
}

function Get-OpenPathChromiumBrowserTargets {
    param(
        [string]$ChromeStoreUrl = '',
        [string]$EdgeStoreUrl = ''
    )

    $browserTargets = @()

    if ($ChromeStoreUrl) {
        $chromeExecutablePath = @(
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1

        $browserTargets += [PSCustomObject]@{
            Name = 'Google Chrome'
            ExecutablePath = [string]$chromeExecutablePath
            StoreUrl = [string]$ChromeStoreUrl
            ShortcutName = 'Install OpenPath for Google Chrome.url'
        }
    }

    if ($EdgeStoreUrl) {
        $edgeExecutablePath = @(
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
            "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1

        $browserTargets += [PSCustomObject]@{
            Name = 'Microsoft Edge'
            ExecutablePath = [string]$edgeExecutablePath
            StoreUrl = [string]$EdgeStoreUrl
            ShortcutName = 'Install OpenPath for Microsoft Edge.url'
        }
    }

    return @($browserTargets)
}

function Install-OpenPathChromiumUnmanagedGuidance {
    param(
        [string]$ChromeStoreUrl = '',
        [string]$EdgeStoreUrl = '',
        [switch]$Unattended
    )

    $browserTargets = Get-OpenPathChromiumBrowserTargets `
        -ChromeStoreUrl $ChromeStoreUrl `
        -EdgeStoreUrl $EdgeStoreUrl

    if ($browserTargets.Count -eq 0) {
        return $false
    }

    $guidanceRoot = "$OpenPathRoot\browser-extension\chromium-unmanaged"
    Remove-Item $guidanceRoot -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $guidanceRoot -Force | Out-Null

    foreach ($browserTarget in $browserTargets) {
        $shortcutPath = Join-Path $guidanceRoot $browserTarget.ShortcutName
        New-OpenPathInternetShortcut -Path $shortcutPath -Url $browserTarget.StoreUrl
        Write-Host "  Chromium store guidance staged in $shortcutPath" -ForegroundColor Green

        if (-not $Unattended) {
            if ($browserTarget.ExecutablePath) {
                try {
                    Start-Process -FilePath $browserTarget.ExecutablePath -ArgumentList $browserTarget.StoreUrl | Out-Null
                    Write-Host "  Opened $($browserTarget.Name) store page for OpenPath extension" -ForegroundColor Green
                }
                catch {
                    Write-Host "  ADVERTENCIA: No se pudo abrir $($browserTarget.Name) automáticamente: $_" -ForegroundColor Yellow
                }
            }
            else {
                Write-Host "  ADVERTENCIA: $($browserTarget.Name) no se detecto localmente; abre manualmente $shortcutPath" -ForegroundColor Yellow
            }
        }
    }

    if ($Unattended) {
        Write-Host "  Chromium store guidance staged for unattended install" -ForegroundColor Yellow
    }

    return $true
}

if (-not $chromiumManagedSource) {
    if (-not (Install-OpenPathChromiumUnmanagedGuidance `
        -ChromeStoreUrl $ChromeExtensionStoreUrl `
        -EdgeStoreUrl $EdgeExtensionStoreUrl `
        -Unattended:$Unattended)) {
        Write-Host "  ADVERTENCIA: No Chromium store URLs configured; non-managed Chrome/Edge installs require user-initiated store install." -ForegroundColor Yellow
    }
}

Write-Host "  Chrome/Edge force-install is not available on unmanaged Windows; use store guidance, Firefox auto-install, or a managed CRX/update-manifest rollout." -ForegroundColor Yellow

Write-Host "  Modulos copiados" -ForegroundColor Green

# Import modules
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force
Import-Module "$OpenPathRoot\lib\Firewall.psm1" -Force

function Test-InstallerDirectDnsServer {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Server,

        [string]$ProbeDomain = 'google.com'
    )

    if (-not $Server -or $Server -in @('127.0.0.1', '0.0.0.0')) {
        return $false
    }

    if ($Server -notmatch '^\d{1,3}(?:\.\d{1,3}){3}$') {
        return $false
    }

    try {
        $result = Resolve-DnsName -Name $ProbeDomain -Server $Server -DnsOnly -ErrorAction Stop
        return ($null -ne $result)
    }
    catch {
        return $false
    }
}

function Test-InstallerDisfavoredDnsServer {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Server
    )

    return $Server -in @(
        '168.63.129.16'
    )
}

function Get-InstallerPrimaryDNS {
    $preferredCandidates = @(
        Get-DnsClientServerAddress -AddressFamily IPv4 |
            ForEach-Object { @($_.ServerAddresses) } |
            Where-Object {
                $_ -and
                $_ -notin @('127.0.0.1', '0.0.0.0') -and
                $_ -match '^\d{1,3}(?:\.\d{1,3}){3}$'
            }
    )

    $gateway = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -First 1).NextHop
    if (
        $gateway -and
        $gateway -notin @('127.0.0.1', '0.0.0.0') -and
        $gateway -match '^\d{1,3}(?:\.\d{1,3}){3}$'
    ) {
        $preferredCandidates += $gateway
    }

    $preferredCandidates = @($preferredCandidates | Select-Object -Unique)
    $disfavoredCandidates = @(
        $preferredCandidates | Where-Object { Test-InstallerDisfavoredDnsServer -Server $_ }
    )
    $preferredCandidates = @(
        $preferredCandidates | Where-Object { -not (Test-InstallerDisfavoredDnsServer -Server $_) }
    )
    $fallbackCandidates = @('8.8.8.8', '1.1.1.1', '9.9.9.9', '8.8.4.4')

    foreach ($candidate in (@($preferredCandidates) + @($fallbackCandidates) + @($disfavoredCandidates))) {
        if (Test-InstallerDirectDnsServer -Server $candidate) {
            return $candidate
        }
    }

    if ($preferredCandidates.Count -gt 0) {
        return $preferredCandidates[0]
    }

    if ($disfavoredCandidates.Count -gt 0) {
        return $disfavoredCandidates[0]
    }

    return '8.8.8.8'
}

# Step 3: Create configuration
Write-Host "[3/7] Creando configuracion..." -ForegroundColor Yellow

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
Write-Host "  DNS upstream: $primaryDNS" -ForegroundColor Green

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
Write-Host "[5/7] Configurando DNS local..." -ForegroundColor Yellow
Set-LocalDNS
Write-Host "  DNS configurado a 127.0.0.1" -ForegroundColor Green

# Step 6: Register scheduled tasks
Write-Host "[6/7] Registrando tareas programadas..." -ForegroundColor Yellow
Register-OpenPathTask -UpdateIntervalMinutes 15 -WatchdogIntervalMinutes 1
if (Start-OpenPathTask -TaskType SSE) {
    Write-Host "  Listener SSE iniciado" -ForegroundColor Green
}
else {
    Write-Host "  ADVERTENCIA: No se pudo iniciar el listener SSE automaticamente" -ForegroundColor Yellow
}
Write-Host "  Tareas registradas" -ForegroundColor Green

# Register machine in classroom mode
$machineRegistered = "NOT_REQUESTED"
if ($classroomModeRequested) {
    Write-Host ""
    Write-Host "Registering machine in classroom..." -ForegroundColor Yellow

    $enrollScript = "$OpenPathRoot\scripts\Enroll-Machine.ps1"
    if (-not (Test-Path $enrollScript)) {
        $machineRegistered = "FAILED"
        Write-Host "  Enrollment script not found: $enrollScript" -ForegroundColor Yellow
    }
    else {
        try {
            $enrollParams = @{
                ApiUrl = $apiBaseUrl
                OpenPathRoot = $OpenPathRoot
            }
            if ($Classroom) {
                $enrollParams.Classroom = $Classroom
            }
            if ($ClassroomId) {
                $enrollParams.ClassroomId = $ClassroomId
            }
            if ($EnrollmentToken) {
                $enrollParams.EnrollmentToken = $EnrollmentToken
            }
            if ($MachineName) {
                $enrollParams.MachineName = $MachineName
            }
            if ($RegistrationToken) {
                $enrollParams.RegistrationToken = $RegistrationToken
                $enrollParams.SkipTokenValidation = $true
            }
            if ($Unattended) {
                $enrollParams.Unattended = $true
            }

            $enrollResult = & $enrollScript @enrollParams

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

try {
    $nativeHostConfig = Get-OpenPathConfig
    Sync-OpenPathFirefoxNativeHostState -Config $nativeHostConfig -ClearWhitelist | Out-Null
}
catch {
    Write-Host "  ADVERTENCIA: No se pudo sincronizar el estado del host nativo de Firefox: $_" -ForegroundColor Yellow
}

# Step 7: First update
Write-Host "[7/7] Ejecutando primera actualizacion..." -ForegroundColor Yellow

$shouldRunFirstUpdate = $true
if ($classroomModeRequested -and $machineRegistered -ne "REGISTERED") {
    Write-Host "  ADVERTENCIA: Registro no completado; se omite primera actualizacion" -ForegroundColor Yellow
    $shouldRunFirstUpdate = $false
}

if ($shouldRunFirstUpdate) {
    try {
        & "$OpenPathRoot\scripts\Update-OpenPath.ps1"
        Write-Host "  Primera actualizacion completada" -ForegroundColor Green
    }
    catch {
        Write-Host "  ADVERTENCIA: Primera actualizacion fallida (se reintentara)" -ForegroundColor Yellow
    }
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

# Verify installation
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Verificando instalacion..." -ForegroundColor Cyan
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
Write-Host "Desinstalar: .\Uninstall-OpenPath.ps1"
Write-Host ""
