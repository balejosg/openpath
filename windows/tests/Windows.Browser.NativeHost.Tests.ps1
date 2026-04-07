# OpenPath Windows browser native host tests

. (Join-Path $PSScriptRoot "TestHelpers.ps1")

BeforeAll {
    $modulePath = Join-Path $PSScriptRoot ".." "lib"
    Import-Module "$modulePath\Browser.psm1" -Force -ErrorAction SilentlyContinue
}

Describe "Browser Module - Native Host" {
    Context "Native host registration" {
        It "Re-stages native host artifacts before writing the Firefox manifest" {
            $browserModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.psm1"
            $content = Get-Content $browserModulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Sync-OpenPathFirefoxNativeHostArtifacts',
                "OpenPath-NativeHost.ps1",
                "OpenPath-NativeHost.cmd",
                'Sync-OpenPathFirefoxNativeHostArtifacts | Out-Null'
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
