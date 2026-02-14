# OpenPath Browser Policies Module for Windows
# Manages Firefox and Chrome/Edge policies

# Import common functions
$modulePath = Split-Path $PSScriptRoot -Parent
Import-Module "$modulePath\lib\Common.psm1" -Force -ErrorAction SilentlyContinue

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
        
        $policiesPath = "$firefoxPath\policies.json"
        $policies | ConvertTo-Json -Depth 10 | Set-Content $policiesPath -Encoding UTF8
        
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
        "HKLM:\SOFTWARE\Policies\Microsoft\Edge\URLBlocklist"
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
