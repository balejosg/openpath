# Pre-Install-Validation.ps1
# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# Validates Windows environment before OpenPath installation
#
# PSScriptAnalyzer suppressions for interactive validation scripts:
# - Write-Host is intentional for colored user feedback
# - BOM not required for UTF-8 (files are already UTF-8 without BOM)
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseBOMForUnicodeEncodedFile', '')]
param()

$script:errors = 0
$script:warnings = 0

function Test-Requirement {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [string]$FailMessage = "",
        [switch]$Warning
    )
    try {
        if (& $Test) {
            Write-Host "[PASS] $Name" -ForegroundColor Green
            return $true
        } else {
            if ($Warning) {
                Write-Host "[WARN] $Name" -ForegroundColor Yellow
                if ($FailMessage) { Write-Host "       $FailMessage" -ForegroundColor Yellow }
                $script:warnings++
            } else {
                Write-Host "[FAIL] $Name" -ForegroundColor Red
                if ($FailMessage) { Write-Host "       $FailMessage" -ForegroundColor Red }
                $script:errors++
            }
            return $false
        }
    } catch {
        Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        $script:errors++
        return $false
    }
}

Write-Host ""
Write-Host "OpenPath Pre-Installation Validation" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Core Requirements
Write-Host "Core Requirements:" -ForegroundColor White
Test-Requirement "PowerShell 5.1+" { $PSVersionTable.PSVersion.Major -ge 5 } `
    -FailMessage "PowerShell 5.1 or later is required"

Test-Requirement "Administrator privileges" {
    ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} -FailMessage "Run this script as Administrator"

Test-Requirement "Windows 10/11 or Server 2016+" {
    $os = [System.Environment]::OSVersion.Version
    $os.Major -ge 10
} -FailMessage "Windows 10/11 or Windows Server 2016+ required"

Write-Host ""
Write-Host "Required Services:" -ForegroundColor White

Test-Requirement "Windows Firewall service (MpsSvc)" {
    (Get-Service -Name MpsSvc -ErrorAction SilentlyContinue).Status -eq 'Running'
} -FailMessage "Windows Firewall service must be running"

Test-Requirement "DNS Client service (Dnscache)" {
    (Get-Service -Name Dnscache -ErrorAction SilentlyContinue).Status -eq 'Running'
} -FailMessage "DNS Client service must be running"

Test-Requirement "Task Scheduler service (Schedule)" {
    (Get-Service -Name Schedule -ErrorAction SilentlyContinue).Status -eq 'Running'
} -FailMessage "Task Scheduler service must be running"

Write-Host ""
Write-Host "Network Configuration:" -ForegroundColor White

Test-Requirement "Network adapter present" {
    (Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }).Count -gt 0
} -FailMessage "No active network adapter found"

Test-Requirement "DNS resolution working" {
    try {
        $null = Resolve-DnsName -Name "microsoft.com" -Type A -ErrorAction Stop
        $true
    } catch {
        $false
    }
} -FailMessage "DNS resolution is not working"

Write-Host ""
Write-Host "Optional Components:" -ForegroundColor White

Test-Requirement "Acrylic DNS Proxy installed" {
    Test-Path "C:\Program Files (x86)\Acrylic DNS Proxy\AcrylicController.exe"
} -FailMessage "Acrylic DNS Proxy not found - will be installed" -Warning

Test-Requirement "Chocolatey package manager" {
    Get-Command choco -ErrorAction SilentlyContinue
} -FailMessage "Chocolatey not found - installer will use direct Acrylic download" -Warning

Write-Host ""
Write-Host "Disk Space:" -ForegroundColor White

Test-Requirement "Sufficient disk space (100MB free on C:)" {
    $drive = Get-PSDrive C
    ($drive.Free / 1MB) -gt 100
} -FailMessage "Need at least 100MB free on C: drive"

Write-Host ""
Write-Host "─────────────────────────────────────" -ForegroundColor Gray

if ($errors -gt 0) {
    Write-Host ""
    Write-Host "$errors validation(s) FAILED" -ForegroundColor Red
    Write-Host "Please fix the issues above before installing OpenPath." -ForegroundColor Red
    Write-Host ""
    exit 1
}

if ($warnings -gt 0) {
    Write-Host ""
    Write-Host "All core validations passed with $warnings warning(s)" -ForegroundColor Yellow
    Write-Host "Installation can proceed, but optional components may need attention." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "All validations passed" -ForegroundColor Green
Write-Host "Ready to install OpenPath!" -ForegroundColor Green
Write-Host ""
exit 0
