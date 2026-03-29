# OpenPath Native Messaging Host for Windows
# Runs under the logged-in Firefox user context and reads only the
# browser-readable mirror staged beneath C:\OpenPath\browser-extension\firefox\native.

$ErrorActionPreference = 'Stop'

$script:NativeRoot = Split-Path -Parent $PSCommandPath
$script:StatePath = Join-Path $script:NativeRoot 'native-state.json'
$script:WhitelistPath = Join-Path $script:NativeRoot 'whitelist.txt'
$script:LogPath = Join-Path $script:NativeRoot 'native-host.log'
$script:UpdateTaskName = 'OpenPath-Update'
$script:MaxDomains = 50
$script:MaxMessageBytes = 1MB

function Write-NativeHostLog {
    param(
        [string]$Message
    )

    try {
        $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -Path $script:LogPath -Value "[$timestamp] $Message" -Encoding UTF8
    }
    catch {
        # Logging must never break protocol handling.
    }
}

function Read-NativeState {
    if (-not (Test-Path $script:StatePath)) {
        return [PSCustomObject]@{}
    }

    try {
        return Get-Content $script:StatePath -Raw | ConvertFrom-Json
    }
    catch {
        Write-NativeHostLog "Failed to parse native state: $_"
        return [PSCustomObject]@{}
    }
}

function Get-WhitelistSections {
    $result = [ordered]@{
        Whitelist = @()
        BlockedPaths = @()
    }

    if (-not (Test-Path $script:WhitelistPath)) {
        return [PSCustomObject]$result
    }

    $section = 'WHITELIST'
    foreach ($line in Get-Content $script:WhitelistPath -ErrorAction SilentlyContinue) {
        $trimmed = [string]$line
        $trimmed = $trimmed.Trim()

        if (-not $trimmed) {
            continue
        }

        if ($trimmed -match '^##\s*(.+)$') {
            $section = $Matches[1].Trim().ToUpperInvariant()
            continue
        }

        if ($trimmed.StartsWith('#')) {
            continue
        }

        switch ($section) {
            'WHITELIST' { $result.Whitelist += $trimmed }
            'BLOCKED-PATHS' { $result.BlockedPaths += $trimmed }
        }
    }

    return [PSCustomObject]$result
}

function Get-MachineTokenFromWhitelistUrl {
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

function Resolve-DomainIp {
    param(
        [string]$Domain
    )

    try {
        $record = Resolve-DnsName -Name $Domain -DnsOnly -ErrorAction Stop |
            Where-Object { $_.IPAddress } |
            Select-Object -First 1
        if ($record -and $record.IPAddress) {
            return [string]$record.IPAddress
        }
    }
    catch {
        return $null
    }

    return $null
}

function Invoke-UpdateTask {
    try {
        $null = & schtasks.exe /Run /TN $script:UpdateTaskName 2>$null
        if ($LASTEXITCODE -ne 0) {
            return @{
                success = $false
                action = 'update-whitelist'
                error = "schtasks exit code $LASTEXITCODE"
            }
        }

        return @{
            success = $true
            action = 'update-whitelist'
            message = 'OpenPath update task triggered'
        }
    }
    catch {
        return @{
            success = $false
            action = 'update-whitelist'
            error = [string]$_
        }
    }
}

function Handle-Message {
    param(
        [AllowNull()]
        [object]$Message
    )

    if (-not ($Message -is [System.Collections.IDictionary]) -and -not $Message.PSObject) {
        return @{ success = $false; error = 'Invalid message format' }
    }

    $state = Read-NativeState
    $sections = Get-WhitelistSections
    $action = [string]$Message.action

    switch ($action) {
        'ping' {
            return @{
                success = $true
                action = 'ping'
                message = 'pong'
                version = if ($state.PSObject.Properties['version']) { [string]$state.version } else { '' }
            }
        }

        'get-hostname' {
            $hostname = if ($state.PSObject.Properties['machineName'] -and $state.machineName) {
                [string]$state.machineName
            }
            else {
                [string]$env:COMPUTERNAME
            }

            return @{
                success = $true
                action = 'get-hostname'
                hostname = $hostname
            }
        }

        'get-machine-token' {
            $whitelistUrl = if ($state.PSObject.Properties['whitelistUrl']) {
                [string]$state.whitelistUrl
            }
            else {
                ''
            }
            $token = Get-MachineTokenFromWhitelistUrl -WhitelistUrl $whitelistUrl
            if (-not $token) {
                return @{
                    success = $false
                    action = 'get-machine-token'
                    error = 'Machine token not available'
                }
            }

            return @{
                success = $true
                action = 'get-machine-token'
                token = $token
            }
        }

        'get-config' {
            $hostname = if ($state.PSObject.Properties['machineName'] -and $state.machineName) {
                [string]$state.machineName
            }
            else {
                [string]$env:COMPUTERNAME
            }

            $apiUrl = if ($state.PSObject.Properties['requestApiUrl'] -and $state.requestApiUrl) {
                ([string]$state.requestApiUrl).TrimEnd('/')
            }
            elseif ($state.PSObject.Properties['apiUrl'] -and $state.apiUrl) {
                ([string]$state.apiUrl).TrimEnd('/')
            }
            else {
                ''
            }

            $whitelistUrl = if ($state.PSObject.Properties['whitelistUrl']) {
                [string]$state.whitelistUrl
            }
            else {
                ''
            }

            $machineToken = Get-MachineTokenFromWhitelistUrl -WhitelistUrl $whitelistUrl
            if (-not $apiUrl) {
                return @{
                    success = $false
                    action = 'get-config'
                    error = 'API URL is not configured'
                }
            }

            return @{
                success = $true
                action = 'get-config'
                apiUrl = $apiUrl
                requestApiUrl = $apiUrl
                fallbackApiUrls = @()
                hostname = $hostname
                machineToken = if ($machineToken) { $machineToken } else { '' }
                whitelistUrl = $whitelistUrl
            }
        }

        'get-blocked-paths' {
            $paths = @($sections.BlockedPaths)
            $digest = ''
            if ($paths.Count -gt 0) {
                $sha = [System.Security.Cryptography.SHA256]::Create()
                try {
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($paths -join "`n"))
                    $digest = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
                }
                finally {
                    $sha.Dispose()
                }
            }

            $mtime = 0
            if (Test-Path $script:WhitelistPath) {
                $whitelistItem = Get-Item $script:WhitelistPath
                $mtime = [int]([DateTimeOffset]$whitelistItem.LastWriteTimeUtc).ToUnixTimeSeconds()
            }

            return @{
                success = $true
                action = 'get-blocked-paths'
                paths = $paths
                count = $paths.Count
                hash = $digest
                mtime = $mtime
                source = $script:WhitelistPath
            }
        }

        'check' {
            $domains = @($Message.domains)
            $validDomains = $domains |
                Where-Object { $_ -is [string] } |
                ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } |
                Where-Object { $_ -match '^[a-z0-9.-]+$' } |
                Select-Object -First $script:MaxDomains

            $whitelistSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
            foreach ($domain in @($sections.Whitelist)) {
                if ($domain) {
                    $null = $whitelistSet.Add([string]$domain)
                }
            }

            $results = @()
            foreach ($domain in $validDomains) {
                $resolvedIp = Resolve-DomainIp -Domain $domain
                $results += @{
                    domain = $domain
                    in_whitelist = $whitelistSet.Contains($domain)
                    resolved_ip = $resolvedIp
                }
            }

            return @{
                success = $true
                action = 'check'
                results = $results
            }
        }

        'update-whitelist' {
            return (Invoke-UpdateTask)
        }

        default {
            return @{
                success = $false
                error = "Unknown action: $action"
            }
        }
    }
}

function Read-NativeMessage {
    $stdin = [Console]::OpenStandardInput()
    $lengthBuffer = New-Object byte[] 4
    $read = $stdin.Read($lengthBuffer, 0, 4)
    if ($read -ne 4) {
        return $null
    }

    $length = [System.BitConverter]::ToInt32($lengthBuffer, 0)
    if ($length -le 0 -or $length -gt $script:MaxMessageBytes) {
        return $null
    }

    $payload = New-Object byte[] $length
    $offset = 0
    while ($offset -lt $length) {
        $chunk = $stdin.Read($payload, $offset, $length - $offset)
        if ($chunk -le 0) {
            return $null
        }
        $offset += $chunk
    }

    $json = [System.Text.Encoding]::UTF8.GetString($payload)
    return $json | ConvertFrom-Json
}

function Write-NativeMessage {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Message
    )

    $stdout = [Console]::OpenStandardOutput()
    $json = $Message | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $lengthBytes = [System.BitConverter]::GetBytes([int]$bytes.Length)
    $stdout.Write($lengthBytes, 0, $lengthBytes.Length)
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

Write-NativeHostLog 'Native host started'

while ($true) {
    try {
        $message = Read-NativeMessage
        if ($null -eq $message) {
            break
        }

        $response = Handle-Message -Message $message
        Write-NativeMessage -Message $response
    }
    catch {
        Write-NativeHostLog "Fatal protocol error: $_"
        try {
            Write-NativeMessage -Message @{
                success = $false
                error = [string]$_
            }
        }
        catch {
            break
        }
    }
}
