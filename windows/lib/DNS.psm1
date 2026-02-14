# OpenPath DNS Module for Windows
# Manages Acrylic DNS Proxy configuration and service

# Import common functions
$modulePath = Split-Path $PSScriptRoot -Parent
Import-Module "$modulePath\lib\Common.psm1" -Force -ErrorAction SilentlyContinue

function Get-AcrylicPath {
    <#
    .SYNOPSIS
        Gets the Acrylic DNS Proxy installation path
    #>
    $defaultPath = "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"
    
    try {
        $config = Get-OpenPathConfig
        if ($config.acrylicPath -and (Test-Path $config.acrylicPath)) {
            return $config.acrylicPath
        }
    }
    catch {
        # Config file doesn't exist or is invalid - fall through to default paths
        Write-Debug "Config not available: $_"
    }
    
    if (Test-Path $defaultPath) {
        return $defaultPath
    }
    
    # Try Program Files (64-bit)
    $altPath = "$env:ProgramFiles\Acrylic DNS Proxy"
    if (Test-Path $altPath) {
        return $altPath
    }
    
    return $null
}

function Test-AcrylicInstalled {
    <#
    .SYNOPSIS
        Checks if Acrylic DNS Proxy is installed
    #>
    $path = Get-AcrylicPath
    return ($null -ne $path -and (Test-Path "$path\AcrylicService.exe"))
}

function Install-AcrylicDNS {
    <#
    .SYNOPSIS
        Downloads and installs Acrylic DNS Proxy silently
    .PARAMETER Force
        Force reinstallation even if already installed
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [switch]$Force
    )

    if ((Test-AcrylicInstalled) -and -not $Force) {
        Write-OpenPathLog "Acrylic DNS Proxy already installed"
        return $true
    }

    if (-not $PSCmdlet.ShouldProcess("Acrylic DNS Proxy", "Install")) {
        return $false
    }

    Write-OpenPathLog "Installing Acrylic DNS Proxy..."
    
    $installerUrl = "https://sourceforge.net/projects/acrylic/files/Acrylic/2.1.1/Acrylic-Portable.zip/download"
    $tempDir = "$env:TEMP\acrylic-install"
    $installDir = "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"
    
    try {
        # Clean temp directory
        if (Test-Path $tempDir) {
            Remove-Item $tempDir -Recurse -Force
        }
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        
        # Download portable version
        Write-OpenPathLog "Downloading Acrylic..."
        $zipPath = "$tempDir\acrylic.zip"
        
        # Use System.Net.WebClient for better compatibility
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($installerUrl, $zipPath)
        
        # Extract
        Write-OpenPathLog "Extracting..."
        Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
        
        # Create install directory
        if (-not (Test-Path $installDir)) {
            New-Item -ItemType Directory -Path $installDir -Force | Out-Null
        }
        
        # Copy files
        $extractedDir = Get-ChildItem $tempDir -Directory | Select-Object -First 1
        if ($extractedDir) {
            Copy-Item "$($extractedDir.FullName)\*" $installDir -Recurse -Force
        }
        else {
            Copy-Item "$tempDir\*" $installDir -Recurse -Force -Exclude "*.zip"
        }
        
        # Install service
        Write-OpenPathLog "Installing Acrylic service..."
        $servicePath = "$installDir\AcrylicService.exe"
        if (Test-Path $servicePath) {
            & $servicePath /INSTALL 2>$null
            Start-Sleep -Seconds 2
        }
        
        Write-OpenPathLog "Acrylic DNS Proxy installed successfully"
        return $true
    }
    catch {
        Write-OpenPathLog "Failed to install Acrylic: $_" -Level ERROR
        return $false
    }
    finally {
        # Cleanup
        if (Test-Path $tempDir) {
            Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Update-AcrylicHost {
    <#
    .SYNOPSIS
        Generates AcrylicHosts.txt with whitelist configuration
    .PARAMETER WhitelistedDomains
        Array of domains to allow
    .PARAMETER BlockedSubdomains
        Array of subdomains to explicitly block
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$WhitelistedDomains,

        [string[]]$BlockedSubdomains = @()
    )

    $acrylicPath = Get-AcrylicPath
    if (-not $acrylicPath) {
        Write-OpenPathLog "Acrylic not found" -Level ERROR
        return $false
    }

    if (-not $PSCmdlet.ShouldProcess("AcrylicHosts.txt", "Update whitelist configuration")) {
        return $false
    }

    $hostsPath = "$acrylicPath\AcrylicHosts.txt"

    try {
        $config = Get-OpenPathConfig
        $upstream = $config.primaryDNS
    }
    catch {
        $upstream = "8.8.8.8"
    }

    # Enforce max domains limit to protect Acrylic from excessive memory usage
    $maxDomains = 500
    try {
        $cfg = Get-OpenPathConfig
        if ($cfg.PSObject.Properties['maxDomains']) { $maxDomains = $cfg.maxDomains }
    } catch { <# use default #> }

    if ($WhitelistedDomains.Count -gt $maxDomains) {
        Write-OpenPathLog "Truncating whitelist from $($WhitelistedDomains.Count) to $maxDomains domains" -Level WARN
        $WhitelistedDomains = $WhitelistedDomains | Select-Object -First $maxDomains
    }

    Write-OpenPathLog "Generating AcrylicHosts.txt with $($WhitelistedDomains.Count) domains..."
    
    $content = @"
# ========================================
# OpenPath DNS - Generated by openpath-windows
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# Upstream DNS: $upstream
# ========================================

# ========================================
# DEFAULT BLOCK (NXDOMAIN for everything)
# This MUST come first!
# ========================================
NX >*

# ========================================
# ESSENTIAL DOMAINS (always allowed)
# Required for system operation
# ========================================

# Whitelist source
FORWARD >raw.githubusercontent.com $upstream
FORWARD >github.com $upstream
FORWARD >githubusercontent.com $upstream

# Captive portal detection
FORWARD >detectportal.firefox.com $upstream
FORWARD >connectivity-check.ubuntu.com $upstream
FORWARD >captive.apple.com $upstream
FORWARD >www.msftconnecttest.com $upstream
FORWARD >msftconnecttest.com $upstream
FORWARD >clients3.google.com $upstream

# Windows Update (optional, comment out if not needed)
FORWARD >windowsupdate.microsoft.com $upstream
FORWARD >update.microsoft.com $upstream

# NTP
FORWARD >time.windows.com $upstream
FORWARD >time.google.com $upstream


"@

    # Add blocked subdomains (explicit NXDOMAIN)
    if ($BlockedSubdomains.Count -gt 0) {
        $content += "# ========================================`n"
        $content += "# BLOCKED SUBDOMAINS ($($BlockedSubdomains.Count))`n"
        $content += "# ========================================`n"
        foreach ($subdomain in $BlockedSubdomains) {
            $content += "NX >$subdomain`n"
        }
        $content += "`n"
    }
    
    # Add whitelisted domains
    $content += "# ========================================`n"
    $content += "# WHITELISTED DOMAINS ($($WhitelistedDomains.Count))`n"
    $content += "# ========================================`n"
    
    foreach ($domain in $WhitelistedDomains) {
        $domain = $domain.Trim()
        if ($domain) {
            # Use > for domain and all subdomains
            $content += "FORWARD >$domain $upstream`n"
        }
    }
    
    # Write to file
    $content | Set-Content $hostsPath -Encoding UTF8 -Force
    
    Write-OpenPathLog "AcrylicHosts.txt updated"
    return $true
}

function Set-AcrylicConfiguration {
    <#
    .SYNOPSIS
        Configures AcrylicConfiguration.ini with optimal settings
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    $acrylicPath = Get-AcrylicPath
    if (-not $acrylicPath) {
        return $false
    }

    if (-not $PSCmdlet.ShouldProcess("AcrylicConfiguration.ini", "Configure Acrylic settings")) {
        return $false
    }

    $configPath = "$acrylicPath\AcrylicConfiguration.ini"

    try {
        $config = Get-OpenPathConfig
        $upstream = $config.primaryDNS
    }
    catch {
        $upstream = "8.8.8.8"
    }

    Write-OpenPathLog "Configuring Acrylic..."
    
    # Read existing config or create new
    if (Test-Path $configPath) {
        $iniContent = Get-Content $configPath -Raw
    }
    else {
        $iniContent = ""
    }
    
    # Key settings to ensure
    $settings = @{
        "PrimaryServerAddress" = $upstream
        "SecondaryServerAddress" = "8.8.4.4"
        "LocalIPv4BindingAddress" = "127.0.0.1"
        "LocalIPv4BindingPort" = "53"
        "CacheSize" = "65536"
        "HitLogFileName" = ""
        "ErrorLogFileName" = ""
    }
    
    # Update or add settings
    foreach ($key in $settings.Keys) {
        $pattern = "(?m)^$key=.*$"
        $replacement = "$key=$($settings[$key])"
        
        if ($iniContent -match $pattern) {
            $iniContent = $iniContent -replace $pattern, $replacement
        }
        else {
            $iniContent += "`n$replacement"
        }
    }
    
    $iniContent | Set-Content $configPath -Encoding UTF8 -Force
    
    Write-OpenPathLog "Acrylic configuration updated"
    return $true
}

function Set-LocalDNS {
    <#
    .SYNOPSIS
        Configures all active network adapters to use 127.0.0.1 as DNS
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Network adapters", "Set DNS to 127.0.0.1")) {
        return
    }

    Write-OpenPathLog "Configuring local DNS..."

    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
    
    foreach ($adapter in $adapters) {
        try {
            Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses "127.0.0.1"
            Write-OpenPathLog "Set DNS for adapter: $($adapter.Name)"
        }
        catch {
            Write-OpenPathLog "Failed to set DNS for $($adapter.Name): $_" -Level WARN
        }
    }
    
    # Flush DNS cache
    Clear-DnsClientCache
    Write-OpenPathLog "DNS cache flushed"
}

function Restore-OriginalDNS {
    <#
    .SYNOPSIS
        Restores network adapters to automatic DNS
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Network adapters", "Reset DNS to automatic")) {
        return
    }

    Write-OpenPathLog "Restoring original DNS settings..."

    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
    
    foreach ($adapter in $adapters) {
        try {
            Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ResetServerAddresses
            Write-OpenPathLog "Reset DNS for adapter: $($adapter.Name)"
        }
        catch {
            Write-OpenPathLog "Failed to reset DNS for $($adapter.Name): $_" -Level WARN
        }
    }
    
    Clear-DnsClientCache
}

function Restart-AcrylicService {
    <#
    .SYNOPSIS
        Restarts the Acrylic DNS Proxy service
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Acrylic DNS Proxy service", "Restart")) {
        return $false
    }

    Write-OpenPathLog "Restarting Acrylic service..."

    $serviceName = "AcrylicDNSProxySvc"
    
    try {
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        
        if (-not $service) {
            # Try alternative name
            $service = Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1
        }
        
        if ($service) {
            Restart-Service -Name $service.Name -Force
            Start-Sleep -Seconds 2
            
            $service = Get-Service -Name $service.Name
            if ($service.Status -eq 'Running') {
                Write-OpenPathLog "Acrylic service restarted successfully"
                return $true
            }
        }
        
        # Fallback: use batch file
        $acrylicPath = Get-AcrylicPath
        if ($acrylicPath -and (Test-Path "$acrylicPath\RestartAcrylicService.bat")) {
            & cmd /c "$acrylicPath\RestartAcrylicService.bat" 2>$null
            Start-Sleep -Seconds 2
            Write-OpenPathLog "Acrylic service restarted via batch file"
            return $true
        }
        
        Write-OpenPathLog "Could not restart Acrylic service" -Level ERROR
        return $false
    }
    catch {
        Write-OpenPathLog "Error restarting Acrylic: $_" -Level ERROR
        return $false
    }
}

function Start-AcrylicService {
    <#
    .SYNOPSIS
        Starts the Acrylic DNS Proxy service
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Acrylic DNS Proxy service", "Start")) {
        return $false
    }

    $acrylicPath = Get-AcrylicPath
    if (-not $acrylicPath) {
        return $false
    }
    
    try {
        $service = Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1
        
        if ($service) {
            if ($service.Status -ne 'Running') {
                Start-Service -Name $service.Name
                Start-Sleep -Seconds 2
            }
            return $true
        }
        
        # Start via executable
        if (Test-Path "$acrylicPath\StartAcrylicService.bat") {
            & cmd /c "$acrylicPath\StartAcrylicService.bat" 2>$null
            Start-Sleep -Seconds 2
            return $true
        }
        
        return $false
    }
    catch {
        Write-OpenPathLog "Error starting Acrylic: $_" -Level ERROR
        return $false
    }
}

function Stop-AcrylicService {
    <#
    .SYNOPSIS
        Stops the Acrylic DNS Proxy service
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Acrylic DNS Proxy service", "Stop")) {
        return $false
    }

    try {
        $service = Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1
        
        if ($service -and $service.Status -eq 'Running') {
            Stop-Service -Name $service.Name -Force
            Start-Sleep -Seconds 1
        }
        
        return $true
    }
    catch {
        Write-OpenPathLog "Error stopping Acrylic: $_" -Level ERROR
        return $false
    }
}

function Test-DNSResolution {
    <#
    .SYNOPSIS
        Tests if DNS resolution is working correctly
    .PARAMETER Domain
        Domain to test (should be whitelisted)
    #>
    param(
        [string]$Domain = "google.com"
    )
    
    try {
        $result = Resolve-DnsName -Name $Domain -Server 127.0.0.1 -DnsOnly -ErrorAction Stop
        return ($null -ne $result)
    }
    catch {
        return $false
    }
}

function Test-DNSSinkhole {
    <#
    .SYNOPSIS
        Tests if the DNS sinkhole is working (blocking non-whitelisted domains)
    .PARAMETER Domain
        Domain to test (should NOT be whitelisted)
    #>
    param(
        [string]$Domain = "should-not-exist-test.com"
    )
    
    try {
        $result = Resolve-DnsName -Name $Domain -Server 127.0.0.1 -DnsOnly -ErrorAction SilentlyContinue
        # If we get NXDOMAIN or no result, sinkhole is working
        return ($null -eq $result)
    }
    catch {
        # Error means blocked - sinkhole working
        return $true
    }
}

# Export module members
Export-ModuleMember -Function @(
    'Get-AcrylicPath',
    'Test-AcrylicInstalled',
    'Install-AcrylicDNS',
    'Update-AcrylicHost',
    'Set-AcrylicConfiguration',
    'Set-LocalDNS',
    'Restore-OriginalDNS',
    'Restart-AcrylicService',
    'Start-AcrylicService',
    'Stop-AcrylicService',
    'Test-DNSResolution',
    'Test-DNSSinkhole'
)
