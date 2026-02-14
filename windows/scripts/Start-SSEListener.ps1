# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    SSE listener daemon for instant rule updates on Windows
.DESCRIPTION
    Maintains a persistent connection to the API's Server-Sent Events (SSE)
    endpoint. When a whitelist rule change is detected, immediately triggers
    Update-OpenPath.ps1 to apply the new rules without waiting for the
    15-minute fallback timer.

    Reconnects automatically with exponential backoff on connection failure.
#>

$ErrorActionPreference = "Stop"
$OpenPathRoot = "C:\OpenPath"

# Import common module
Import-Module "$OpenPathRoot\lib\Common.psm1" -Force

# =============================================================================
# Configuration
# =============================================================================

$script:LastUpdateTime = [datetime]::MinValue
$script:UpdateScript = "$OpenPathRoot\scripts\Update-OpenPath.ps1"
$script:UpdateJobName = "OpenPath-SSE-Update"

function Get-SSEConfig {
    <#
    .SYNOPSIS
        Reads SSE configuration from config.json with defaults
    #>
    $config = Get-OpenPathConfig

    return @{
        WhitelistUrl    = $config.whitelistUrl
        ReconnectMin    = if ($config.PSObject.Properties['sseReconnectMin']) { $config.sseReconnectMin } else { 5 }
        ReconnectMax    = if ($config.PSObject.Properties['sseReconnectMax']) { $config.sseReconnectMax } else { 60 }
        UpdateCooldown  = if ($config.PSObject.Properties['sseUpdateCooldown']) { $config.sseUpdateCooldown } else { 10 }
    }
}

function Get-MachineToken {
    <#
    .SYNOPSIS
        Extracts machine token from the whitelist URL
    .DESCRIPTION
        URL format: https://server:3000/w/<TOKEN>/whitelist.txt
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$WhitelistUrl
    )

    if ($WhitelistUrl -match '/w/([^/]+)/') {
        return $Matches[1]
    }

    Write-OpenPathLog "Cannot extract machine token from whitelist URL" -Level ERROR
    throw "Invalid whitelist URL format — cannot extract machine token"
}

function Get-SSEUrl {
    <#
    .SYNOPSIS
        Derives the SSE endpoint URL from the whitelist URL
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$WhitelistUrl
    )

    $token = Get-MachineToken -WhitelistUrl $WhitelistUrl

    # Extract base URL (scheme + host)
    if ($WhitelistUrl -match '^(https?://[^/]+)') {
        $baseUrl = $Matches[1]
    }
    else {
        throw "Cannot extract base URL from whitelist URL"
    }

    return "$baseUrl/api/machines/events?token=$token"
}

# =============================================================================
# Update Trigger (with debounce)
# =============================================================================

function Invoke-DebouncedUpdate {
    <#
    .SYNOPSIS
        Triggers an OpenPath update with cooldown debounce
    #>
    param(
        [int]$CooldownSeconds = 10
    )

    $now = Get-Date
    $elapsed = ($now - $script:LastUpdateTime).TotalSeconds

    if ($elapsed -lt $CooldownSeconds) {
        Write-OpenPathLog "SSE: Skipping update (last update ${elapsed}s ago, cooldown ${CooldownSeconds}s)"
        return
    }

    Write-OpenPathLog "SSE: Whitelist change detected - triggering immediate update"
    $script:LastUpdateTime = $now

    # Keep one update job at a time for this listener process
    Get-Job -Name $script:UpdateJobName -ErrorAction SilentlyContinue |
        Where-Object { $_.State -in @('Completed', 'Failed', 'Stopped') } |
        Remove-Job -Force -ErrorAction SilentlyContinue

    $runningJob = Get-Job -Name $script:UpdateJobName -State Running -ErrorAction SilentlyContinue
    if ($runningJob) {
        Write-OpenPathLog "SSE: Update already in progress - skipping duplicate trigger"
        return
    }

    # Run update in a background job so we don't block the SSE stream
    if (Test-Path $script:UpdateScript) {
        Start-Job -ScriptBlock {
            param($scriptPath)
            & $scriptPath
        } -Name $script:UpdateJobName -ArgumentList $script:UpdateScript | Out-Null
    }
    else {
        Write-OpenPathLog "SSE: Update script not found at $($script:UpdateScript)" -Level WARN
    }
}

# =============================================================================
# SSE Connection Loop
# =============================================================================

function Start-SSEConnection {
    <#
    .SYNOPSIS
        Maintains a persistent SSE connection with automatic reconnection
    #>
    $sseConfig = Get-SSEConfig

    if (-not $sseConfig.WhitelistUrl) {
        Write-OpenPathLog "SSE: No whitelist URL configured — cannot start SSE listener" -Level ERROR
        exit 1
    }

    $sseUrl = Get-SSEUrl -WhitelistUrl $sseConfig.WhitelistUrl
    $maskedUrl = $sseUrl -replace 'token=[^&]+', 'token=***'
    $backoff = $sseConfig.ReconnectMin

    Write-OpenPathLog "SSE listener starting (endpoint: $maskedUrl)"

    while ($true) {
        Write-OpenPathLog "SSE: Connecting..."

        $client = $null
        $response = $null
        $stream = $null
        $reader = $null

        try {
            # Use HttpClient for streaming SSE (Invoke-WebRequest buffers the whole response)
            $handler = [System.Net.Http.HttpClientHandler]::new()
            $client = [System.Net.Http.HttpClient]::new($handler)
            $client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan

            $request = [System.Net.Http.HttpRequestMessage]::new(
                [System.Net.Http.HttpMethod]::Get,
                $sseUrl
            )
            $request.Headers.Accept.Add(
                [System.Net.Http.Headers.MediaTypeWithQualityHeaderValue]::new("text/event-stream")
            )

            # ResponseHeadersRead allows streaming without buffering the entire body
            $response = $client.SendAsync(
                $request,
                [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
            ).GetAwaiter().GetResult()

            $response.EnsureSuccessStatusCode()

            $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            $reader = [System.IO.StreamReader]::new($stream)

            # Reset backoff on successful connection
            $backoff = $sseConfig.ReconnectMin

            while (-not $reader.EndOfStream) {
                $line = $reader.ReadLine()

                if (-not $line) { continue }

                # SSE format: "data: {json}"
                if ($line -match '^data:\s*(.+)$') {
                    $payload = $Matches[1]

                    if ($payload -match '"whitelist-changed"') {
                        Invoke-DebouncedUpdate -CooldownSeconds $sseConfig.UpdateCooldown
                    }
                    elseif ($payload -match '"connected"') {
                        Write-OpenPathLog "SSE: Connected to API - listening for rule changes"
                    }
                }
            }
        }
        catch {
            Write-OpenPathLog "SSE: Connection error: $_" -Level WARN
        }
        finally {
            # Clean up resources
            if ($reader) { $reader.Dispose() }
            if ($stream) { $stream.Dispose() }
            if ($response) { $response.Dispose() }
            if ($client) { $client.Dispose() }
        }

        # Reconnect with exponential backoff
        Write-OpenPathLog "SSE: Connection lost - reconnecting in ${backoff}s"
        Start-Sleep -Seconds $backoff

        $backoff = [Math]::Min($backoff * 2, $sseConfig.ReconnectMax)
    }
}

# =============================================================================
# Main
# =============================================================================

Start-SSEConnection
