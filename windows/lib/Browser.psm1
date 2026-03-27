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
    'Set-FirefoxPolicy',
    'Set-ChromePolicy',
    'Remove-BrowserPolicy',
    'Set-AllBrowserPolicy'
)
