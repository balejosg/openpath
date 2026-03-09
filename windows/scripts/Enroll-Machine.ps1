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

[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseBOMForUnicodeEncodedFile', '')]

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Registers (or re-registers) a Windows agent in classroom mode.
.DESCRIPTION
    Validates registration token when needed, registers machine in API, and updates local
    config.json with classroom/api/tokenized whitelist URL.
.PARAMETER Classroom
    Classroom name (required with registration token mode).
.PARAMETER ApiUrl
    Base URL for OpenPath API.
.PARAMETER RegistrationToken
    Long-lived registration token. If omitted, uses OPENPATH_TOKEN env var.
.PARAMETER EnrollmentToken
    Short-lived classroom enrollment token. If omitted, uses OPENPATH_ENROLLMENT_TOKEN env var.
.PARAMETER ClassroomId
    Classroom ID (recommended with EnrollmentToken mode).
.PARAMETER OpenPathRoot
    OpenPath installation root.
.PARAMETER SkipTokenValidation
    Skip /api/setup/validate-token call before registration (registration token mode only).
.PARAMETER Unattended
    Fail fast when required parameters are missing instead of prompting.
#>

param(
    [string]$Classroom = "",

    [Parameter(Mandatory = $true)]
    [string]$ApiUrl,

    [string]$RegistrationToken = "",

    [string]$EnrollmentToken = "",

    [string]$ClassroomId = "",

    [string]$MachineName = "",

    [string]$OpenPathRoot = "C:\OpenPath",

    [switch]$SkipTokenValidation,

    [switch]$Unattended
)

$ErrorActionPreference = 'Stop'
$configPath = "$OpenPathRoot\data\config.json"
$commonModulePath = "$OpenPathRoot\lib\Common.psm1"

if (-not (Test-Path $commonModulePath)) {
    throw "Common module not found at $commonModulePath"
}

Import-Module $commonModulePath -Force

if (-not (Test-Path $configPath)) {
    throw "Configuration file not found at $configPath"
}

if ($RegistrationToken -and $EnrollmentToken) {
    throw 'RegistrationToken and EnrollmentToken cannot be used together'
}

if ($ClassroomId -and -not $EnrollmentToken) {
    throw 'ClassroomId requires EnrollmentToken mode'
}

if (-not $RegistrationToken -and -not $EnrollmentToken) {
    if ($env:OPENPATH_ENROLLMENT_TOKEN) {
        $EnrollmentToken = $env:OPENPATH_ENROLLMENT_TOKEN
    }
    elseif ($env:OPENPATH_TOKEN) {
        $RegistrationToken = $env:OPENPATH_TOKEN
    }
    elseif ($Unattended) {
        throw 'RegistrationToken or EnrollmentToken is required in unattended mode'
    }
    else {
        $RegistrationToken = Read-Host "Enter registration token"
    }
}

if ($RegistrationToken -and -not $Classroom) {
    throw 'Classroom is required when using RegistrationToken mode'
}

if (-not $RegistrationToken -and -not $EnrollmentToken) {
    throw 'RegistrationToken or EnrollmentToken is required'
}

$apiBaseUrl = $ApiUrl.TrimEnd('/')

if ($RegistrationToken -and -not $SkipTokenValidation) {
    Write-Host "Validating registration token..." -ForegroundColor Yellow

    $validateBody = @{ token = $RegistrationToken } | ConvertTo-Json
    $validateResponse = Invoke-RestMethod -Uri "$apiBaseUrl/api/setup/validate-token" `
        -Method Post -Body $validateBody -ContentType 'application/json' -ErrorAction Stop

    if (-not $validateResponse.valid) {
        throw 'Invalid registration token'
    }

    Write-Host "  Registration token validated" -ForegroundColor Green
}

$config = Get-OpenPathConfig
$version = if ($config.PSObject.Properties['version'] -and $config.version) { [string]$config.version } else { '1.0.0' }
$authToken = if ($EnrollmentToken) { $EnrollmentToken } else { $RegistrationToken }
$machineName = if ($MachineName) {
    [string](Set-OpenPathMachineName -Config $config -MachineName $MachineName)
}
elseif ($EnrollmentToken -and $ClassroomId) {
    [string](New-OpenPathScopedMachineName -Hostname $env:COMPUTERNAME -ClassroomId $ClassroomId)
}
else {
    [string](Get-OpenPathMachineName)
}

Write-Host "Registering machine in classroom..." -ForegroundColor Yellow
Write-Host "  Machine name: $machineName"
if ($Classroom) {
    Write-Host "  Classroom: $Classroom"
}
if ($ClassroomId) {
    Write-Host "  Classroom ID: $ClassroomId"
}
Write-Host "  API URL: $apiBaseUrl"
Write-Host "  Auth mode: $(if ($EnrollmentToken) { 'enrollment token' } else { 'registration token' })"

$registerBody = New-OpenPathMachineRegistrationBody `
    -MachineName $machineName `
    -Version $version `
    -Classroom $Classroom `
    -ClassroomId $ClassroomId
$registerBodyJson = $registerBody | ConvertTo-Json

$headers = @{
    Authorization = "Bearer $authToken"
    'Content-Type' = 'application/json'
}

$registerResponse = Invoke-RestMethod -Uri "$apiBaseUrl/api/machines/register" `
    -Method Post -Body $registerBodyJson -Headers $headers -ErrorAction Stop

$registration = Resolve-OpenPathMachineRegistration `
    -Response $registerResponse `
    -MachineName $machineName `
    -Classroom $Classroom `
    -ClassroomId $ClassroomId

if ($registration.Classroom) {
    Set-OpenPathConfigValue -Config $config -Name 'classroom' -Value $registration.Classroom
}
if ($registration.ClassroomId) {
    Set-OpenPathConfigValue -Config $config -Name 'classroomId' -Value $registration.ClassroomId
}
Set-OpenPathMachineName -Config $config -MachineName $registration.MachineName | Out-Null
Set-OpenPathConfigValue -Config $config -Name 'apiUrl' -Value $apiBaseUrl
Set-OpenPathConfigValue -Config $config -Name 'whitelistUrl' -Value $registration.WhitelistUrl

Set-OpenPathConfig -Config $config | Out-Null

Write-Host "  Machine registered successfully" -ForegroundColor Green
Write-Host "  Tokenized whitelist URL saved" -ForegroundColor Green

[PSCustomObject]@{
    Success = $true
    Hostname = $registration.MachineName
    MachineName = $registration.MachineName
    Classroom = $registration.Classroom
    ClassroomId = $registration.ClassroomId
    WhitelistUrl = $registration.WhitelistUrl
}
