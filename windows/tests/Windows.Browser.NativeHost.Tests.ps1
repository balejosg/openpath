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
        It "Serves request config from the staged native directory without reading locked agent internals" {
            $repoWindowsRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
            $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("openpath-native-host-test-" + [Guid]::NewGuid().ToString("N"))
            $nativeRoot = Join-Path $tempRoot "browser-extension\firefox\native"
            New-Item -ItemType Directory -Path $nativeRoot -Force | Out-Null

            try {
                $nativeFiles = @(
                    "OpenPath-NativeHost.ps1",
                    "OpenPath-NativeHost.cmd",
                    "NativeHost.State.ps1",
                    "NativeHost.Protocol.ps1",
                    "NativeHost.Actions.ps1"
                )

                foreach ($nativeFile in $nativeFiles) {
                    $sourcePath = Join-Path $repoWindowsRoot "scripts\$nativeFile"
                    if (-not (Test-Path $sourcePath)) {
                        $sourcePath = Join-Path $repoWindowsRoot "lib\internal\$nativeFile"
                    }

                    Copy-Item $sourcePath -Destination (Join-Path $nativeRoot $nativeFile) -Force
                }

                @{
                    machineName = "lab-pc-01"
                    apiUrl = "https://school.example"
                    requestApiUrl = "https://school.example"
                    whitelistUrl = "https://school.example/w/machine-token-123/whitelist.txt"
                    version = "test-version"
                } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $nativeRoot "native-state.json") -Encoding UTF8

                $nativeScriptPath = Join-Path $nativeRoot "OpenPath-NativeHost.ps1"
                $processStart = [System.Diagnostics.ProcessStartInfo]::new()
                $processStart.FileName = (Get-Process -Id $PID).Path
                $processStart.ArgumentList.Add("-NoProfile")
                $processStart.ArgumentList.Add("-ExecutionPolicy")
                $processStart.ArgumentList.Add("Bypass")
                $processStart.ArgumentList.Add("-File")
                $processStart.ArgumentList.Add($nativeScriptPath)
                $processStart.RedirectStandardInput = $true
                $processStart.RedirectStandardOutput = $true
                $processStart.RedirectStandardError = $true
                $processStart.UseShellExecute = $false

                function Read-NativeHostProcessBytes {
                    param(
                        [Parameter(Mandatory = $true)]
                        [System.IO.Stream]$Stream,

                        [Parameter(Mandatory = $true)]
                        [int]$Count,

                        [Parameter(Mandatory = $true)]
                        [string]$Description
                    )

                    $buffer = New-Object byte[] $Count
                    $offset = 0
                    while ($offset -lt $Count) {
                        $readTask = $Stream.ReadAsync($buffer, $offset, $Count - $offset)
                        if (-not $readTask.Wait([TimeSpan]::FromSeconds(5))) {
                            throw "Timed out reading $Description from native host"
                        }

                        $chunkSize = $readTask.Result
                        if ($chunkSize -le 0) {
                            throw "Native host stdout closed while reading $Description"
                        }

                        $offset += $chunkSize
                    }

                    return $buffer
                }

                $process = [System.Diagnostics.Process]::Start($processStart)
                $stderrTask = $process.StandardError.ReadToEndAsync()
                try {
                    $messageJson = (@{ action = "get-config" } | ConvertTo-Json -Compress)
                    $messageBytes = [System.Text.Encoding]::UTF8.GetBytes($messageJson)
                    $lengthBytes = [System.BitConverter]::GetBytes([int]$messageBytes.Length)
                    $process.StandardInput.BaseStream.Write($lengthBytes, 0, $lengthBytes.Length)
                    $process.StandardInput.BaseStream.Write($messageBytes, 0, $messageBytes.Length)
                    $process.StandardInput.BaseStream.Flush()
                    $process.StandardInput.Close()

                    $responseLengthBytes = Read-NativeHostProcessBytes `
                        -Stream $process.StandardOutput.BaseStream `
                        -Count 4 `
                        -Description "response length"
                    $responseLength = [System.BitConverter]::ToInt32($responseLengthBytes, 0)
                    if ($responseLength -le 0 -or $responseLength -gt 1MB) {
                        throw "Native host returned invalid response length: $responseLength"
                    }

                    $responseBytes = Read-NativeHostProcessBytes `
                        -Stream $process.StandardOutput.BaseStream `
                        -Count $responseLength `
                        -Description "response body"
                    $response = [System.Text.Encoding]::UTF8.GetString($responseBytes) | ConvertFrom-Json
                    $response.success | Should -BeTrue
                    $response.requestApiUrl | Should -Be "https://school.example"
                    $response.hostname | Should -Be "lab-pc-01"
                    $response.machineToken | Should -Be "machine-token-123"
                }
                finally {
                    if ($null -ne $process) {
                        $nativeHostExited = $process.WaitForExit(5000)
                        if (-not $nativeHostExited) {
                            try {
                                $process.Kill($true)
                            }
                            catch {
                                try {
                                    $process.Kill()
                                }
                                catch {
                                    # The process may have exited between WaitForExit and Kill.
                                }
                            }

                            $null = $process.WaitForExit(5000)
                        }

                        if ($null -ne $stderrTask -and $stderrTask.Wait(5000) -and $stderrTask.Result) {
                            Write-Host ("Native host stderr: {0}" -f $stderrTask.Result)
                        }

                        $process.Dispose()

                        if (-not $nativeHostExited) {
                            throw "Native host process did not exit after stdin closed"
                        }
                    }
                }
            }
            finally {
                Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
            }
        }

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

        It "Accepts only complete classroom request setup for native host registration" {
            $nativeHostModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.FirefoxNativeHost.psm1"
            Import-Module $nativeHostModulePath -Force -Global -ErrorAction Stop

            $completeConfig = [PSCustomObject]@{
                apiUrl = "https://school.example"
                whitelistUrl = "https://school.example/w/machine-token-123/whitelist.txt"
                classroomId = "classroom-123"
            }
            $missingWhitelist = [PSCustomObject]@{
                apiUrl = "https://school.example"
                classroomId = "classroom-123"
            }
            $missingClassroom = [PSCustomObject]@{
                apiUrl = "https://school.example"
                whitelistUrl = "https://school.example/w/machine-token-123/whitelist.txt"
            }
            $invalidApi = [PSCustomObject]@{
                apiUrl = "school.example"
                whitelistUrl = "https://school.example/w/machine-token-123/whitelist.txt"
                classroomId = "classroom-123"
            }

            Test-OpenPathFirefoxNativeHostRequestSetupComplete -Config $completeConfig | Should -BeTrue
            Test-OpenPathFirefoxNativeHostRequestSetupComplete -Config $missingWhitelist | Should -BeFalse
            Test-OpenPathFirefoxNativeHostRequestSetupComplete -Config $missingClassroom | Should -BeFalse
            Test-OpenPathFirefoxNativeHostRequestSetupComplete -Config $invalidApi | Should -BeFalse
        }

        It "Re-stages native host artifacts before writing the Firefox manifest" {
            $browserModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.psm1"
            $nativeHostModulePath = Join-Path $PSScriptRoot ".." "lib" "Browser.FirefoxNativeHost.psm1"
            $browserContent = Get-Content $browserModulePath -Raw
            $nativeHostContent = Get-Content $nativeHostModulePath -Raw

            Assert-ContentContainsAll -Content $nativeHostContent -Needles @(
                'function Sync-OpenPathFirefoxNativeHostArtifacts',
                "OpenPath-NativeHost.ps1",
                "OpenPath-NativeHost.cmd",
                "NativeHost.State.ps1",
                "NativeHost.Protocol.ps1",
                "NativeHost.Actions.ps1",
                '(Join-Path $sourceParent ''lib\internal'')'
            )

            Assert-ContentContainsAll -Content $browserContent -Needles @(
                'function Sync-OpenPathFirefoxNativeHostArtifacts',
                'Browser.FirefoxNativeHost\Sync-OpenPathFirefoxNativeHostArtifacts -SourceRoot $SourceRoot'
            )
        }

        It "Native host script prefers staged support files before locked agent internals" {
            $nativeHostScriptPath = Join-Path $PSScriptRoot ".." "scripts" "OpenPath-NativeHost.ps1"
            $nativeHostContent = Get-Content $nativeHostScriptPath -Raw

            Assert-ContentContainsAll -Content $nativeHostContent -Needles @(
                'function Resolve-OpenPathNativeHostRoot',
                'function Resolve-OpenPathNativeHostSupportPath',
                '$stagedStateHelperPath = Join-Path $script:NativeRoot ''NativeHost.State.ps1''',
                '$script:OpenPathRoot = Resolve-OpenPathNativeHostRoot',
                '(Join-Path $script:NativeRoot $FileName)',
                '(Join-Path $script:OpenPathRoot "lib\internal\$FileName")',
                '. (Resolve-OpenPathNativeHostSupportPath -FileName ''NativeHost.State.ps1'')',
                '. (Resolve-OpenPathNativeHostSupportPath -FileName ''NativeHost.Protocol.ps1'')',
                '. (Resolve-OpenPathNativeHostSupportPath -FileName ''NativeHost.Actions.ps1'')'
            )

            $legacyImportPattern = [regex]::Escape("Join-Path `$PSScriptRoot '..\lib\internal\NativeHost.State.ps1'")
            $nativeHostContent | Should -Not -Match $legacyImportPattern
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
