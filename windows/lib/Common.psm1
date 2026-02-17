# OpenPath DNS Common Module for Windows
# Provides shared functions for all openpath components

# PSScriptAnalyzer: Test-AdminPrivileges is a valid noun form (privileges is a valid singular concept)
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseSingularNouns', '', Scope = 'Function', Target = 'Test-AdminPrivileges')]
param()

# Configuration paths
$script:OpenPathRoot = "C:\OpenPath"
$script:ConfigPath = "$script:OpenPathRoot\data\config.json"
$script:LogPath = "$script:OpenPathRoot\data\logs\openpath.log"
$script:IntegrityBaselinePath = "$script:OpenPathRoot\data\integrity-baseline.json"
$script:IntegrityBackupPath = "$script:OpenPathRoot\data\integrity-backup"
$script:CheckpointPath = "$script:OpenPathRoot\data\checkpoints"
$script:DomainPattern = '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$'

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

function Get-OpenPathFileAgeHours {
    <#
    .SYNOPSIS
        Returns file age in hours since last write time
    .PARAMETER Path
        Full file path
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        return [double]::PositiveInfinity
    }

    try {
        $file = Get-Item $Path -ErrorAction Stop
        $age = (New-TimeSpan -Start $file.LastWriteTimeUtc -End (Get-Date).ToUniversalTime()).TotalHours
        return [Math]::Max([Math]::Round($age, 2), 0)
    }
    catch {
        return [double]::PositiveInfinity
    }
}

function Get-HostFromUrl {
    <#
    .SYNOPSIS
        Returns host component from a URL string
    #>
    param(
        [string]$Url
    )

    if (-not $Url) {
        return $null
    }

    try {
        return ([System.Uri]$Url).Host
    }
    catch {
        return $null
    }
}

function Test-OpenPathDomainFormat {
    <#
    .SYNOPSIS
        Validates a domain using OpenPath's shared allowlist domain format
    #>
    param(
        [string]$Domain
    )

    if (-not $Domain) {
        return $false
    }

    $trimmedDomain = $Domain.Trim()

    if ($trimmedDomain.Length -lt 4 -or $trimmedDomain.Length -gt 253) {
        return $false
    }

    if ($trimmedDomain.EndsWith('.local', [System.StringComparison]::OrdinalIgnoreCase)) {
        return $false
    }

    return ($trimmedDomain -match $script:DomainPattern)
}

function Get-OpenPathRuntimeHealth {
    <#
    .SYNOPSIS
        Returns current DNS runtime health status
    .OUTPUTS
        PSCustomObject with DnsServiceRunning and DnsResolving booleans
    #>
    $acrylicRunning = $false
    $dnsResolving = $false

    try {
        $acrylicService = Get-Service -DisplayName "*Acrylic*" -ErrorAction SilentlyContinue | Select-Object -First 1
        $acrylicRunning = [bool]($acrylicService -and $acrylicService.Status -eq 'Running')
    }
    catch {
        $acrylicRunning = $false
    }

    if (Get-Command -Name 'Test-DNSResolution' -ErrorAction SilentlyContinue) {
        try {
            $dnsResolving = [bool](Test-DNSResolution -Domain 'google.com')
        }
        catch {
            $dnsResolving = $false
        }
    }

    return [PSCustomObject]@{
        DnsServiceRunning = [bool]$acrylicRunning
        DnsResolving = [bool]$dnsResolving
    }
}

function Get-ValidWhitelistDomainsFromFile {
    <#
    .SYNOPSIS
        Returns syntactically valid domains from a whitelist file
    .PARAMETER Path
        Full path to whitelist file
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        return @()
    }

    return @(
        Get-Content $Path -ErrorAction SilentlyContinue |
            ForEach-Object { $_.Trim() } |
            Where-Object { Test-OpenPathDomainFormat -Domain $_ }
    )
}

function Save-OpenPathWhitelistCheckpoint {
    <#
    .SYNOPSIS
        Saves the current whitelist into a timestamped checkpoint folder
    .PARAMETER WhitelistPath
        Path to current whitelist file
    .PARAMETER MaxCheckpoints
        Maximum number of checkpoint folders to keep
    .PARAMETER Reason
        Reason for checkpoint creation
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory = $true)]
        [string]$WhitelistPath,

        [int]$MaxCheckpoints = 3,

        [string]$Reason = 'pre-update'
    )

    if (-not (Test-Path $WhitelistPath)) {
        return [PSCustomObject]@{
            Success = $false
            CheckpointPath = $null
            Error = 'Whitelist file not found'
        }
    }

    try {
        if (-not (Test-Path $script:CheckpointPath)) {
            New-Item -ItemType Directory -Path $script:CheckpointPath -Force | Out-Null
        }

        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $checkpointPath = Join-Path $script:CheckpointPath "checkpoint-$timestamp"

        if (-not $PSCmdlet.ShouldProcess($checkpointPath, 'Create whitelist checkpoint')) {
            return [PSCustomObject]@{
                Success = $false
                CheckpointPath = $null
                Error = 'Operation cancelled by WhatIf/Confirm'
            }
        }

        New-Item -ItemType Directory -Path $checkpointPath -Force | Out-Null
        Copy-Item $WhitelistPath (Join-Path $checkpointPath 'whitelist.txt') -Force

        @{
            createdAt = (Get-Date -Format 'o')
            reason = $Reason
            source = $WhitelistPath
        } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $checkpointPath 'metadata.json') -Encoding UTF8

        if ($MaxCheckpoints -lt 1) {
            $MaxCheckpoints = 1
        }

        $checkpoints = Get-ChildItem $script:CheckpointPath -Directory -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending

        if ($checkpoints.Count -gt $MaxCheckpoints) {
            $checkpoints | Select-Object -Skip $MaxCheckpoints | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        }

        return [PSCustomObject]@{
            Success = $true
            CheckpointPath = $checkpointPath
            Error = $null
        }
    }
    catch {
        return [PSCustomObject]@{
            Success = $false
            CheckpointPath = $null
            Error = "Failed to create checkpoint: $_"
        }
    }
}

function Get-OpenPathLatestCheckpoint {
    <#
    .SYNOPSIS
        Returns latest available whitelist checkpoint metadata
    #>
    if (-not (Test-Path $script:CheckpointPath)) {
        return $null
    }

    $latest = Get-ChildItem $script:CheckpointPath -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1

    if (-not $latest) {
        return $null
    }

    $checkpointWhitelist = Join-Path $latest.FullName 'whitelist.txt'
    if (-not (Test-Path $checkpointWhitelist)) {
        return $null
    }

    $metadataPath = Join-Path $latest.FullName 'metadata.json'
    $metadata = $null
    if (Test-Path $metadataPath) {
        try {
            $metadata = Get-Content $metadataPath -Raw | ConvertFrom-Json
        }
        catch {
            $metadata = $null
        }
    }

    return [PSCustomObject]@{
        Path = $latest.FullName
        WhitelistPath = $checkpointWhitelist
        Metadata = $metadata
    }
}

function Restore-OpenPathLatestCheckpoint {
    <#
    .SYNOPSIS
        Restores the latest whitelist checkpoint and reapplies DNS enforcement state
    .PARAMETER Config
        OpenPath config object with enableFirewall/primaryDNS settings
    .PARAMETER WhitelistPath
        Destination whitelist path to restore into
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config,

        [Parameter(Mandatory = $true)]
        [string]$WhitelistPath
    )

    $result = [ordered]@{
        Success = $false
        CheckpointPath = $null
        DomainCount = 0
        Error = $null
    }

    $checkpoint = Get-OpenPathLatestCheckpoint
    if (-not $checkpoint) {
        $result.Error = 'No checkpoint available'
        return [PSCustomObject]$result
    }

    if (-not $PSCmdlet.ShouldProcess($WhitelistPath, "Restore checkpoint from $($checkpoint.Path)")) {
        $result.Error = 'Operation cancelled by WhatIf/Confirm'
        return [PSCustomObject]$result
    }

    try {
        Copy-Item $checkpoint.WhitelistPath $WhitelistPath -Force

        $domains = Get-ValidWhitelistDomainsFromFile -Path $WhitelistPath
        if ($domains.Count -lt 1) {
            $result.Error = 'Checkpoint restore aborted: no valid domains in checkpoint whitelist'
            return [PSCustomObject]$result
        }

        Update-AcrylicHost -WhitelistedDomains $domains -BlockedSubdomains @() | Out-Null
        Restart-AcrylicService | Out-Null

        if ($Config.enableFirewall) {
            $acrylicPath = Get-AcrylicPath
            Set-OpenPathFirewall -UpstreamDNS $Config.primaryDNS -AcrylicPath $acrylicPath | Out-Null
        }

        Set-LocalDNS

        $result.Success = $true
        $result.CheckpointPath = $checkpoint.Path
        $result.DomainCount = $domains.Count
        return [PSCustomObject]$result
    }
    catch {
        $result.Error = "Checkpoint restore failed: $_"
        return [PSCustomObject]$result
    }
}

function Get-OpenPathCriticalFiles {
    <#
    .SYNOPSIS
        Returns critical files covered by integrity baseline checks
    #>
    $files = @(
        "$script:OpenPathRoot\lib\Common.psm1",
        "$script:OpenPathRoot\lib\DNS.psm1",
        "$script:OpenPathRoot\lib\Firewall.psm1",
        "$script:OpenPathRoot\lib\Browser.psm1",
        "$script:OpenPathRoot\lib\Services.psm1",
        "$script:OpenPathRoot\scripts\Update-OpenPath.ps1",
        "$script:OpenPathRoot\scripts\Test-DNSHealth.ps1",
        "$script:OpenPathRoot\scripts\Start-SSEListener.ps1"
    )

    return $files | Where-Object { Test-Path $_ }
}

function Get-OpenPathRelativePath {
    <#
    .SYNOPSIS
        Converts an absolute OpenPath path into a path relative to C:\OpenPath
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if ($Path.StartsWith($script:OpenPathRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $Path.Substring($script:OpenPathRoot.Length).TrimStart('\')
    }

    return [System.IO.Path]::GetFileName($Path)
}

function Save-OpenPathIntegrityBackup {
    <#
    .SYNOPSIS
        Saves backup copies of critical files used for integrity restoration
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess($script:IntegrityBackupPath, 'Save integrity backup')) {
        return $false
    }

    try {
        New-Item -ItemType Directory -Path $script:IntegrityBackupPath -Force | Out-Null

        foreach ($file in Get-OpenPathCriticalFiles) {
            $relativePath = Get-OpenPathRelativePath -Path $file
            $backupPath = Join-Path $script:IntegrityBackupPath $relativePath
            $backupDir = Split-Path $backupPath -Parent
            if (-not (Test-Path $backupDir)) {
                New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
            }

            Copy-Item $file $backupPath -Force
        }

        Write-OpenPathLog 'Integrity backup saved'
        return $true
    }
    catch {
        Write-OpenPathLog "Failed to save integrity backup: $_" -Level WARN
        return $false
    }
}

function New-OpenPathIntegrityBaseline {
    <#
    .SYNOPSIS
        Creates integrity baseline hashes for critical files
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess($script:IntegrityBaselinePath, 'Generate integrity baseline')) {
        return $false
    }

    try {
        $entries = @()
        foreach ($file in Get-OpenPathCriticalFiles) {
            $hash = (Get-FileHash -Path $file -Algorithm SHA256 -ErrorAction Stop).Hash
            $entries += [PSCustomObject]@{
                path = $file
                hash = $hash
            }
        }

        $baseline = [PSCustomObject]@{
            generatedAt = (Get-Date -Format 'o')
            entryCount = $entries.Count
            entries = $entries
        }

        $baseline | ConvertTo-Json -Depth 10 | Set-Content $script:IntegrityBaselinePath -Encoding UTF8
        Write-OpenPathLog "Integrity baseline generated for $($entries.Count) files"
        return $true
    }
    catch {
        Write-OpenPathLog "Failed to generate integrity baseline: $_" -Level ERROR
        return $false
    }
}

function Test-OpenPathIntegrity {
    <#
    .SYNOPSIS
        Checks critical files against the integrity baseline
    #>
    $result = [ordered]@{
        Healthy = $true
        BaselinePresent = $false
        CheckedFiles = 0
        TamperedFiles = @()
        MissingFiles = @()
        Errors = @()
    }

    if (-not (Test-Path $script:IntegrityBaselinePath)) {
        return [PSCustomObject]$result
    }

    $result.BaselinePresent = $true

    try {
        $baseline = Get-Content $script:IntegrityBaselinePath -Raw | ConvertFrom-Json
        $entries = @($baseline.entries)
    }
    catch {
        $result.Healthy = $false
        $result.Errors += "Invalid integrity baseline: $_"
        return [PSCustomObject]$result
    }

    foreach ($entry in $entries) {
        $path = [string]$entry.path
        $expectedHash = [string]$entry.hash
        if (-not $path -or -not $expectedHash) {
            continue
        }

        $result.CheckedFiles += 1

        if (-not (Test-Path $path)) {
            $result.MissingFiles += $path
            continue
        }

        try {
            $currentHash = (Get-FileHash -Path $path -Algorithm SHA256 -ErrorAction Stop).Hash
            if ($currentHash -ne $expectedHash) {
                $result.TamperedFiles += $path
            }
        }
        catch {
            $result.Errors += "Unable to hash $path : $_"
        }
    }

    if (($result.TamperedFiles.Count -gt 0) -or ($result.MissingFiles.Count -gt 0) -or ($result.Errors.Count -gt 0)) {
        $result.Healthy = $false
    }

    return [PSCustomObject]$result
}

function Restore-OpenPathIntegrity {
    <#
    .SYNOPSIS
        Attempts bounded restoration of integrity using local backup copies
    .PARAMETER IntegrityResult
        Optional result from Test-OpenPathIntegrity to avoid re-checking
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [PSCustomObject]$IntegrityResult
    )

    if (-not $IntegrityResult) {
        $IntegrityResult = Test-OpenPathIntegrity
    }

    if (-not $IntegrityResult.BaselinePresent) {
        $baselineCreated = New-OpenPathIntegrityBaseline
        return [PSCustomObject]@{
            RestoredFiles = @()
            PendingFiles = @()
            Healthy = [bool]$baselineCreated
            BaselineRecreated = [bool]$baselineCreated
        }
    }

    $restoredFiles = @()
    $pendingFiles = @()
    $targets = @($IntegrityResult.MissingFiles + $IntegrityResult.TamperedFiles)
    $targets = @($targets | Sort-Object -Unique)

    foreach ($path in $targets) {
        $relativePath = Get-OpenPathRelativePath -Path $path
        $backupPath = Join-Path $script:IntegrityBackupPath $relativePath

        if (-not (Test-Path $backupPath)) {
            $pendingFiles += $path
            continue
        }

        if (-not $PSCmdlet.ShouldProcess($path, "Restore from $backupPath")) {
            $pendingFiles += $path
            continue
        }

        try {
            $destinationDir = Split-Path $path -Parent
            if (-not (Test-Path $destinationDir)) {
                New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
            }

            Copy-Item $backupPath $path -Force
            $restoredFiles += $path
        }
        catch {
            $pendingFiles += $path
            Write-OpenPathLog "Failed to restore $path : $_" -Level WARN
        }
    }

    if ($restoredFiles.Count -gt 0) {
        New-OpenPathIntegrityBaseline | Out-Null
    }

    $postCheck = Test-OpenPathIntegrity
    return [PSCustomObject]@{
        RestoredFiles = $restoredFiles
        PendingFiles = ($pendingFiles | Sort-Object -Unique)
        Healthy = [bool]$postCheck.Healthy
        BaselineRecreated = $false
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
    $validDomains = $result.Whitelist | Where-Object { Test-OpenPathDomainFormat -Domain $_ }
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

function Send-OpenPathHealthReport {
    <#
    .SYNOPSIS
        Sends machine health status to central API via tRPC
    .PARAMETER Status
        Health state string (HEALTHY, DEGRADED, STALE_FAILSAFE, TAMPERED, etc.)
    .PARAMETER DnsServiceRunning
        Whether local DNS service is running
    .PARAMETER DnsResolving
        Whether DNS resolution is currently working
    .PARAMETER FailCount
        Consecutive watchdog fail count
    .PARAMETER Actions
        Short reason code(s) describing the current state
    .PARAMETER Version
        Agent version string
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Status,

        [bool]$DnsServiceRunning = $false,

        [bool]$DnsResolving = $false,

        [int]$FailCount = 0,

        [string]$Actions = '',

        [string]$Version = 'unknown'
    )

    $config = $null
    try {
        $config = Get-OpenPathConfig
    }
    catch {
        return $false
    }

    if (-not ($config.PSObject.Properties['apiUrl']) -or -not $config.apiUrl) {
        return $false
    }

    $versionToSend = $Version
    if ($versionToSend -eq 'unknown' -and $config.PSObject.Properties['version'] -and $config.version) {
        $versionToSend = [string]$config.version
    }

    $healthApiSecret = ''
    if ($config.PSObject.Properties['healthApiSecret'] -and $config.healthApiSecret) {
        $healthApiSecret = [string]$config.healthApiSecret
    }
    elseif ($env:OPENPATH_HEALTH_API_SECRET) {
        $healthApiSecret = [string]$env:OPENPATH_HEALTH_API_SECRET
    }

    $payload = @{
        json = @{
            hostname = $env:COMPUTERNAME
            status = $Status
            dnsmasqRunning = [bool]$DnsServiceRunning
            dnsResolving = [bool]$DnsResolving
            failCount = [int]$FailCount
            actions = [string]$Actions
            version = [string]$versionToSend
        }
    } | ConvertTo-Json -Depth 8

    $healthUrl = "$($config.apiUrl.TrimEnd('/'))/trpc/healthReports.submit"
    $headers = @{ 'Content-Type' = 'application/json' }
    if ($healthApiSecret) {
        $headers['Authorization'] = "Bearer $healthApiSecret"
    }

    try {
        Invoke-RestMethod -Uri $healthUrl -Method Post -Headers $headers -Body $payload `
            -TimeoutSec 10 -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        Write-OpenPathLog "Health report failed (non-critical): $_" -Level WARN
        return $false
    }
}

# Export module members
Export-ModuleMember -Function @(
    'Test-AdminPrivileges',
    'Write-OpenPathLog',
    'Get-OpenPathConfig',
    'Set-OpenPathConfig',
    'Get-OpenPathFileAgeHours',
    'Get-HostFromUrl',
    'Test-OpenPathDomainFormat',
    'Get-OpenPathRuntimeHealth',
    'Get-ValidWhitelistDomainsFromFile',
    'Save-OpenPathWhitelistCheckpoint',
    'Get-OpenPathLatestCheckpoint',
    'Restore-OpenPathLatestCheckpoint',
    'Get-OpenPathCriticalFiles',
    'Save-OpenPathIntegrityBackup',
    'New-OpenPathIntegrityBaseline',
    'Test-OpenPathIntegrity',
    'Restore-OpenPathIntegrity',
    'Get-PrimaryDNS',
    'Get-OpenPathFromUrl',
    'Test-InternetConnection',
    'Send-OpenPathHealthReport'
)
