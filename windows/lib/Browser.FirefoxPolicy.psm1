# OpenPath Firefox managed extension policy helpers for Windows

$script:OpenPathRoot = "C:\OpenPath"
Import-Module "$PSScriptRoot\Common.psm1" -Force -ErrorAction Stop
Import-Module "$PSScriptRoot\Browser.Common.psm1" -Force -ErrorAction Stop

function Get-OpenPathFirefoxExtensionRoot {
    return "$script:OpenPathRoot\browser-extension\firefox"
}

function Get-OpenPathFirefoxReleaseMetadataPath {
    return "$script:OpenPathRoot\browser-extension\firefox-release\metadata.json"
}

function Get-OpenPathFirefoxReleaseXpiPath {
    return "$script:OpenPathRoot\browser-extension\firefox-release\openpath-firefox-extension.xpi"
}

function Get-OpenPathConfiguredFirefoxManagedExtensionPolicy {
    param(
        [AllowNull()]
        [object]$Config
    )

    $configuredExtensionId = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'firefoxExtensionId'
    $configuredInstallUrl = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'firefoxExtensionInstallUrl'

    if ($configuredExtensionId -and $configuredInstallUrl) {
        return [PSCustomObject]@{
            ExtensionId = $configuredExtensionId
            InstallUrl = $configuredInstallUrl
            Source = 'configured-install-url'
        }
    }

    if ($configuredExtensionId -or $configuredInstallUrl) {
        Write-OpenPathLog 'Firefox signed extension config is incomplete; both firefoxExtensionId and firefoxExtensionInstallUrl are required' -Level WARN
    }

    return $null
}

function Get-OpenPathFirefoxReleaseMetadata {
    $metadataPath = Get-OpenPathFirefoxReleaseMetadataPath
    if (-not (Test-Path $metadataPath)) {
        return $null
    }

    try {
        return Get-Content $metadataPath -Raw | ConvertFrom-Json
    }
    catch {
        Write-OpenPathLog "Failed to parse Firefox release extension metadata: $_" -Level WARN
        return $null
    }
}

function Get-OpenPathFirefoxReleaseExtensionId {
    param(
        [AllowNull()]
        [object]$Metadata
    )

    if ($Metadata -and $Metadata.PSObject.Properties['extensionId'] -and $Metadata.extensionId) {
        return ([string]$Metadata.extensionId).Trim()
    }

    return ''
}

function Resolve-OpenPathFirefoxReleaseInstallSpec {
    param(
        [AllowNull()]
        [object]$Config,

        [AllowNull()]
        [object]$Metadata
    )

    $apiBaseUrl = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'apiUrl'
    if ($apiBaseUrl) {
        $apiBaseUrl = $apiBaseUrl.TrimEnd('/')
    }

    $signedXpiPath = Get-OpenPathFirefoxReleaseXpiPath
    if ($apiBaseUrl -and (Test-Path $signedXpiPath)) {
        return [PSCustomObject]@{
            InstallUrl = "$apiBaseUrl/api/extensions/firefox/openpath.xpi"
            Source = 'managed-api'
        }
    }

    if (Test-Path $signedXpiPath) {
        return [PSCustomObject]@{
            InstallUrl = (ConvertTo-OpenPathFileUrl -Path $signedXpiPath)
            Source = 'staged-release'
        }
    }

    if ($Metadata -and $Metadata.PSObject.Properties['installUrl'] -and $Metadata.installUrl) {
        return [PSCustomObject]@{
            InstallUrl = ([string]$Metadata.installUrl).Trim()
            Source = 'metadata-install-url'
        }
    }

    return $null
}

function Get-OpenPathFirefoxManagedExtensionPolicy {
    $config = $null
    try {
        $config = Get-OpenPathConfig
    }
    catch {
        # Allow policy generation to proceed without a persisted config.
    }

    $configuredPolicy = Get-OpenPathConfiguredFirefoxManagedExtensionPolicy -Config $config
    if ($configuredPolicy) {
        return $configuredPolicy
    }

    $metadata = Get-OpenPathFirefoxReleaseMetadata
    if (-not $metadata) {
        return $null
    }

    $extensionId = Get-OpenPathFirefoxReleaseExtensionId -Metadata $metadata
    if (-not $extensionId) {
        Write-OpenPathLog 'Firefox release extension metadata is incomplete' -Level WARN
        return $null
    }

    $installSpec = Resolve-OpenPathFirefoxReleaseInstallSpec -Config $config -Metadata $metadata
    if (-not $installSpec) {
        Write-OpenPathLog 'Firefox release extension metadata did not resolve to a signed XPI source' -Level WARN
        return $null
    }

    return [PSCustomObject]@{
        ExtensionId = $extensionId
        InstallUrl = $installSpec.InstallUrl
        Source = $installSpec.Source
    }
}

function Sync-OpenPathFirefoxManagedExtensionPolicy {
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Firefox", "Configure managed extension policy")) {
        return $false
    }

    Write-OpenPathLog "Configuring Firefox managed extension policy..."

    $firefoxPaths = @(
        "$env:ProgramFiles\Mozilla Firefox\distribution",
        "${env:ProgramFiles(x86)}\Mozilla Firefox\distribution"
    )

    $policiesSet = $false
    $unsignedExtensionManifest = "$(Get-OpenPathFirefoxExtensionRoot)\manifest.json"
    $managedExtensionPolicy = Get-OpenPathFirefoxManagedExtensionPolicy
    $signedExtensionWarningWritten = $false

    foreach ($firefoxPath in $firefoxPaths) {
        $firefoxExe = Split-Path $firefoxPath -Parent
        if (-not (Test-Path "$firefoxExe\firefox.exe")) {
            continue
        }

        if (-not (Test-Path $firefoxPath)) {
            New-Item -ItemType Directory -Path $firefoxPath -Force | Out-Null
        }

        if ($managedExtensionPolicy) {
            $policies = @{
                policies = @{
                    ExtensionSettings = @{
                        $managedExtensionPolicy.ExtensionId = @{
                            installation_mode = 'force_installed'
                            install_url = $managedExtensionPolicy.InstallUrl
                        }
                    }
                }
            }
        }
        else {
            $policiesPath = "$firefoxPath\policies.json"
            if (Test-Path $policiesPath) {
                Remove-Item $policiesPath -Force -ErrorAction SilentlyContinue
                Write-OpenPathLog "Removed stale Firefox policies from: $policiesPath"
            }

            if (-not $signedExtensionWarningWritten) {
                if (Test-Path $unsignedExtensionManifest) {
                    Write-OpenPathLog 'Unsigned Firefox extension bundle detected, but Firefox Release requires a signed XPI distribution; removing Firefox policies until signed extension config is available' -Level WARN
                }
                else {
                    Write-OpenPathLog 'No signed Firefox extension distribution configured; removing Firefox policies until extension auto-install is available' -Level WARN
                }

                $signedExtensionWarningWritten = $true
            }

            continue
        }

        $policiesPath = "$firefoxPath\policies.json"
        $policiesJson = $policies | ConvertTo-Json -Depth 10
        Write-OpenPathUtf8NoBomFile -Path $policiesPath -Value $policiesJson

        Write-OpenPathLog "Firefox managed extension policy written to: $policiesPath"
        $policiesSet = $true
    }

    if (-not $policiesSet) {
        Write-OpenPathLog "Firefox not found or managed extension unavailable, skipping Firefox managed extension policy" -Level WARN
    }

    return $policiesSet
}

Export-ModuleMember -Function @(
    'Get-OpenPathFirefoxExtensionRoot',
    'Get-OpenPathFirefoxReleaseMetadataPath',
    'Get-OpenPathFirefoxReleaseXpiPath',
    'Get-OpenPathFirefoxManagedExtensionPolicy',
    'Sync-OpenPathFirefoxManagedExtensionPolicy'
)
