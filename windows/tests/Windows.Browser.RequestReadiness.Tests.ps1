# OpenPath Windows browser request readiness tests

Import-Module (Join-Path $PSScriptRoot "TestHelpers.psm1") -Force
$modulePath = Join-Path $PSScriptRoot ".." "lib"
Import-Module "$modulePath\Browser.RequestReadiness.psm1" -Force -Global -ErrorAction Stop

Describe "Browser Module - Request Readiness" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module (Join-Path $modulePath "Browser.RequestReadiness.psm1") -Force -Global -ErrorAction Stop
    }

    It "Reports complete Windows browser request readiness facts" {
        $result = Get-OpenPathBrowserRequestReadiness `
            -Config ([PSCustomObject]@{
                apiUrl = "https://school.example"
                whitelistUrl = "https://school.example/w/machine-token-123/whitelist.txt"
                classroomId = "classroom-123"
            }) `
            -ManagedExtensionPolicy ([PSCustomObject]@{
                ExtensionId = "monitor-bloqueos@openpath"
                InstallUrl = "https://school.example/api/extensions/firefox/openpath.xpi"
                Source = "managed-api"
            }) `
            -NativeHostRegistered $true `
            -NativeHostStatePresent $true

        $result.Platform | Should -Be "windows"
        $result.Ready | Should -BeTrue
        $result.Facts.request_setup | Should -Be "ready"
        $result.Facts.firefox_managed_extension | Should -Be "ready"
        $result.Facts.PSObject.Properties.Name | Should -Not -Contain "firefox_policy"
        $result.Facts.firefox_native_host | Should -Be "ready"
        @($result.FailureReasons).Count | Should -Be 0
    }

    It "Fails readiness when signed Firefox extension policy is missing" {
        $result = Get-OpenPathBrowserRequestReadiness `
            -Config ([PSCustomObject]@{
                apiUrl = "https://school.example"
                whitelistUrl = "https://school.example/w/machine-token-123/whitelist.txt"
                classroomId = "classroom-123"
            }) `
            -ManagedExtensionPolicy $null `
            -NativeHostRegistered $true `
            -NativeHostStatePresent $true

        $result.Ready | Should -BeFalse
        $result.Facts.firefox_managed_extension | Should -Be "missing"
        @($result.FailureReasons) | Should -Contain "firefox_managed_extension_missing"
    }

    It "Fails readiness when native host registration proof is missing" {
        $result = Get-OpenPathBrowserRequestReadiness `
            -Config ([PSCustomObject]@{
                apiUrl = "https://school.example"
                whitelistUrl = "https://school.example/w/machine-token-123/whitelist.txt"
                classroomId = "classroom-123"
            }) `
            -ManagedExtensionPolicy ([PSCustomObject]@{
                ExtensionId = "monitor-bloqueos@openpath"
                InstallUrl = "https://school.example/api/extensions/firefox/openpath.xpi"
                Source = "managed-api"
            }) `
            -NativeHostRegistered $false `
            -NativeHostStatePresent $true

        $result.Ready | Should -BeFalse
        $result.Facts.firefox_native_host | Should -Be "missing"
        @($result.FailureReasons) | Should -Contain "firefox_native_host_missing"
    }

    It "Fails readiness when request setup is incomplete" {
        $result = Get-OpenPathBrowserRequestReadiness `
            -Config ([PSCustomObject]@{
                apiUrl = "school.example"
                whitelistUrl = "https://school.example/w/machine-token-123/whitelist.txt"
                classroomId = "classroom-123"
            }) `
            -ManagedExtensionPolicy ([PSCustomObject]@{
                ExtensionId = "monitor-bloqueos@openpath"
                InstallUrl = "https://school.example/api/extensions/firefox/openpath.xpi"
                Source = "managed-api"
            }) `
            -NativeHostRegistered $true `
            -NativeHostStatePresent $true

        $result.Ready | Should -BeFalse
        $result.Facts.request_setup | Should -Be "missing"
        @($result.FailureReasons) | Should -Contain "request_setup_incomplete"
    }
}
