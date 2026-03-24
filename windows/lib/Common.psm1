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

function ConvertTo-OpenPathMachineName {
    param(
        [string]$Value
    )

    if (-not $Value) {
        return ''
    }

    $normalized = $Value.Trim().ToLowerInvariant()
    $normalized = $normalized -replace '[^a-z0-9-]+', '-'
    $normalized = $normalized -replace '-+', '-'
    return $normalized.Trim('-')
}

function New-OpenPathScopedMachineName {
    <#
    .SYNOPSIS
        Builds a deterministic classroom-scoped machine identifier from the local hostname.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Hostname,

        [Parameter(Mandatory = $true)]
        [string]$ClassroomId
    )

    $base = ConvertTo-OpenPathMachineName -Value $Hostname
    if (-not $base) {
        $base = 'machine'
    }

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($ClassroomId)
        $hashBytes = $sha.ComputeHash($bytes)
        $hash = ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant().Substring(0, 8)
    }
    finally {
        $sha.Dispose()
    }

    $suffix = "-$hash"
    $maxBaseLength = [Math]::Max(1, 63 - $suffix.Length)
    if ($base.Length -gt $maxBaseLength) {
        $base = $base.Substring(0, $maxBaseLength).TrimEnd('-')
    }
    if (-not $base) {
        $base = 'machine'
    }

    return "$base$suffix"
}

function Get-OpenPathMachineName {
    <#
    .SYNOPSIS
        Returns the persisted machine identifier, falling back to COMPUTERNAME.
    #>
    try {
        $config = Get-OpenPathConfig
        if ($config.PSObject.Properties['machineName'] -and $config.machineName) {
            return [string]$config.machineName
        }
    }
    catch {
        # Fall back to the system hostname if config is unavailable.
    }

    return [string]$env:COMPUTERNAME
}

function Set-OpenPathMachineName {
    <#
    .SYNOPSIS
        Persists the machine identifier into the in-memory config object.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config,

        [Parameter(Mandatory = $true)]
        [string]$MachineName
    )

    $normalized = ConvertTo-OpenPathMachineName -Value $MachineName
    if (-not $normalized) {
        throw 'MachineName must include at least one letter or number'
    }

    if ($Config.PSObject.Properties['machineName']) {
        $Config.machineName = $normalized
    }
    else {
        $Config | Add-Member -MemberType NoteProperty -Name 'machineName' -Value $normalized -Force
    }

    return $normalized
}

function Set-OpenPathConfigValue {
    <#
    .SYNOPSIS
        Sets or adds a config property on the provided OpenPath config object.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [PSCustomObject]$Config,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [AllowNull()]
        [AllowEmptyString()]
        [object]$Value
    )

    if ($Config.PSObject.Properties[$Name]) {
        $Config.$Name = $Value
    }
    else {
        $Config | Add-Member -MemberType NoteProperty -Name $Name -Value $Value -Force
    }
}

function New-OpenPathMachineRegistrationBody {
    <#
    .SYNOPSIS
        Builds the canonical machine registration request payload.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$MachineName,

        [Parameter(Mandatory = $true)]
        [string]$Version,

        [string]$Classroom = '',

        [string]$ClassroomId = ''
    )

    $body = [ordered]@{
        hostname = $MachineName
        version = $Version
    }

    if ($ClassroomId) {
        $body.classroomId = $ClassroomId
    }
    elseif ($Classroom) {
        $body.classroomName = $Classroom
    }

    return [PSCustomObject]$body
}

function Resolve-OpenPathMachineRegistration {
    <#
    .SYNOPSIS
        Normalizes the API registration response into canonical classroom/machine fields.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [object]$Response,

        [string]$MachineName = '',

        [string]$Classroom = '',

        [string]$ClassroomId = ''
    )

    if (-not $Response.success) {
        throw "Machine registration failed: $($Response | ConvertTo-Json -Compress)"
    }

    if (-not $Response.whitelistUrl) {
        throw 'Registration succeeded but no tokenized whitelist URL was returned'
    }

    $resolvedClassroom = if ($Response.PSObject.Properties['classroomName'] -and $Response.classroomName) {
        [string]$Response.classroomName
    }
    else {
        [string]$Classroom
    }

    $resolvedClassroomId = if ($Response.PSObject.Properties['classroomId'] -and $Response.classroomId) {
        [string]$Response.classroomId
    }
    else {
        [string]$ClassroomId
    }

    $resolvedMachineName = if ($Response.PSObject.Properties['machineHostname'] -and $Response.machineHostname) {
        [string]$Response.machineHostname
    }
    else {
        [string]$MachineName
    }

    return [PSCustomObject]@{
        Success = $true
        WhitelistUrl = [string]$Response.whitelistUrl
        Classroom = $resolvedClassroom
        ClassroomId = $resolvedClassroomId
        MachineName = $resolvedMachineName
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

function Get-OpenPathProtectedDomains {
    <#
    .SYNOPSIS
        Returns control-plane and bootstrap/download domains that must never be blocked
    #>
    $domains = [System.Collections.Generic.List[string]]::new()
    $seenDomains = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    foreach ($domain in @(
            'raw.githubusercontent.com',
            'github.com',
            'githubusercontent.com',
            'api.github.com',
            'release-assets.githubusercontent.com',
            'objects.githubusercontent.com',
            'balejosg.github.io',
            'sourceforge.net',
            'downloads.sourceforge.net'
        )) {
        if ($domain -and $seenDomains.Add($domain)) {
            $domains.Add($domain) | Out-Null
        }
    }

    try {
        $config = Get-OpenPathConfig
        foreach ($urlProperty in @('whitelistUrl', 'apiUrl')) {
            if (-not $config.PSObject.Properties[$urlProperty]) {
                continue
            }

            $host = Get-HostFromUrl -Url ([string]$config.$urlProperty)
            if (-not $host) {
                continue
            }

            $normalizedHost = $host.Trim().Trim('.')
            if ($normalizedHost -and (Test-OpenPathDomainFormat -Domain $normalizedHost) -and $seenDomains.Add($normalizedHost)) {
                $domains.Add($normalizedHost) | Out-Null
            }
        }
    }
    catch {
        Write-Debug "Protected domains unavailable from config: $_"
    }

    return @($domains)
}

function Get-OpenPathHostFromBlockedPathRule {
    <#
    .SYNOPSIS
        Extracts the host portion from a blocked path rule when one is present
    #>
    param(
        [string]$Rule
    )

    if (-not $Rule) {
        return $null
    }

    $candidate = $Rule.Trim()
    if (-not $candidate) {
        return $null
    }

    $candidate = $candidate -replace '^\*://', ''
    $candidate = $candidate -replace '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''
    $candidate = $candidate.TrimStart('*').TrimStart('.')

    if (-not $candidate -or $candidate.StartsWith('/')) {
        return $null
    }

    $host = ($candidate -split '[/?#]')[0]
    $host = ($host -split ':')[0]
    $host = $host.Trim().Trim('*').Trim('.')

    if (-not $host) {
        return $null
    }

    if (Test-OpenPathDomainFormat -Domain $host) {
        return $host
    }

    return $null
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
            $dnsResolving = [bool](Test-DNSResolution)
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

function Get-OpenPathDnsProbeDomains {
    <#
    .SYNOPSIS
        Returns candidate domains for DNS health probes based on the effective allowlist
    #>
    $domains = [System.Collections.Generic.List[string]]::new()
    $seenDomains = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $whitelistPath = Join-Path $script:OpenPathRoot 'data\whitelist.txt'

    try {
        foreach ($domain in @(Get-ValidWhitelistDomainsFromFile -Path $whitelistPath)) {
            $normalizedDomain = ([string]$domain).Trim().Trim('.')
            if ($normalizedDomain -and (Test-OpenPathDomainFormat -Domain $normalizedDomain) -and $seenDomains.Add($normalizedDomain)) {
                $domains.Add($normalizedDomain) | Out-Null
            }
        }
    }
    catch {
        Write-Debug "DNS probe domains unavailable from whitelist: $_"
    }

    foreach ($domain in @(Get-OpenPathProtectedDomains)) {
        $normalizedDomain = ([string]$domain).Trim().Trim('.')
        if ($normalizedDomain -and (Test-OpenPathDomainFormat -Domain $normalizedDomain) -and $seenDomains.Add($normalizedDomain)) {
            $domains.Add($normalizedDomain) | Out-Null
        }
    }

    return @($domains)
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
        "$script:OpenPathRoot\lib\CaptivePortal.psm1",
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

function Test-DirectDnsServer {
    <#
    .SYNOPSIS
        Checks whether a DNS server can answer direct recursive queries
    .PARAMETER Server
        IPv4 DNS server to probe
    .PARAMETER ProbeDomain
        Public domain used for the probe
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Server,

        [string]$ProbeDomain = 'google.com'
    )

    if (-not $Server -or $Server -in @('127.0.0.1', '0.0.0.0')) {
        return $false
    }

    if ($Server -notmatch '^\d{1,3}(?:\.\d{1,3}){3}$') {
        return $false
    }

    try {
        $result = Resolve-DnsName -Name $ProbeDomain -Server $Server -DnsOnly -ErrorAction Stop
        return ($null -ne $result)
    }
    catch {
        return $false
    }
}

function Test-DisfavoredDnsServer {
    <#
    .SYNOPSIS
        Flags platform-managed resolvers that should be tried after public fallbacks
    .PARAMETER Server
        IPv4 DNS server candidate
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Server
    )

    return $Server -in @(
        '168.63.129.16'
    )
}

function Get-PrimaryDNS {
    <#
    .SYNOPSIS
        Detects the primary DNS server from active network adapters
    .OUTPUTS
        String with the primary DNS IP address
    #>
    $preferredCandidates = @(
        Get-DnsClientServerAddress -AddressFamily IPv4 |
            ForEach-Object { @($_.ServerAddresses) } |
            Where-Object {
                $_ -and
                $_ -notin @('127.0.0.1', '0.0.0.0') -and
                $_ -match '^\d{1,3}(?:\.\d{1,3}){3}$'
            }
    )

    $gateway = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -First 1).NextHop
    if (
        $gateway -and
        $gateway -notin @('127.0.0.1', '0.0.0.0') -and
        $gateway -match '^\d{1,3}(?:\.\d{1,3}){3}$'
    ) {
        $preferredCandidates += $gateway
    }

    $preferredCandidates = @($preferredCandidates | Select-Object -Unique)
    $disfavoredCandidates = @(
        $preferredCandidates | Where-Object { Test-DisfavoredDnsServer -Server $_ }
    )
    $preferredCandidates = @(
        $preferredCandidates | Where-Object { -not (Test-DisfavoredDnsServer -Server $_) }
    )
    $fallbackCandidates = @('8.8.8.8', '1.1.1.1', '9.9.9.9', '8.8.4.4')

    foreach ($candidate in (@($preferredCandidates) + @($fallbackCandidates) + @($disfavoredCandidates))) {
        if (Test-DirectDnsServer -Server $candidate) {
            return $candidate
        }
    }

    if ($preferredCandidates.Count -gt 0) {
        return $preferredCandidates[0]
    }

    if ($disfavoredCandidates.Count -gt 0) {
        return $disfavoredCandidates[0]
    }

    return '8.8.8.8'
}

function Ensure-OpenPathHttpAssembly {
    if ('System.Net.Http.HttpClientHandler' -as [type]) {
        return
    }

    try {
        Add-Type -AssemblyName 'System.Net.Http' -ErrorAction Stop
    }
    catch {
        try {
            [System.Reflection.Assembly]::Load('System.Net.Http') | Out-Null
        }
        catch {
            throw "Failed to load System.Net.Http assembly: $_"
        }
    }

    if (-not ('System.Net.Http.HttpClientHandler' -as [type])) {
        throw 'System.Net.Http assembly loaded, but HttpClientHandler is still unavailable'
    }
}

function Invoke-OpenPathHttpGetText {
    <#
    .SYNOPSIS
        Performs a GET request and returns status, content, and ETag.
    .PARAMETER RequestUrl
        Full URL to request.
    .PARAMETER IfNoneMatch
        Optional ETag value to send as If-None-Match.
    .PARAMETER TimeoutSec
        Request timeout in seconds.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$RequestUrl,

        [string]$IfNoneMatch,

        [int]$TimeoutSec = 30
    )

    $client = $null
    $response = $null

    try {
        Ensure-OpenPathHttpAssembly

        $handler = [System.Net.Http.HttpClientHandler]::new()
        if ($handler.PSObject.Properties['AutomaticDecompression']) {
            $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
        }

        $client = [System.Net.Http.HttpClient]::new($handler)
        $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)

        $request = [System.Net.Http.HttpRequestMessage]::new(
            [System.Net.Http.HttpMethod]::Get,
            $RequestUrl
        )

        if ($IfNoneMatch) {
            try {
                $request.Headers.IfNoneMatch.Add([System.Net.Http.Headers.EntityTagHeaderValue]::Parse($IfNoneMatch))
            }
            catch {
                # Ignore invalid cached ETag
            }
        }

        $response = $client.SendAsync($request).GetAwaiter().GetResult()

        $statusCode = [int]$response.StatusCode
        $etag = $null
        if ($response.Headers.ETag) {
            $etag = $response.Headers.ETag.ToString()
        }

        if ($statusCode -eq 304) {
            return [PSCustomObject]@{
                StatusCode = $statusCode
                Content    = ''
                ETag       = $etag
            }
        }

        if (-not $response.IsSuccessStatusCode) {
            throw "HTTP $statusCode"
        }

        $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        return [PSCustomObject]@{
            StatusCode = $statusCode
            Content    = $content
            ETag       = $etag
        }
    }
    finally {
        if ($response) { $response.Dispose() }
        if ($client) { $client.Dispose() }
    }
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

    $etagPath = Join-Path $script:OpenPathRoot 'data\whitelist.etag'
    $cachedEtag = $null
    if (Test-Path $etagPath) {
        try {
            $cachedEtag = (Get-Content $etagPath -Raw -ErrorAction Stop).Trim()
        }
        catch {
            $cachedEtag = $null
        }
    }

    $httpResult = $null
    try {
        $httpResult = Invoke-OpenPathHttpGetText -RequestUrl $Url -IfNoneMatch $cachedEtag -TimeoutSec 30
    }
    catch {
        Write-OpenPathLog "Failed to download whitelist: $_" -Level ERROR
        throw
    }

    $result = [PSCustomObject]@{
        Whitelist = @()
        BlockedSubdomains = @()
        BlockedPaths = @()
        IsDisabled = $false
        NotModified = $false
    }

    if ($httpResult -and $httpResult.StatusCode -eq 304) {
        $result.NotModified = $true
        Write-OpenPathLog "Whitelist unchanged (ETag match)"
        return $result
    }

    $content = if ($httpResult) { [string]$httpResult.Content } else { '' }
    $newEtag = if ($httpResult) { [string]$httpResult.ETag } else { $null }
    
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
    
    if ($result.IsDisabled) {
        Write-OpenPathLog "Parsed: $($result.Whitelist.Count) whitelisted, $($result.BlockedSubdomains.Count) blocked subdomains, $($result.BlockedPaths.Count) blocked paths, disabled=$($result.IsDisabled)"
        Write-OpenPathLog "Remote disable marker detected - skipping minimum-domain validation" -Level WARN
        if ($newEtag) {
            try {
                $dir = Split-Path $etagPath -Parent
                if (-not (Test-Path $dir)) {
                    New-Item -ItemType Directory -Path $dir -Force | Out-Null
                }
                $newEtag | Set-Content -Path $etagPath -Encoding ASCII
            }
            catch {
                # Non-fatal
            }
        }
        return $result
    }

    $protectedDomains = @(Get-OpenPathProtectedDomains)
    $protectedDomainSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($domain in $protectedDomains) {
        if ($domain) {
            $protectedDomainSet.Add($domain) | Out-Null
        }
    }

    if ($protectedDomainSet.Count -gt 0) {
        $effectiveWhitelist = [System.Collections.Generic.List[string]]::new()
        $whitelistSeen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

        foreach ($domain in @($result.Whitelist) + $protectedDomains) {
            $normalizedDomain = ([string]$domain).Trim().Trim('.')
            if (-not $normalizedDomain) {
                continue
            }

            if ((Test-OpenPathDomainFormat -Domain $normalizedDomain) -and $whitelistSeen.Add($normalizedDomain)) {
                $effectiveWhitelist.Add($normalizedDomain) | Out-Null
            }
        }

        $blockedSubdomainRemovals = 0
        $filteredBlockedSubdomains = @(
            foreach ($subdomain in @($result.BlockedSubdomains)) {
                $normalizedSubdomain = ([string]$subdomain).Trim().Trim('.')
                if (-not $normalizedSubdomain) {
                    continue
                }

                if ($protectedDomainSet.Contains($normalizedSubdomain)) {
                    $blockedSubdomainRemovals++
                    continue
                }

                $normalizedSubdomain
            }
        )

        $blockedPathRemovals = 0
        $filteredBlockedPaths = @(
            foreach ($pathRule in @($result.BlockedPaths)) {
                $protectedPathHost = Get-OpenPathHostFromBlockedPathRule -Rule $pathRule
                if ($protectedPathHost -and $protectedDomainSet.Contains($protectedPathHost)) {
                    $blockedPathRemovals++
                    continue
                }

                $pathRule
            }
        )

        if ($blockedSubdomainRemovals -gt 0 -or $blockedPathRemovals -gt 0) {
            Write-OpenPathLog "Removed $blockedSubdomainRemovals blocked subdomains and $blockedPathRemovals blocked paths targeting protected control-plane domains" -Level WARN
        }

        $result.Whitelist = @($effectiveWhitelist)
        $result.BlockedSubdomains = @($filteredBlockedSubdomains)
        $result.BlockedPaths = @($filteredBlockedPaths)
    }

    Write-OpenPathLog "Parsed: $($result.Whitelist.Count) whitelisted, $($result.BlockedSubdomains.Count) blocked subdomains, $($result.BlockedPaths.Count) blocked paths, disabled=$($result.IsDisabled)"

    # Validate that the downloaded content looks like a real whitelist.
    # A valid policy may legitimately contain a single allowed domain.
    $validDomains = $result.Whitelist | Where-Object { Test-OpenPathDomainFormat -Domain $_ }
    $minRequiredDomains = 1
    if ($validDomains.Count -lt $minRequiredDomains) {
        Write-OpenPathLog "Downloaded whitelist appears invalid ($($validDomains.Count) valid domains, minimum $minRequiredDomains required)" -Level ERROR
        throw "Invalid whitelist content: insufficient valid domains ($($validDomains.Count)/$minRequiredDomains)"
    }

    if ($newEtag) {
        try {
            $dir = Split-Path $etagPath -Parent
            if (-not (Test-Path $dir)) {
                New-Item -ItemType Directory -Path $dir -Force | Out-Null
            }
            $newEtag | Set-Content -Path $etagPath -Encoding ASCII
        }
        catch {
            # Non-fatal
        }
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

    $authToken = ''
    if ($config.PSObject.Properties['whitelistUrl'] -and $config.whitelistUrl) {
        $authToken = Get-OpenPathMachineTokenFromWhitelistUrl -WhitelistUrl ([string]$config.whitelistUrl)
    }

    if (-not $authToken -and $config.PSObject.Properties['healthApiSecret'] -and $config.healthApiSecret) {
        $authToken = [string]$config.healthApiSecret
    }
    elseif (-not $authToken -and $env:OPENPATH_HEALTH_API_SECRET) {
        $authToken = [string]$env:OPENPATH_HEALTH_API_SECRET
    }

    $payload = @{
        json = @{
            hostname = Get-OpenPathMachineName
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
    if ($authToken) {
        $headers['Authorization'] = "Bearer $authToken"
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

function Get-OpenPathMachineTokenFromWhitelistUrl {
    <#
    .SYNOPSIS
        Extracts machine token from tokenized whitelist URL
    .PARAMETER WhitelistUrl
        URL formatted as .../w/<token>/whitelist.txt
    #>
    param(
        [string]$WhitelistUrl
    )

    if (-not $WhitelistUrl) {
        return $null
    }

    if ($WhitelistUrl -match '/w/([^/]+)/') {
        return [string]$Matches[1]
    }

    return $null
}

function Compare-OpenPathVersion {
    <#
    .SYNOPSIS
        Compares semantic-like versions and returns -1, 0, or 1
    #>
    param(
        [string]$CurrentVersion,
        [string]$TargetVersion
    )

    $currentMatch = [regex]::Match([string]$CurrentVersion, '\d+(?:\.\d+){0,3}')
    $targetMatch = [regex]::Match([string]$TargetVersion, '\d+(?:\.\d+){0,3}')

    $currentNormalized = if ($currentMatch.Success) { $currentMatch.Value } else { '0.0.0' }
    $targetNormalized = if ($targetMatch.Success) { $targetMatch.Value } else { '0.0.0' }

    try {
        $currentParsed = [version]$currentNormalized
        $targetParsed = [version]$targetNormalized
        return $currentParsed.CompareTo($targetParsed)
    }
    catch {
        return [string]::Compare($currentNormalized, $targetNormalized, $true)
    }
}

function Invoke-OpenPathAgentSelfUpdate {
    <#
    .SYNOPSIS
        Performs silent software self-update against the current OpenPath server
    .PARAMETER CheckOnly
        Only check if update is available
    .PARAMETER Silent
        Suppress interactive output (logs are still written)
    #>
    [CmdletBinding()]
    param(
        [switch]$CheckOnly,
        [switch]$Silent
    )

    function Write-SelfUpdateMessage {
        param(
            [Parameter(Mandatory = $true)]
            [string]$Message,

            [ValidateSet('INFO', 'WARN', 'ERROR')]
            [string]$Level = 'INFO'
        )

        Write-OpenPathLog "Self-update: $Message" -Level $Level

        if ($Silent) {
            return
        }

        $color = switch ($Level) {
            'ERROR' { 'Red' }
            'WARN' { 'Yellow' }
            default { 'Cyan' }
        }

        Write-Host $Message -ForegroundColor $color
    }

    $config = $null
    try {
        $config = Get-OpenPathConfig
    }
    catch {
        $message = 'Configuration unavailable for self-update'
        Write-SelfUpdateMessage -Message $message -Level ERROR
        return [PSCustomObject]@{
            Success = $false
            Updated = $false
            Message = $message
        }
    }

    $apiUrl = if ($config.PSObject.Properties['apiUrl']) { [string]$config.apiUrl } else { '' }
    $whitelistUrl = if ($config.PSObject.Properties['whitelistUrl']) { [string]$config.whitelistUrl } else { '' }
    $currentVersion = if ($config.PSObject.Properties['version'] -and $config.version) {
        [string]$config.version
    }
    else {
        '0.0.0'
    }

    if (-not $apiUrl -or -not $whitelistUrl) {
        $message = 'Classroom mode is not configured; self-update skipped'
        Write-SelfUpdateMessage -Message $message -Level WARN
        return [PSCustomObject]@{
            Success = $false
            Updated = $false
            Message = $message
        }
    }

    $machineToken = Get-OpenPathMachineTokenFromWhitelistUrl -WhitelistUrl $whitelistUrl
    if (-not $machineToken) {
        $message = 'Could not extract machine token from whitelist URL'
        Write-SelfUpdateMessage -Message $message -Level ERROR
        return [PSCustomObject]@{
            Success = $false
            Updated = $false
            Message = $message
        }
    }

    $apiBaseUrl = $apiUrl.TrimEnd('/')
    $headers = @{ Authorization = "Bearer $machineToken" }

    $manifest = $null
    try {
        $manifest = Invoke-RestMethod -Uri "$apiBaseUrl/api/agent/windows/latest.json" -Method Get -Headers $headers -TimeoutSec 30 -ErrorAction Stop
    }
    catch {
        $message = "Manifest download failed: $_"
        Write-SelfUpdateMessage -Message $message -Level WARN
        return [PSCustomObject]@{
            Success = $false
            Updated = $false
            Message = $message
        }
    }

    if (-not $manifest -or -not $manifest.version -or -not $manifest.files) {
        $message = 'Invalid manifest payload received from server'
        Write-SelfUpdateMessage -Message $message -Level ERROR
        return [PSCustomObject]@{
            Success = $false
            Updated = $false
            Message = $message
        }
    }

    $targetVersion = [string]$manifest.version
    $comparison = Compare-OpenPathVersion -CurrentVersion $currentVersion -TargetVersion $targetVersion
    if ($comparison -ge 0) {
        $message = "Agent already up to date (current=$currentVersion)"
        Write-SelfUpdateMessage -Message $message
        return [PSCustomObject]@{
            Success = $true
            Updated = $false
            CurrentVersion = $currentVersion
            TargetVersion = $targetVersion
            Message = $message
        }
    }

    $updateAvailableMessage = "Agent update available: $currentVersion -> $targetVersion"
    Write-SelfUpdateMessage -Message $updateAvailableMessage

    if ($CheckOnly) {
        return [PSCustomObject]@{
            Success = $true
            Updated = $false
            CurrentVersion = $currentVersion
            TargetVersion = $targetVersion
            Message = $updateAvailableMessage
        }
    }

    $mutex = $null
    $lockAcquired = $false

    try {
        $mutex = [System.Threading.Mutex]::new($false, 'Global\OpenPathAgentUpdateLock')
        try {
            $lockAcquired = $mutex.WaitOne(0)
        }
        catch [System.Threading.AbandonedMutexException] {
            $lockAcquired = $true
            Write-SelfUpdateMessage -Message 'Update lock was abandoned by previous process, continuing' -Level WARN
        }

        if (-not $lockAcquired) {
            $message = 'Another self-update process is already running'
            Write-SelfUpdateMessage -Message $message -Level WARN
            return [PSCustomObject]@{
                Success = $false
                Updated = $false
                Message = $message
            }
        }

        $manifestFiles = @($manifest.files)
        if ($manifestFiles.Count -eq 0) {
            throw 'Manifest did not include files to update'
        }

        $updateRoot = Join-Path $script:OpenPathRoot 'data\agent-update'
        $stagingRoot = Join-Path $updateRoot ("staging-$targetVersion")

        if (Test-Path $stagingRoot) {
            Remove-Item $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
        }

        New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

        $downloadedFiles = @()
        foreach ($file in $manifestFiles) {
            $manifestPath = [string]$file.path
            if ([string]::IsNullOrWhiteSpace($manifestPath)) {
                throw 'Manifest included empty file path'
            }

            if ($manifestPath.Contains('..')) {
                throw "Rejected unsafe file path from manifest: $manifestPath"
            }

            $relativePath = $manifestPath -replace '/', '\\'
            if ([System.IO.Path]::IsPathRooted($relativePath)) {
                throw "Rejected rooted file path from manifest: $manifestPath"
            }

            $stagedPath = Join-Path $stagingRoot $relativePath
            $stagedDirectory = Split-Path $stagedPath -Parent
            if (-not (Test-Path $stagedDirectory)) {
                New-Item -ItemType Directory -Path $stagedDirectory -Force | Out-Null
            }

            $encodedPath = [System.Uri]::EscapeDataString($manifestPath)
            $fileUrl = "$apiBaseUrl/api/agent/windows/file?path=$encodedPath"

            Invoke-WebRequest -Uri $fileUrl -Method Get -Headers $headers -OutFile $stagedPath -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop

            $expectedHash = if ($file.PSObject.Properties['sha256']) { [string]$file.sha256 } else { '' }
            if ($expectedHash) {
                $actualHash = (Get-FileHash -Path $stagedPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
                if ($actualHash -ne $expectedHash.ToLowerInvariant()) {
                    throw "Checksum mismatch for $manifestPath"
                }
            }

            $destinationPath = Join-Path $script:OpenPathRoot $relativePath
            $downloadedFiles += [PSCustomObject]@{
                RelativePath = $relativePath
                StagedPath = $stagedPath
                DestinationPath = $destinationPath
            }
        }

        Save-OpenPathIntegrityBackup | Out-Null

        foreach ($download in $downloadedFiles) {
            $destinationDir = Split-Path $download.DestinationPath -Parent
            if (-not (Test-Path $destinationDir)) {
                New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
            }

            Copy-Item -Path $download.StagedPath -Destination $download.DestinationPath -Force
        }

        if ($config.PSObject.Properties['version']) {
            $config.version = $targetVersion
        }
        else {
            $config | Add-Member -NotePropertyName version -NotePropertyValue $targetVersion
        }

        $updatedAt = Get-Date -Format 'o'
        if ($config.PSObject.Properties['lastAgentUpdateAt']) {
            $config.lastAgentUpdateAt = $updatedAt
        }
        else {
            $config | Add-Member -NotePropertyName lastAgentUpdateAt -NotePropertyValue $updatedAt
        }

        Set-OpenPathConfig -Config $config | Out-Null

        $updateInterval = 15
        if ($config.PSObject.Properties['updateIntervalMinutes']) {
            try {
                $candidate = [int]$config.updateIntervalMinutes
                if ($candidate -ge 1) {
                    $updateInterval = $candidate
                }
            }
            catch {
                # Keep default
            }
        }

        $watchdogInterval = 1
        if ($config.PSObject.Properties['watchdogIntervalMinutes']) {
            try {
                $candidate = [int]$config.watchdogIntervalMinutes
                if ($candidate -ge 1) {
                    $watchdogInterval = $candidate
                }
            }
            catch {
                # Keep default
            }
        }

        if (Get-Command -Name 'Register-OpenPathTask' -ErrorAction SilentlyContinue) {
            Register-OpenPathTask -UpdateIntervalMinutes $updateInterval -WatchdogIntervalMinutes $watchdogInterval | Out-Null
        }
        if (Get-Command -Name 'Enable-OpenPathTask' -ErrorAction SilentlyContinue) {
            Enable-OpenPathTask | Out-Null
        }
        if (Get-Command -Name 'Restart-AcrylicService' -ErrorAction SilentlyContinue) {
            Restart-AcrylicService | Out-Null
        }
        if (Get-Command -Name 'Start-OpenPathTask' -ErrorAction SilentlyContinue) {
            Start-OpenPathTask -TaskType SSE | Out-Null
        }

        New-OpenPathIntegrityBaseline | Out-Null

        $message = "Agent self-update applied successfully: $currentVersion -> $targetVersion"
        Write-SelfUpdateMessage -Message $message
        return [PSCustomObject]@{
            Success = $true
            Updated = $true
            CurrentVersion = $currentVersion
            TargetVersion = $targetVersion
            Message = $message
        }
    }
    catch {
        $message = "Self-update failed: $_"
        Write-SelfUpdateMessage -Message $message -Level ERROR
        return [PSCustomObject]@{
            Success = $false
            Updated = $false
            Message = $message
        }
    }
    finally {
        if ($lockAcquired -and $mutex) {
            try {
                $mutex.ReleaseMutex()
            }
            catch [System.ApplicationException] {
                # Ignore if mutex ownership changed unexpectedly
            }
        }
        if ($mutex) {
            $mutex.Dispose()
        }
    }
}

# Export module members
Export-ModuleMember -Function @(
    'Test-AdminPrivileges',
    'Write-OpenPathLog',
    'Get-OpenPathConfig',
    'Set-OpenPathConfig',
    'Set-OpenPathConfigValue',
    'Get-OpenPathFileAgeHours',
    'Get-HostFromUrl',
    'Get-OpenPathProtectedDomains',
    'ConvertTo-OpenPathMachineName',
    'Get-OpenPathMachineName',
    'Test-OpenPathDomainFormat',
    'Get-OpenPathRuntimeHealth',
    'Get-OpenPathDnsProbeDomains',
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
    'Send-OpenPathHealthReport',
    'Get-OpenPathMachineTokenFromWhitelistUrl',
    'New-OpenPathScopedMachineName',
    'New-OpenPathMachineRegistrationBody',
    'Resolve-OpenPathMachineRegistration',
    'Set-OpenPathMachineName',
    'Compare-OpenPathVersion',
    'Invoke-OpenPathAgentSelfUpdate'
)
