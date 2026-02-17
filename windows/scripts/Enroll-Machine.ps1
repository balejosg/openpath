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
    Validates enrollment token, registers machine in API, and updates local
    config.json with classroom/api/tokenized whitelist URL.
.PARAMETER Classroom
    Classroom name.
.PARAMETER ApiUrl
    Base URL for OpenPath API.
.PARAMETER RegistrationToken
    Enrollment token. If omitted, uses OPENPATH_TOKEN env var or prompt.
.PARAMETER OpenPathRoot
    OpenPath installation root.
.PARAMETER SkipTokenValidation
    Skip /api/setup/validate-token call before registration.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Classroom,

    [Parameter(Mandatory = $true)]
    [string]$ApiUrl,

    [string]$RegistrationToken = "",

    [string]$OpenPathRoot = "C:\OpenPath",

    [switch]$SkipTokenValidation
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

if (-not $RegistrationToken) {
    if ($env:OPENPATH_TOKEN) {
        $RegistrationToken = $env:OPENPATH_TOKEN
    }
    else {
        $RegistrationToken = Read-Host "Enter registration token"
    }
}

if (-not $RegistrationToken) {
    throw "Registration token is required"
}

$apiBaseUrl = $ApiUrl.TrimEnd('/')

if (-not $SkipTokenValidation) {
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

Write-Host "Registering machine in classroom..." -ForegroundColor Yellow
Write-Host "  Hostname: $hostname"
Write-Host "  Classroom: $Classroom"
Write-Host "  API URL: $apiBaseUrl"

$registerBody = @{
    hostname = $hostname
    classroomName = $Classroom
    version = $version
} | ConvertTo-Json

$headers = @{
    Authorization = "Bearer $RegistrationToken"
    'Content-Type' = 'application/json'
}

$registerResponse = Invoke-RestMethod -Uri "$apiBaseUrl/api/machines/register" `
    -Method Post -Body $registerBody -Headers $headers -ErrorAction Stop

if (-not $registerResponse.success) {
    throw "Machine registration failed: $($registerResponse | ConvertTo-Json -Compress)"
}

if (-not $registerResponse.whitelistUrl) {
    throw 'Registration succeeded but no tokenized whitelist URL was returned'
}

$config.classroom = $Classroom
$config.apiUrl = $apiBaseUrl
$config.whitelistUrl = [string]$registerResponse.whitelistUrl

Set-OpenPathConfig -Config $config | Out-Null

Write-Host "  Machine registered successfully" -ForegroundColor Green
Write-Host "  Tokenized whitelist URL saved" -ForegroundColor Green

[PSCustomObject]@{
    Success = $true
    Hostname = $hostname
    Classroom = $Classroom
    WhitelistUrl = [string]$registerResponse.whitelistUrl
}
