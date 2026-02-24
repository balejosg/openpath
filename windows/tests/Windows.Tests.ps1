# OpenPath Windows Pester Tests
# Tests for all PowerShell modules

# PSScriptAnalyzer: Test-FunctionExists ends with "s" but "Exists" is not a plural noun
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseSingularNouns', '')]
param()

# Helper function to safely check if a function exists
# Must be at script scope (outside BeforeAll) for -Skip evaluation during discovery
function Test-FunctionExists {
    param([string]$FunctionName)
    return $null -ne (Get-Command -Name $FunctionName -ErrorAction SilentlyContinue)
}

# Helper to check admin privileges safely during discovery
function Test-IsAdmin {
    if (Test-FunctionExists 'Test-AdminPrivileges') {
        return Test-AdminPrivileges
    }
    return $false
}

# Import modules at script scope for discovery-time availability
$script:modulePath = Join-Path $PSScriptRoot ".." "lib"
Import-Module "$script:modulePath\Common.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\DNS.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\Firewall.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\Browser.psm1" -Force -ErrorAction SilentlyContinue
Import-Module "$script:modulePath\Services.psm1" -Force -ErrorAction SilentlyContinue

BeforeAll {
    # Re-import modules in BeforeAll to ensure fresh state for tests
    $modulePath = Join-Path $PSScriptRoot ".." "lib"
    Import-Module "$modulePath\Common.psm1" -Force

    function Assert-ContentContainsAll {
        param(
            [Parameter(Mandatory = $true)]
            [string]$Content,

            [Parameter(Mandatory = $true)]
            [string[]]$Needles
        )

        foreach ($needle in $Needles) {
            $Content.Contains($needle) | Should -BeTrue -Because "Expected content to include '$needle'"
        }
    }

    function Initialize-FirewallRuleCaptureMocks {
        $script:createdFirewallRules = @()

        Mock Test-AdminPrivileges { $true } -ModuleName Firewall
        Mock Remove-OpenPathFirewall { $true } -ModuleName Firewall

        Mock New-NetFirewallRule {
            param(
                [string]$DisplayName,
                [string]$Direction,
                [string]$Protocol,
                [object]$RemoteAddress,
                [object]$RemotePort,
                [string]$Action,
                [string]$Profile,
                [string]$Description,
                [string]$Program
            )

            $script:createdFirewallRules += [PSCustomObject]@{
                DisplayName = $DisplayName
                Direction = $Direction
                Protocol = $Protocol
                RemoteAddress = [string]$RemoteAddress
                RemotePort = [string]$RemotePort
                Action = $Action
                Program = $Program
            }

            return [PSCustomObject]@{ DisplayName = $DisplayName }
        } -ModuleName Firewall

        Mock Test-Path { $false } -ModuleName Firewall -ParameterFilter { $Path -like '*AcrylicService.exe' }
    }

    function Get-ContractFixtureLines {
        param(
            [Parameter(Mandatory = $true)]
            [string]$FileName
        )

        $contractsDir = Join-Path $PSScriptRoot '..' '..' 'tests' 'contracts'
        $fixturePath = Join-Path $contractsDir $FileName

        if (-not (Test-Path $fixturePath)) {
            throw "Contract fixture not found: $fixturePath"
        }

        return @(
            Get-Content $fixturePath -ErrorAction Stop |
                ForEach-Object { $_.Trim() } |
                Where-Object { $_ -and -not $_.StartsWith('#') }
        )
    }
}

Describe "Common Module" {
    Context "Test-AdminPrivileges" {
        It "Returns a boolean value" {
            $result = Test-AdminPrivileges
            $result | Should -BeOfType [bool]
        }
    }

    Context "Write-OpenPathLog" {
        It "Writes INFO level logs" {
            { Write-OpenPathLog -Message "Test INFO message" -Level INFO } | Should -Not -Throw
        }

        It "Writes WARN level logs" {
            { Write-OpenPathLog -Message "Test WARN message" -Level WARN } | Should -Not -Throw
        }

        It "Writes ERROR level logs" {
            { Write-OpenPathLog -Message "Test ERROR message" -Level ERROR } | Should -Not -Throw
        }

        It "Includes PID in log entries" {
            $logPath = "C:\OpenPath\data\logs\openpath.log"
            if (Test-Path $logPath) {
                Write-OpenPathLog -Message "PID test entry" -Level INFO
                $lastLine = Get-Content $logPath -Tail 1
                $lastLine | Should -Match "\[PID:\d+\]"
            }
        }
    }

    Context "Get-PrimaryDNS" {
        It "Returns a valid IP address string" {
            $dns = Get-PrimaryDNS
            $dns | Should -Not -BeNullOrEmpty
            $dns | Should -Match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$'
        }
    }

    Context "Get-OpenPathRuntimeHealth" {
        It "Returns runtime health object with expected boolean properties" {
            $health = Get-OpenPathRuntimeHealth

            $health | Should -Not -BeNullOrEmpty
            $health.PSObject.Properties.Name | Should -Contain 'DnsServiceRunning'
            $health.PSObject.Properties.Name | Should -Contain 'DnsResolving'
            $health.DnsServiceRunning | Should -BeOfType [bool]
            $health.DnsResolving | Should -BeOfType [bool]
        }
    }

    Context "Self-update helpers" {
        It "Extracts machine token from whitelist URL" {
            $token = Get-OpenPathMachineTokenFromWhitelistUrl -WhitelistUrl "https://api.example.com/w/abc123token/whitelist.txt"
            $token | Should -Be 'abc123token'
        }

        It "Compares versions correctly" {
            (Compare-OpenPathVersion -CurrentVersion '4.1.0' -TargetVersion '4.2.0') | Should -BeLessThan 0
            (Compare-OpenPathVersion -CurrentVersion '4.2.0' -TargetVersion '4.2.0') | Should -Be 0
            (Compare-OpenPathVersion -CurrentVersion '4.3.0' -TargetVersion '4.2.0') | Should -BeGreaterThan 0
        }
    }

    Context "Get-ValidWhitelistDomainsFromFile" {
        It "Returns valid domains and ignores invalid entries" {
            $tempFile = Join-Path $env:TEMP ("openpath-domains-" + [Guid]::NewGuid().ToString() + ".txt")

            try {
                @(
                    'google.com',
                    'example.org',
                    'not-a-domain',
                    'bad..domain.com',
                    '# comment',
                    ''
                ) | Set-Content $tempFile -Encoding UTF8

                $domains = Get-ValidWhitelistDomainsFromFile -Path $tempFile

                $domains | Should -Contain 'google.com'
                $domains | Should -Contain 'example.org'
                $domains | Should -Not -Contain 'not-a-domain'
                $domains | Should -Not -Contain 'bad..domain.com'
            }
            finally {
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            }
        }

        It "Returns an empty array when file does not exist" {
            $domains = Get-ValidWhitelistDomainsFromFile -Path (Join-Path $env:TEMP ([Guid]::NewGuid().ToString() + '.txt'))
            @($domains).Count | Should -Be 0
        }
    }

    Context "Get-HostFromUrl" {
        It "Returns host for a valid URL" {
            $parsedHost = Get-HostFromUrl -Url 'https://api.example.com/path?x=1'
            $parsedHost | Should -Be 'api.example.com'
        }

        It "Returns null for invalid URL" {
            $parsedHost = Get-HostFromUrl -Url 'not-a-valid-url'
            $parsedHost | Should -BeNullOrEmpty
        }

        It "Returns null for empty URL" {
            $parsedHost = Get-HostFromUrl -Url ''
            $parsedHost | Should -BeNullOrEmpty
        }
    }

    Context "Test-OpenPathDomainFormat" {
        It "Accepts syntactically valid domains" {
            (Test-OpenPathDomainFormat -Domain 'google.com') | Should -BeTrue
            (Test-OpenPathDomainFormat -Domain 'sub.example.org') | Should -BeTrue
        }

        It "Rejects invalid domain values" {
            (Test-OpenPathDomainFormat -Domain 'invalid domain') | Should -BeFalse
            (Test-OpenPathDomainFormat -Domain 'bad..domain.com') | Should -BeFalse
            (Test-OpenPathDomainFormat -Domain '-bad.example.com') | Should -BeFalse
            (Test-OpenPathDomainFormat -Domain '') | Should -BeFalse
            (Test-OpenPathDomainFormat -Domain $null) | Should -BeFalse
        }

        It "Matches shared domain contract fixtures" {
            $validDomains = Get-ContractFixtureLines -FileName 'domain-valid.txt'
            foreach ($domain in $validDomains) {
                (Test-OpenPathDomainFormat -Domain $domain) | Should -BeTrue
            }

            $invalidDomains = Get-ContractFixtureLines -FileName 'domain-invalid.txt'
            foreach ($domain in $invalidDomains) {
                (Test-OpenPathDomainFormat -Domain $domain) | Should -BeFalse
            }
        }
    }

    Context "Get-OpenPathFromUrl" {
        It "Throws when URL is invalid" {
            { Get-OpenPathFromUrl -Url "https://invalid.example.com/404" } | Should -Throw
        }
    }

    Context "Test-InternetConnection" {
        It "Returns a boolean value" {
            $result = Test-InternetConnection
            $result | Should -BeOfType [bool]
        }
    }
}

Describe "Common Module - Mocked Tests" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Common.psm1" -Force
    }

    Context "Get-OpenPathFromUrl parsing" {
        It "Parses whitelist sections correctly" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{
                    StatusCode = 200
                    Content    = "domain1.com`ndomain2.com`ndomain3.com`n## BLOCKED-SUBDOMAINS`nbad.domain.com`n## BLOCKED-PATHS`n/blocked/path"
                    ETag       = $null
                }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.Whitelist | Should -HaveCount 3
            $result.Whitelist[0] | Should -Be "domain1.com"
            $result.BlockedSubdomains | Should -HaveCount 1
            $result.BlockedSubdomains[0] | Should -Be "bad.domain.com"
            $result.BlockedPaths | Should -HaveCount 1
        }

        It "Detects #DESACTIVADO marker" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{ StatusCode = 200; Content = "#DESACTIVADO`ndomain1.com`ndomain2.com`ndomain3.com"; ETag = $null }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.IsDisabled | Should -BeTrue
        }

        It "Accepts disabled whitelist even without minimum domains" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{ StatusCode = 200; Content = "#DESACTIVADO"; ETag = $null }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.IsDisabled | Should -BeTrue
            $result.Whitelist | Should -HaveCount 0
        }

        It "Skips comment lines and empty lines" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{
                    StatusCode = 200
                    Content    = "# comment`n`ndomain1.com`ndomain2.com`ndomain3.com`n# another comment"
                    ETag       = $null
                }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.Whitelist | Should -HaveCount 3
        }

        It "Rejects whitelist with insufficient valid domains" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{ StatusCode = 200; Content = "not-a-domain"; ETag = $null }
            } -ModuleName Common

            { Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt" } | Should -Throw "*Invalid whitelist*"
        }

        It "Handles empty response content" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{ StatusCode = 200; Content = ""; ETag = $null }
            } -ModuleName Common

            { Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt" } | Should -Throw "*Invalid whitelist*"
        }
    }

    Context "Get-PrimaryDNS with mocked network" {
        It "Returns DNS from adapter when available" {
            Mock Get-DnsClientServerAddress {
                @([PSCustomObject]@{ ServerAddresses = @("192.168.1.1") })
            } -ModuleName Common

            $dns = Get-PrimaryDNS
            $dns | Should -Be "192.168.1.1"
        }

        It "Falls back to gateway when no DNS adapter found" {
            Mock Get-DnsClientServerAddress { @() } -ModuleName Common
            Mock Get-NetRoute {
                @([PSCustomObject]@{ NextHop = "10.0.0.1" })
            } -ModuleName Common

            $dns = Get-PrimaryDNS
            $dns | Should -Be "10.0.0.1"
        }

        It "Falls back to 8.8.8.8 as ultimate default" {
            Mock Get-DnsClientServerAddress { @() } -ModuleName Common
            Mock Get-NetRoute { @() } -ModuleName Common

            $dns = Get-PrimaryDNS
            $dns | Should -Be "8.8.8.8"
        }
    }

    Context "Send-OpenPathHealthReport" {
        It "Posts health reports to the tRPC endpoint with expected payload fields" {
            $script:capturedUri = $null
            $script:capturedHeaders = $null
            $script:capturedBody = $null

            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    apiUrl = 'https://api.example.com'
                    healthApiSecret = 'shared-secret'
                    version = '4.1.0'
                }
            } -ModuleName Common

            Mock Invoke-RestMethod {
                param(
                    [string]$Uri,
                    [string]$Method,
                    [hashtable]$Headers,
                    [string]$Body
                )

                $script:capturedUri = $Uri
                $script:capturedHeaders = $Headers
                $script:capturedBody = $Body

                return @{ result = @{ data = @{ json = @{ ok = $true } } } }
            } -ModuleName Common

            $result = Send-OpenPathHealthReport -Status 'DEGRADED' -DnsServiceRunning:$true -DnsResolving:$false -FailCount 2 -Actions 'watchdog_repair' -Version '4.1.0'
            $result | Should -BeTrue

            $script:capturedUri | Should -Be 'https://api.example.com/trpc/healthReports.submit'
            $script:capturedHeaders['Authorization'] | Should -Be 'Bearer shared-secret'

            $payload = $script:capturedBody | ConvertFrom-Json
            $payload.json.status | Should -Be 'DEGRADED'
            $payload.json.hostname | Should -Not -BeNullOrEmpty
            $payload.json.dnsmasqRunning | Should -BeTrue
            $payload.json.dnsResolving | Should -BeFalse
            $payload.json.failCount | Should -Be 2
            $payload.json.actions | Should -Be 'watchdog_repair'
            $payload.json.version | Should -Be '4.1.0'
        }

        It "Returns false when apiUrl is missing in config" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    version = '4.1.0'
                }
            } -ModuleName Common

            Mock Invoke-RestMethod {
                throw 'Invoke-RestMethod should not be called when apiUrl is missing'
            } -ModuleName Common

            $result = Send-OpenPathHealthReport -Status 'HEALTHY'
            $result | Should -BeFalse
        }
    }

    Context "Restore-OpenPathLatestCheckpoint" {
        It "Restores checkpoint whitelist and reapplies DNS controls" {
            $tempDir = Join-Path $env:TEMP ("openpath-checkpoint-" + [Guid]::NewGuid().ToString())
            $checkpointDir = Join-Path $tempDir 'checkpoint-001'
            $checkpointWhitelistPath = Join-Path $checkpointDir 'whitelist.txt'
            $targetWhitelistPath = Join-Path $tempDir 'whitelist.txt'

            try {
                New-Item -ItemType Directory -Path $checkpointDir -Force | Out-Null
                @('google.com', 'example.org') | Set-Content $checkpointWhitelistPath -Encoding UTF8

                Mock Get-OpenPathLatestCheckpoint {
                    [PSCustomObject]@{
                        Path = $checkpointDir
                        WhitelistPath = $checkpointWhitelistPath
                        Metadata = $null
                    }
                } -ModuleName Common

                Mock Update-AcrylicHost { $true } -ModuleName Common
                Mock Restart-AcrylicService { $true } -ModuleName Common
                Mock Get-AcrylicPath { 'C:\OpenPath\Acrylic DNS Proxy' } -ModuleName Common
                Mock Set-OpenPathFirewall { $true } -ModuleName Common
                Mock Set-LocalDNS { } -ModuleName Common

                $config = [PSCustomObject]@{
                    enableFirewall = $true
                    primaryDNS = '8.8.8.8'
                }

                $result = Restore-OpenPathLatestCheckpoint -Config $config -WhitelistPath $targetWhitelistPath

                $result.Success | Should -BeTrue
                $result.DomainCount | Should -Be 2
                $result.CheckpointPath | Should -Be $checkpointDir

                $restoredContent = Get-Content $targetWhitelistPath -Raw
                $restoredContent.Contains('google.com') | Should -BeTrue
                $restoredContent.Contains('example.org') | Should -BeTrue
            }
            finally {
                Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }

        It "Returns failure when checkpoint whitelist has no valid domains" {
            $tempDir = Join-Path $env:TEMP ("openpath-checkpoint-invalid-" + [Guid]::NewGuid().ToString())
            $checkpointDir = Join-Path $tempDir 'checkpoint-001'
            $checkpointWhitelistPath = Join-Path $checkpointDir 'whitelist.txt'
            $targetWhitelistPath = Join-Path $tempDir 'whitelist.txt'

            try {
                New-Item -ItemType Directory -Path $checkpointDir -Force | Out-Null
                @('not-a-domain', '# comment') | Set-Content $checkpointWhitelistPath -Encoding UTF8

                Mock Get-OpenPathLatestCheckpoint {
                    [PSCustomObject]@{
                        Path = $checkpointDir
                        WhitelistPath = $checkpointWhitelistPath
                        Metadata = $null
                    }
                } -ModuleName Common

                $config = [PSCustomObject]@{
                    enableFirewall = $false
                    primaryDNS = '8.8.8.8'
                }

                $result = Restore-OpenPathLatestCheckpoint -Config $config -WhitelistPath $targetWhitelistPath

                $result.Success | Should -BeFalse
                $result.Error | Should -BeLike '*no valid domains*'
            }
            finally {
                Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

Describe "DNS Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\DNS.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Test-AcrylicInstalled" {
        It "Returns a boolean value" -Skip:(-not (Test-FunctionExists 'Test-AcrylicInstalled')) {
            $result = Test-AcrylicInstalled
            $result | Should -BeOfType [bool]
        }
    }

    Context "Get-AcrylicPath" {
        It "Returns null or valid path" -Skip:(-not (Test-FunctionExists 'Get-AcrylicPath')) {
            $path = Get-AcrylicPath
            if ($path) {
                Test-Path $path | Should -BeTrue
            } else {
                $path | Should -BeNullOrEmpty
            }
        }
    }

    Context "Update-AcrylicHost" {
        It "Generates valid hosts content" -Skip:(-not ((Test-FunctionExists 'Test-AcrylicInstalled') -and (Test-FunctionExists 'Update-AcrylicHost') -and (Test-AcrylicInstalled))) {
            $result = Update-AcrylicHost -WhitelistedDomains @("example.com", "test.com") -BlockedSubdomains @()
            $result | Should -BeTrue
        }
    }

    Context "Max domains limit" {
        It "Update-AcrylicHost code enforces a max domains limit" -Skip:(-not (Test-FunctionExists 'Update-AcrylicHost')) {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "DNS.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'maxDomains',
                'Truncating whitelist'
            )
        }
    }
}

Describe "Firewall Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Firewall.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Test-FirewallActive" {
        It "Returns a boolean value" -Skip:(-not (Test-FunctionExists 'Test-FirewallActive')) {
            $result = Test-FirewallActive
            $result | Should -BeOfType [bool]
        }
    }

    Context "Get-FirewallStatus" {
        It "Returns a hashtable with expected keys" -Skip:(-not (Test-FunctionExists 'Get-FirewallStatus')) {
            $status = Get-FirewallStatus
            $status | Should -Not -BeNullOrEmpty
            $status.TotalRules | Should -Not -BeNullOrEmpty
            $status.AllowRules | Should -Not -BeNullOrEmpty
            $status.BlockRules | Should -Not -BeNullOrEmpty
        }
    }

    Context "DoH egress blocking" {
        It "Matches shared DoH resolver contract fixture" {
            $expectedResolvers = @(Get-ContractFixtureLines -FileName 'doh-resolvers.txt' | Sort-Object -Unique)
            $actualResolvers = @((Get-DefaultDohResolverIps) | Sort-Object -Unique)

            $diff = Compare-Object -ReferenceObject $expectedResolvers -DifferenceObject $actualResolvers
            $diff | Should -BeNullOrEmpty
        }

        It "Exposes a default DoH resolver catalog" {
            $resolvers = Get-DefaultDohResolverIps

            $resolvers | Should -Not -BeNullOrEmpty
            @($resolvers).Count | Should -BeGreaterThan 0
            @($resolvers) | Should -Contain '8.8.8.8'
            @($resolvers) | Should -Contain '1.1.1.1'

            foreach ($resolver in @($resolvers)) {
                $resolver | Should -Match '^\d{1,3}(?:\.\d{1,3}){3}$'
            }
        }

        BeforeEach {
            Initialize-FirewallRuleCaptureMocks
        }

        It "Creates TCP and UDP 443 DoH block rules from configured resolver list" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    enableDohIpBlocking = $true
                    dohResolverIps = @('4.4.4.4', '5.5.5.5')
                }
            } -ModuleName Firewall

            $result = Set-OpenPathFirewall -UpstreamDNS '8.8.8.8' -AcrylicPath 'C:\OpenPath\Acrylic DNS Proxy'
            $result | Should -BeTrue

            ($script:createdFirewallRules | Where-Object {
                    $_.RemoteAddress -eq '4.4.4.4' -and $_.RemotePort -eq '443' -and $_.Protocol -eq 'TCP'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.RemoteAddress -eq '4.4.4.4' -and $_.RemotePort -eq '443' -and $_.Protocol -eq 'UDP'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.RemoteAddress -eq '5.5.5.5' -and $_.RemotePort -eq '443' -and $_.Protocol -eq 'TCP'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.RemoteAddress -eq '5.5.5.5' -and $_.RemotePort -eq '443' -and $_.Protocol -eq 'UDP'
                }).Count | Should -Be 1
        }

        It "Skips upstream DNS and invalid DoH resolver entries" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    enableDohIpBlocking = $true
                    dohResolverIps = @('8.8.8.8', 'invalid-ip', '6.6.6.6')
                }
            } -ModuleName Firewall

            $result = Set-OpenPathFirewall -UpstreamDNS '8.8.8.8' -AcrylicPath 'C:\OpenPath\Acrylic DNS Proxy'
            $result | Should -BeTrue

            ($script:createdFirewallRules | Where-Object { $_.RemoteAddress -eq '8.8.8.8' -and $_.RemotePort -eq '443' }).Count | Should -Be 0
            ($script:createdFirewallRules | Where-Object { $_.RemoteAddress -eq 'invalid-ip' -and $_.RemotePort -eq '443' }).Count | Should -Be 0

            ($script:createdFirewallRules | Where-Object {
                    $_.RemoteAddress -eq '6.6.6.6' -and $_.RemotePort -eq '443' -and $_.Protocol -eq 'TCP'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.RemoteAddress -eq '6.6.6.6' -and $_.RemotePort -eq '443' -and $_.Protocol -eq 'UDP'
                }).Count | Should -Be 1
        }

        It "Does not create DoH 443 rules when DoH IP blocking is disabled" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    enableDohIpBlocking = $false
                    dohResolverIps = @('4.4.4.4', '5.5.5.5')
                }
            } -ModuleName Firewall

            $result = Set-OpenPathFirewall -UpstreamDNS '8.8.8.8' -AcrylicPath 'C:\OpenPath\Acrylic DNS Proxy'
            $result | Should -BeTrue

            ($script:createdFirewallRules | Where-Object { $_.DisplayName -like '*Block-DoH*' -and $_.RemotePort -eq '443' }).Count | Should -Be 0
        }
    }

    Context "VPN and Tor egress blocking" {
        It "Matches shared VPN/Tor contract fixtures" {
            $expectedVpnRules = @(Get-ContractFixtureLines -FileName 'vpn-block-rules.txt' | Sort-Object -Unique)
            $actualVpnRules = @(
                (Get-DefaultVpnBlockRules | ForEach-Object {
                    "$(($_.Protocol).ToString().ToLowerInvariant()):$($_.Port):$($_.Name)"
                }) | Sort-Object -Unique
            )

            $vpnDiff = Compare-Object -ReferenceObject $expectedVpnRules -DifferenceObject $actualVpnRules
            $vpnDiff | Should -BeNullOrEmpty

            $expectedTorPorts = @(Get-ContractFixtureLines -FileName 'tor-block-ports.txt' | Sort-Object -Unique)
            $actualTorPorts = @((Get-DefaultTorBlockPorts | ForEach-Object { [string]$_ }) | Sort-Object -Unique)

            $torDiff = Compare-Object -ReferenceObject $expectedTorPorts -DifferenceObject $actualTorPorts
            $torDiff | Should -BeNullOrEmpty
        }

        It "Exposes default VPN and Tor block catalogs" {
            $vpnRules = @((Get-DefaultVpnBlockRules))
            $torPorts = @((Get-DefaultTorBlockPorts))

            $vpnRules.Count | Should -BeGreaterThan 0
            $torPorts.Count | Should -BeGreaterThan 0

            ($vpnRules | Where-Object { $_.Protocol -eq 'UDP' -and $_.Port -eq 1194 }).Count | Should -Be 1
            ($vpnRules | Where-Object { $_.Protocol -eq 'TCP' -and $_.Port -eq 1723 }).Count | Should -Be 1
            @($torPorts) | Should -Contain 9001
            @($torPorts) | Should -Contain 9030
        }

        BeforeEach {
            Initialize-FirewallRuleCaptureMocks
        }

        It "Applies custom VPN and Tor block configuration" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    enableDohIpBlocking = $false
                    vpnBlockRules = @(
                        [PSCustomObject]@{ Protocol = 'TCP'; Port = 9443; Name = 'TestVPN-TCP' },
                        [PSCustomObject]@{ Protocol = 'UDP'; Port = 5555; Name = 'TestVPN-UDP' }
                    )
                    torBlockPorts = @(10001, 10002)
                }
            } -ModuleName Firewall

            $result = Set-OpenPathFirewall -UpstreamDNS '8.8.8.8' -AcrylicPath 'C:\OpenPath\Acrylic DNS Proxy'
            $result | Should -BeTrue

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -like '*Block-VPN*' -and $_.Protocol -eq 'TCP' -and $_.RemotePort -eq '9443'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -like '*Block-VPN*' -and $_.Protocol -eq 'UDP' -and $_.RemotePort -eq '5555'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -like '*Block-Tor-10001' -and $_.Protocol -eq 'TCP' -and $_.RemotePort -eq '10001'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -like '*Block-Tor-10002' -and $_.Protocol -eq 'TCP' -and $_.RemotePort -eq '10002'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object { $_.DisplayName -like '*Block-Tor-9001' }).Count | Should -Be 0
        }

        It "Skips invalid VPN/Tor custom entries and keeps valid ones" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    enableDohIpBlocking = $false
                    vpnBlockRules = @('udp:6000:GoodRule', 'bad-entry', 'tcp:notaport:BadRule', 'icmp:1200:InvalidProto')
                    torBlockPorts = @('9050', 'bad', 70000)
                }
            } -ModuleName Firewall

            $result = Set-OpenPathFirewall -UpstreamDNS '8.8.8.8' -AcrylicPath 'C:\OpenPath\Acrylic DNS Proxy'
            $result | Should -BeTrue

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -like '*Block-VPN*' -and $_.Protocol -eq 'UDP' -and $_.RemotePort -eq '6000'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -like '*Block-VPN*' -and $_.RemotePort -eq '1200'
                }).Count | Should -Be 0

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -like '*Block-Tor-9050' -and $_.Protocol -eq 'TCP' -and $_.RemotePort -eq '9050'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -like '*Block-Tor-70000'
                }).Count | Should -Be 0
        }
    }
}

Describe "Browser Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Browser.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Set-FirefoxPolicy" {
        It "Returns a boolean value" -Skip:(-not (Test-FunctionExists 'Set-FirefoxPolicy')) {
            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeOfType [bool]
        }
    }

    Context "Set-ChromePolicy" {
        It "Does not throw with empty blocked paths" -Skip:(-not ((Test-FunctionExists 'Set-ChromePolicy') -and (Test-IsAdmin))) {
            { Set-ChromePolicy -BlockedPaths @() } | Should -Not -Throw
        }
    }

    Context "DoH blocking" {
        It "Set-FirefoxPolicy writes DNSOverHTTPS disabled and locked" {
            $script:capturedFirefoxPolicyJson = $null

            Mock Test-Path {
                param([string]$Path)
                if ($Path -like '*firefox.exe') {
                    return $true
                }
                return $false
            } -ModuleName Browser

            Mock New-Item {
                [PSCustomObject]@{ FullName = 'mock-path' }
            } -ModuleName Browser

            Mock Set-Content {
                param(
                    [string]$Path,
                    [string]$Value,
                    [string]$Encoding
                )

                if ($Path -like '*policies.json') {
                    $script:capturedFirefoxPolicyJson = $Value
                }
            } -ModuleName Browser

            Mock Write-OpenPathLog { } -ModuleName Browser

            $result = Set-FirefoxPolicy -BlockedPaths @()
            $result | Should -BeTrue
            $script:capturedFirefoxPolicyJson | Should -Not -BeNullOrEmpty

            $policy = $script:capturedFirefoxPolicyJson | ConvertFrom-Json
            $policy.policies.DNSOverHTTPS.Enabled | Should -BeFalse
            $policy.policies.DNSOverHTTPS.Locked | Should -BeTrue
        }

        It "Set-ChromePolicy sets DnsOverHttpsMode to off for managed browsers" {
            $script:capturedRegistryWrites = @()

            Mock Test-Path { $false } -ModuleName Browser
            Mock New-Item { [PSCustomObject]@{ FullName = 'mock-reg-path' } } -ModuleName Browser
            Mock Remove-Item { } -ModuleName Browser

            Mock Set-ItemProperty {
                param(
                    [string]$Path,
                    [object]$Name,
                    [object]$Value,
                    [string]$Type
                )

                $script:capturedRegistryWrites += [PSCustomObject]@{
                    Path = $Path
                    Name = [string]$Name
                    Value = [string]$Value
                    Type = $Type
                }
            } -ModuleName Browser

            Mock Write-OpenPathLog { } -ModuleName Browser

            $result = Set-ChromePolicy -BlockedPaths @()
            $result | Should -BeTrue

            $dohModeWrites = @($script:capturedRegistryWrites | Where-Object {
                    $_.Name -eq 'DnsOverHttpsMode' -and $_.Value -eq 'off'
                })
            $dohModeWrites.Count | Should -BeGreaterThan 0
        }
    }
}

Describe "Services Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Services.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Get-OpenPathTaskStatus" {
        It "Returns an array or empty result" -Skip:(-not (Test-FunctionExists 'Get-OpenPathTaskStatus')) {
            $status = Get-OpenPathTaskStatus
            # Status can be empty array, null, or array of objects
            { $status } | Should -Not -Throw
        }
    }

    Context "Register-OpenPathTask" {
        It "Accepts custom interval parameters" -Skip:(-not ((Test-FunctionExists 'Register-OpenPathTask') -and (Test-IsAdmin))) {
            # Just verify the function signature works
            { Register-OpenPathTask -UpdateIntervalMinutes 15 -WatchdogIntervalMinutes 2 -WhatIf } | Should -Not -Throw
        }

        It "Includes daily silent agent update task" {
            $servicesPath = Join-Path $PSScriptRoot ".." "lib" "Services.psm1"
            $content = Get-Content $servicesPath -Raw

            $content.Contains('$script:TaskPrefix-AgentUpdate') | Should -BeTrue
            $content.Contains('self-update --silent') | Should -BeTrue
        }
    }

    Context "Start-OpenPathTask" {
        It "Accepts SSE as a valid task type" -Skip:(-not (Test-FunctionExists 'Start-OpenPathTask')) {
            # Verify the SSE task type is accepted in the ValidateSet
            { Start-OpenPathTask -TaskType SSE -WhatIf } | Should -Not -Throw
        }

        It "Accepts AgentUpdate as a valid task type" -Skip:(-not (Test-FunctionExists 'Start-OpenPathTask')) {
            { Start-OpenPathTask -TaskType AgentUpdate -WhatIf } | Should -Not -Throw
        }
    }
}

Describe "SSE Listener" {
    Context "Script existence" {
        It "Start-SSEListener.ps1 exists" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            Test-Path $scriptPath | Should -BeTrue
        }
    }

    Context "Update job deduplication" {
        It "uses a named job and active-job guard" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'OpenPath-SSE-Update',
                'Get-Job -Name $script:UpdateJobName',
                "State -notin @('Completed', 'Failed', 'Stopped')",
                'Start-Job -ScriptBlock',
                '-Name $script:UpdateJobName'
            )
        }
    }
}

Describe "Operational Command Script" {
    Context "Script existence" {
        It "OpenPath.ps1 exists" {
            $scriptPath = Join-Path $PSScriptRoot ".." "OpenPath.ps1"
            Test-Path $scriptPath | Should -BeTrue
        }
    }

    Context "Command routing" {
        It "Routes key commands through a unified dispatcher" {
            $scriptPath = Join-Path $PSScriptRoot ".." "OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content.Contains('switch ($commandName)') | Should -BeTrue
            $content.Contains("'status'") | Should -BeTrue
            $content.Contains("'update'") | Should -BeTrue
            $content.Contains("'health'") | Should -BeTrue
            $content.Contains("'self-update'") | Should -BeTrue
            $content.Contains("'enroll'") | Should -BeTrue
            $content.Contains("'rotate-token'") | Should -BeTrue
            $content.Contains("'restart'") | Should -BeTrue
            $content.Contains('Show-OpenPathStatus') | Should -BeTrue
            $content.Contains('Invoke-OpenPathAgentSelfUpdate') | Should -BeTrue
            $content.Contains('Enroll-Machine.ps1') | Should -BeTrue
        }
    }
}

Describe "Update Script" {
    Context "Concurrency guard" {
        It "Update-OpenPath.ps1 uses a global mutex lock" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'System.Threading.Mutex',
                'Global\OpenPathUpdateLock',
                'WaitOne(0)'
            )
        }
    }

    Context "Rollback system" {
        It "Creates rolling checkpoints before applying new whitelist" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $commonPath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $content = Get-Content $scriptPath -Raw
            $commonContent = Get-Content $commonPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'whitelist.backup.txt',
                'Copy-Item $whitelistPath $backupPath -Force',
                'Save-OpenPathWhitelistCheckpoint',
                'maxCheckpoints'
            )

            Assert-ContentContainsAll -Content $commonContent -Needles @(
                'Save-OpenPathWhitelistCheckpoint',
                'Get-OpenPathLatestCheckpoint',
                'Restore-OpenPathLatestCheckpoint'
            )
        }

        It "Restores checkpoint and falls back to backup on update failure" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Restore-OpenPathCheckpoint',
                'Attempting checkpoint rollback',
                'Falling back to backup whitelist rollback',
                'Copy-Item $backupPath $whitelistPath -Force'
            )
        }
    }

    Context "Health report" {
        It "Sends health report to API after successful update" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $commonPath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $updateContent = Get-Content $scriptPath -Raw
            $commonContent = Get-Content $commonPath -Raw

            $updateContent.Contains('Send-OpenPathHealthReport') | Should -BeTrue
            $commonContent.Contains('/trpc/healthReports.submit') | Should -BeTrue
            $commonContent.Contains('dnsmasqRunning') | Should -BeTrue
        }
    }

    Context "Stale whitelist fail-safe" {
        It "Includes stale threshold logic and STALE_FAILSAFE handling" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'staleWhitelistMaxAgeHours',
                'Enter-StaleWhitelistFailsafe',
                'STALE_FAILSAFE'
            )
        }
    }
}

Describe "Watchdog Script" {
    Context "SSE listener monitoring" {
        It "Checks and restarts SSE listener task" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'OpenPath-SSE',
                'Start-ScheduledTask -TaskName "OpenPath-SSE"'
            )
        }
    }

    Context "Captive portal detection" {
        It "Detects captive portals and temporarily opens DNS" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "CaptivePortal.psm1"
            $scriptContent = Get-Content $scriptPath -Raw
            $moduleContent = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $scriptContent -Needles @(
                'CaptivePortal.psm1',
                'Test-OpenPathCaptivePortalState',
                'Enable-OpenPathCaptivePortalMode'
            )

            Assert-ContentContainsAll -Content $moduleContent -Needles @(
                'msftconnecttest.com',
                'detectportal.firefox.com',
                'clients3.google.com',
                'captive-portal-active.json',
                'Captive portal detected',
                'Disable-OpenPathFirewall',
                'Restore-OriginalDNS'
            )
        }

        It "Restores DNS protection after captive portal is resolved" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "CaptivePortal.psm1"
            $scriptContent = Get-Content $scriptPath -Raw
            $moduleContent = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $scriptContent -Needles @(
                'Disable-OpenPathCaptivePortalMode',
                'Test-OpenPathCaptivePortalModeActive'
            )

            Assert-ContentContainsAll -Content $moduleContent -Needles @(
                'Captive portal resolved',
                'restoring DNS protection',
                'Set-LocalDNS',
                'Set-OpenPathFirewall',
                'Clear-OpenPathCaptivePortalMarker'
            )
        }
    }

    Context "Integrity checks" {
        It "Verifies baseline integrity and handles tampering" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Test-OpenPathIntegrity',
                'Restore-OpenPathIntegrity',
                'TAMPERED'
            )
        }
    }

    Context "Watchdog health states" {
        It "Reports STALE_FAILSAFE and CRITICAL states" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'STALE_FAILSAFE',
                'CRITICAL',
                'Send-OpenPathHealthReport'
            )
        }
    }

    Context "Checkpoint recovery" {
        It "Attempts checkpoint recovery when watchdog reaches CRITICAL" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'enableCheckpointRollback',
                'Restore-CheckpointFromWatchdog',
                'Checkpoint rollback restored DNS state'
            )
        }
    }
}

Describe "Installer" {
    Context "ACL lockdown" {
        It "Sets restrictive file permissions during installation" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'SetAccessRuleProtection',
                'NT AUTHORITY\SYSTEM',
                'BUILTIN\Administrators'
            )
        }
    }

    Context "Source path validation" {
        It "Validates modules exist before copying" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Modules not found',
                'Test-Path "$scriptDir\lib\*.psm1"'
            )
        }
    }

    Context "Checkpoint defaults" {
        It "Configures checkpoint rollback defaults during install" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'enableCheckpointRollback',
                'maxCheckpoints',
                'enableDohIpBlocking',
                'dohResolverIps',
                'vpnBlockRules',
                'torBlockPorts'
            )
            $content.Contains('Get-DefaultDohResolverIps') | Should -BeTrue
            $content.Contains('Get-DefaultVpnBlockRules') | Should -BeTrue
            $content.Contains('Get-DefaultTorBlockPorts') | Should -BeTrue
        }
    }

    Context "Enrollment extraction" {
        It "Uses Enroll-Machine script for classroom registration" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $enrollScriptPath = Join-Path $PSScriptRoot ".." "scripts" "Enroll-Machine.ps1"
            $content = Get-Content $scriptPath -Raw

            Test-Path $enrollScriptPath | Should -BeTrue
            Assert-ContentContainsAll -Content $content -Needles @(
                'Enroll-Machine.ps1',
                'SkipTokenValidation',
                'Machine registration completed'
            )
        }
    }

    Context "Unattended enrollment support" {
        It "Supports enrollment-token unattended parameters in installer" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '[string]$EnrollmentToken = ""',
                '[string]$ClassroomId = ""',
                '[switch]$Unattended',
                '-EnrollmentToken',
                '-ClassroomId',
                '-Unattended'
            )
        }
    }

    Context "Enrollment before first update" {
        It "Skips first update when classroom registration fails" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Registro no completado; se omite primera actualización',
                '$classroomModeRequested -and $machineRegistered -ne "REGISTERED"'
            )
        }
    }

    Context "Operational script installation" {
        It "Copies OpenPath.ps1 and Rotate-Token.ps1 into install root" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content.Contains("'OpenPath.ps1', 'Rotate-Token.ps1'") | Should -BeTrue
        }
    }

    Context "Pre-install validation integration" {
        It "Runs pre-install validation by default and supports SkipPreflight" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'SkipPreflight',
                'Pre-Install-Validation.ps1',
                'powershell.exe -NoProfile -ExecutionPolicy Bypass -File'
            )
        }
    }
}

Describe "Enrollment script" {
    Context "Token modes" {
        It "Supports registration and enrollment token parameters" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Enroll-Machine.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '[string]$EnrollmentToken = ""',
                '[string]$ClassroomId = ""',
                '[switch]$Unattended',
                'RegistrationToken and EnrollmentToken cannot be used together',
                'ClassroomId requires EnrollmentToken mode',
                '$registerBody.classroomId = $ClassroomId',
                '$registerBody.classroomName = $Classroom'
            )
        }
    }
}

Describe "Whitelist Validation" {
    Context "Content validation" {
        It "Common module validates minimum domain count" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'minRequiredDomains',
                'Invalid whitelist content'
            )
        }
    }
}

Describe "Log Rotation" {
    Context "Automatic rotation" {
        It "Common module implements log rotation" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'MaxLogSizeBytes',
                'Move-Item $script:LogPath $archivePath',
                'Select-Object -Skip 5'
            )
        }
    }
}
