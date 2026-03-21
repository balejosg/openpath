#!/usr/bin/env bats
################################################################################
# windows-e2e.bats - Guardrails for Windows E2E installation coverage
################################################################################

load 'test_helper'

@test "windows e2e runner invokes the real installer" {
    run grep -n "Install-OpenPath\.ps1" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -n -- "-WhitelistUrl" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -n -- "-Unattended" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]
}

@test "windows e2e workflow does not manufacture install state before runner" {
    run grep -n "name: Install Acrylic DNS Proxy" "$PROJECT_DIR/.github/workflows/e2e-tests.yml"
    [ "$status" -ne 0 ]

    run grep -n "name: Prepare installation" "$PROJECT_DIR/.github/workflows/e2e-tests.yml"
    [ "$status" -ne 0 ]

    run grep -n "name: Create test configuration" "$PROJECT_DIR/.github/workflows/e2e-tests.yml"
    [ "$status" -ne 0 ]
}

@test "windows installer entrypoints stay ASCII-safe" {
    run grep -nP "[^\\x00-\\x7F]" "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -ne 0 ]

    run grep -nP "[^\\x00-\\x7F]" "$PROJECT_DIR/windows/Uninstall-OpenPath.ps1"
    [ "$status" -ne 0 ]

    run grep -nP "[^\\x00-\\x7F]" "$PROJECT_DIR/windows/tests/Pre-Install-Validation.ps1"
    [ "$status" -ne 0 ]
}

@test "windows e2e accepts install-time whitelist bootstrap as best effort" {
    run grep -n "proceeding to explicit update validation" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -n "Installed whitelist file is missing after first update" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -ne 0 ]
}

@test "windows updater re-imports Common globally for standalone execution" {
    run grep -nF 'Import-Module "$OpenPathRoot\lib\Common.psm1" -Force -Global' "$PROJECT_DIR/windows/scripts/Update-OpenPath.ps1"
    [ "$status" -eq 0 ]

    run grep -nF 'Update-OpenPath.ps1 failed to import required common commands' "$PROJECT_DIR/windows/scripts/Update-OpenPath.ps1"
    [ "$status" -eq 0 ]
}

@test "windows common module loads System.Net.Http before standalone downloads" {
    run grep -nF "function Ensure-OpenPathHttpAssembly" "$PROJECT_DIR/windows/lib/Common.psm1"
    [ "$status" -eq 0 ]

    run grep -nF "Add-Type -AssemblyName 'System.Net.Http' -ErrorAction Stop" "$PROJECT_DIR/windows/lib/Common.psm1"
    [ "$status" -eq 0 ]
}

@test "windows acrylic hosts generation uses official FW/NX syntax" {
    run grep -nF 'NX *' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'function Get-AcrylicForwardRules' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF '"FW $normalizedDomain"' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF '"FW >$normalizedDomain"' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF "Get-AcrylicForwardRules -Domain 'raw.githubusercontent.com'" "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF "\$((Get-AcrylicForwardRules -Domain 'raw.githubusercontent.com') -join \"\`n\")" "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'Get-AcrylicForwardRules -Domain $domain' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run sh -c '
        dns_file="$1"
        whitelist_line=$(grep -nF "# WHITELISTED DOMAINS" "$dns_file" | head -1 | cut -d: -f1)
        nx_line=$(grep -nF "NX *" "$dns_file" | head -1 | cut -d: -f1)
        test -n "$whitelist_line" && test -n "$nx_line" && [ "$nx_line" -gt "$whitelist_line" ]
    ' _ "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'This MUST come last after FW rules.' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nE 'Get-AcrylicForwardRules -Domain [^)]* -join' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -ne 0 ]

    run grep -nF 'NX >*' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -ne 0 ]
}

@test "windows dns validation retries acrylic readiness before failing" {
    run grep -nF 'function Resolve-OpenPathDnsWithRetry' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF '"IgnoreNegativeResponsesFromPrimaryServer" = "Yes"' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF '"IgnoreNegativeResponsesFromSecondaryServer" = "Yes"' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF '"AddressCacheNegativeTime" = "0"' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'Start-Sleep -Milliseconds $DelayMilliseconds' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF "Resolve-OpenPathDnsWithRetry -Domain 'google.com' -MaxAttempts 20 -DelayMilliseconds 1500" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "(Join-Path \$acrylicPath 'AcrylicConfiguration.ini')" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]
}

@test "windows e2e dumps Acrylic hit logs and per-record diagnostics on failure" {
    run grep -nF "function Set-AcrylicDiagnosticLogging" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "'C:\OpenPath\data\logs\acrylic-hit.log'" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "'HitLogFileWhat' = 'XHCFRU'" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "@('A', 'AAAA', 'HTTPS')" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "AcrylicService.exe version" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]
}

@test "windows installer keeps Acrylic on the modern portable release track" {
    run grep -nF '$installerVersion = "2.2.1"' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'Acrylic/$installerVersion/Acrylic-Portable.zip/download' "$PROJECT_DIR/windows/lib/DNS.psm1"
    [ "$status" -eq 0 ]
}

@test "windows firewall does not install a global DNS port 53 block that overrides Acrylic" {
    run grep -nF 'OpenPath-DNS-Block-DNS-UDP' "$PROJECT_DIR/windows/lib/Firewall.psm1"
    [ "$status" -ne 0 ]

    run grep -nF 'OpenPath-DNS-Block-DNS-TCP' "$PROJECT_DIR/windows/lib/Firewall.psm1"
    [ "$status" -ne 0 ]

    run grep -nF 'DisplayName "$script:RulePrefix-Allow-$($target.Name)-$protocol"' "$PROJECT_DIR/windows/lib/Firewall.psm1"
    [ "$status" -eq 0 ]

    run grep -nF 'Block-Known-DNS-' "$PROJECT_DIR/windows/lib/Firewall.psm1"
    [ "$status" -eq 0 ]
}

@test "windows installer validates direct DNS candidates before picking upstream" {
    run grep -nF 'function Test-InstallerDirectDnsServer' "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]

    run grep -nF 'function Test-InstallerDisfavoredDnsServer' "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "'168.63.129.16'" "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "Resolve-DnsName -Name \$ProbeDomain -Server \$Server -DnsOnly -ErrorAction Stop" "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "@('8.8.8.8', '1.1.1.1', '9.9.9.9', '8.8.4.4')" "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "(@(\$preferredCandidates) + @(\$fallbackCandidates) + @(\$disfavoredCandidates))" "$PROJECT_DIR/windows/Install-OpenPath.ps1"
    [ "$status" -eq 0 ]
}

@test "windows pester e2e receives whitelist domains from the harness and keeps file fallback" {
    run grep -nF 'OPENPATH_E2E_EXPECTED_WHITELIST_DOMAINS' "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -nF 'OPENPATH_E2E_EXPECTED_WHITELIST_DOMAINS' "$PROJECT_DIR/tests/e2e/Windows-E2E.Tests.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "Get-ValidWhitelistDomainsFromFile -Path \$whitelistPath" "$PROJECT_DIR/tests/e2e/Windows-E2E.Tests.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "function Resolve-OpenPathDnsWithRetry" "$PROJECT_DIR/tests/e2e/Windows-E2E.Tests.ps1"
    [ "$status" -eq 0 ]

    run grep -nF '$result = Resolve-OpenPathDnsWithRetry -Domain $domains[0]' "$PROJECT_DIR/tests/e2e/Windows-E2E.Tests.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "At least one adapter points DNS to 127.0.0.1" "$PROJECT_DIR/tests/e2e/Windows-E2E.Tests.ps1"
    [ "$status" -eq 0 ]

    run grep -nF "function Test-InstalledDnsProxyResolution" "$PROJECT_DIR/tests/e2e/ci/run-windows-e2e.ps1"
    [ "$status" -eq 0 ]

    run grep -n 'Can resolve google.com via system DNS' "$PROJECT_DIR/tests/e2e/Windows-E2E.Tests.ps1"
    [ "$status" -ne 0 ]
}
