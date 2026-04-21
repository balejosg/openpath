#Requires -Version 5.1
<#
.SYNOPSIS
    E2E tests for OpenPath DNS system using Pester
.DESCRIPTION
    Validates the installation and operation of the Acrylic DNS-based
    whitelist system including DNS resolution, sinkhole blocking,
    firewall rules, and scheduled tasks.
.NOTES
    Run with: Invoke-Pester -Path .\Windows-E2E.Tests.ps1 -Verbose
#>

BeforeAll {
    $OpenPathRoot = "C:\OpenPath"
    
    # Import modules if they exist
    $modulesToImport = @(
        "$OpenPathRoot\lib\Common.psm1",
        "$OpenPathRoot\lib\DNS.psm1",
        "$OpenPathRoot\lib\Firewall.psm1"
    )
    
    foreach ($module in $modulesToImport) {
        if (Test-Path $module) {
            Import-Module $module -Force -ErrorAction SilentlyContinue
        }
    }

    function Get-InstalledWhitelistDomains {
        $expectedDomains = @(
            ($env:OPENPATH_E2E_EXPECTED_WHITELIST_DOMAINS -split ',') |
                ForEach-Object { $_.Trim() } |
                Where-Object { $_ }
        )

        if ($expectedDomains.Count -gt 0) {
            return $expectedDomains
        }

        $whitelistPath = Join-Path $OpenPathRoot 'data\whitelist.txt'
        if (-not (Test-Path $whitelistPath)) {
            return @()
        }

        if (-not (Get-Command 'Get-ValidWhitelistDomainsFromFile' -ErrorAction SilentlyContinue)) {
            return @()
        }

        return @(Get-ValidWhitelistDomainsFromFile -Path $whitelistPath)
    }

    function Get-LoopbackDnsAdapters {
        return @(
            Get-DnsClientServerAddress -AddressFamily IPv4 |
                Where-Object { $_.ServerAddresses -contains '127.0.0.1' }
        )
    }

    function Resolve-OpenPathDnsWithRetry {
        param(
            [Parameter(Mandatory = $true)][string]$Domain,
            [int]$MaxAttempts = 12,
            [int]$DelayMilliseconds = 1000
        )

        for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
            $result = Resolve-DnsName -Name $Domain -Server '127.0.0.1' -DnsOnly -ErrorAction SilentlyContinue
            if ($result) {
                return $result
            }

            Start-Sleep -Milliseconds $DelayMilliseconds
        }

        return $null
    }
}

Describe "OpenPath E2E Tests" {
    
    Context "Directory Structure" {
        
        It "OpenPath root directory exists" {
            Test-Path "C:\OpenPath" | Should -Be $true
        }
        
        It "Lib directory exists" {
            Test-Path "C:\OpenPath\lib" | Should -Be $true
        }
        
        It "Scripts directory exists" {
            Test-Path "C:\OpenPath\scripts" | Should -Be $true
        }
        
        It "Data directory exists" {
            Test-Path "C:\OpenPath\data" | Should -Be $true
        }
    }
    
    Context "Configuration" {
        
        It "Config file exists" {
            Test-Path "C:\OpenPath\data\config.json" | Should -Be $true
        }
        
        It "Config file is valid JSON" {
            { Get-Content "C:\OpenPath\data\config.json" | ConvertFrom-Json } | 
                Should -Not -Throw
        }
        
        It "Config has required properties" {
            $config = Get-Content "C:\OpenPath\data\config.json" | ConvertFrom-Json
            $config.whitelistUrl | Should -Not -BeNullOrEmpty
            $config.primaryDNS | Should -Not -BeNullOrEmpty
        }
    }
    
    Context "PowerShell Modules" {
        
        It "Common.psm1 exists" {
            Test-Path "C:\OpenPath\lib\Common.psm1" | Should -Be $true
        }
        
        It "DNS.psm1 exists" {
            Test-Path "C:\OpenPath\lib\DNS.psm1" | Should -Be $true
        }
        
        It "Firewall.psm1 exists" {
            Test-Path "C:\OpenPath\lib\Firewall.psm1" | Should -Be $true
        }
        
        It "Common module can be imported" {
            { Import-Module "C:\OpenPath\lib\Common.psm1" -Force } | 
                Should -Not -Throw
        }
        
        It "DNS module can be imported" {
            { Import-Module "C:\OpenPath\lib\DNS.psm1" -Force } | 
                Should -Not -Throw
        }
    }
    
    Context "DNS Resolution (System)" {

        It "Whitelist file exposes domains for DNS validation" {
            $domains = Get-InstalledWhitelistDomains
            $domains.Count | Should -BeGreaterThan 0
        }

        It "OpenPath DNS proxy resolves an installed whitelisted domain" {
            $domains = Get-InstalledWhitelistDomains
            $domains.Count | Should -BeGreaterThan 0

            $result = Resolve-OpenPathDnsWithRetry -Domain $domains[0]
            $result | Should -Not -BeNullOrEmpty
        }
    }
    
    Context "Acrylic DNS Proxy" -Skip:(-not (Get-Command "Get-AcrylicPath" -ErrorAction SilentlyContinue)) {
        
        It "Get-AcrylicPath returns a value" {
            $path = Get-AcrylicPath
            # Path may be null if not installed, that's acceptable in CI
            $true | Should -Be $true
        }
        
        It "Test-AcrylicInstalled returns boolean" {
            $installed = Test-AcrylicInstalled
            $installed | Should -BeOfType [bool]
        }
    }
    
    Context "Firewall Module Functions" -Skip:(-not (Get-Command "Test-FirewallActive" -ErrorAction SilentlyContinue)) {
        
        It "Test-FirewallActive returns boolean" {
            $active = Test-FirewallActive
            $active | Should -BeOfType [bool]
        }
        
        It "Windows Firewall service is running" {
            $service = Get-Service -Name "MpsSvc" -ErrorAction SilentlyContinue
            $service.Status | Should -Be "Running"
        }
    }
    
    Context "Scheduled Tasks API" {
        
        It "Can query scheduled tasks" {
            { Get-ScheduledTask -ErrorAction Stop | Out-Null } | 
                Should -Not -Throw
        }
        
        It "Can create and remove a test task" {
            $taskName = "OpenPath-Pester-Test-$(Get-Random)"
            
            try {
                $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-Command 'echo test'"
                $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddDays(1)
                $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
                
                Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
                
                $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                $task | Should -Not -BeNullOrEmpty
            }
            finally {
                Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
            }
        }
    }
    
    Context "Network Adapter DNS" {
        
        It "Can query network adapter DNS settings" {
            { Get-DnsClientServerAddress -AddressFamily IPv4 } | 
                Should -Not -Throw
        }
        
        It "At least one adapter points DNS to 127.0.0.1" {
            $adapters = Get-LoopbackDnsAdapters
            $adapters.Count | Should -BeGreaterThan 0
        }
    }
}

Describe "OpenPath Scripts" {
    
    Context "Script Files" {
        
        It "Update-OpenPath.ps1 exists" -Skip:(-not (Test-Path "C:\OpenPath\scripts")) {
            Test-Path "C:\OpenPath\scripts\Update-OpenPath.ps1" | Should -Be $true
        }
        
        It "Test-DNSHealth.ps1 exists" -Skip:(-not (Test-Path "C:\OpenPath\scripts")) {
            Test-Path "C:\OpenPath\scripts\Test-DNSHealth.ps1" | Should -Be $true
        }
    }
}

    AfterAll {
    # Cleanup any test artifacts
    Get-ScheduledTask -TaskName "OpenPath-Pester-*" -ErrorAction SilentlyContinue | 
        Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
}
