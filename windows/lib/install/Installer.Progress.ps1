function Write-InstallerNotice {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [string]$ForegroundColor = ''
    )

    if ($ForegroundColor) {
        Write-Host $Message -ForegroundColor $ForegroundColor
    }
    else {
        Write-Host $Message
    }
}

function Write-InstallerVerbose {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    Write-Verbose $Message
}

function Show-InstallerProgress {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Step,

        [Parameter(Mandatory = $true)]
        [int]$Total,

        [Parameter(Mandatory = $true)]
        [string]$Status
    )

    $percentComplete = [Math]::Min(100, [Math]::Max(0, [int](($Step / $Total) * 100)))
    if ($VerbosePreference -eq 'Continue') {
        Write-Verbose "[$Step/$Total] $Status"
        return
    }

    if ([Console]::IsOutputRedirected) {
        Write-Host "Progress ${Step}/${Total}: $Status"
        return
    }

    Write-Progress -Activity 'Installing OpenPath' -Status $Status -PercentComplete $percentComplete
}
