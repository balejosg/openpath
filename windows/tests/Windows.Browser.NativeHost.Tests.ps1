# OpenPath Windows browser native host tests

Import-Module (Join-Path $PSScriptRoot "TestHelpers.psm1") -Force
$modulePath = Join-Path $PSScriptRoot ".." "lib"
Import-Module "$modulePath\Browser.psm1" -Force -Global -ErrorAction Stop

Describe "Browser Module - Native Host" {
    BeforeAll {
        $browserModulePath = Join-Path (Join-Path $PSScriptRoot ".." "lib") "Browser.psm1"
        Import-Module $browserModulePath -Force -Global -ErrorAction Stop
    }

    Context "Native host registration" {
        It "Requires complete request setup before native host registration or state sync" {
            $nativeHostModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.FirefoxNativeHost.psm1"
            $nativeHostContent = Get-Content $nativeHostModulePath -Raw

            Assert-ContentContainsAll -Content $nativeHostContent -Needles @(
                'function Test-OpenPathFirefoxNativeHostRequestSetupComplete',
                'Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName ''apiUrl''',
                'Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName ''whitelistUrl''',
                'Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName ''classroom''',
                'Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName ''classroomId''',
                "/w/[^/]+/whitelist\.txt($|[?#].*)",
                'Unregister-OpenPathFirefoxNativeHost | Out-Null',
                'Test-OpenPathFirefoxNativeHostRequestSetupComplete -Config $Config'
            )
        }

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
            $taskHelperPath = Join-Path $PSScriptRoot ".." "lib" "internal" "Services.TaskBuilders.ps1"
            $content = Get-Content $servicesModulePath -Raw
            $taskHelperContent = Get-Content $taskHelperPath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'function Grant-OpenPathTaskRunAccessToUsers',
                'GetTask($TaskName)',
                'GetSecurityDescriptor(0xF)',
                'SetSecurityDescriptor($updatedSecurityDescriptor, 0)',
                "(A;;GRGX;;;BU)",
                'Grant-OpenPathTaskRunAccessToUsers -TaskName $updateDefinition.TaskName'
            )

            Assert-ContentContainsAll -Content $taskHelperContent -Needles @(
                'function New-OpenPathUpdateTaskDefinition',
                '-TaskName "$TaskPrefix-Update"'
            )
        }
    }
}
