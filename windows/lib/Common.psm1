# OpenPath DNS Common Module for Windows
# Provides shared functions for all openpath components

# PSScriptAnalyzer: Test-AdminPrivileges is a valid noun form (privileges is a valid singular concept)
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseSingularNouns', '', Scope = 'Function', Target = 'Test-AdminPrivileges')]
param()

# Configuration paths
$script:OpenPathRoot = "C:\OpenPath"
$script:ConfigPath = "$script:OpenPathRoot\data\config.json"
$script:LogPath = "$script:OpenPathRoot\data\logs\openpath.log"

function Test-AdminPrivileges {
    <#
    .SYNOPSIS
        Checks if script is running with administrator privileges
    #>
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-OpenPathLog {
    <#
    .SYNOPSIS
        Writes a log entry to the openpath log file
    .PARAMETER Message
        The message to log
    .PARAMETER Level
        Log level: INFO, WARN, ERROR
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [ValidateSet("INFO", "WARN", "ERROR")]
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    # Identify calling script for structured logging
    $callerInfo = Get-PSCallStack | Select-Object -Skip 1 -First 1
    $callerScript = if ($callerInfo -and $callerInfo.ScriptName) {
        Split-Path $callerInfo.ScriptName -Leaf
    } else { "unknown" }

    $logEntry = "$timestamp [$Level] [$callerScript] [PID:$PID] $Message"
    
    # Ensure log directory exists
    $logDir = Split-Path $script:LogPath -Parent
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }

    # Rotate log if it exceeds 5 MB
    $script:MaxLogSizeBytes = 5MB
    if ((Test-Path $script:LogPath) -and (Get-Item $script:LogPath -ErrorAction SilentlyContinue).Length -gt $script:MaxLogSizeBytes) {
        $archivePath = $script:LogPath -replace '\.log$', ".$(Get-Date -Format 'yyyyMMddHHmmss').log"
        Move-Item $script:LogPath $archivePath -Force -ErrorAction SilentlyContinue
        # Keep only the 5 most recent archives
        Get-ChildItem (Split-Path $script:LogPath) -Filter "openpath.*.log" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }
    
    # Append to log file
    Add-Content -Path $script:LogPath -Value $logEntry -Encoding UTF8

    # Also write to console with appropriate stream
    switch ($Level) {
        "ERROR" { Write-Error $logEntry -ErrorAction Continue }
        "WARN"  { Write-Warning $logEntry }
        default { Write-Information $logEntry -InformationAction Continue }
    }
}

function Get-OpenPathConfig {
    <#
    .SYNOPSIS
        Reads the openpath configuration from config.json
    .OUTPUTS
        PSCustomObject with configuration values
    #>
    if (-not (Test-Path $script:ConfigPath)) {
        Write-OpenPathLog "Config file not found at $($script:ConfigPath)" -Level ERROR
        throw "Configuration file not found"
    }
    
    return Get-Content $script:ConfigPath -Raw | ConvertFrom-Json
}

function Set-OpenPathConfig {
    <#
    .SYNOPSIS
        Saves configuration to config.json
    .PARAMETER Config
        Configuration object to save
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config
    )

    $configDir = Split-Path $script:ConfigPath -Parent
    if (-not (Test-Path $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }

    if ($PSCmdlet.ShouldProcess($script:ConfigPath, "Save configuration")) {
        $Config | ConvertTo-Json -Depth 10 | Set-Content $script:ConfigPath -Encoding UTF8
        Write-OpenPathLog "Configuration saved"
    }
}

function Get-PrimaryDNS {
    <#
    .SYNOPSIS
        Detects the primary DNS server from active network adapters
    .OUTPUTS
        String with the primary DNS IP address
    #>
    $dns = Get-DnsClientServerAddress -AddressFamily IPv4 | 
        Where-Object { $_.ServerAddresses -and $_.ServerAddresses[0] -ne "127.0.0.1" } |
        Select-Object -First 1
    
    if ($dns -and $dns.ServerAddresses) {
        return $dns.ServerAddresses[0]
    }
    
    # Fallback to gateway
    $gateway = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Select-Object -First 1).NextHop
    if ($gateway) {
        return $gateway
    }
    
    # Ultimate fallback
    return "8.8.8.8"
}

function Get-OpenPathFromUrl {
    <#
    .SYNOPSIS
        Downloads and parses whitelist from URL
    .PARAMETER Url
        URL to download whitelist from
    .OUTPUTS
        Hashtable with Whitelist, BlockedSubdomains, and BlockedPaths arrays
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )
    
    Write-OpenPathLog "Downloading whitelist from $Url"
    
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
        $content = $response.Content
    }
    catch {
        Write-OpenPathLog "Failed to download whitelist: $_" -Level ERROR
        throw
    }
    
    $result = @{
        Whitelist = @()
        BlockedSubdomains = @()
        BlockedPaths = @()
        IsDisabled = $false
    }
    
    $currentSection = "WHITELIST"
    
    foreach ($line in $content -split "`n") {
        $line = $line.Trim()
        
        # Skip empty lines and comments (except section headers)
        if (-not $line) { continue }
        
        # Check for section headers
        if ($line -match '^#\s*DESACTIVADO\b') {
            $result.IsDisabled = $true
            continue
        }

        if ($line -match "^##\s*(.+)$") {
            $currentSection = $Matches[1].Trim().ToUpper()
            continue
        }
        
        # Skip other comments
        if ($line.StartsWith("#")) { continue }
        
        # Add to appropriate section
        switch ($currentSection) {
            "WHITELIST"           { $result.Whitelist += $line }
            "BLOCKED-SUBDOMAINS"  { $result.BlockedSubdomains += $line }
            "BLOCKED-PATHS"       { $result.BlockedPaths += $line }
        }
    }
    
    Write-OpenPathLog "Parsed: $($result.Whitelist.Count) whitelisted, $($result.BlockedSubdomains.Count) blocked subdomains, $($result.BlockedPaths.Count) blocked paths, disabled=$($result.IsDisabled)"

    if ($result.IsDisabled) {
        Write-OpenPathLog "Remote disable marker detected - skipping minimum-domain validation" -Level WARN
        return $result
    }

    # Validate that the downloaded content looks like a real whitelist
    $validDomains = $result.Whitelist | Where-Object { $_ -match '^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$' }
    $minRequiredDomains = 3
    if ($validDomains.Count -lt $minRequiredDomains) {
        Write-OpenPathLog "Downloaded whitelist appears invalid ($($validDomains.Count) valid domains, minimum $minRequiredDomains required)" -Level ERROR
        throw "Invalid whitelist content: insufficient valid domains ($($validDomains.Count)/$minRequiredDomains)"
    }
    
    return $result
}

function Test-InternetConnection {
    <#
    .SYNOPSIS
        Tests if there is an active internet connection
    #>
    # Use Google's public DNS server for connectivity test
    $testServer = '8.8.8.8'
    try {
        $result = Test-NetConnection -ComputerName $testServer -Port 53 -WarningAction SilentlyContinue
        return $result.TcpTestSucceeded
    }
    catch {
        return $false
    }
}

# Export module members
Export-ModuleMember -Function @(
    'Test-AdminPrivileges',
    'Write-OpenPathLog',
    'Get-OpenPathConfig',
    'Set-OpenPathConfig',
    'Get-PrimaryDNS',
    'Get-OpenPathFromUrl',
    'Test-InternetConnection'
)
