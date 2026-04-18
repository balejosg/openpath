function Get-AcrylicPath {
    $defaultPath = "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"
    try {
        $config = Get-OpenPathConfig
        if ($config.acrylicPath -and (Test-Path (Join-Path $config.acrylicPath 'AcrylicService.exe'))) {
            return $config.acrylicPath
        }
    }
    catch {
        Write-Debug "Config not available: $_"
    }

    $candidatePaths = @(
        $defaultPath,
        "$env:ProgramFiles\Acrylic DNS Proxy",
        "$env:ProgramData\chocolatey\lib\acrylic-dns-proxy\tools",
        "$env:ProgramData\chocolatey\lib\acrylic-dns-proxy"
    )

    if ($env:ChocolateyInstall) {
        $candidatePaths += @(
            (Join-Path $env:ChocolateyInstall 'lib\acrylic-dns-proxy\tools'),
            (Join-Path $env:ChocolateyInstall 'lib\acrylic-dns-proxy')
        )
    }

    foreach ($candidatePath in @($candidatePaths | Where-Object { $_ } | Select-Object -Unique)) {
        if (Test-Path (Join-Path $candidatePath 'AcrylicService.exe')) {
            return $candidatePath
        }
    }

    $searchRoots = @(
        "$env:ProgramData\chocolatey\lib\acrylic-dns-proxy",
        $(if ($env:ChocolateyInstall) { Join-Path $env:ChocolateyInstall 'lib\acrylic-dns-proxy' })
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

    foreach ($searchRoot in $searchRoots) {
        $serviceExecutable = Get-ChildItem -Path $searchRoot -Filter 'AcrylicService.exe' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($serviceExecutable) {
            return $serviceExecutable.DirectoryName
        }
    }
    return $null
}

function Test-AcrylicInstalled {
    $path = Get-AcrylicPath
    return ($null -ne $path -and (Test-Path "$path\AcrylicService.exe"))
}

function Register-AcrylicServiceFromPath {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$AcrylicPath)

    $servicePath = Join-Path $AcrylicPath 'AcrylicService.exe'
    if (-not (Test-Path $servicePath)) { return $false }

    $service = Get-Service -Name 'AcrylicDNSProxySvc' -ErrorAction SilentlyContinue
    if (-not $service) {
        $service = Get-Service -DisplayName '*Acrylic*' -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($service) { return $true }

    & $servicePath /INSTALL 2>$null
    Start-Sleep -Seconds 2
    return $true
}

function Install-AcrylicDNS {
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
    $installerVersion = "2.2.1"
    $installerUrl = "https://downloads.sourceforge.net/project/acrylic/Acrylic/$installerVersion/Acrylic-Portable.zip"
    $installerFallbackUrl = "https://sourceforge.net/projects/acrylic/files/Acrylic/$installerVersion/Acrylic-Portable.zip/download"
    $tempDir = "$env:TEMP\acrylic-install"
    $installDir = "${env:ProgramFiles(x86)}\Acrylic DNS Proxy"

    try {
        if (Test-Path $tempDir) {
            Remove-Item $tempDir -Recurse -Force
        }
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        Write-OpenPathLog "Downloading Acrylic..."
        $zipPath = "$tempDir\acrylic.zip"
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12

        $downloadError = $null
        foreach ($candidateUrl in @($installerUrl, $installerFallbackUrl)) {
            $webClient = $null
            try {
                if (Test-Path $zipPath) {
                    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
                }
                $webClient = New-Object System.Net.WebClient
                $webClient.Headers.Add('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OpenPathInstaller')
                $webClient.DownloadFile($candidateUrl, $zipPath)
                $downloadError = $null
                break
            }
            catch {
                $downloadError = $_
                Write-OpenPathLog "Acrylic download failed from ${candidateUrl}: $downloadError" -Level WARN
            }
            finally {
                if ($null -ne $webClient) {
                    $webClient.Dispose()
                }
            }
        }

        if ($downloadError) { throw $downloadError }

        Write-OpenPathLog "Extracting..."
        Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force
        if (-not (Test-Path $installDir)) {
            New-Item -ItemType Directory -Path $installDir -Force | Out-Null
        }
        $extractedDir = Get-ChildItem $tempDir -Directory | Select-Object -First 1
        if ($extractedDir) {
            Copy-Item "$($extractedDir.FullName)\*" $installDir -Recurse -Force
        }
        else {
            Copy-Item "$tempDir\*" $installDir -Recurse -Force -Exclude "*.zip"
        }
        Write-OpenPathLog "Installing Acrylic service..."
        if (Test-Path (Join-Path $installDir 'AcrylicService.exe')) {
            Register-AcrylicServiceFromPath -AcrylicPath $installDir | Out-Null
        }
        Write-OpenPathLog "Acrylic DNS Proxy installed successfully"
        return $true
    }
    catch {
        $directInstallError = $_
        Write-OpenPathLog "Direct Acrylic install failed: $directInstallError" -Level WARN
        $choco = Get-Command choco -ErrorAction SilentlyContinue
        if ($choco) {
            Write-OpenPathLog "Falling back to Chocolatey package acrylic-dns-proxy..."
            & $choco.Source upgrade acrylic-dns-proxy -y --no-progress
            $chocoExitCode = $LASTEXITCODE
            $validExitCodes = @(0, 1605, 1614, 1641, 3010)
            if ($validExitCodes -contains $chocoExitCode) {
                Start-Sleep -Seconds 2
                $acrylicPath = Get-AcrylicPath
                if ($acrylicPath -and (Register-AcrylicServiceFromPath -AcrylicPath $acrylicPath)) {
                    Write-OpenPathLog "Acrylic DNS Proxy installed successfully via Chocolatey"
                    return $true
                }
            }
            Write-OpenPathLog "Chocolatey fallback failed with exit code $chocoExitCode" -Level ERROR
        }
        Write-OpenPathLog "Failed to install Acrylic: $directInstallError" -Level ERROR
        return $false
    }
    finally {
        if (Test-Path $tempDir) {
            Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
