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

function Test-OpenPathFirefoxNativeHostRequestSetupComplete {
    param(
        [AllowNull()]
        [object]$Config = $null
    )

    if (-not $Config) {
        try {
            $Config = Get-OpenPathConfig
        }
        catch {
            return $false
        }
    }

    $apiUrl = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'apiUrl'
    $whitelistUrl = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'whitelistUrl'
    $classroom = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'classroom'
    $classroomId = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'classroomId'

    if ($apiUrl -notmatch '^https?://\S+$') {
        return $false
    }
    if ($whitelistUrl -notmatch '/w/[^/]+/whitelist\.txt($|[?#].*)') {
        return $false
    }

    return [bool]($classroom -or $classroomId)
}

function Sync-OpenPathFirefoxNativeHostArtifacts {
    param(
        [string]$SourceRoot = "$script:OpenPathRoot\scripts"
    )

    $nativeRoot = Get-OpenPathFirefoxNativeHostRoot
    if (-not (Test-Path $nativeRoot)) {
        New-Item -ItemType Directory -Path $nativeRoot -Force | Out-Null
    }

    $artifactNames = @(
        'OpenPath-NativeHost.ps1',
        'OpenPath-NativeHost.cmd',
        'NativeHost.State.ps1',
        'NativeHost.Protocol.ps1',
        'NativeHost.Actions.ps1'
    )
    $sourceParent = if ($SourceRoot) { Split-Path $SourceRoot -Parent } else { '' }
    $candidateRoots = @($SourceRoot)
    if (-not [string]::IsNullOrWhiteSpace($sourceParent)) {
        $candidateRoots += (Join-Path $sourceParent 'lib\internal')
    }
    $candidateRoots += $nativeRoot
    $candidateRoots = $candidateRoots | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
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

    if (-not (Test-OpenPathFirefoxNativeHostRequestSetupComplete -Config $Config)) {
        Write-OpenPathLog 'Firefox native host request setup is incomplete; skipping native host state sync' -Level WARN
        Remove-Item (Get-OpenPathFirefoxNativeStatePath) -Force -ErrorAction SilentlyContinue
        Remove-Item (Get-OpenPathFirefoxNativeWhitelistMirrorPath) -Force -ErrorAction SilentlyContinue
        return $false
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

    $classroom = if (
        $Config -and
        $Config.PSObject.Properties['classroom'] -and
        $Config.classroom
    ) {
        [string]$Config.classroom
    }
    else {
        ''
    }

    $classroomId = if (
        $Config -and
        $Config.PSObject.Properties['classroomId'] -and
        $Config.classroomId
    ) {
        [string]$Config.classroomId
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
        classroom = $classroom
        classroomId = $classroomId
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

    if (-not (Test-OpenPathFirefoxNativeHostRequestSetupComplete -Config $Config)) {
        Write-OpenPathLog 'Firefox native host request setup is incomplete; skipping native host registration' -Level WARN
        Unregister-OpenPathFirefoxNativeHost | Out-Null
        return $false
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
        (Join-Path (Get-OpenPathFirefoxNativeHostRoot) 'NativeHost.State.ps1'),
        (Join-Path (Get-OpenPathFirefoxNativeHostRoot) 'NativeHost.Protocol.ps1'),
        (Join-Path (Get-OpenPathFirefoxNativeHostRoot) 'NativeHost.Actions.ps1'),
        (Get-OpenPathFirefoxNativeStatePath),
        (Get-OpenPathFirefoxNativeWhitelistMirrorPath)
    )

    foreach ($path in $paths) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
    }

    return $true
}

Export-ModuleMember -Function @(
    'Get-OpenPathFirefoxNativeHostRoot',
    'Get-OpenPathFirefoxNativeHostManifestPath',
    'Get-OpenPathFirefoxNativeHostScriptPath',
    'Get-OpenPathFirefoxNativeHostWrapperPath',
    'Get-OpenPathFirefoxNativeStatePath',
    'Get-OpenPathFirefoxNativeWhitelistMirrorPath',
    'Get-OpenPathFirefoxNativeHostUpdateTaskName',
    'Get-OpenPathFirefoxNativeHostRegistryPaths',
    'Test-OpenPathFirefoxNativeHostRequestSetupComplete',
    'Sync-OpenPathFirefoxNativeHostArtifacts',
    'Sync-OpenPathFirefoxNativeHostState',
    'Register-OpenPathFirefoxNativeHost',
    'Unregister-OpenPathFirefoxNativeHost'
)
