# OpenPath Browser Policies Module for Windows
# Manages Firefox and Chrome/Edge policies

# Import common functions
$script:OpenPathRoot = "C:\OpenPath"
$modulePath = Split-Path $PSScriptRoot -Parent
Import-Module "$modulePath\lib\Common.psm1" -Force -ErrorAction SilentlyContinue

function Get-OpenPathFirefoxExtensionRoot {
    return "$script:OpenPathRoot\browser-extension\firefox"
}

function Get-OpenPathFirefoxReleaseMetadataPath {
    return "$script:OpenPathRoot\browser-extension\firefox-release\metadata.json"
}

function Get-OpenPathFirefoxReleaseXpiPath {
    return "$script:OpenPathRoot\browser-extension\firefox-release\openpath-firefox-extension.xpi"
}

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

function ConvertTo-OpenPathRegistryProviderPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RegistryPath
    )

    if ($RegistryPath -match '^HKLM\\') {
        return "Registry::HKEY_LOCAL_MACHINE\\$($RegistryPath.Substring(5))"
    }

    throw "Unsupported registry hive path: $RegistryPath"
}

function Remove-OpenPathRegistryKeyIfPresent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RegistryPath
    )

    $providerPath = ConvertTo-OpenPathRegistryProviderPath -RegistryPath $RegistryPath
    if (Test-Path $providerPath) {
        Remove-Item -Path $providerPath -Recurse -Force -ErrorAction SilentlyContinue
    }
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
    $missingArtifacts = @(
        $artifactNames | Where-Object { -not (Test-Path (Join-Path $SourceRoot $_)) }
    )

    if ($missingArtifacts.Count -gt 0) {
        throw "Firefox native host artifacts not found in ${SourceRoot}: $($missingArtifacts -join ', ')"
    }

    foreach ($artifactName in $artifactNames) {
        Copy-Item (Join-Path $SourceRoot $artifactName) -Destination (Join-Path $nativeRoot $artifactName) -Force
    }

    return $true
}

function Get-OpenPathScheduledTaskSecurityDescriptor {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TaskName
    )

    try {
        $schedule = New-Object -ComObject 'Schedule.Service'
        $schedule.Connect()
        $task = $schedule.GetFolder('\').GetTask($TaskName)
        return [string]$task.GetSecurityDescriptor(0xF)
    }
    catch {
        return $null
    }
}

function ConvertTo-OpenPathFileUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $absolutePath = ''
    if ($Path -match '^[A-Za-z]:[\\/]') {
        $absolutePath = $Path
    }
    else {
        $resolvedPath = Resolve-Path $Path -ErrorAction SilentlyContinue
        $providerPath = if ($resolvedPath) { $resolvedPath.ProviderPath } else { $Path }
        $absolutePath = [System.IO.Path]::GetFullPath($providerPath)
    }

    if ($absolutePath.StartsWith('\\')) {
        $uncParts = $absolutePath.TrimStart('\') -split '\\', 2
        $uriBuilder = [System.UriBuilder]::new()
        $uriBuilder.Scheme = [System.Uri]::UriSchemeFile
        $uriBuilder.Host = $uncParts[0]
        $uriBuilder.Path = if ($uncParts.Length -gt 1) { $uncParts[1] -replace '\\', '/' } else { '' }
        return $uriBuilder.Uri.AbsoluteUri
    }

    $uriBuilder = [System.UriBuilder]::new()
    $uriBuilder.Scheme = [System.Uri]::UriSchemeFile
    $uriBuilder.Host = ''
    $uriBuilder.Path = $absolutePath -replace '\\', '/'
    return $uriBuilder.Uri.AbsoluteUri
}

function Write-OpenPathUtf8NoBomFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [AllowNull()]
        [string]$Value
    )

    $parent = Split-Path $Path -Parent
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $Value, $utf8NoBom)
}

function Get-OpenPathFirefoxManagedExtensionPolicy {
    $config = $null
    try {
        $config = Get-OpenPathConfig
    }
    catch {
        # Allow policy generation to proceed without a persisted config.
    }

    if ($config) {
        $configuredExtensionId = if (
            $config.PSObject.Properties['firefoxExtensionId'] -and $config.firefoxExtensionId
        ) {
            ([string]$config.firefoxExtensionId).Trim()
        }
        else {
            ''
        }
        $configuredInstallUrl = if (
            $config.PSObject.Properties['firefoxExtensionInstallUrl'] -and $config.firefoxExtensionInstallUrl
        ) {
            ([string]$config.firefoxExtensionInstallUrl).Trim()
        }
        else {
            ''
        }

        if ($configuredExtensionId -and $configuredInstallUrl) {
            return [PSCustomObject]@{
                ExtensionId = $configuredExtensionId
                InstallUrl = $configuredInstallUrl
                Source = 'config'
            }
        }

        if ($configuredExtensionId -or $configuredInstallUrl) {
            Write-OpenPathLog 'Firefox signed extension config is incomplete; both firefoxExtensionId and firefoxExtensionInstallUrl are required' -Level WARN
        }
    }

    $metadataPath = Get-OpenPathFirefoxReleaseMetadataPath
    if (-not (Test-Path $metadataPath)) {
        return $null
    }

    try {
        $metadata = Get-Content $metadataPath -Raw | ConvertFrom-Json
    }
    catch {
        Write-OpenPathLog "Failed to parse Firefox release extension metadata: $_" -Level WARN
        return $null
    }

    $extensionId = if ($metadata.PSObject.Properties['extensionId'] -and $metadata.extensionId) {
        ([string]$metadata.extensionId).Trim()
    }
    else {
        ''
    }
    if (-not $extensionId) {
        Write-OpenPathLog 'Firefox release extension metadata is incomplete' -Level WARN
        return $null
    }

    $installUrl = ''
    $signedXpiPath = Get-OpenPathFirefoxReleaseXpiPath
    if (Test-Path $signedXpiPath) {
        $installUrl = ConvertTo-OpenPathFileUrl -Path $signedXpiPath
    }
    elseif ($metadata.PSObject.Properties['installUrl'] -and $metadata.installUrl) {
        $installUrl = ([string]$metadata.installUrl).Trim()
    }

    if (-not $installUrl) {
        Write-OpenPathLog 'Firefox release extension metadata did not resolve to a signed XPI source' -Level WARN
        return $null
    }

    return [PSCustomObject]@{
        ExtensionId = $extensionId
        InstallUrl = $installUrl
        Source = 'staged-release'
    }
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

    $statePath = Get-OpenPathFirefoxNativeStatePath
    $stateJson = [ordered]@{
        machineName = $machineName
        whitelistUrl = $whitelistUrl
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

function Get-OpenPathChromiumManagedMetadataPath {
    return "$script:OpenPathRoot\browser-extension\chromium-managed\metadata.json"
}

function Get-OpenPathChromiumManagedPolicy {
    $metadataPath = Get-OpenPathChromiumManagedMetadataPath
    if (-not (Test-Path $metadataPath)) {
        return $null
    }

    $config = Get-OpenPathConfig
    if (-not $config -or -not $config.PSObject.Properties['apiUrl'] -or -not $config.apiUrl) {
        Write-OpenPathLog 'Chromium managed extension metadata found but apiUrl is not configured' -Level WARN
        return $null
    }

    try {
        $metadata = Get-Content $metadataPath -Raw | ConvertFrom-Json
    }
    catch {
        Write-OpenPathLog "Failed to parse Chromium managed extension metadata: $_" -Level WARN
        return $null
    }

    if (-not $metadata.extensionId -or -not $metadata.version) {
        Write-OpenPathLog 'Chromium managed extension metadata is incomplete' -Level WARN
        return $null
    }

    $apiBaseUrl = ([string]$config.apiUrl).TrimEnd('/')
    return [PSCustomObject]@{
        ExtensionId = [string]$metadata.extensionId
        Version = [string]$metadata.version
        UpdateUrl = "$apiBaseUrl/api/extensions/chromium/updates.xml"
    }
}

function Get-OpenPathBrowserDoctorReport {
    $metadataPath = Get-OpenPathFirefoxReleaseMetadataPath
    $xpiPath = Get-OpenPathFirefoxReleaseXpiPath
    $nativeHostManifestPath = Get-OpenPathFirefoxNativeHostManifestPath
    $nativeHostWrapperPath = Get-OpenPathFirefoxNativeHostWrapperPath
    $nativeHostScriptPath = Get-OpenPathFirefoxNativeHostScriptPath
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

function Set-FirefoxPolicy {
    <#
    .SYNOPSIS
        Configures Firefox policies including search engines and blocked paths
    .PARAMETER BlockedPaths
        Array of paths/URLs to block
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string[]]$BlockedPaths = @()
    )

    if (-not $PSCmdlet.ShouldProcess("Firefox", "Configure browser policies")) {
        return $false
    }

    Write-OpenPathLog "Configuring Firefox policies..."
    
    # Firefox policy locations
    $firefoxPaths = @(
        "$env:ProgramFiles\Mozilla Firefox\distribution",
        "${env:ProgramFiles(x86)}\Mozilla Firefox\distribution"
    )
    
    $policiesSet = $false
    
    $unsignedExtensionManifest = Join-Path (Get-OpenPathFirefoxExtensionRoot) 'manifest.json'
    $managedExtensionPolicy = Get-OpenPathFirefoxManagedExtensionPolicy
    $signedExtensionWarningWritten = $false

    foreach ($firefoxPath in $firefoxPaths) {
        $firefoxExe = Split-Path $firefoxPath -Parent
        if (-not (Test-Path "$firefoxExe\firefox.exe")) {
            continue
        }
        
        # Create distribution folder if needed
        if (-not (Test-Path $firefoxPath)) {
            New-Item -ItemType Directory -Path $firefoxPath -Force | Out-Null
        }
        
        # Build blocked URLs in Firefox format
        $blockedUrls = @()
        foreach ($path in $BlockedPaths) {
            if ($path) {
                # Normalize to Firefox WebsiteFilter format
                if ($path -notmatch "^\*://") {
                    $blockedUrls += "*://*$path*"
                }
                else {
                    $blockedUrls += $path
                }
            }
        }
        
        # Always block Google Search
        $blockedUrls += @(
            "*://www.google.com/search*",
            "*://www.google.es/search*",
            "*://google.com/search*",
            "*://google.es/search*"
        )
        
        $policies = @{
            policies = @{
                SearchEngines = @{
                    Remove = @("Google", "Bing")
                    Default = "DuckDuckGo"
                    Add = @(
                        @{
                            Name = "DuckDuckGo"
                            Description = "Privacy-focused search engine"
                            Alias = "ddg"
                            Method = "GET"
                            URLTemplate = "https://duckduckgo.com/?q={searchTerms}"
                            IconURL = "https://duckduckgo.com/favicon.ico"
                        },
                        @{
                            Name = "Wikipedia (ES)"
                            Description = "Free encyclopedia"
                            Alias = "wiki"
                            Method = "GET"
                            URLTemplate = "https://es.wikipedia.org/wiki/Special:Search?search={searchTerms}"
                        }
                    )
                }
                WebsiteFilter = @{
                    Block = $blockedUrls
                }
                DNSOverHTTPS = @{
                    Enabled = $false
                    Locked  = $true
                }
                DisableTelemetry = $true
                OverrideFirstRunPage = ""
            }
        }

        if ($managedExtensionPolicy) {
            $policies.policies.ExtensionSettings = @{
                $managedExtensionPolicy.ExtensionId = @{
                    installation_mode = 'force_installed'
                    install_url = $managedExtensionPolicy.InstallUrl
                }
            }
        }
        elseif (-not $signedExtensionWarningWritten) {
            if (Test-Path $unsignedExtensionManifest) {
                Write-OpenPathLog 'Unsigned Firefox extension bundle detected, but Firefox Release requires a signed XPI distribution; skipping extension auto-install' -Level WARN
            }
            else {
                Write-OpenPathLog 'No signed Firefox extension distribution configured; applying Firefox policies without extension auto-install' -Level WARN
            }

            $signedExtensionWarningWritten = $true
        }
        
        $policiesPath = "$firefoxPath\policies.json"
        $policiesJson = $policies | ConvertTo-Json -Depth 10
        Write-OpenPathUtf8NoBomFile -Path $policiesPath -Value $policiesJson

        Write-OpenPathLog "Firefox policies written to: $policiesPath"
        $policiesSet = $true
    }
    
    if (-not $policiesSet) {
        Write-OpenPathLog "Firefox not found, skipping policies" -Level WARN
    }
    
    return $policiesSet
}

function Set-ChromePolicy {
    <#
    .SYNOPSIS
        Configures Chrome/Edge policies via Registry
    .PARAMETER BlockedPaths
        Array of paths/URLs to block
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string[]]$BlockedPaths = @()
    )

    if (-not $PSCmdlet.ShouldProcess("Chrome/Edge", "Configure browser policies via Registry")) {
        return $false
    }

    Write-OpenPathLog "Configuring Chrome/Edge policies..."
    $managedExtensionPolicy = Get-OpenPathChromiumManagedPolicy
    
    # Policy registry paths
    $regPaths = @(
        "HKLM:\SOFTWARE\Policies\Google\Chrome",
        "HKLM:\SOFTWARE\Policies\Microsoft\Edge"
    )
    
    foreach ($regPath in $regPaths) {
        try {
            # Create base path
            if (-not (Test-Path $regPath)) {
                New-Item -Path $regPath -Force | Out-Null
            }
            
            # URL Blocklist
            $blocklistPath = "$regPath\URLBlocklist"
            if (Test-Path $blocklistPath) {
                Remove-Item $blocklistPath -Recurse -Force
            }
            New-Item -Path $blocklistPath -Force | Out-Null
            
            $i = 1
            foreach ($path in $BlockedPaths) {
                if ($path) {
                    Set-ItemProperty -Path $blocklistPath -Name $i -Value $path
                    $i++
                }
            }
            
            # Block Google Search
            Set-ItemProperty -Path $blocklistPath -Name $i -Value "*://www.google.*/search*"
            
            # Set default search engine to DuckDuckGo
            Set-ItemProperty -Path $regPath -Name "DefaultSearchProviderEnabled" -Value 1 -Type DWord
            Set-ItemProperty -Path $regPath -Name "DefaultSearchProviderName" -Value "DuckDuckGo"
            Set-ItemProperty -Path $regPath -Name "DefaultSearchProviderSearchURL" -Value "https://duckduckgo.com/?q={searchTerms}"

            # Block DNS-over-HTTPS to prevent DNS sinkhole bypass
            Set-ItemProperty -Path $regPath -Name "DnsOverHttpsMode" -Value "off" -Type String

            if ($managedExtensionPolicy) {
                $forcelistPath = "$regPath\ExtensionInstallForcelist"
                if (Test-Path $forcelistPath) {
                    Remove-Item $forcelistPath -Recurse -Force
                }
                New-Item -Path $forcelistPath -Force | Out-Null
                Set-ItemProperty -Path $forcelistPath -Name 1 -Value "$($managedExtensionPolicy.ExtensionId);$($managedExtensionPolicy.UpdateUrl)"
            }
            
            Write-OpenPathLog "Policies written to: $regPath"
        }
        catch {
            Write-OpenPathLog "Failed to set policies for $regPath : $_" -Level WARN
        }
    }
    
    return $true
}

function Remove-BrowserPolicy {
    <#
    .SYNOPSIS
        Removes all whitelist browser policies
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("All browsers", "Remove OpenPath browser policies")) {
        return
    }

    Write-OpenPathLog "Removing browser policies..."
    
    # Firefox
    $firefoxPaths = @(
        "$env:ProgramFiles\Mozilla Firefox\distribution\policies.json",
        "${env:ProgramFiles(x86)}\Mozilla Firefox\distribution\policies.json"
    )
    
    foreach ($path in $firefoxPaths) {
        if (Test-Path $path) {
            Remove-Item $path -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Chrome/Edge registry
    $regPaths = @(
        "HKLM:\SOFTWARE\Policies\Google\Chrome\URLBlocklist",
        "HKLM:\SOFTWARE\Policies\Microsoft\Edge\URLBlocklist",
        "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist",
        "HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist"
    )
    
    foreach ($path in $regPaths) {
        if (Test-Path $path) {
            Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    
    Write-OpenPathLog "Browser policies removed"
}

function Set-AllBrowserPolicy {
    <#
    .SYNOPSIS
        Sets policies for all supported browsers
    .PARAMETER BlockedPaths
        Array of paths/URLs to block
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string[]]$BlockedPaths = @()
    )

    if (-not $PSCmdlet.ShouldProcess("All browsers", "Configure browser policies")) {
        return
    }

    Set-FirefoxPolicy -BlockedPaths $BlockedPaths
    Set-ChromePolicy -BlockedPaths $BlockedPaths
}

# Export module members
Export-ModuleMember -Function @(
    'Get-OpenPathBrowserDoctorReport',
    'Register-OpenPathFirefoxNativeHost',
    'Sync-OpenPathFirefoxNativeHostArtifacts',
    'Sync-OpenPathFirefoxNativeHostState',
    'Unregister-OpenPathFirefoxNativeHost',
    'Set-FirefoxPolicy',
    'Set-ChromePolicy',
    'Remove-BrowserPolicy',
    'Set-AllBrowserPolicy'
)
