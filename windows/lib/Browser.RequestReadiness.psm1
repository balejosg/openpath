# OpenPath browser request readiness facts for Windows

Import-Module "$PSScriptRoot\Common.psm1" -Force -ErrorAction Stop
Import-Module "$PSScriptRoot\Browser.FirefoxPolicy.psm1" -Force -ErrorAction Stop
Import-Module "$PSScriptRoot\Browser.FirefoxNativeHost.psm1" -Force -ErrorAction Stop

function Test-OpenPathBrowserRequestSetupReady {
    param(
        [AllowNull()]
        [object]$Config = $null
    )

    if (Get-Command -Name 'Test-OpenPathFirefoxNativeHostRequestSetupComplete' -ErrorAction SilentlyContinue) {
        return [bool](Test-OpenPathFirefoxNativeHostRequestSetupComplete -Config $Config)
    }

    if (-not $Config) {
        return $false
    }

    $apiUrl = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'apiUrl'
    $whitelistUrl = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'whitelistUrl'
    $classroom = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'classroom'
    $classroomId = Get-OpenPathConfigTrimmedValue -Config $Config -PropertyName 'classroomId'

    if ($apiUrl -notmatch '^https?://\S+$') {
        return $false
    }
    if ($whitelistUrl -notmatch '/w/[^/]+/whitelist\.txt($|[?#].*)') {
        return $false
    }

    return [bool]($classroom -or $classroomId)
}

function Test-OpenPathFirefoxNativeHostRegistrationProof {
    $manifestPath = Get-OpenPathFirefoxNativeHostManifestPath
    $wrapperPath = Get-OpenPathFirefoxNativeHostWrapperPath
    $statePath = Get-OpenPathFirefoxNativeStatePath

    if (-not (Test-Path $manifestPath)) {
        return $false
    }
    if (-not (Test-Path $wrapperPath)) {
        return $false
    }
    if (-not (Test-Path $statePath)) {
        return $false
    }

    $registryPaths = @(Get-OpenPathFirefoxNativeHostRegistryPaths)
    foreach ($registryPath in $registryPaths) {
        try {
            & reg.exe QUERY $registryPath /ve *> $null
            if ($LASTEXITCODE -eq 0) {
                return $true
            }
        }
        catch {
            # Keep probing remaining registry views.
        }
    }

    return $false
}

function Get-OpenPathBrowserRequestReadiness {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object]$Config = $null,

        [AllowNull()]
        [object]$ManagedExtensionPolicy = $null,

        [AllowNull()]
        [object]$NativeHostRegistered = $null,

        [AllowNull()]
        [object]$NativeHostStatePresent = $null,

        [AllowNull()]
        [object]$FirefoxMachinePolicyApplied = $null
    )

    if (-not $PSBoundParameters.ContainsKey('Config') -or -not $Config) {
        try {
            $Config = Get-OpenPathConfig
        }
        catch {
            $Config = $null
        }
    }

    if (-not $PSBoundParameters.ContainsKey('ManagedExtensionPolicy')) {
        $ManagedExtensionPolicy = Get-OpenPathFirefoxManagedExtensionPolicy
    }

    if (-not $PSBoundParameters.ContainsKey('NativeHostRegistered')) {
        $NativeHostRegistered = Test-OpenPathFirefoxNativeHostRegistrationProof
    }

    if (-not $PSBoundParameters.ContainsKey('NativeHostStatePresent')) {
        $NativeHostStatePresent = Test-Path (Get-OpenPathFirefoxNativeStatePath)
    }

    if (-not $PSBoundParameters.ContainsKey('FirefoxMachinePolicyApplied')) {
        $FirefoxMachinePolicyApplied = Test-OpenPathFirefoxMachineExtensionPolicy -ManagedExtensionPolicy $ManagedExtensionPolicy
    }

    $facts = [ordered]@{}
    $failureReasons = New-Object System.Collections.Generic.List[string]

    if (Test-OpenPathBrowserRequestSetupReady -Config $Config) {
        $facts.request_setup = 'ready'
    }
    else {
        $facts.request_setup = 'missing'
        $failureReasons.Add('request_setup_incomplete')
    }

    if ($ManagedExtensionPolicy -and $ManagedExtensionPolicy.ExtensionId -and $ManagedExtensionPolicy.InstallUrl) {
        $facts.firefox_managed_extension = 'ready'
    }
    else {
        $facts.firefox_managed_extension = 'missing'
        $failureReasons.Add('firefox_managed_extension_missing')
    }

    if ([bool]$FirefoxMachinePolicyApplied) {
        $facts.firefox_machine_policy = 'ready'
    }
    else {
        $facts.firefox_machine_policy = 'missing'
        $failureReasons.Add('firefox_machine_policy_missing')
    }

    if ([bool]$NativeHostRegistered -and [bool]$NativeHostStatePresent) {
        $facts.firefox_native_host = 'ready'
    }
    else {
        $facts.firefox_native_host = 'missing'
        $failureReasons.Add('firefox_native_host_missing')
    }

    return [PSCustomObject]@{
        Platform = 'windows'
        Ready = ($failureReasons.Count -eq 0)
        Facts = [PSCustomObject]$facts
        FailureReasons = @($failureReasons)
    }
}

Export-ModuleMember -Function @(
    'Get-OpenPathBrowserRequestReadiness',
    'Test-OpenPathBrowserRequestSetupReady',
    'Test-OpenPathFirefoxNativeHostRegistrationProof'
)
