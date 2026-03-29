$ErrorActionPreference = 'Stop'

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$script:ArtifactsRoot = if ($env:OPENPATH_STUDENT_ARTIFACTS_DIR) {
    [System.IO.Path]::GetFullPath($env:OPENPATH_STUDENT_ARTIFACTS_DIR)
}
else {
    [System.IO.Path]::GetFullPath((Join-Path $script:RepoRoot 'tests\e2e\artifacts\windows-student-policy'))
}

$script:ApiPort = if ($env:OPENPATH_STUDENT_API_PORT) { [int]$env:OPENPATH_STUDENT_API_PORT } else { 3201 }
$script:FixturePort = if ($env:OPENPATH_STUDENT_FIXTURE_PORT) { [int]$env:OPENPATH_STUDENT_FIXTURE_PORT } else { 18082 }
$script:MachineName = if ($env:OPENPATH_STUDENT_MACHINE_NAME) { [string]$env:OPENPATH_STUDENT_MACHINE_NAME } else { 'windows-student-e2e' }

$script:ApiProcess = $null
$script:FixtureProcess = $null
$script:DatabaseMode = $null
$script:PostgresServiceName = $null
$script:PostgresBinDir = $null
$script:PostgresDataDir = $null
$script:PostgresLogPath = $null
$script:PostgresPort = 5432

function Write-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Message
    )

    Write-Host ""
    Write-Host $Message -ForegroundColor Cyan
}

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return $listener.LocalEndpoint.Port
    }
    finally {
        $listener.Stop()
    }
}

function Assert-LastExitCode {
    param(
        [Parameter(Mandatory = $true)][string]$Context
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$Context failed with exit code $LASTEXITCODE"
    }
}

function Quote-Argument {
    param(
        [Parameter(Mandatory = $true)][string]$Value
    )

    '"' + $Value.Replace('"', '""') + '"'
}

function Invoke-ProcessWithTimeout {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][int]$TimeoutMs,
        [Parameter(Mandatory = $true)][string]$Context,
        [Parameter(Mandatory = $true)][string]$OutputPath,
        [string]$WorkingDirectory = $script:RepoRoot
    )

    $errorPath = "$OutputPath.err"

    $process = Start-Process -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -NoNewWindow `
        -RedirectStandardOutput $OutputPath `
        -RedirectStandardError $errorPath `
        -PassThru

    if (-not $process.WaitForExit($TimeoutMs)) {
        try {
            $process.Kill($true)
        }
        catch {
            # Best effort.
        }

        $stdout = if (Test-Path $OutputPath) { Get-Content $OutputPath -Raw } else { '' }
        $stderr = if (Test-Path $errorPath) { Get-Content $errorPath -Raw } else { '' }
        throw "$Context timed out after $TimeoutMs ms. STDOUT:`n$stdout`nSTDERR:`n$stderr"
    }

    if (Test-Path $OutputPath) {
        Get-Content $OutputPath -Raw | Out-Host
    }

    if (Test-Path $errorPath) {
        $stderrContent = Get-Content $errorPath -Raw
        if ($stderrContent) {
            $stderrContent | Out-Host
        }
    }

    if ($process.ExitCode -ne 0) {
        throw "$Context failed with exit code $($process.ExitCode)"
    }
}

function Invoke-WebProbe {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 3
    )

    Invoke-WebRequest -Uri $Url -Headers $Headers -UseBasicParsing -TimeoutSec $TimeoutSec | Out-Null
}

function Wait-ForHttp {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [hashtable]$Headers = @{},
        [int]$Attempts = 40,
        [object]$Process = $null,
        [string]$ProcessName = 'background process',
        [string]$LogPath = ''
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
        if ($null -ne $Process) {
            if ($Process.HasExited) {
                $logOutput = if ($LogPath -and (Test-Path $LogPath)) { Get-Content $LogPath -Raw } else { '' }
                throw "$ProcessName exited before becoming ready. ExitCode=$($Process.ExitCode). Log:`n$logOutput"
            }
        }

        try {
            Invoke-WebProbe -Url $Url -Headers $Headers -TimeoutSec 3
            return
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    throw "Timed out waiting for HTTP endpoint: $Url"
}

function Ensure-ArtifactsDirectory {
    if (-not (Test-Path $script:ArtifactsRoot)) {
        New-Item -ItemType Directory -Path $script:ArtifactsRoot -Force | Out-Null
    }
}

function Ensure-SeleniumDependencies {
    Write-Step 'Ensuring Selenium package dependencies...'
    Push-Location (Join-Path $script:RepoRoot 'tests\selenium')
    try {
        npm install | Out-Host
        Assert-LastExitCode 'npm install (tests/selenium)'
    }
    finally {
        Pop-Location
    }
}

function Build-RequiredWorkspaces {
    Write-Step 'Building shared and Firefox extension workspaces...'
    Push-Location $script:RepoRoot
    try {
        npm run build --workspace=@openpath/shared | Out-Host
        Assert-LastExitCode 'npm run build --workspace=@openpath/shared'
        npm run build --workspace=@openpath/firefox-extension | Out-Host
        Assert-LastExitCode 'npm run build --workspace=@openpath/firefox-extension'
    }
    finally {
        Pop-Location
    }
}

function Start-TestPostgresDocker {
    Write-Step 'Starting PostgreSQL via Docker Compose...'
    docker compose -f "$script:RepoRoot\docker-compose.test.yml" up -d | Out-Host
    Assert-LastExitCode 'docker compose up -d'

    for ($attempt = 1; $attempt -le 30; $attempt += 1) {
        try {
            docker exec openpath-test-db pg_isready -U openpath -d openpath_test | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $script:DatabaseMode = 'docker'
                return
            }
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    throw 'Docker-based PostgreSQL did not become ready in time.'
}

function Get-PostgresBinDir {
    $command = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($command) {
        return Split-Path -Parent $command.Source
    }

    $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
        Sort-Object FullName |
        Select-Object -Last 1
    if ($candidate) {
        return Split-Path -Parent $candidate.FullName
    }

    return $null
}

function Invoke-PostgresSql {
    param(
        [Parameter(Mandatory = $true)][string]$Sql
    )

    if (-not $script:PostgresBinDir) {
        throw 'PostgreSQL bin directory is not configured.'
    }

    $psql = Join-Path $script:PostgresBinDir 'psql.exe'
    $outputPath = Join-Path $script:ArtifactsRoot 'psql-last.log'
    $sqlPath = Join-Path $script:ArtifactsRoot 'psql-last.sql'

    [System.IO.File]::WriteAllText($sqlPath, "$Sql`n", [System.Text.UTF8Encoding]::new($false))

    Invoke-ProcessWithTimeout -FilePath $psql `
        -ArgumentList @('-w', '-h', '127.0.0.1', '-p', [string]$script:PostgresPort, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', $sqlPath) `
        -TimeoutMs 30000 `
        -Context 'psql' `
        -OutputPath $outputPath
}

function Start-TestPostgresProcess {
    Write-Step 'Starting PostgreSQL via local process...'

    if (-not (Get-Command choco.exe -ErrorAction SilentlyContinue)) {
        throw 'Chocolatey is required to install PostgreSQL on the Windows runner.'
    }

    $script:PostgresBinDir = Get-PostgresBinDir
    if (-not $script:PostgresBinDir) {
        choco install postgresql16 --params '"/Password:openpath_test"' --no-progress -y | Out-Host
        Assert-LastExitCode 'choco install postgresql16'
        $script:PostgresBinDir = Get-PostgresBinDir
    }

    if (-not $script:PostgresBinDir) {
        throw 'Could not locate PostgreSQL binaries after installation.'
    }

    $tempRoot = if ($env:RUNNER_TEMP) {
        $env:RUNNER_TEMP
    }
    else {
        [System.IO.Path]::GetTempPath()
    }

    $script:PostgresDataDir = Join-Path $tempRoot ("openpath-postgres-" + [System.Guid]::NewGuid().ToString('N'))
    $script:PostgresLogPath = Join-Path $script:ArtifactsRoot 'postgres.log'

    $initdb = Join-Path $script:PostgresBinDir 'initdb.exe'
    $pgCtl = Join-Path $script:PostgresBinDir 'pg_ctl.exe'
    $pgIsReady = Join-Path $script:PostgresBinDir 'pg_isready.exe'

    Invoke-ProcessWithTimeout -FilePath $initdb `
        -ArgumentList @('-D', $script:PostgresDataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8') `
        -TimeoutMs 120000 `
        -Context 'initdb' `
        -OutputPath (Join-Path $script:ArtifactsRoot 'postgres-initdb.log')

    Invoke-ProcessWithTimeout -FilePath $pgCtl `
        -ArgumentList @(
            'start',
            '-D',
            (Quote-Argument -Value $script:PostgresDataDir),
            '-l',
            (Quote-Argument -Value $script:PostgresLogPath),
            '-o',
            (Quote-Argument -Value "-p $($script:PostgresPort)"),
            '-w'
        ) `
        -TimeoutMs 120000 `
        -Context 'pg_ctl start' `
        -OutputPath (Join-Path $script:ArtifactsRoot 'postgres-start.log')

    Write-Step 'Verifying PostgreSQL readiness and bootstrap SQL...'
    for ($attempt = 1; $attempt -le 30; $attempt += 1) {
        try {
            & $pgIsReady -h 127.0.0.1 -p $script:PostgresPort -U postgres -d postgres | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "PostgreSQL ready on attempt $attempt" -ForegroundColor DarkGray
                Invoke-PostgresSql -Sql "DO `$`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openpath') THEN CREATE ROLE openpath LOGIN PASSWORD 'openpath_test'; ELSE ALTER ROLE openpath WITH LOGIN PASSWORD 'openpath_test'; END IF; END `$`$;"
                Invoke-PostgresSql -Sql "DROP DATABASE IF EXISTS openpath_test WITH (FORCE);"
                Invoke-PostgresSql -Sql "CREATE DATABASE openpath_test OWNER openpath;"
                $script:DatabaseMode = 'local'
                return
            }
        }
        catch {
            Write-Host "PostgreSQL not ready yet (attempt $attempt): $_" -ForegroundColor DarkGray
            Start-Sleep -Seconds 1
        }
    }

    throw 'Local PostgreSQL process did not become ready in time.'
}

function Ensure-TestPostgres {
    try {
        if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
            docker info | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Start-TestPostgresDocker
                return
            }
        }
    }
    catch {
        Write-Host 'WARN: Docker PostgreSQL bootstrap unavailable; falling back to local PostgreSQL.' -ForegroundColor Yellow
    }

    Start-TestPostgresProcess
}

function Initialize-TestDatabase {
    Write-Step 'Running API E2E database setup...'
    Push-Location $script:RepoRoot
    try {
        $env:DB_HOST = '127.0.0.1'
        $env:DB_PORT = '5433'
        $env:DB_NAME = 'openpath_test'
        $env:DB_USER = 'openpath'
        $env:DB_PASSWORD = 'openpath_test'

        if ($script:DatabaseMode -eq 'local') {
            $env:DB_PORT = [string]$script:PostgresPort
        }

        npm run db:setup:e2e --workspace=@openpath/api | Out-Host
        Assert-LastExitCode 'npm run db:setup:e2e --workspace=@openpath/api'
    }
    finally {
        Pop-Location
    }
}

function Start-ApiServer {
    Write-Step "Starting API on port $($script:ApiPort)..."
    $apiLog = Join-Path $script:ArtifactsRoot 'api.log'
    $apiErrLog = Join-Path $script:ArtifactsRoot 'api.err.log'
    $dataDir = Join-Path $script:ArtifactsRoot 'api-data'
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

    $nodeCommand = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodeCommand) {
        throw 'node.exe was not found on PATH.'
    }

    $originalEnv = @{}
    foreach ($name in 'NODE_ENV','JWT_SECRET','SHARED_SECRET','DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','PORT','PUBLIC_URL','DATA_DIR','OPENPATH_FORCE_SERVER_START') {
        $originalEnv[$name] = (Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value
    }

    try {
        $env:NODE_ENV = 'test'
        $env:JWT_SECRET = 'openpath-student-policy-secret'
        $env:SHARED_SECRET = 'openpath-student-policy-shared'
        $env:DB_HOST = '127.0.0.1'
        $env:DB_PORT = if ($script:DatabaseMode -eq 'local') { [string]$script:PostgresPort } else { '5433' }
        $env:DB_NAME = 'openpath_test'
        $env:DB_USER = 'openpath'
        $env:DB_PASSWORD = 'openpath_test'
        $env:PORT = [string]$script:ApiPort
        $env:PUBLIC_URL = "http://127.0.0.1:$($script:ApiPort)"
        $env:DATA_DIR = $dataDir
        $env:OPENPATH_FORCE_SERVER_START = 'true'

        $script:ApiProcess = Start-Process -FilePath $nodeCommand `
            -ArgumentList @('--import', 'tsx', 'api/src/server.ts') `
            -WorkingDirectory $script:RepoRoot `
            -NoNewWindow `
            -RedirectStandardOutput $apiLog `
            -RedirectStandardError $apiErrLog `
            -PassThru
    }
    finally {
        foreach ($name in $originalEnv.Keys) {
            if ($null -eq $originalEnv[$name]) {
                Remove-Item "Env:$name" -ErrorAction SilentlyContinue
            }
            else {
                Set-Item "Env:$name" -Value $originalEnv[$name]
            }
        }
    }

    Wait-ForHttp -Url "http://127.0.0.1:$($script:ApiPort)/trpc/healthcheck.ready" -Process $script:ApiProcess -ProcessName 'API server process' -LogPath $apiLog
}

function Start-FixtureServer {
    Write-Step "Starting fixture server on port $($script:FixturePort)..."
    $fixtureLog = Join-Path $script:ArtifactsRoot 'fixture-server.log'
    $fixtureErrLog = Join-Path $script:ArtifactsRoot 'fixture-server.err.log'
    $nodeCommand = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodeCommand) {
        throw 'node.exe was not found on PATH.'
    }

    $script:FixtureProcess = Start-Process -FilePath $nodeCommand `
        -ArgumentList @('--import', 'tsx', 'tests/e2e/student-flow/fixture-server.ts', '--host', '0.0.0.0', '--port', [string]$script:FixturePort) `
        -WorkingDirectory $script:RepoRoot `
        -NoNewWindow `
        -RedirectStandardOutput $fixtureLog `
        -RedirectStandardError $fixtureErrLog `
        -PassThru

    Wait-ForHttp -Url "http://127.0.0.1:$($script:FixturePort)/ok" -Headers @{ Host = "portal.127.0.0.1.sslip.io:$($script:FixturePort)" } -Process $script:FixtureProcess -ProcessName 'fixture server process' -LogPath $fixtureLog
}

function Invoke-BackendHarnessBootstrap {
    param(
        [string]$ScenarioName = 'Windows Student Policy'
    )

    Write-Step 'Bootstrapping student-policy scenario...'
    $scenarioPath = Join-Path $script:ArtifactsRoot 'student-scenario.json'
    Push-Location $script:RepoRoot
    try {
        $scenarioJson = node --import tsx tests/e2e/student-flow/backend-harness.ts bootstrap `
            --api-url "http://127.0.0.1:$($script:ApiPort)" `
            --scenario-name $ScenarioName `
            --machine-hostname $script:MachineName
        Assert-LastExitCode 'backend harness bootstrap'

        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($scenarioPath, ($scenarioJson -join [Environment]::NewLine), $utf8NoBom)
    }
    finally {
        Pop-Location
    }

    return Get-Content $scenarioPath -Raw | ConvertFrom-Json
}

function New-FirefoxExtensionArchive {
    Write-Step 'Packaging Firefox extension XPI for Selenium...'
    $packagePath = Join-Path $script:ArtifactsRoot 'openpath-firefox-extension.xpi'
    if (Test-Path $packagePath) {
        Remove-Item $packagePath -Force
    }

    $stagingDir = Join-Path $script:ArtifactsRoot 'firefox-extension-xpi'
    if (Test-Path $stagingDir) {
        Remove-Item $stagingDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

    Copy-Item (Join-Path $script:RepoRoot 'firefox-extension\manifest.json') $stagingDir -Force
    Copy-Item (Join-Path $script:RepoRoot 'firefox-extension\dist') $stagingDir -Recurse -Force
    Copy-Item (Join-Path $script:RepoRoot 'firefox-extension\popup') $stagingDir -Recurse -Force
    Copy-Item (Join-Path $script:RepoRoot 'firefox-extension\blocked') $stagingDir -Recurse -Force
    Copy-Item (Join-Path $script:RepoRoot 'firefox-extension\native') $stagingDir -Recurse -Force
    Copy-Item (Join-Path $script:RepoRoot 'firefox-extension\icons') $stagingDir -Recurse -Force

    Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $packagePath -Force
    return $packagePath
}

function Ensure-FirefoxAndGeckodriver {
    Write-Step 'Ensuring Firefox and geckodriver are available...'

    if (-not (Get-Command choco.exe -ErrorAction SilentlyContinue)) {
        throw 'Chocolatey is required to install Firefox and geckodriver on the Windows runner.'
    }

    if (-not (Get-Command firefox.exe -ErrorAction SilentlyContinue)) {
        choco install firefox --no-progress -y | Out-Host
        Assert-LastExitCode 'choco install firefox'
    }

    if (-not (Get-Command geckodriver.exe -ErrorAction SilentlyContinue)) {
        choco install geckodriver --no-progress -y | Out-Host
        Assert-LastExitCode 'choco install geckodriver'
    }
}

function Get-EnrollmentTicket {
    param(
        [Parameter(Mandatory = $true)][pscustomobject]$Scenario
    )

    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$($script:ApiPort)/api/enroll/$($Scenario.classroom.id)/ticket" `
        -Headers @{ Authorization = "Bearer $($Scenario.auth.teacher.accessToken)" } `
        -Method Post

    return [string]$response.enrollmentToken
}

function Install-AndEnrollClient {
    param(
        [Parameter(Mandatory = $true)][pscustomobject]$Scenario,
        [bool]$InstallClient = $true
    )

    if ($InstallClient) {
        Write-Step 'Installing and enrolling the Windows OpenPath client...'

        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $script:RepoRoot 'windows\Install-OpenPath.ps1') `
            -WhitelistUrl $Scenario.machine.whitelistUrl `
            -ApiUrl "http://127.0.0.1:$($script:ApiPort)" `
            -Unattended

        if ($LASTEXITCODE -ne 0) {
            throw "Install-OpenPath.ps1 failed with exit code $LASTEXITCODE"
        }
    }
    else {
        Write-Step 'Reconfiguring existing Windows OpenPath client...'
    }

    $enrollmentToken = Get-EnrollmentTicket -Scenario $Scenario
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $script:RepoRoot 'windows\scripts\Enroll-Machine.ps1') `
        -ApiUrl "http://127.0.0.1:$($script:ApiPort)" `
        -ClassroomId $Scenario.classroom.id `
        -EnrollmentToken $enrollmentToken `
        -MachineName $script:MachineName `
        -Unattended

    if ($LASTEXITCODE -ne 0) {
        throw "Enroll-Machine.ps1 failed with exit code $LASTEXITCODE"
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\OpenPath\scripts\Update-OpenPath.ps1'
    if ($LASTEXITCODE -ne 0) {
        throw "Update-OpenPath.ps1 failed with exit code $LASTEXITCODE"
    }

    $scenarioPath = Join-Path $script:ArtifactsRoot 'student-scenario.json'
    $config = Get-Content 'C:\OpenPath\data\config.json' -Raw | ConvertFrom-Json
    $nodeCommand = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodeCommand) {
        throw 'node.exe was not found on PATH.'
    }

    & $nodeCommand --import tsx tests/e2e/student-flow/reconcile-student-scenario.ts `
        --scenario-file $scenarioPath `
        --whitelist-url $config.whitelistUrl
    Assert-LastExitCode 'student scenario reconciliation'
}

function Invoke-SeleniumStudentSuite {
    param(
        [Parameter(Mandatory = $true)][string]$ScenarioPath,
        [Parameter(Mandatory = $true)][string]$ExtensionArchivePath,
        [Parameter(Mandatory = $true)][string]$Mode
    )

    Push-Location (Join-Path $script:RepoRoot 'tests\selenium')
    try {
        $env:OPENPATH_STUDENT_SCENARIO_FILE = $ScenarioPath
        $env:OPENPATH_FIXTURE_PORT = [string]$script:FixturePort
        $env:OPENPATH_EXTENSION_PATH = $ExtensionArchivePath
        $env:OPENPATH_WHITELIST_PATH = 'C:\OpenPath\data\whitelist.txt'
        $env:OPENPATH_FORCE_UPDATE_COMMAND = 'powershell -NoLogo -File "C:\OpenPath\scripts\Update-OpenPath.ps1"'
        $env:OPENPATH_DISABLE_SSE_COMMAND = 'powershell -NoLogo -Command "Disable-ScheduledTask -TaskName ''OpenPath-SSE'' -ErrorAction SilentlyContinue; Stop-ScheduledTask -TaskName ''OpenPath-SSE'' -ErrorAction SilentlyContinue"'
        $env:OPENPATH_ENABLE_SSE_COMMAND = 'powershell -NoLogo -Command "Enable-ScheduledTask -TaskName ''OpenPath-SSE'' -ErrorAction SilentlyContinue; Start-ScheduledTask -TaskName ''OpenPath-SSE'' -ErrorAction SilentlyContinue"'
        $env:CI = 'true'
        $env:OPENPATH_STUDENT_MODE = $Mode

        $npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
        if (-not $npmCommand) {
            throw 'npm.cmd was not found on PATH.'
        }

        $logPath = Join-Path $script:ArtifactsRoot ("windows-student-policy-$Mode.log")
        $errorPath = Join-Path $script:ArtifactsRoot ("windows-student-policy-$Mode.err.log")
        $process = Start-Process -FilePath $npmCommand `
            -ArgumentList @('run', 'test:student-policy:ci') `
            -WorkingDirectory (Get-Location).Path `
            -NoNewWindow `
            -RedirectStandardOutput $logPath `
            -RedirectStandardError $errorPath `
            -PassThru

        if (-not $process.WaitForExit(1200000)) {
            try {
                $process.Kill($true)
            }
            catch {
                # Best effort.
            }

            $tail = if (Test-Path $logPath) { Get-Content $logPath -Raw } else { '' }
            $errorTail = if (Test-Path $errorPath) { Get-Content $errorPath -Raw } else { '' }
            throw "Windows student-policy Selenium ($Mode) timed out after 20 minutes. STDOUT:`n$tail`nSTDERR:`n$errorTail"
        }

        if (Test-Path $logPath) {
            Get-Content $logPath -Raw | Out-Host
        }

        if (Test-Path $errorPath) {
            $stderrContent = Get-Content $errorPath -Raw
            if ($stderrContent) {
                $stderrContent | Out-Host
            }
        }

        if ($process.ExitCode -ne 0) {
            throw "npm run test:student-policy:ci ($Mode) failed with exit code $($process.ExitCode)"
        }
    }
    finally {
        Remove-Item Env:\OPENPATH_STUDENT_SCENARIO_FILE -ErrorAction SilentlyContinue
        Remove-Item Env:\OPENPATH_FIXTURE_PORT -ErrorAction SilentlyContinue
        Remove-Item Env:\OPENPATH_EXTENSION_PATH -ErrorAction SilentlyContinue
        Remove-Item Env:\OPENPATH_WHITELIST_PATH -ErrorAction SilentlyContinue
        Remove-Item Env:\OPENPATH_FORCE_UPDATE_COMMAND -ErrorAction SilentlyContinue
        Remove-Item Env:\OPENPATH_DISABLE_SSE_COMMAND -ErrorAction SilentlyContinue
        Remove-Item Env:\OPENPATH_ENABLE_SSE_COMMAND -ErrorAction SilentlyContinue
        Remove-Item Env:\OPENPATH_STUDENT_MODE -ErrorAction SilentlyContinue
        Pop-Location
    }
}

function Write-WindowsDiagnostics {
    Write-Step 'Collecting Windows student-policy diagnostics...'

    $diagnosticPath = Join-Path $script:ArtifactsRoot 'windows-diagnostics.txt'
    $whitelistPath = 'C:\OpenPath\data\whitelist.txt'
    $logPath = 'C:\OpenPath\data\logs\openpath.log'

    @(
        '=== Scheduled Tasks ==='
        (Get-ScheduledTask -TaskName 'OpenPath-*' -ErrorAction SilentlyContinue | Format-List | Out-String)
        '=== Resolve-DnsName google.com ==='
        (Resolve-DnsName -Name 'google.com' -Server 127.0.0.1 -DnsOnly -ErrorAction SilentlyContinue | Out-String)
        '=== Whitelist ==='
        $(if (Test-Path $whitelistPath) { Get-Content $whitelistPath -Raw } else { 'Whitelist file missing' })
        '=== OpenPath Log Tail ==='
        $(if (Test-Path $logPath) { Get-Content $logPath -Tail 200 | Out-String } else { 'OpenPath log missing' })
    ) | Set-Content -Path $diagnosticPath -Encoding UTF8
}

function Stop-BackgroundJobs {
    foreach ($process in @($script:ApiProcess, $script:FixtureProcess)) {
        if ($null -ne $process -and -not $process.HasExited) {
            try {
                $process.Kill($true)
            }
            catch {
                # Best effort.
            }
        }
    }
}

function Cleanup-TestPostgres {
    if ($script:DatabaseMode -eq 'docker') {
        docker compose -f "$script:RepoRoot\docker-compose.test.yml" down | Out-Null
    }

    if ($script:DatabaseMode -eq 'local' -and $script:PostgresBinDir -and $script:PostgresDataDir) {
        $pgCtl = Join-Path $script:PostgresBinDir 'pg_ctl.exe'
        if (Test-Path $pgCtl) {
            & $pgCtl stop -D $script:PostgresDataDir -m fast | Out-Null
        }

        if (Test-Path $script:PostgresDataDir) {
            Remove-Item $script:PostgresDataDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-DebugDump {
    Write-WindowsDiagnostics
    foreach ($logPath in @(
        (Join-Path $script:ArtifactsRoot 'api.log'),
        (Join-Path $script:ArtifactsRoot 'api.err.log'),
        (Join-Path $script:ArtifactsRoot 'fixture-server.log'),
        (Join-Path $script:ArtifactsRoot 'fixture-server.err.log')
    )) {
        if (Test-Path $logPath) {
            Write-Host "===== $(Split-Path $logPath -Leaf) ====="
            Get-Content $logPath -Raw | Write-Host
        }
    }
}

try {
    Ensure-ArtifactsDirectory
    Build-RequiredWorkspaces
    Ensure-SeleniumDependencies
    Ensure-TestPostgres
    Initialize-TestDatabase
    Start-ApiServer
    Start-FixtureServer
    $scenario = Invoke-BackendHarnessBootstrap -ScenarioName 'Windows Student Policy SSE'
    $scenarioPath = Join-Path $script:ArtifactsRoot 'student-scenario.json'
    $extensionArchivePath = New-FirefoxExtensionArchive
    Ensure-FirefoxAndGeckodriver
    Install-AndEnrollClient -Scenario $scenario -InstallClient $true
    Invoke-SeleniumStudentSuite -ScenarioPath $scenarioPath -ExtensionArchivePath $extensionArchivePath -Mode 'sse'
    $scenario = Invoke-BackendHarnessBootstrap -ScenarioName 'Windows Student Policy Fallback'
    Install-AndEnrollClient -Scenario $scenario -InstallClient $false
    Invoke-SeleniumStudentSuite -ScenarioPath $scenarioPath -ExtensionArchivePath $extensionArchivePath -Mode 'fallback'
    Write-WindowsDiagnostics
    Write-Host 'Windows student-policy runner completed successfully' -ForegroundColor Green
}
catch {
    Write-Host "Windows student-policy runner failed: $_" -ForegroundColor Red
    Invoke-DebugDump
    throw
}
finally {
    Stop-BackgroundJobs
    Cleanup-TestPostgres
}
