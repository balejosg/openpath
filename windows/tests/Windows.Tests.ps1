# OpenPath Windows Pester Tests
# Tests for all PowerShell modules

. (Join-Path $PSScriptRoot "TestHelpers.ps1")

BeforeAll {
    # Re-import modules in BeforeAll to ensure fresh state for tests
    $modulePath = Join-Path $PSScriptRoot ".." "lib"
    Import-Module "$modulePath\Common.psm1" -Force
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

    Context "HTTP compatibility" {
        It "Loads System.Net.Http types for standalone whitelist downloads" {
            InModuleScope Common {
                { Ensure-OpenPathHttpAssembly } | Should -Not -Throw
                ('System.Net.Http.HttpClientHandler' -as [type]) | Should -Not -BeNullOrEmpty
            }
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

    Context "Protected mode helpers" {
        It "Defines Restore-OpenPathProtectedMode with optional Acrylic restart" {
            $commonPath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $content = Get-Content $commonPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Restore-OpenPathProtectedMode',
                '[switch]$SkipAcrylicRestart',
                'Restart-AcrylicService',
                'Set-LocalDNS',
                'Set-OpenPathFirewall',
                'Enable-OpenPathFirewall'
            )
        }

        It "Reuses Restore-OpenPathProtectedMode during checkpoint restore" {
            $commonPath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $content = Get-Content $commonPath -Raw

            $content | Should -Match '(?s)function Restore-OpenPathLatestCheckpoint.*?Restore-OpenPathProtectedMode -Config \$Config'
        }
    }

    Context "Get-OpenPathDnsProbeDomains" {
        It "Prefers cached whitelist domains before protected fallbacks" {
            $expectedWhitelistPath = 'C:\OpenPath\data\whitelist.txt'

            Mock Test-Path { $true } -ModuleName Common -ParameterFilter { $Path -eq $expectedWhitelistPath }
            Mock Get-ValidWhitelistDomainsFromFile { @('safe.example', 'allowed.example') } -ModuleName Common
            Mock Get-OpenPathProtectedDomains { @('raw.githubusercontent.com', 'api.example.com') } -ModuleName Common

            InModuleScope Common {
                $domains = @(Get-OpenPathDnsProbeDomains)

                $domains[0] | Should -Be 'safe.example'
                $domains[1] | Should -Be 'allowed.example'
                $domains | Should -Contain 'raw.githubusercontent.com'
                $domains | Should -Contain 'api.example.com'
            }
        }
    }

    Context "Machine identity helpers" {
        It "Canonicalizes machine names" {
            (ConvertTo-OpenPathMachineName -Value 'PC 01__Lab') | Should -Be 'pc-01-lab'
        }

        It "Builds classroom-scoped machine names" {
            $scoped = New-OpenPathScopedMachineName -Hostname 'PC 01__Lab' -ClassroomId 'classroom-123'
            $scoped | Should -Match '^pc-01-lab-[a-f0-9]{8}$'
            $scoped.Length | Should -BeLessOrEqual 63
        }

        It "Builds canonical registration payloads" {
            $body = New-OpenPathMachineRegistrationBody -MachineName 'pc-01-abcd1234' -Version '4.1.0' -ClassroomId 'classroom-123'
            $body.hostname | Should -Be 'pc-01-abcd1234'
            $body.version | Should -Be '4.1.0'
            $body.classroomId | Should -Be 'classroom-123'
            $body.PSObject.Properties.Name | Should -Not -Contain 'classroomName'
        }

        It "Resolves registration responses with server-issued machine names" {
            $registration = Resolve-OpenPathMachineRegistration `
                -Response ([PSCustomObject]@{
                    success = $true
                    whitelistUrl = 'https://api.example.com/w/token/whitelist.txt'
                    classroomName = 'Room 101'
                    classroomId = 'classroom-123'
                    machineHostname = 'pc-01-abcd1234'
                }) `
                -MachineName 'pc-01-lab' `
                -Classroom 'Room Local' `
                -ClassroomId 'fallback-id'

            $registration.WhitelistUrl | Should -Be 'https://api.example.com/w/token/whitelist.txt'
            $registration.Classroom | Should -Be 'Room 101'
            $registration.ClassroomId | Should -Be 'classroom-123'
            $registration.MachineName | Should -Be 'pc-01-abcd1234'
        }
    }

    Context "Self-update helpers" {
        It "Extracts machine token from whitelist URL" {
            $token = Get-OpenPathMachineTokenFromWhitelistUrl -WhitelistUrl "https://api.example.com/w/abc123token/whitelist.txt"
            $token | Should -Be 'abc123token'
        }

        It "Builds protected domains from configured control-plane URLs and bootstrap hosts" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    apiUrl = 'https://classroompath.example'
                    whitelistUrl = 'https://downloads.example/w/token/whitelist.txt'
                }
            } -ModuleName Common

            $domains = Get-OpenPathProtectedDomains

            $domains | Should -Contain 'classroompath.example'
            $domains | Should -Contain 'downloads.example'
            $domains | Should -Contain 'raw.githubusercontent.com'
            $domains | Should -Contain 'api.github.com'
            $domains | Should -Contain 'release-assets.githubusercontent.com'
            $domains | Should -Contain 'sourceforge.net'
            $domains | Should -Contain 'downloads.sourceforge.net'
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

    Context "ConvertTo-OpenPathWhitelistFileContent" {
        It "Serializes whitelist, blocked subdomains, and blocked paths sections" {
            $content = ConvertTo-OpenPathWhitelistFileContent `
                -Whitelist @('allowed.example') `
                -BlockedSubdomains @('ads.allowed.example') `
                -BlockedPaths @('allowed.example/private')

            Assert-ContentContainsAll -Content $content -Needles @(
                '## WHITELIST',
                'allowed.example',
                '## BLOCKED-SUBDOMAINS',
                'ads.allowed.example',
                '## BLOCKED-PATHS',
                'allowed.example/private'
            )
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
            $result.Whitelist.Count | Should -BeGreaterOrEqual 3
            $result.Whitelist[0] | Should -Be "domain1.com"
            $result.Whitelist | Should -Contain "domain2.com"
            $result.Whitelist | Should -Contain "domain3.com"
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
            $result.Whitelist.Count | Should -BeGreaterOrEqual 3
            $result.Whitelist | Should -Contain "domain1.com"
            $result.Whitelist | Should -Contain "domain2.com"
            $result.Whitelist | Should -Contain "domain3.com"
        }

        It "Accepts structured whitelist with a single valid domain" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{
                    StatusCode = 200
                    Content    = "## WHITELIST`nsingle-domain.example"
                    ETag       = $null
                }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.IsDisabled | Should -BeFalse
            $result.Whitelist.Count | Should -BeGreaterOrEqual 1
            $result.Whitelist | Should -Contain "single-domain.example"
        }

        It "Falls back to protected domains when whitelist has insufficient valid domains" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{ StatusCode = 200; Content = "not-a-domain"; ETag = $null }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.Whitelist.Count | Should -BeGreaterOrEqual 1
            $result.Whitelist | Should -Contain "github.com"
            $result.Whitelist | Should -Not -Contain "not-a-domain"
        }

        It "Handles empty response content by retaining protected domains" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{ StatusCode = 200; Content = ""; ETag = $null }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.Whitelist.Count | Should -BeGreaterOrEqual 1
            $result.Whitelist | Should -Contain "github.com"
        }

        It "Returns a detectable NotModified property when the whitelist ETag matches" {
            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{ StatusCode = 304; Content = ""; ETag = '"etag-123"' }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"
            $result.PSObject.Properties['NotModified'] | Should -Not -BeNullOrEmpty
            $result.NotModified | Should -BeTrue
            $result.Whitelist | Should -HaveCount 0
        }

        It "Protects control-plane hosts from blocked sections and injects them into the effective whitelist" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    apiUrl = 'https://classroompath.example'
                    whitelistUrl = 'https://downloads.example/w/token/whitelist.txt'
                }
            } -ModuleName Common

            Mock Invoke-OpenPathHttpGetText {
                [PSCustomObject]@{
                    StatusCode = 200
                    Content = @"
safe.example
## BLOCKED-SUBDOMAINS
classroompath.example
## BLOCKED-PATHS
downloads.example/blocked
"@
                    ETag = $null
                }
            } -ModuleName Common

            $result = Get-OpenPathFromUrl -Url "http://test.example.com/whitelist.txt"

            $result.Whitelist | Should -Contain 'safe.example'
            $result.Whitelist | Should -Contain 'classroompath.example'
            $result.Whitelist | Should -Contain 'downloads.example'
            $result.BlockedSubdomains | Should -Not -Contain 'classroompath.example'
            $result.BlockedPaths | Should -Not -Contain 'downloads.example/blocked'
        }
    }

    Context "Get-PrimaryDNS with mocked network" {
        It "Returns DNS from adapter when available" {
            Mock Get-DnsClientServerAddress {
                @([PSCustomObject]@{ ServerAddresses = @("192.168.1.1") })
            } -ModuleName Common
            Mock Resolve-DnsName { @([PSCustomObject]@{ IPAddress = '142.250.184.14' }) } -ModuleName Common -ParameterFilter { $Server -eq '192.168.1.1' }

            $dns = Get-PrimaryDNS
            $dns | Should -Be "192.168.1.1"
        }

        It "Falls back to gateway when no DNS adapter found" {
            Mock Get-DnsClientServerAddress { @() } -ModuleName Common
            Mock Get-NetRoute {
                @([PSCustomObject]@{ NextHop = "10.0.0.1" })
            } -ModuleName Common
            Mock Resolve-DnsName { @([PSCustomObject]@{ IPAddress = '142.250.184.14' }) } -ModuleName Common -ParameterFilter { $Server -eq '10.0.0.1' }

            $dns = Get-PrimaryDNS
            $dns | Should -Be "10.0.0.1"
        }

        It "Falls back to a public resolver when adapter DNS cannot answer direct queries" {
            Mock Get-DnsClientServerAddress {
                @([PSCustomObject]@{ ServerAddresses = @("168.63.129.16") })
            } -ModuleName Common
            Mock Get-NetRoute { @() } -ModuleName Common
            Mock Resolve-DnsName { throw 'unreachable' } -ModuleName Common -ParameterFilter { $Server -eq '168.63.129.16' }
            Mock Resolve-DnsName { @([PSCustomObject]@{ IPAddress = '142.250.184.14' }) } -ModuleName Common -ParameterFilter { $Server -eq '8.8.8.8' }

            $dns = Get-PrimaryDNS
            $dns | Should -Be "8.8.8.8"
        }

        It "De-prioritizes platform-managed resolvers when a public fallback also works" {
            Mock Get-DnsClientServerAddress {
                @([PSCustomObject]@{ ServerAddresses = @("168.63.129.16") })
            } -ModuleName Common
            Mock Get-NetRoute { @() } -ModuleName Common
            Mock Resolve-DnsName { @([PSCustomObject]@{ IPAddress = '142.250.184.14' }) } -ModuleName Common -ParameterFilter { $Server -eq '168.63.129.16' }
            Mock Resolve-DnsName { @([PSCustomObject]@{ IPAddress = '142.250.184.14' }) } -ModuleName Common -ParameterFilter { $Server -eq '8.8.8.8' }

            $dns = Get-PrimaryDNS
            $dns | Should -Be "8.8.8.8"
        }

        It "Still uses a platform-managed resolver when fallbacks are unreachable" {
            Mock Get-DnsClientServerAddress {
                @([PSCustomObject]@{ ServerAddresses = @("168.63.129.16") })
            } -ModuleName Common
            Mock Get-NetRoute { @() } -ModuleName Common
            Mock Resolve-DnsName { @([PSCustomObject]@{ IPAddress = '142.250.184.14' }) } -ModuleName Common -ParameterFilter { $Server -eq '168.63.129.16' }
            Mock Resolve-DnsName { throw 'unreachable' } -ModuleName Common -ParameterFilter { $Server -eq '8.8.8.8' }
            Mock Resolve-DnsName { throw 'unreachable' } -ModuleName Common -ParameterFilter { $Server -eq '1.1.1.1' }
            Mock Resolve-DnsName { throw 'unreachable' } -ModuleName Common -ParameterFilter { $Server -eq '9.9.9.9' }
            Mock Resolve-DnsName { throw 'unreachable' } -ModuleName Common -ParameterFilter { $Server -eq '8.8.4.4' }

            $dns = Get-PrimaryDNS
            $dns | Should -Be "168.63.129.16"
        }

        It "Falls back to 8.8.8.8 as ultimate default" {
            Mock Get-DnsClientServerAddress { @() } -ModuleName Common
            Mock Get-NetRoute { @() } -ModuleName Common
            Mock Resolve-DnsName { throw 'unreachable' } -ModuleName Common

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
                    whitelistUrl = 'https://api.example.com/w/token123/whitelist.txt'
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
            $script:capturedHeaders['Authorization'] | Should -Be 'Bearer token123'

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

    Context "Test-DNSResolution" {
        It "Uses the first allowed probe domain when no explicit domain is provided" {
            Mock Get-OpenPathDnsProbeDomains { @('safe.example', 'fallback.example') } -ModuleName DNS
            Mock Resolve-DnsName { @([PSCustomObject]@{ IPAddress = '203.0.113.10' }) } -ModuleName DNS -ParameterFilter { $Name -eq 'safe.example' -and $Server -eq '127.0.0.1' }
            Mock Start-Sleep { } -ModuleName DNS

            InModuleScope DNS {
                (Test-DNSResolution -MaxAttempts 1) | Should -BeTrue
                Assert-MockCalled Resolve-DnsName -ModuleName DNS -Times 1 -Exactly -ParameterFilter { $Name -eq 'safe.example' -and $Server -eq '127.0.0.1' }
            }
        }
    }

    Context "Get-OpenPathDnsSettings" {
        It "Returns safe defaults when OpenPath config is unavailable" {
            Mock Get-OpenPathConfig { throw 'config unavailable' } -ModuleName DNS

            InModuleScope DNS {
                $settings = Get-OpenPathDnsSettings

                $settings.PrimaryDNS | Should -Be '8.8.8.8'
                $settings.SecondaryDNS | Should -Be '8.8.4.4'
                $settings.MaxDomains | Should -Be 500
            }
        }

        It "Honors DNS-related overrides from OpenPath config" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    primaryDNS = '1.1.1.1'
                    secondaryDNS = '1.0.0.1'
                    maxDomains = 42
                }
            } -ModuleName DNS

            InModuleScope DNS {
                $settings = Get-OpenPathDnsSettings

                $settings.PrimaryDNS | Should -Be '1.1.1.1'
                $settings.SecondaryDNS | Should -Be '1.0.0.1'
                $settings.MaxDomains | Should -Be 42
            }
        }
    }

    Context "Update-AcrylicHost" {
        It "Generates valid hosts content" -Skip:(-not ((Test-FunctionExists 'Test-AcrylicInstalled') -and (Test-FunctionExists 'Update-AcrylicHost') -and (Test-AcrylicInstalled))) {
            $result = Update-AcrylicHost -WhitelistedDomains @("example.com", "test.com") -BlockedSubdomains @()
            $result | Should -BeTrue
        }

        It "Builds Acrylic hosts content from a generated definition in official FW/NX order" {
            InModuleScope DNS {
                $definition = New-AcrylicHostsDefinition `
                    -WhitelistedDomains @('example.com', 'test.com') `
                    -BlockedSubdomains @('ads.other-example.com') `
                    -DnsSettings ([PSCustomObject]@{
                        PrimaryDNS = '1.1.1.1'
                        SecondaryDNS = '1.0.0.1'
                        MaxDomains = 10
                    })

                $content = ConvertTo-AcrylicHostsContent -Definition $definition

                $expectedNeedles = @(
                    '# ESSENTIAL DOMAINS (always allowed)',
                    'FW raw.githubusercontent.com',
                    'FW >raw.githubusercontent.com',
                    '# BLOCKED SUBDOMAINS (1)',
                    'NX >ads.other-example.com',
                    '# WHITELISTED DOMAINS (2)',
                    'FW example.com',
                    'FW >example.com',
                    'FW test.com',
                    'FW >test.com',
                    '# DEFAULT BLOCK (NXDOMAIN for everything else)',
                    '# This MUST come last after FW rules.',
                    '# Upstream DNS: 1.1.1.1',
                    'NX *'
                )

                foreach ($needle in $expectedNeedles) {
                    $content.Contains($needle) | Should -BeTrue -Because "Expected generated hosts content to include '$needle'"
                }

                $content | Should -Not -Match 'FORWARD >'
                $content | Should -Not -Match 'NX >\*'

                $whitelistSectionIndex = $content.IndexOf('# WHITELISTED DOMAINS')
                $nxRuleIndex = $content.IndexOf('NX *')
                $whitelistSectionIndex | Should -BeGreaterThan -1
                $nxRuleIndex | Should -BeGreaterThan $whitelistSectionIndex

                @($definition.EffectiveWhitelistedDomains).Count | Should -Be 2
                $definition.WasTruncated | Should -BeFalse
            }
        }

        It "Keeps blocked descendants ahead of a whitelisted parent wildcard" {
            InModuleScope DNS {
                $definition = New-AcrylicHostsDefinition `
                    -WhitelistedDomains @('example.com') `
                    -BlockedSubdomains @('ads.example.com') `
                    -DnsSettings ([PSCustomObject]@{
                        PrimaryDNS = '1.1.1.1'
                        SecondaryDNS = '1.0.0.1'
                        MaxDomains = 10
                    })

                $content = ConvertTo-AcrylicHostsContent -Definition $definition
                $lines = @($content -split "`n")
                $regexForwardRules = @(
                    $lines | Where-Object {
                        $_.StartsWith('FW /^') -and
                        $_.Contains('ads\.example\.com') -and
                        $_.Contains('example\.com$')
                    }
                )
                $regexRule = $regexForwardRules[0]
                $regexPattern = $regexRule.Substring(4).TrimStart('/').Replace('\\', '\')

                $content.Contains('FW example.com') | Should -BeTrue
                $content.Contains('NX >ads.example.com') | Should -BeTrue
                $content.Contains('FW >example.com') | Should -BeFalse
                $regexForwardRules.Count | Should -Be 1
                'www.example.com' | Should -Match $regexPattern
                'ads.example.com' | Should -Not -Match $regexPattern
                'cdn.ads.example.com' | Should -Not -Match $regexPattern
            }
        }

        It "Keeps Acrylic hosts modeling and rendering split into helpers" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "DNS.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Get-OpenPathDnsSettings',
                'NX *',
                'function Get-AcrylicForwardRules',
                'function New-AcrylicHostsDefinition',
                'function ConvertTo-AcrylicHostsContent',
                '$definition = New-AcrylicHostsDefinition',
                '$content = ConvertTo-AcrylicHostsContent -Definition $definition',
                '"FW $normalizedDomain"',
                '"FW >$normalizedDomain"'
            )

            $content | Should -Not -Match '\$content = @"'
        }

        It "Retries Acrylic DNS resolution before reporting failure" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "DNS.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Resolve-OpenPathDnsWithRetry',
                '[int]$MaxAttempts = 12',
                'Start-Sleep -Milliseconds $DelayMilliseconds',
                'Resolve-OpenPathDnsWithRetry',
                'Write-OpenPathLog "DNS resolution failed'
            )
        }

        It "Configures Acrylic to ignore and avoid caching upstream negative responses" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "DNS.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '"IgnoreNegativeResponsesFromPrimaryServer" = "No"',
                '"IgnoreNegativeResponsesFromSecondaryServer" = "No"',
                '"AddressCacheDisabled" = "Yes"',
                '"AddressCacheNegativeTime" = "0"'
            )
        }

        It "Writes allowlist affinity masks into AcrylicConfiguration.ini" {
            $script:capturedAcrylicConfig = $null

            Mock Get-AcrylicPath { 'C:\Program Files (x86)\Acrylic DNS Proxy' } -ModuleName DNS
            Mock Get-OpenPathDnsSettings {
                [PSCustomObject]@{
                    PrimaryDNS = '1.1.1.1'
                    SecondaryDNS = '1.0.0.1'
                    MaxDomains = 10
                }
            } -ModuleName DNS
            Mock Test-Path { $false } -ModuleName DNS -ParameterFilter { $Path -like '*AcrylicConfiguration.ini' }
            Mock Set-Content {
                param(
                    [string]$Path,
                    [string]$Value,
                    [string]$Encoding,
                    [switch]$Force
                )

                if ($Path -like '*AcrylicConfiguration.ini') {
                    $script:capturedAcrylicConfig = $Value
                }
            } -ModuleName DNS

            $result = Set-AcrylicConfiguration -WhitelistedDomains @('example.com', 'test.com')

            $result | Should -BeTrue
            $script:capturedAcrylicConfig | Should -Not -BeNullOrEmpty
            Assert-ContentContainsAll -Content $script:capturedAcrylicConfig -Needles @(
                'PrimaryServerDomainNameAffinityMask=',
                'SecondaryServerDomainNameAffinityMask=',
                'raw.githubusercontent.com;*.raw.githubusercontent.com',
                'example.com;*.example.com',
                'test.com;*.test.com',
                'IgnoreNegativeResponsesFromPrimaryServer=No',
                'IgnoreNegativeResponsesFromSecondaryServer=No',
                'AddressCacheDisabled=Yes'
            )
        }

        It "Allows install-time Acrylic configuration before any classroom whitelist exists" {
            $script:capturedAcrylicConfig = $null

            Mock Get-AcrylicPath { 'C:\Program Files (x86)\Acrylic DNS Proxy' } -ModuleName DNS
            Mock Get-OpenPathDnsSettings {
                [PSCustomObject]@{
                    PrimaryDNS = '1.1.1.1'
                    SecondaryDNS = '1.0.0.1'
                    MaxDomains = 10
                }
            } -ModuleName DNS
            Mock Test-Path { $false } -ModuleName DNS -ParameterFilter { $Path -like '*AcrylicConfiguration.ini' }
            Mock Set-Content {
                param(
                    [string]$Path,
                    [string]$Value,
                    [string]$Encoding,
                    [switch]$Force
                )

                if ($Path -like '*AcrylicConfiguration.ini') {
                    $script:capturedAcrylicConfig = $Value
                }
            } -ModuleName DNS

            $result = Set-AcrylicConfiguration

            $result | Should -BeTrue
            $script:capturedAcrylicConfig | Should -Not -BeNullOrEmpty
            Assert-ContentContainsAll -Content $script:capturedAcrylicConfig -Needles @(
                'PrimaryServerDomainNameAffinityMask=',
                'raw.githubusercontent.com;*.raw.githubusercontent.com',
                'IgnoreNegativeResponsesFromPrimaryServer=No',
                'AddressCacheDisabled=Yes'
            )
            $script:capturedAcrylicConfig | Should -Not -Match 'example\.com;'
        }

        It "Allows updating Acrylic hosts before any classroom whitelist exists" {
            $script:capturedAcrylicConfig = $null
            $script:capturedHostsContent = $null

            Mock Get-AcrylicPath { 'C:\Program Files (x86)\Acrylic DNS Proxy' } -ModuleName DNS
            Mock Get-OpenPathDnsSettings {
                [PSCustomObject]@{
                    PrimaryDNS = '1.1.1.1'
                    SecondaryDNS = '1.0.0.1'
                    MaxDomains = 10
                }
            } -ModuleName DNS
            Mock Test-Path { $false } -ModuleName DNS
            Mock Set-Content {
                param(
                    [string]$Path,
                    [string]$Value,
                    [string]$Encoding,
                    [switch]$Force
                )

                if ($Path -like '*AcrylicConfiguration.ini') {
                    $script:capturedAcrylicConfig = $Value
                }

                if ($Path -like '*AcrylicHosts.txt') {
                    $script:capturedHostsContent = $Value
                }
            } -ModuleName DNS

            $result = Update-AcrylicHost -WhitelistedDomains @() -BlockedSubdomains @()

            $result | Should -BeTrue
            $script:capturedHostsContent | Should -Not -BeNullOrEmpty
            $script:capturedHostsContent | Should -Match '# WHITELISTED DOMAINS \(0\)'
            $script:capturedHostsContent | Should -Match 'NX \*'
            $script:capturedHostsContent | Should -Not -Match 'FW example\.com'
            $script:capturedAcrylicConfig | Should -Not -BeNullOrEmpty
            Assert-ContentContainsAll -Content $script:capturedAcrylicConfig -Needles @(
                'PrimaryServerDomainNameAffinityMask=',
                'raw.githubusercontent.com;*.raw.githubusercontent.com',
                'IgnoreNegativeResponsesFromPrimaryServer=No',
                'AddressCacheDisabled=Yes'
            )
        }

        It "Always includes configured control-plane domains in the essential Acrylic allowlist" {
            InModuleScope DNS {
                Mock Get-OpenPathProtectedDomains { @('classroompath.example', 'downloads.example', 'raw.githubusercontent.com') }

                $definition = New-AcrylicHostsDefinition `
                    -WhitelistedDomains @('safe.example') `
                    -DnsSettings ([PSCustomObject]@{
                        PrimaryDNS = '1.1.1.1'
                        SecondaryDNS = '1.0.0.1'
                        MaxDomains = 10
                    })

                $content = ConvertTo-AcrylicHostsContent -Definition $definition

                $content | Should -Match 'FW classroompath\.example'
                $content | Should -Match 'FW downloads\.example'
                $definition.DomainAffinityMask | Should -Match 'classroompath\.example;\*\.classroompath\.example'
                $definition.DomainAffinityMask | Should -Match 'downloads\.example;\*\.downloads\.example'
            }
        }

        It "Purges AcrylicCache.dat before restarting the service" {
            $script:removedAcrylicPaths = @()

            Mock Get-AcrylicPath { 'C:\Program Files (x86)\Acrylic DNS Proxy' } -ModuleName DNS
            Mock Test-Path {
                param([string]$Path)

                return ($Path -like '*AcrylicCache.dat')
            } -ModuleName DNS
            Mock Remove-Item {
                param(
                    [string]$Path,
                    [switch]$Force,
                    [object]$ErrorAction
                )

                $script:removedAcrylicPaths += $Path
            } -ModuleName DNS
            Mock Get-Service {
                [PSCustomObject]@{
                    Name = 'AcrylicDNSProxySvc'
                    Status = 'Running'
                }
            } -ModuleName DNS
            Mock Restart-Service { } -ModuleName DNS
            Mock Start-Sleep { } -ModuleName DNS

            $result = Restart-AcrylicService

            $result | Should -BeTrue
            $script:removedAcrylicPaths | Should -Contain 'C:\Program Files (x86)\Acrylic DNS Proxy\AcrylicCache.dat'
        }
    }

    Context "Max domains limit" {
        It "Truncates generated whitelist domains to the configured limit" {
            InModuleScope DNS {
                $definition = New-AcrylicHostsDefinition `
                    -WhitelistedDomains @('one.example.com', 'two.example.com', 'three.example.com') `
                    -DnsSettings ([PSCustomObject]@{
                        PrimaryDNS = '8.8.8.8'
                        SecondaryDNS = '8.8.4.4'
                        MaxDomains = 2
                    })

                $definition.WasTruncated | Should -BeTrue
                $definition.OriginalWhitelistedDomainCount | Should -Be 3
                @($definition.EffectiveWhitelistedDomains).Count | Should -Be 2
                @($definition.EffectiveWhitelistedDomains) | Should -Be @('one.example.com', 'two.example.com')
            }
        }
    }

    Context "Acrylic installation fallback" {
        It "Pins the Acrylic portable installer to a release with modern hosts-cache fixes" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "DNS.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$installerVersion = "2.2.1"',
                'https://downloads.sourceforge.net/project/acrylic/Acrylic/$installerVersion/Acrylic-Portable.zip',
                'https://sourceforge.net/projects/acrylic/files/Acrylic/$installerVersion/Acrylic-Portable.zip/download'
            )
        }

        It "Falls back to Chocolatey when the direct Acrylic download fails" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "DNS.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Direct Acrylic install failed',
                'Get-Command choco',
                'upgrade acrylic-dns-proxy -y --no-progress',
                'Acrylic DNS Proxy installed successfully via Chocolatey'
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
                    enableKnownDnsIpBlocking = $true
                    enableDohIpBlocking = $false
                    dohResolverIps = @('4.4.4.4', '5.5.5.5')
                }
            } -ModuleName Firewall

            $result = Set-OpenPathFirewall -UpstreamDNS '8.8.8.8' -AcrylicPath 'C:\OpenPath\Acrylic DNS Proxy'
            $result | Should -BeTrue

            ($script:createdFirewallRules | Where-Object { $_.DisplayName -like '*Block-DoH*' -and $_.RemotePort -eq '443' }).Count | Should -Be 0
        }

        It "Creates targeted DNS/53 bypass blocks instead of a global port 53 block" {
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    enableKnownDnsIpBlocking = $true
                    enableDohIpBlocking = $true
                    dohResolverIps = @('4.4.4.4', '5.5.5.5')
                }
            } -ModuleName Firewall

            $result = Set-OpenPathFirewall -UpstreamDNS '8.8.8.8' -AcrylicPath 'C:\OpenPath\Acrylic DNS Proxy'
            $result | Should -BeTrue

            ($script:createdFirewallRules | Where-Object {
                    $_.RemoteAddress -eq '4.4.4.4' -and $_.RemotePort -eq '53' -and $_.Protocol -eq 'TCP'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.RemoteAddress -eq '4.4.4.4' -and $_.RemotePort -eq '53' -and $_.Protocol -eq 'UDP'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object { $_.DisplayName -eq 'OpenPath-DNS-Block-DNS-UDP' }).Count | Should -Be 0
            ($script:createdFirewallRules | Where-Object { $_.DisplayName -eq 'OpenPath-DNS-Block-DNS-TCP' }).Count | Should -Be 0
        }

        It "Creates TCP and UDP allow rules for Acrylic upstream DNS" {
            Initialize-FirewallRuleCaptureMocks
            Mock Test-Path { $true } -ModuleName Firewall -ParameterFilter { $Path -like '*AcrylicService.exe' }
            Mock Get-OpenPathConfig {
                [PSCustomObject]@{
                    enableKnownDnsIpBlocking = $true
                    enableDohIpBlocking = $true
                    dohResolverIps = @('4.4.4.4')
                }
            } -ModuleName Firewall

            $result = Set-OpenPathFirewall -UpstreamDNS '8.8.8.8' -AcrylicPath 'C:\OpenPath\Acrylic DNS Proxy'
            $result | Should -BeTrue

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -eq 'OpenPath-DNS-Allow-Upstream-UDP' -and $_.RemoteAddress -eq '8.8.8.8' -and $_.RemotePort -eq '53'
                }).Count | Should -Be 1

            ($script:createdFirewallRules | Where-Object {
                    $_.DisplayName -eq 'OpenPath-DNS-Allow-Upstream-TCP' -and $_.RemoteAddress -eq '8.8.8.8' -and $_.RemotePort -eq '53'
                }).Count | Should -Be 1
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

        It "Avoids explicit max repetition duration for recurring tasks" {
            $servicesPath = Join-Path $PSScriptRoot ".." "lib" "Services.psm1"
            $content = Get-Content $servicesPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$updateTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2)',
                '-RepetitionInterval (New-TimeSpan -Minutes $UpdateIntervalMinutes)',
                '$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)',
                '-RepetitionInterval (New-TimeSpan -Minutes $WatchdogIntervalMinutes)'
            )

            $content.Contains('RepetitionDuration ([TimeSpan]::MaxValue)') | Should -BeFalse
        }
    }

    Context "Agent self-update" {
        It "Re-registers the Firefox native host after applying updated files" {
            $commonPath = Join-Path $PSScriptRoot ".." "lib" "Common.psm1"
            $content = Get-Content $commonPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Copy-Item -Path $download.StagedPath -Destination $download.DestinationPath -Force',
                'Register-OpenPathFirefoxNativeHost -Config $config | Out-Null'
            )
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

Describe "Script Bootstrap Module" {
    Context "Standalone script initialization" {
        It "Provides a shared initializer for standalone Windows scripts" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "ScriptBootstrap.psm1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Initialize-OpenPathScriptSession',
                '[string[]]$DependentModules = @()',
                '[string[]]$RequiredCommands = @()',
                '[string]$ScriptName = ''OpenPath script''',
                'Import-Module (Join-Path $OpenPathRoot "lib\$moduleName.psm1") -Force -Global',
                'Import-Module (Join-Path $OpenPathRoot ''lib\Common.psm1'') -Force -Global',
                'failed to import required commands',
                'Export-ModuleMember -Function @('
            )
        }
    }
}

Describe "SSE Listener" {
    Context "Script existence" {
        It "Start-SSEListener.ps1 exists" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            Test-Path $scriptPath | Should -BeTrue
        }

        It "Keeps parser-sensitive messages ASCII-only" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            $content.Contains('—') | Should -BeFalse
        }

        It "Uses the shared standalone bootstrap helper and loads HTTP assembly support" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Start-SSEListener.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Import-Module "$OpenPathRoot\lib\ScriptBootstrap.psm1" -Force',
                'Initialize-OpenPathScriptSession `',
                '-OpenPathRoot $OpenPathRoot',
                '-RequiredCommands @(',
                '-ScriptName ''Start-SSEListener.ps1''',
                "Add-Type -AssemblyName 'System.Net.Http' -ErrorAction Stop",
                "[System.Reflection.Assembly]::Load('System.Net.Http')",
                '[System.Net.Http.HttpClientHandler]::new()'
            )
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

    Context "Argument forwarding" {
        It "Normalizes named arguments before invoking child scripts" {
            $scriptPath = Join-Path $PSScriptRoot ".." "OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function ConvertTo-OpenPathInvocationSplat',
                '$namedArguments = @{}',
                '& $ScriptPath @namedArguments @positionalArguments'
            )
            $content.Contains('& $ScriptPath @ScriptArguments') | Should -BeFalse
        }
    }

    Context "DNS probe selection" {
        It "Uses the shared probe selection instead of hard-coding google.com" {
            $scriptPath = Join-Path $PSScriptRoot ".." "OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content.Contains("Test-DNSResolution -Domain 'google.com'") | Should -BeFalse
            $content.Contains('Test-DNSResolution)') | Should -BeTrue
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

    Context "Module import resilience" {
        It "Uses the shared standalone bootstrap helper" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Import-Module "$OpenPathRoot\lib\ScriptBootstrap.psm1" -Force',
                'Initialize-OpenPathScriptSession `',
                '-OpenPathRoot $OpenPathRoot',
                '-DependentModules @(''DNS'', ''Firewall'', ''Browser'')',
                '-RequiredCommands @(',
                '-ScriptName ''Update-OpenPath.ps1'''
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
                'function Write-UpdateCatchLog',
                'Attempting checkpoint rollback',
                'Falling back to backup whitelist rollback',
                'Copy-Item $backupPath $whitelistPath -Force',
                'Write-UpdateCatchLog "Update failed: $_" -Level ERROR'
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
        It "Includes stale threshold logic and restores protected mode via shared helper" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'staleWhitelistMaxAgeHours',
                'Enter-StaleWhitelistFailsafe',
                'STALE_FAILSAFE',
                'Restore-OpenPathProtectedMode -Config $Config'
            )
        }
    }

    Context "Protected mode recovery" {
        It "Restores local DNS and firewall through the shared helper after applying a valid whitelist" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Update-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content | Should -Match '(?s)elseif \(\$whitelist\.IsDisabled\).*?Restore-OriginalDNS'
            $content | Should -Match '(?s)# Save whitelist to local file.*?Update-AcrylicHost.*?Restore-OpenPathProtectedMode -Config \$config'
            $content | Should -Match '(?s)Falling back to backup whitelist rollback.*?Restore-OpenPathProtectedMode -Config \$config -ErrorAction SilentlyContinue'
        }
    }
}

Describe "Watchdog Script" {
    Context "Module import resilience" {
        It "Uses the shared standalone bootstrap helper" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Import-Module "$OpenPathRoot\lib\ScriptBootstrap.psm1" -Force',
                'Initialize-OpenPathScriptSession `',
                '-OpenPathRoot $OpenPathRoot',
                '-DependentModules @(''DNS'', ''Firewall'', ''CaptivePortal'')',
                '-RequiredCommands @(',
                '-ScriptName ''Test-DNSHealth.ps1'''
            )
        }
    }

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
                '-DependentModules @(''DNS'', ''Firewall'', ''CaptivePortal'')',
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
                'Restore-OpenPathProtectedMode -Config $Config -SkipAcrylicRestart',
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

    Context "DNS probe selection" {
        It "Relies on the shared DNS probe instead of a hard-coded public domain" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            $content.Contains('Test-DNSResolution -Domain "google.com"') | Should -BeFalse
            $content.Contains('(Test-DNSResolution)') | Should -BeTrue
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

        It "Does not let SSE listener failures alone trigger checkpoint rollback" {
            $scriptPath = Join-Path $PSScriptRoot ".." "scripts" "Test-DNSHealth.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$recoveryEligibleIssues = @()',
                '$shouldIncrementFailCount = $status -eq ''DEGRADED'' -and $recoveryEligibleIssues.Count -gt 0',
                '$issues += "SSE listener not running"'
            )
            $content.Contains('$recoveryEligibleIssues += "SSE listener not running"') | Should -BeFalse
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

        It "Grants local users read access to staged browser extension artifacts" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$browserExtensionAclPath = "$OpenPathRoot\browser-extension"',
                'BUILTIN\Users',
                '"ReadAndExecute"',
                'Read access granted for browser extension artifacts'
            )
        }

        It "Stages Firefox release assets beneath the user-readable browser-extension ACL root" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$browserExtensionAclPath = "$OpenPathRoot\browser-extension"',
                '$firefoxReleaseTarget = "$OpenPathRoot\browser-extension\firefox-release"',
                'Signed Firefox Release artifacts staged in $OpenPathRoot\browser-extension\firefox-release'
            )
        }

        It "Stages Chromium managed rollout metadata beneath the user-readable browser-extension ACL root" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$browserExtensionAclPath = "$OpenPathRoot\browser-extension"',
                '$chromiumManagedCandidates = @(',
                "firefox-extension\build\chromium-managed",
                '$chromiumManagedTarget = "$OpenPathRoot\browser-extension\chromium-managed"',
                'Chromium managed rollout metadata staged in $OpenPathRoot\browser-extension\chromium-managed'
            )
        }

        It "Stages Windows native host assets beneath the user-readable Firefox native directory" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$firefoxNativeHostTarget = "$OpenPathRoot\browser-extension\firefox\native"',
                'OpenPath-NativeHost.ps1',
                'OpenPath-NativeHost.cmd',
                'Firefox native host assets staged in $OpenPathRoot\browser-extension\firefox\native'
            )
        }

        It "Registers Firefox native messaging host in both 64-bit and WOW6432Node registry views" {
            $browserModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.psm1"
            $content = Get-Content $browserModulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Mozilla\NativeMessagingHosts\whitelist_native_host',
                'WOW6432Node\Mozilla\NativeMessagingHosts\whitelist_native_host',
                "allowed_extensions = @('monitor-bloqueos@openpath')",
                'name = Get-OpenPathFirefoxNativeHostName'
            )
        }

        It "Uses braced interpolation for SourceRoot error messages before a colon" {
            $browserModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.psm1"
            $content = Get-Content $browserModulePath -Raw

            $content.Contains('Firefox native host artifacts not found in ${SourceRoot}:') | Should -BeTrue
            $content.Contains('Firefox native host artifacts not found in $SourceRoot:') | Should -BeFalse
        }

        It "Skips registry deletion when Firefox native host keys are already absent in the browser module" {
            $browserModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.psm1"
            $content = Get-Content $browserModulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function ConvertTo-OpenPathRegistryProviderPath',
                'return "Registry::HKEY_LOCAL_MACHINE\\$($RegistryPath.Substring(5))"',
                'if ($RegistryPath -match ''^HKLM\\'')',
                'Remove-OpenPathRegistryKeyIfPresent -RegistryPath $registryPath',
                'if (Test-Path $providerPath)'
            )
            $content.Contains('& reg.exe DELETE $registryPath /f 2>$null | Out-Null') | Should -BeFalse
        }

        It "Falls back to the staged native host directory during re-registration after self-update" {
            $browserModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.psm1"
            $content = Get-Content $browserModulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$candidateRoots = @($SourceRoot, $nativeRoot) | Select-Object -Unique',
                '$artifactSources[$artifactName] = $artifactSource',
                '[string]::Equals($sourcePath, $destinationPath, [System.StringComparison]::OrdinalIgnoreCase)'
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

    Context "Enrollment argument forwarding" {
        It "Uses named parameter splatting for classroom registration" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$enrollParams = @{',
                '& $enrollScript @enrollParams'
            )
            $content.Contains('$enrollArgs = @(') | Should -BeFalse
            $content.Contains('& $enrollScript @enrollArgs') | Should -BeFalse
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

        It "Supports optional Chromium store URLs for unmanaged browser installs" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '[string]$ChromeExtensionStoreUrl = ""',
                '[string]$EdgeExtensionStoreUrl = ""',
                'chromeExtensionStoreUrl',
                'edgeExtensionStoreUrl'
            )
        }
    }

    Context "Enrollment before first update" {
        It "Skips first update when classroom registration fails" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Registro no completado; se omite primera actualizacion',
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

        It "Stages Chromium unmanaged browser install guidance when store URLs are configured" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$OpenPathRoot\browser-extension\chromium-unmanaged',
                '[InternetShortcut]',
                'Install OpenPath for Google Chrome.url',
                'Install OpenPath for Microsoft Edge.url'
            )
        }

        It "Opens unmanaged Chromium store guidance only during interactive installs" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'if (-not $Unattended)',
                'Start-Process -FilePath $browserTarget.ExecutablePath -ArgumentList $browserTarget.StoreUrl',
                'Chromium store guidance staged for unattended install'
            )
        }
    }

    Context "Pre-install validation integration" {
        It "Runs pre-install validation by default and supports SkipPreflight" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'SkipPreflight',
                'scripts\Pre-Install-Validation.ps1',
                'powershell.exe -NoProfile -ExecutionPolicy Bypass -File'
            )
            $content.Contains('tests\Pre-Install-Validation.ps1') | Should -BeFalse
        }
    }

    Context "Primary DNS detection" {
        It "Uses an installer helper instead of indexing directly into adapter DNS arrays" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            $content.Contains('function Get-InstallerPrimaryDNS') | Should -BeTrue
            $content.Contains('$primaryDNS = Get-InstallerPrimaryDNS') | Should -BeTrue
            $content.Contains('Select-Object -First 1).ServerAddresses[0]') | Should -BeFalse
        }
    }

    Context "DNS probe guidance" {
        It "Derives the suggested nslookup domain from the shared probe list" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Get-OpenPathDnsProbeDomains',
                'nslookup $dnsProbeDomain 127.0.0.1'
            )
            $content.Contains('Test-DNSResolution -Domain "google.com"') | Should -BeFalse
            $content.Contains('nslookup google.com 127.0.0.1') | Should -BeFalse
        }
    }

    Context "SSE bootstrap" {
        It "Starts the SSE listener immediately after registering scheduled tasks" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Install-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Register-OpenPathTask -UpdateIntervalMinutes 15 -WatchdogIntervalMinutes 1',
                'Start-OpenPathTask -TaskType SSE'
            )
        }
    }
}

Describe "Uninstaller" {
    Context "Firefox native host cleanup" {
        It "Removes Firefox native messaging registry entries and staged host artifacts" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Uninstall-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Mozilla\NativeMessagingHosts\whitelist_native_host',
                'WOW6432Node\Mozilla\NativeMessagingHosts\whitelist_native_host',
                'OpenPath-NativeHost.ps1',
                'OpenPath-NativeHost.cmd'
            )
        }

        It "Skips registry deletion when Firefox native host keys are already absent" {
            $scriptPath = Join-Path $PSScriptRoot ".." "Uninstall-OpenPath.ps1"
            $content = Get-Content $scriptPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Convert-ToRegistryProviderPath',
                'return "Registry::HKEY_LOCAL_MACHINE\\$($RegistryPath.Substring(5))"',
                'if ($RegistryPath -match ''^HKLM\\'')',
                'if (Test-Path $providerPath)',
                'Remove-Item -Path $providerPath -Recurse -Force -ErrorAction SilentlyContinue'
            )
            $content.Contains('& reg.exe DELETE $registryPath /f 2>$null | Out-Null') | Should -BeFalse
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
                'New-OpenPathMachineRegistrationBody',
                'Resolve-OpenPathMachineRegistration'
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
