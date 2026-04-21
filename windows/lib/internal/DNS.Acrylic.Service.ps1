function Clear-AcrylicCache {
    [CmdletBinding()] param()
    $acrylicPath = Get-AcrylicPath
    if (-not $acrylicPath) { return $false }
    $cachePath = "$acrylicPath\AcrylicCache.dat"
    if (-not (Test-Path $cachePath)) { return $true }
    try {
        Remove-Item $cachePath -Force -ErrorAction SilentlyContinue
        Write-OpenPathLog "Purged Acrylic address cache"
        return $true
    }
    catch {
        Write-OpenPathLog "Failed to purge Acrylic address cache: $_" -Level WARN
        return $false
    }
}

function Set-LocalDNS {
    [CmdletBinding(SupportsShouldProcess)] param()
    if (-not $PSCmdlet.ShouldProcess("Network adapters", "Set DNS to 127.0.0.1")) { return }
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
    Clear-DnsClientCache
    Write-OpenPathLog "DNS cache flushed"
}

function Restore-OriginalDNS {
    [CmdletBinding(SupportsShouldProcess)] param()
    if (-not $PSCmdlet.ShouldProcess("Network adapters", "Restore DNS to an upstream resolver")) { return }
    Write-OpenPathLog "Restoring original DNS settings..."
    $primaryDns = Get-PrimaryDNS
    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
    foreach ($adapter in $adapters) {
        try {
            Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses $primaryDns
            Write-OpenPathLog "Reset DNS for adapter: $($adapter.Name) to $primaryDns"
        }
        catch {
            Write-OpenPathLog "Failed to reset DNS for $($adapter.Name): $_" -Level WARN
        }
    }
    Clear-DnsClientCache
}

function Get-AcrylicService {
    $service = Get-Service -Name 'AcrylicDNSProxySvc' -ErrorAction SilentlyContinue
    if ($service) { return $service }

    return Get-Service -DisplayName '*Acrylic*' -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Wait-AcrylicServiceStatus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Status,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $service) { return $null }

    if ($service.PSObject.Methods.Name -contains 'WaitForStatus') {
        try {
            $remainingSeconds = [Math]::Max(1, [int][Math]::Ceiling(($deadline - (Get-Date)).TotalSeconds))
            $service.WaitForStatus($Status, [TimeSpan]::FromSeconds($remainingSeconds))
        }
        catch {
            Write-OpenPathLog "Acrylic service wait via ServiceController failed: $_" -Level WARN
        }
    }

    do {
        $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
        if ($service -and ([string]$service.Status) -eq $Status) {
            return $service
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    return (Get-Service -Name $Name -ErrorAction SilentlyContinue)
}

function Ensure-AcrylicService {
    [CmdletBinding()]
    param(
        [switch]$Start
    )

    try {
        $acrylicPath = Get-AcrylicPath
        if (-not $acrylicPath) { return $false }

        $service = Get-AcrylicService
        if (-not $service -and (Test-Path (Join-Path $acrylicPath 'AcrylicService.exe'))) {
            Register-AcrylicServiceFromPath -AcrylicPath $acrylicPath | Out-Null
            Start-Sleep -Seconds 2
            $service = Get-AcrylicService
        }

        if (-not $service) {
            Write-OpenPathLog 'Acrylic service is not registered' -Level WARN
            return $false
        }

        if ($Start -and $service.Status -ne 'Running') {
            Start-Service -Name $service.Name -ErrorAction Stop
            $service = Wait-AcrylicServiceStatus -Name $service.Name -Status 'Running' -TimeoutSeconds 20
        }

        if ($Start) {
            return ($service.Status -eq 'Running')
        }

        return $true
    }
    catch {
        Write-OpenPathLog "Failed to ensure Acrylic service: $_" -Level WARN
        return $false
    }
}

function Restart-AcrylicService {
    [CmdletBinding(SupportsShouldProcess)] param()
    if (-not $PSCmdlet.ShouldProcess("Acrylic DNS Proxy service", "Restart")) { return $false }
    Write-OpenPathLog "Restarting Acrylic service..."
    try {
        Clear-AcrylicCache | Out-Null
        $service = Get-AcrylicService
        if (-not $service) {
            Ensure-AcrylicService -Start | Out-Null
            $service = Get-AcrylicService
        }
        if ($service) {
            if ($service.Status -eq 'Running') {
                Restart-Service -Name $service.Name -Force
            }
            else {
                Start-Service -Name $service.Name -ErrorAction Stop
            }
            $service = Wait-AcrylicServiceStatus -Name $service.Name -Status 'Running' -TimeoutSeconds 20
            if ($service.Status -eq 'Running') {
                Write-OpenPathLog "Acrylic service restarted successfully"
                return $true
            }
        }
        $acrylicPath = Get-AcrylicPath
        if ($acrylicPath -and (Test-Path "$acrylicPath\RestartAcrylicService.bat")) {
            & cmd /c "$acrylicPath\RestartAcrylicService.bat" 2>$null
            Start-Sleep -Seconds 2
            if (Ensure-AcrylicService -Start) {
                Write-OpenPathLog "Acrylic service restarted via batch file"
                return $true
            }
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
    [CmdletBinding(SupportsShouldProcess)] param()
    if (-not $PSCmdlet.ShouldProcess("Acrylic DNS Proxy service", "Start")) { return $false }
    $acrylicPath = Get-AcrylicPath
    if (-not $acrylicPath) { return $false }
    try {
        if (Ensure-AcrylicService -Start) {
            return $true
        }
        if (Test-Path "$acrylicPath\StartAcrylicService.bat") {
            & cmd /c "$acrylicPath\StartAcrylicService.bat" 2>$null
            Start-Sleep -Seconds 2
            return (Ensure-AcrylicService -Start)
        }
        return $false
    }
    catch {
        Write-OpenPathLog "Error starting Acrylic: $_" -Level ERROR
        return $false
    }
}

function Stop-AcrylicService {
    [CmdletBinding(SupportsShouldProcess)] param()
    if (-not $PSCmdlet.ShouldProcess("Acrylic DNS Proxy service", "Stop")) { return $false }
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
