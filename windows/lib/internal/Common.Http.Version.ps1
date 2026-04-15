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
