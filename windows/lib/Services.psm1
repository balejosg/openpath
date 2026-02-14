# OpenPath Services Module for Windows
# Manages Task Scheduler tasks for periodic updates

# Import common functions
$modulePath = Split-Path $PSScriptRoot -Parent
Import-Module "$modulePath\lib\Common.psm1" -Force -ErrorAction SilentlyContinue

$script:TaskPrefix = "OpenPath"

function Register-OpenPathTask {
    <#
    .SYNOPSIS
        Registers all scheduled tasks for whitelist system
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [int]$UpdateIntervalMinutes = 15,
        [int]$WatchdogIntervalMinutes = 1
    )

    if (-not $PSCmdlet.ShouldProcess("Task Scheduler", "Register OpenPath scheduled tasks")) {
        return $false
    }

    Write-OpenPathLog "Registering scheduled tasks..."

    $openPathRoot = "C:\OpenPath"
    
    # Task 1: Update OpenPath (every 5 minutes)
    $updateAction = New-ScheduledTaskAction -Execute "PowerShell.exe" `
        -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$openPathRoot\scripts\Update-OpenPath.ps1`""
    
    $updateTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
        -RepetitionInterval (New-TimeSpan -Minutes $UpdateIntervalMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 9999)
    
    $updatePrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
    
    $updateSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    
    Register-ScheduledTask -TaskName "$script:TaskPrefix-Update" `
        -Action $updateAction `
        -Trigger $updateTrigger `
        -Principal $updatePrincipal `
        -Settings $updateSettings `
        -Force | Out-Null
    
    Write-OpenPathLog "Registered: $script:TaskPrefix-Update (every $UpdateIntervalMinutes min)"
    
    # Task 2: Watchdog (every 1 minute)
    $watchdogAction = New-ScheduledTaskAction -Execute "PowerShell.exe" `
        -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$openPathRoot\scripts\Test-DNSHealth.ps1`""
    
    $watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes $WatchdogIntervalMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 9999)
    
    Register-ScheduledTask -TaskName "$script:TaskPrefix-Watchdog" `
        -Action $watchdogAction `
        -Trigger $watchdogTrigger `
        -Principal $updatePrincipal `
        -Settings $updateSettings `
        -Force | Out-Null
    
    Write-OpenPathLog "Registered: $script:TaskPrefix-Watchdog (every $WatchdogIntervalMinutes min)"
    
    # Task 3: Startup task (run update on boot)
    $startupTrigger = New-ScheduledTaskTrigger -AtStartup
    
    Register-ScheduledTask -TaskName "$script:TaskPrefix-Startup" `
        -Action $updateAction `
        -Trigger $startupTrigger `
        -Principal $updatePrincipal `
        -Settings $updateSettings `
        -Force | Out-Null
    
    Write-OpenPathLog "Registered: $script:TaskPrefix-Startup (at boot)"
    
    # Task 4: SSE Listener (persistent, starts at boot)
    $sseAction = New-ScheduledTaskAction -Execute "PowerShell.exe" `
        -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$openPathRoot\scripts\Start-SSEListener.ps1`""
    
    $sseTrigger = New-ScheduledTaskTrigger -AtStartup
    
    $sseSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 9999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Days 0)
    
    Register-ScheduledTask -TaskName "$script:TaskPrefix-SSE" `
        -Action $sseAction `
        -Trigger $sseTrigger `
        -Principal $updatePrincipal `
        -Settings $sseSettings `
        -Force | Out-Null
    
    Write-OpenPathLog "Registered: $script:TaskPrefix-SSE (persistent SSE listener)"
    
    return $true
}

function Unregister-OpenPathTask {
    <#
    .SYNOPSIS
        Removes all whitelist scheduled tasks
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Task Scheduler", "Remove OpenPath scheduled tasks")) {
        return
    }

    Write-OpenPathLog "Removing scheduled tasks..."

    $tasks = Get-ScheduledTask -TaskName "$script:TaskPrefix-*" -ErrorAction SilentlyContinue
    
    foreach ($task in $tasks) {
        try {
            Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false
            Write-OpenPathLog "Removed task: $($task.TaskName)"
        }
        catch {
            Write-OpenPathLog "Failed to remove $($task.TaskName): $_" -Level WARN
        }
    }
}

function Get-OpenPathTaskStatus {
    <#
    .SYNOPSIS
        Gets status of all whitelist tasks
    #>
    $tasks = Get-ScheduledTask -TaskName "$script:TaskPrefix-*" -ErrorAction SilentlyContinue
    
    $status = @()
    foreach ($task in $tasks) {
        $info = Get-ScheduledTaskInfo -TaskName $task.TaskName -ErrorAction SilentlyContinue
        $status += [PSCustomObject]@{
            Name = $task.TaskName
            State = $task.State
            LastRunTime = $info.LastRunTime
            LastResult = $info.LastTaskResult
            NextRunTime = $info.NextRunTime
        }
    }
    
    return $status
}

function Start-OpenPathTask {
    <#
    .SYNOPSIS
        Manually starts a whitelist task
    .PARAMETER TaskType
        Type of task: Update, Watchdog, or Startup
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [ValidateSet("Update", "Watchdog", "Startup", "SSE")]
        [string]$TaskType = "Update"
    )

    $taskName = "$script:TaskPrefix-$TaskType"

    if (-not $PSCmdlet.ShouldProcess($taskName, "Start scheduled task")) {
        return $false
    }

    try {
        Start-ScheduledTask -TaskName $taskName
        Write-OpenPathLog "Started task: $taskName"
        return $true
    }
    catch {
        Write-OpenPathLog "Failed to start $taskName : $_" -Level ERROR
        return $false
    }
}

function Enable-OpenPathTask {
    <#
    .SYNOPSIS
        Enables all whitelist scheduled tasks
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Task Scheduler", "Enable OpenPath scheduled tasks")) {
        return
    }

    Get-ScheduledTask -TaskName "$script:TaskPrefix-*" -ErrorAction SilentlyContinue |
        Enable-ScheduledTask | Out-Null
    Write-OpenPathLog "All openpath tasks enabled"
}

function Disable-OpenPathTask {
    <#
    .SYNOPSIS
        Disables all whitelist scheduled tasks
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess("Task Scheduler", "Disable OpenPath scheduled tasks")) {
        return
    }

    Get-ScheduledTask -TaskName "$script:TaskPrefix-*" -ErrorAction SilentlyContinue |
        Disable-ScheduledTask | Out-Null
    Write-OpenPathLog "All openpath tasks disabled"
}

# Export module members
Export-ModuleMember -Function @(
    'Register-OpenPathTask',
    'Unregister-OpenPathTask',
    'Get-OpenPathTaskStatus',
    'Start-OpenPathTask',
    'Enable-OpenPathTask',
    'Disable-OpenPathTask'
)
