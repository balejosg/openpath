# OpenPath browser diagnostics for Windows

Import-Module "$PSScriptRoot\Common.psm1" -Force -ErrorAction Stop
Import-Module "$PSScriptRoot\Browser.Common.psm1" -Force -ErrorAction Stop
Import-Module "$PSScriptRoot\Browser.FirefoxPolicy.psm1" -Force -ErrorAction Stop
Import-Module "$PSScriptRoot\Browser.FirefoxNativeHost.psm1" -Force -ErrorAction Stop

function Get-OpenPathBrowserDoctorReport {
    $metadataPath = Get-OpenPathFirefoxReleaseMetadataPath
    $xpiPath = Get-OpenPathFirefoxReleaseXpiPath
    $nativeHostManifestPath = Get-OpenPathFirefoxNativeHostManifestPath
    $nativeHostWrapperPath = Get-OpenPathFirefoxNativeHostWrapperPath
    $nativeHostScriptPath = Get-OpenPathFirefoxNativeHostScriptPath
    $nativeHostStateHelperPath = Join-Path (Get-OpenPathFirefoxNativeHostRoot) 'NativeHost.State.ps1'
    $nativeHostProtocolHelperPath = Join-Path (Get-OpenPathFirefoxNativeHostRoot) 'NativeHost.Protocol.ps1'
    $nativeHostActionsHelperPath = Join-Path (Get-OpenPathFirefoxNativeHostRoot) 'NativeHost.Actions.ps1'
    $nativeHostStatePath = Get-OpenPathFirefoxNativeStatePath
    $nativeHostWhitelistPath = Get-OpenPathFirefoxNativeWhitelistMirrorPath
    $nativeHostUpdateTaskName = Get-OpenPathFirefoxNativeHostUpdateTaskName
    $nativeHostRegistryPaths = Get-OpenPathFirefoxNativeHostRegistryPaths
    $nativeHostRegistrySummary = '(missing)'
    $nativeHostManifestParse = 'missing'
    $nativeHostManifestName = '(missing)'
    $nativeHostAllowedExtensions = '(missing)'
    $nativeHostRegistryPath = ($nativeHostRegistryPaths -join '; ')
    $nativeHostWrapperPresent = Test-Path $nativeHostWrapperPath
    $nativeHostScriptPresent = Test-Path $nativeHostScriptPath
    $nativeHostStateHelperReadable = $false
    $nativeHostProtocolHelperReadable = $false
    $nativeHostActionsHelperReadable = $false
    $nativeHostStateReadable = $false
    $nativeHostWhitelistReadable = $false
    $nativeHostUpdateTaskPresent = $false
    $nativeHostUpdateTaskUserAccess = 'missing'
    $policyCandidates = @(
        "$env:ProgramFiles\Mozilla Firefox\distribution\policies.json",
        "${env:ProgramFiles(x86)}\Mozilla Firefox\distribution\policies.json"
    )
    $policyPath = @($policyCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)[0]
    if (-not $policyPath) {
        $policyPath = $policyCandidates[0]
    }

    $metadataPresent = Test-Path $metadataPath
    $xpiPresent = Test-Path $xpiPath
    $metadataParseResult = 'missing'
    $policyParseResult = 'missing'
    $policyEncoding = 'missing'
    $policyInstallMode = '(missing)'
    $policyInstallUrl = '(missing)'
    $extensionId = '(missing)'
    $extensionVersion = '(missing)'
    $metadataSha256 = '(missing)'
    $xpiSha256 = '(missing)'
    $xpiBytes = 0
    $aclSummary = 'missing'

    if ($metadataPresent) {
        try {
            $metadataText = Get-Content $metadataPath -Raw
            $metadata = $metadataText | ConvertFrom-Json
            $extensionId = if ($metadata.extensionId) { [string]$metadata.extensionId } else { '(missing)' }
            $extensionVersion = if ($metadata.version) { [string]$metadata.version } else { '(missing)' }
            $metadataSha256 = (Get-FileHash $metadataPath -Algorithm SHA256).Hash.ToLowerInvariant()
            $metadataParseResult = 'ok'
        }
        catch {
            $metadataParseResult = "error: $($_.Exception.Message)"
        }
    }

    if ($xpiPresent) {
        try {
            $xpiItem = Get-Item $xpiPath
            $xpiBytes = [int64]$xpiItem.Length
            $xpiSha256 = (Get-FileHash $xpiPath -Algorithm SHA256).Hash.ToLowerInvariant()
        }
        catch {
            $xpiSha256 = "error: $($_.Exception.Message)"
        }

        try {
            $aclSummary = @(
                (Get-Acl $xpiPath).Access |
                    Select-Object IdentityReference, FileSystemRights, AccessControlType |
                    ForEach-Object {
                        "$($_.IdentityReference):$($_.FileSystemRights):$($_.AccessControlType)"
                    } |
                    Select-Object -Unique
            ) -join '; '

            if (-not $aclSummary) {
                $aclSummary = 'none'
            }
        }
        catch {
            $aclSummary = "error: $($_.Exception.Message)"
        }
    }

    if (Test-Path $nativeHostManifestPath) {
        try {
            $nativeManifest = Get-Content $nativeHostManifestPath -Raw | ConvertFrom-Json
            $nativeHostManifestParse = 'ok'
            $nativeHostManifestName = if ($nativeManifest.name) { [string]$nativeManifest.name } else { '(missing)' }
            $nativeHostAllowedExtensions = if ($nativeManifest.allowed_extensions) {
                @($nativeManifest.allowed_extensions) -join ', '
            }
            else {
                '(missing)'
            }
        }
        catch {
            $nativeHostManifestParse = "error: $($_.Exception.Message)"
        }
    }

    try {
        if (Test-Path $nativeHostStateHelperPath) {
            $null = Get-Content $nativeHostStateHelperPath -TotalCount 1 -ErrorAction Stop
            $nativeHostStateHelperReadable = $true
        }
    }
    catch {
        $nativeHostStateHelperReadable = $false
    }

    try {
        if (Test-Path $nativeHostProtocolHelperPath) {
            $null = Get-Content $nativeHostProtocolHelperPath -TotalCount 1 -ErrorAction Stop
            $nativeHostProtocolHelperReadable = $true
        }
    }
    catch {
        $nativeHostProtocolHelperReadable = $false
    }

    try {
        if (Test-Path $nativeHostActionsHelperPath) {
            $null = Get-Content $nativeHostActionsHelperPath -TotalCount 1 -ErrorAction Stop
            $nativeHostActionsHelperReadable = $true
        }
    }
    catch {
        $nativeHostActionsHelperReadable = $false
    }

    $nativeHostRegistryStates = @()
    foreach ($registryPath in $nativeHostRegistryPaths) {
        try {
            $query = & reg.exe QUERY $registryPath /ve 2>$null
            if ($LASTEXITCODE -eq 0) {
                $nativeHostRegistryStates += "$registryPath=present"
            }
            else {
                $nativeHostRegistryStates += "$registryPath=missing"
            }
        }
        catch {
            $nativeHostRegistryStates += "$registryPath=error"
        }
    }
    if ($nativeHostRegistryStates.Count -gt 0) {
        $nativeHostRegistrySummary = $nativeHostRegistryStates -join '; '
    }

    try {
        if (Test-Path $nativeHostStatePath) {
            $null = Get-Content $nativeHostStatePath -Raw -ErrorAction Stop | ConvertFrom-Json
            $nativeHostStateReadable = $true
        }
    }
    catch {
        $nativeHostStateReadable = $false
    }

    try {
        if (Test-Path $nativeHostWhitelistPath) {
            $null = Get-Content $nativeHostWhitelistPath -TotalCount 1 -ErrorAction Stop
            $nativeHostWhitelistReadable = $true
        }
    }
    catch {
        $nativeHostWhitelistReadable = $false
    }

    try {
        $task = Get-ScheduledTask -TaskName $nativeHostUpdateTaskName -ErrorAction Stop
        if ($task) {
            $nativeHostUpdateTaskPresent = $true
            $securityDescriptor = Get-OpenPathScheduledTaskSecurityDescriptor -TaskName $nativeHostUpdateTaskName
            if ($securityDescriptor -and $securityDescriptor -match '\(A;;[^)]*(?:GX|GA)[^)]*;;;BU\)') {
                $nativeHostUpdateTaskUserAccess = 'granted'
            }
            elseif ($securityDescriptor) {
                $nativeHostUpdateTaskUserAccess = 'missing'
            }
            else {
                $nativeHostUpdateTaskUserAccess = 'unknown'
            }
        }
    }
    catch {
        $nativeHostUpdateTaskPresent = $false
        $nativeHostUpdateTaskUserAccess = 'missing'
    }

    $managedExtensionPolicy = Get-OpenPathFirefoxManagedExtensionPolicy
    $resolvedInstallUrl = if ($managedExtensionPolicy) {
        [string]$managedExtensionPolicy.InstallUrl
    }
    else {
        '(unresolved)'
    }

    if (Test-Path $policyPath) {
        try {
            $policyBytes = [System.IO.File]::ReadAllBytes($policyPath)
            $hasUtf8Bom = $policyBytes.Length -ge 3 -and $policyBytes[0] -eq 239 -and $policyBytes[1] -eq 187 -and $policyBytes[2] -eq 191
            $policyEncoding = if ($hasUtf8Bom) { 'utf8-bom' } else { 'utf8-no-bom' }

            $policyJson = Get-Content $policyPath -Raw | ConvertFrom-Json
            $policyParseResult = 'ok'

            $policyEntry = $null
            if ($extensionId -ne '(missing)' -and $policyJson.policies -and $policyJson.policies.ExtensionSettings) {
                $policyEntry = $policyJson.policies.ExtensionSettings.PSObject.Properties[$extensionId]
                if ($policyEntry) {
                    $policyValue = $policyEntry.Value
                    if ($policyValue.PSObject.Properties['installation_mode']) {
                        $policyInstallMode = [string]$policyValue.installation_mode
                    }
                    if ($policyValue.PSObject.Properties['install_url']) {
                        $policyInstallUrl = [string]$policyValue.install_url
                    }
                }
            }
        }
        catch {
            $policyParseResult = "error: $($_.Exception.Message)"
        }
    }

    return @(
        'OpenPath Browser Doctor'
        "Firefox metadata path: $metadataPath"
        "Firefox metadata present: $metadataPresent"
        "Firefox metadata parse: $metadataParseResult"
        "Firefox extension id: $extensionId"
        "Firefox extension version: $extensionVersion"
        "Firefox metadata sha256: $metadataSha256"
        "Firefox XPI path: $xpiPath"
        "Firefox XPI present: $xpiPresent"
        "Firefox XPI bytes: $xpiBytes"
        "Firefox XPI sha256: $xpiSha256"
        "Firefox XPI ACL summary: $aclSummary"
        "Native host manifest path: $nativeHostManifestPath"
        "Native host manifest parse: $nativeHostManifestParse"
        "Native host manifest name: $nativeHostManifestName"
        "Native host allowed extensions: $nativeHostAllowedExtensions"
        "Native host registry path: $nativeHostRegistryPath"
        "Native host registry summary: $nativeHostRegistrySummary"
        "Native host wrapper path: $nativeHostWrapperPath"
        "Native host wrapper present: $nativeHostWrapperPresent"
        "Native host script path: $nativeHostScriptPath"
        "Native host script present: $nativeHostScriptPresent"
        "Native host state helper readable: $nativeHostStateHelperReadable"
        "Native host protocol helper readable: $nativeHostProtocolHelperReadable"
        "Native host actions helper readable: $nativeHostActionsHelperReadable"
        "Native host state path: $nativeHostStatePath"
        "Native host state readable: $nativeHostStateReadable"
        "Native host whitelist readable: $nativeHostWhitelistReadable"
        "Native host update task: $nativeHostUpdateTaskName"
        "Native host update task present: $nativeHostUpdateTaskPresent"
        "Native host update task user access: $nativeHostUpdateTaskUserAccess"
        "Resolved install_url: $resolvedInstallUrl"
        "Policy file path: $policyPath"
        "Policy file present: $(Test-Path $policyPath)"
        "Policy encoding: $policyEncoding"
        "Policy JSON parse: $policyParseResult"
        "Policy install mode: $policyInstallMode"
        "Policy install_url: $policyInstallUrl"
    ) -join [Environment]::NewLine
}

Export-ModuleMember -Function @(
    'Get-OpenPathBrowserDoctorReport'
)
