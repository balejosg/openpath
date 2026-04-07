# OpenPath Firefox native host helpers for Windows

$script:OpenPathRoot = "C:\OpenPath"
Import-Module "$PSScriptRoot\Common.psm1" -Force -ErrorAction Stop
Import-Module "$PSScriptRoot\Browser.Common.psm1" -Force -ErrorAction Stop

function Get-OpenPathFirefoxNativeHostName {
    return 'whitelist_native_host'
}

function Get-OpenPathFirefoxNativeHostRoot {
    return "$script:OpenPathRoot\browser-extension\firefox\native"
}

function Get-OpenPathFirefoxNativeHostManifestPath {
    return "$(Get-OpenPathFirefoxNativeHostRoot)\whitelist_native_host.json"
}

function Get-OpenPathFirefoxNativeHostScriptPath {
    return "$(Get-OpenPathFirefoxNativeHostRoot)\OpenPath-NativeHost.ps1"
}

function Get-OpenPathFirefoxNativeHostWrapperPath {
    return "$(Get-OpenPathFirefoxNativeHostRoot)\OpenPath-NativeHost.cmd"
}

function Get-OpenPathFirefoxNativeStatePath {
    return "$(Get-OpenPathFirefoxNativeHostRoot)\native-state.json"
}

function Get-OpenPathFirefoxNativeWhitelistMirrorPath {
    return "$(Get-OpenPathFirefoxNativeHostRoot)\whitelist.txt"
}

function Get-OpenPathFirefoxNativeHostUpdateTaskName {
    return 'OpenPath-Update'
}

function Get-OpenPathFirefoxNativeHostRegistryPaths {
    return @(
        'HKLM\SOFTWARE\Mozilla\NativeMessagingHosts\whitelist_native_host',
        'HKLM\SOFTWARE\WOW6432Node\Mozilla\NativeMessagingHosts\whitelist_native_host'
    )
}

function Sync-OpenPathFirefoxNativeHostArtifacts {
    param(
        [string]$SourceRoot = "$script:OpenPathRoot\scripts"
    )

    $nativeRoot = Get-OpenPathFirefoxNativeHostRoot
    if (-not (Test-Path $nativeRoot)) {
        New-Item -ItemType Directory -Path $nativeRoot -Force | Out-Null
    }

    $artifactNames = @('OpenPath-NativeHost.ps1', 'OpenPath-NativeHost.cmd')
    $candidateRoots = @($SourceRoot, $nativeRoot) | Select-Object -Unique
    $artifactSources = @{}
    $missingArtifacts = @()

    foreach ($artifactName in $artifactNames) {
        $artifactSource = $candidateRoots |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path (Join-Path $_ $artifactName)) } |
            Select-Object -First 1

        if ($artifactSource) {
            $artifactSources[$artifactName] = $artifactSource
            continue
        }

        $missingArtifacts += $artifactName
    }

    if ($missingArtifacts.Count -gt 0) {
        throw "Firefox native host artifacts not found in ${SourceRoot}: $($missingArtifacts -join ', ')"
    }

    foreach ($artifactName in $artifactNames) {
        $sourcePath = Join-Path $artifactSources[$artifactName] $artifactName
        $destinationPath = Join-Path $nativeRoot $artifactName
        if (-not [string]::Equals($sourcePath, $destinationPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            Copy-Item $sourcePath -Destination $destinationPath -Force
        }
    }

    return $true
}

function Sync-OpenPathFirefoxNativeHostState {
    param(
        [AllowNull()]
        [object]$Config = $null,

        [string]$WhitelistPath = "$script:OpenPathRoot\data\whitelist.txt",

        [switch]$ClearWhitelist
    )

    $nativeRoot = Get-OpenPathFirefoxNativeHostRoot
    if (-not (Test-Path $nativeRoot)) {
        New-Item -ItemType Directory -Path $nativeRoot -Force | Out-Null
    }

    if (-not $Config) {
        try {
            $Config = Get-OpenPathConfig
        }
        catch {
            $Config = [PSCustomObject]@{}
        }
    }

    $machineName = if (
        $Config -and
        $Config.PSObject.Properties['machineName'] -and
        $Config.machineName
    ) {
        [string]$Config.machineName
    }
    else {
        [string]$env:COMPUTERNAME
    }

    $whitelistUrl = if (
        $Config -and
        $Config.PSObject.Properties['whitelistUrl'] -and
        $Config.whitelistUrl
    ) {
        [string]$Config.whitelistUrl
    }
    else {
        ''
    }

    $version = if (
        $Config -and
        $Config.PSObject.Properties['version'] -and
        $Config.version
    ) {
        [string]$Config.version
    }
    else {
        ''
    }

    $apiUrl = if (
        $Config -and
        $Config.PSObject.Properties['apiUrl'] -and
        $Config.apiUrl
    ) {
        ([string]$Config.apiUrl).TrimEnd('/')
    }
    else {
        ''
    }

    $statePath = Get-OpenPathFirefoxNativeStatePath
    $stateJson = [ordered]@{
        machineName = $machineName
        whitelistUrl = $whitelistUrl
        apiUrl = $apiUrl
        requestApiUrl = $apiUrl
        version = $version
        syncedAt = (Get-Date -Format 'o')
    } | ConvertTo-Json -Depth 8
    Write-OpenPathUtf8NoBomFile -Path $statePath -Value $stateJson

    $whitelistMirrorPath = Get-OpenPathFirefoxNativeWhitelistMirrorPath
    if ($ClearWhitelist) {
        Remove-Item $whitelistMirrorPath -Force -ErrorAction SilentlyContinue
    }
    elseif (Test-Path $WhitelistPath) {
        Copy-Item $WhitelistPath -Destination $whitelistMirrorPath -Force
    }

    return $true
}

function Register-OpenPathFirefoxNativeHost {
    param(
        [AllowNull()]
        [object]$Config = $null,

        [switch]$ClearWhitelist
    )

    $nativeRoot = Get-OpenPathFirefoxNativeHostRoot
    if (-not (Test-Path $nativeRoot)) {
        New-Item -ItemType Directory -Path $nativeRoot -Force | Out-Null
    }

    Sync-OpenPathFirefoxNativeHostArtifacts | Out-Null

    $manifestPath = Get-OpenPathFirefoxNativeHostManifestPath
    $wrapperPath = Get-OpenPathFirefoxNativeHostWrapperPath
    $manifestJson = [ordered]@{
        name = Get-OpenPathFirefoxNativeHostName
        description = 'OpenPath Windows Native Messaging Host'
        path = $wrapperPath
        type = 'stdio'
        allowed_extensions = @('monitor-bloqueos@openpath')
    } | ConvertTo-Json -Depth 8
    Write-OpenPathUtf8NoBomFile -Path $manifestPath -Value $manifestJson

    foreach ($registryPath in Get-OpenPathFirefoxNativeHostRegistryPaths) {
        & reg.exe ADD $registryPath /ve /d $manifestPath /f | Out-Null
    }

    Sync-OpenPathFirefoxNativeHostState -Config $Config -ClearWhitelist:$ClearWhitelist | Out-Null
    return $true
}

function Unregister-OpenPathFirefoxNativeHost {
    foreach ($registryPath in Get-OpenPathFirefoxNativeHostRegistryPaths) {
        Remove-OpenPathRegistryKeyIfPresent -RegistryPath $registryPath
    }

    $paths = @(
        (Get-OpenPathFirefoxNativeHostManifestPath),
        (Get-OpenPathFirefoxNativeHostScriptPath),
        (Get-OpenPathFirefoxNativeHostWrapperPath),
        (Get-OpenPathFirefoxNativeStatePath),
        (Get-OpenPathFirefoxNativeWhitelistMirrorPath)
    )

    foreach ($path in $paths) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
    }

    return $true
}

Export-ModuleMember -Function @(
    'Get-OpenPathFirefoxNativeHostManifestPath',
    'Get-OpenPathFirefoxNativeHostScriptPath',
    'Get-OpenPathFirefoxNativeHostWrapperPath',
    'Get-OpenPathFirefoxNativeStatePath',
    'Get-OpenPathFirefoxNativeWhitelistMirrorPath',
    'Get-OpenPathFirefoxNativeHostUpdateTaskName',
    'Get-OpenPathFirefoxNativeHostRegistryPaths',
    'Sync-OpenPathFirefoxNativeHostArtifacts',
    'Sync-OpenPathFirefoxNativeHostState',
    'Register-OpenPathFirefoxNativeHost',
    'Unregister-OpenPathFirefoxNativeHost'
)
