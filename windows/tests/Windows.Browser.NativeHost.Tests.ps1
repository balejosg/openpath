# OpenPath Windows browser native host tests

Import-Module (Join-Path $PSScriptRoot "TestHelpers.psm1") -Force

BeforeAll {
    $modulePath = Join-Path $PSScriptRoot ".." "lib"
    Import-Module "$modulePath\Browser.psm1" -Force -ErrorAction Stop
}

Describe "Browser Module - Native Host" {
    Context "Native host registration" {
        It "Re-stages native host artifacts before writing the Firefox manifest" {
            $browserModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.psm1"
            $nativeHostModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.FirefoxNativeHost.psm1"
            $browserContent = Get-Content $browserModulePath -Raw
            $nativeHostContent = Get-Content $nativeHostModulePath -Raw

            Assert-ContentContainsAll -Content $nativeHostContent -Needles @(
                'function Sync-OpenPathFirefoxNativeHostArtifacts',
                "OpenPath-NativeHost.ps1",
                "OpenPath-NativeHost.cmd"
            )

            Assert-ContentContainsAll -Content $browserContent -Needles @(
                'function Sync-OpenPathFirefoxNativeHostArtifacts',
                'Browser.FirefoxNativeHost\Sync-OpenPathFirefoxNativeHostArtifacts -SourceRoot $SourceRoot'
            )
        }

        It "Grants standard users read and execute access to the update task" {
            $servicesModulePath = Join-Path $PSScriptRoot ".." "lib" "Services.psm1"
            $content = Get-Content $servicesModulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Grant-OpenPathTaskRunAccessToUsers',
                'GetTask($TaskName)',
                'GetSecurityDescriptor(0xF)',
                'SetSecurityDescriptor($updatedSecurityDescriptor, 0)',
                "(A;;GRGX;;;BU)",
                'Grant-OpenPathTaskRunAccessToUsers -TaskName "$script:TaskPrefix-Update"'
            )
        }
    }
}
