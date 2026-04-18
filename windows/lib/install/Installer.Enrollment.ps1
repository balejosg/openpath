function Resolve-OpenPathInstallerEnrollmentContext {
    param(
        [string]$ApiBaseUrl = "",
        [string]$Classroom = "",
        [string]$ClassroomId = "",
        [string]$RegistrationToken = "",
        [string]$EnrollmentToken = "",
        [switch]$Unattended
    )

    if ($RegistrationToken -and $EnrollmentToken) {
        Write-Host "ERROR: -RegistrationToken and -EnrollmentToken cannot be used together" -ForegroundColor Red
        exit 1
    }

    if ($ClassroomId -and -not $EnrollmentToken) {
        Write-Host "ERROR: -ClassroomId requires -EnrollmentToken" -ForegroundColor Red
        exit 1
    }

    if ((($Classroom -or $ClassroomId -or $RegistrationToken -or $EnrollmentToken) -and -not $ApiBaseUrl)) {
        Write-Host "ERROR: -ApiUrl is required for classroom enrollment parameters" -ForegroundColor Red
        exit 1
    }

    $classroomModeRequested = [bool]$ApiBaseUrl -and (
        [bool]$Classroom -or
        [bool]$ClassroomId -or
        [bool]$RegistrationToken -or
        [bool]$EnrollmentToken -or
        [bool]$env:OPENPATH_TOKEN -or
        [bool]$env:OPENPATH_ENROLLMENT_TOKEN
    )

    if ($classroomModeRequested) {
        if (-not $EnrollmentToken -and -not $RegistrationToken -and $env:OPENPATH_ENROLLMENT_TOKEN) {
            $EnrollmentToken = $env:OPENPATH_ENROLLMENT_TOKEN
        }

        if (-not $EnrollmentToken -and -not $RegistrationToken -and $env:OPENPATH_TOKEN) {
            $RegistrationToken = $env:OPENPATH_TOKEN
        }

        if (-not $EnrollmentToken -and -not $RegistrationToken) {
            if ($Unattended) {
                Write-Host "ERROR: Classroom mode requires -EnrollmentToken or -RegistrationToken in unattended mode" -ForegroundColor Red
                exit 1
            }

            if ($ClassroomId) {
                $EnrollmentToken = Read-Host "Enter enrollment token"
            }
            else {
                $RegistrationToken = Read-Host "Enter registration token"
            }
        }

        if ($RegistrationToken -and -not $Classroom) {
            Write-Host "ERROR: -Classroom is required when using -RegistrationToken" -ForegroundColor Red
            exit 1
        }

        if ($RegistrationToken) {
            Write-Host "Validating registration token..." -ForegroundColor Yellow
            try {
                $validateBody = @{ token = $RegistrationToken } | ConvertTo-Json
                $validateResponse = Invoke-RestMethod -Uri "$ApiBaseUrl/api/setup/validate-token" `
                    -Method Post -Body $validateBody -ContentType "application/json" -ErrorAction Stop

                if (-not $validateResponse.valid) {
                    Write-Host "ERROR: Invalid registration token" -ForegroundColor Red
                    exit 1
                }
                Write-Host "  Registration token validated" -ForegroundColor Green
            }
            catch {
                Write-Host "ERROR: Failed to validate registration token: $_" -ForegroundColor Red
                exit 1
            }
        }
    }

    if ($RegistrationToken -and $EnrollmentToken) {
        Write-Host "ERROR: Enrollment token and registration token cannot be combined" -ForegroundColor Red
        exit 1
    }

    return [PSCustomObject]@{
        ClassroomModeRequested = [bool]$classroomModeRequested
        RegistrationToken = [string]$RegistrationToken
        EnrollmentToken = [string]$EnrollmentToken
    }
}

function Invoke-OpenPathInstallerEnrollment {
    param(
        [Parameter(Mandatory = $true)]
        [string]$OpenPathRoot,

        [Parameter(Mandatory = $true)]
        [string]$ApiBaseUrl,

        [string]$Classroom = "",

        [string]$ClassroomId = "",

        [string]$EnrollmentToken = "",

        [string]$RegistrationToken = "",

        [string]$MachineName = "",

        [switch]$Unattended
    )

    $result = [ordered]@{
        MachineRegistered = 'NOT_REQUESTED'
        WhitelistUrl = ''
        EnrollmentError = ''
    }

    Write-InstallerVerbose "Registering machine in classroom..."

    $enrollScript = "$OpenPathRoot\scripts\Enroll-Machine.ps1"
    if (-not (Test-Path $enrollScript)) {
        $result.MachineRegistered = 'FAILED'
        $result.EnrollmentError = "Enrollment script not found: $enrollScript"
        Write-Host "  Enrollment script not found: $enrollScript" -ForegroundColor Yellow
        return [PSCustomObject]$result
    }

    try {
        $enrollParams = @{
            ApiUrl = $ApiBaseUrl
            OpenPathRoot = $OpenPathRoot
        }
        if ($Classroom) {
            $enrollParams.Classroom = $Classroom
        }
        if ($ClassroomId) {
            $enrollParams.ClassroomId = $ClassroomId
        }
        if ($EnrollmentToken) {
            $enrollParams.EnrollmentToken = $EnrollmentToken
        }
        if ($MachineName) {
            $enrollParams.MachineName = $MachineName
        }
        if ($RegistrationToken) {
            $enrollParams.RegistrationToken = $RegistrationToken
            $enrollParams.SkipTokenValidation = $true
        }
        if ($Unattended) {
            $enrollParams.Unattended = $true
        }

        $enrollResult = & $enrollScript @enrollParams

        if ($enrollResult -and $enrollResult.Success) {
            $result.MachineRegistered = 'REGISTERED'
            if ($enrollResult.WhitelistUrl) {
                $result.WhitelistUrl = [string]$enrollResult.WhitelistUrl
            }
            Write-InstallerVerbose "  Machine registration completed"
        }
        else {
            $result.MachineRegistered = 'FAILED'
            $result.EnrollmentError = 'Machine registration returned an incomplete result'
            Write-Host "  Failed to register machine" -ForegroundColor Yellow
        }
    }
    catch {
        $result.MachineRegistered = 'FAILED'
        $result.EnrollmentError = [string]$_
        Write-Host "  Error registering machine: $_" -ForegroundColor Yellow
    }

    return [PSCustomObject]$result
}
