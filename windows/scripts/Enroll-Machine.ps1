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

$hostname = $env:COMPUTERNAME
$config = Get-OpenPathConfig
$version = if ($config.PSObject.Properties['version'] -and $config.version) { [string]$config.version } else { '1.0.0' }
$authToken = if ($EnrollmentToken) { $EnrollmentToken } else { $RegistrationToken }

function Set-ConfigValue {
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [AllowNull()]
        [AllowEmptyString()]
        [object]$Value
    )

    if ($Config.PSObject.Properties[$Name]) {
        $Config.$Name = $Value
    }
    else {
        $Config | Add-Member -MemberType NoteProperty -Name $Name -Value $Value -Force
    }
}

Write-Host "Registering machine in classroom..." -ForegroundColor Yellow
Write-Host "  Hostname: $hostname"
if ($Classroom) {
    Write-Host "  Classroom: $Classroom"
}
if ($ClassroomId) {
    Write-Host "  Classroom ID: $ClassroomId"
}
Write-Host "  API URL: $apiBaseUrl"
Write-Host "  Auth mode: $(if ($EnrollmentToken) { 'enrollment token' } else { 'registration token' })"

$registerBody = [ordered]@{
    hostname = $hostname
    version = $version
}

if ($EnrollmentToken) {
    if ($ClassroomId) {
        $registerBody.classroomId = $ClassroomId
    }
}
else {
    $registerBody.classroomName = $Classroom
}

$registerBodyJson = $registerBody | ConvertTo-Json

$headers = @{
    Authorization = "Bearer $authToken"
    'Content-Type' = 'application/json'
}

$registerResponse = Invoke-RestMethod -Uri "$apiBaseUrl/api/machines/register" `
    -Method Post -Body $registerBodyJson -Headers $headers -ErrorAction Stop

if (-not $registerResponse.success) {
    throw "Machine registration failed: $($registerResponse | ConvertTo-Json -Compress)"
}

if (-not $registerResponse.whitelistUrl) {
    throw 'Registration succeeded but no tokenized whitelist URL was returned'
}

$resolvedClassroom = if ($registerResponse.PSObject.Properties['classroomName'] -and $registerResponse.classroomName) {
    [string]$registerResponse.classroomName
}
elseif ($Classroom) {
    $Classroom
}
else {
    ''
}

$resolvedClassroomId = if ($registerResponse.PSObject.Properties['classroomId'] -and $registerResponse.classroomId) {
    [string]$registerResponse.classroomId
}
elseif ($ClassroomId) {
    $ClassroomId
}
else {
    ''
}

if ($resolvedClassroom) {
    Set-ConfigValue -Config $config -Name 'classroom' -Value $resolvedClassroom
}
if ($resolvedClassroomId) {
    Set-ConfigValue -Config $config -Name 'classroomId' -Value $resolvedClassroomId
}
Set-ConfigValue -Config $config -Name 'apiUrl' -Value $apiBaseUrl
Set-ConfigValue -Config $config -Name 'whitelistUrl' -Value ([string]$registerResponse.whitelistUrl)

Set-OpenPathConfig -Config $config | Out-Null

Write-Host "  Machine registered successfully" -ForegroundColor Green
Write-Host "  Tokenized whitelist URL saved" -ForegroundColor Green

[PSCustomObject]@{
    Success = $true
    Hostname = $hostname
    Classroom = $resolvedClassroom
    ClassroomId = $resolvedClassroomId
    WhitelistUrl = [string]$registerResponse.whitelistUrl
}
