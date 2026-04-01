import type { Express, Request, Response } from 'express';

import { getErrorMessage } from '@openpath/shared';

import { logger } from '../lib/logger.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import { config } from '../config.js';
import { generateEnrollmentToken, verifyEnrollmentToken } from '../lib/enrollment-token.js';
import { getFirstParam, verifyAccessTokenFromRequest } from '../lib/server-request-auth.js';
import { getPublicBaseUrl, quotePowerShellSingle } from '../lib/server-assets.js';
import ClassroomService from '../services/classroom.service.js';

export function registerEnrollmentRoutes(app: Express): void {
  app.post('/api/enroll/:classroomId/ticket', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const decoded = await verifyAccessTokenFromRequest(req);
        if (!decoded) {
          res.status(401).json({ success: false, error: 'Authorization required' });
          return;
        }

        const roles = decoded.roles.map((r) => r.role);
        if (!roles.includes('admin') && !roles.includes('teacher')) {
          res.status(403).json({ success: false, error: 'Teacher access required' });
          return;
        }

        const classroomId = getFirstParam(req.params.classroomId);
        if (!classroomId) {
          res.status(400).json({ success: false, error: 'classroomId parameter required' });
          return;
        }

        const access = await ClassroomService.ensureUserCanAccessClassroom(decoded, classroomId);
        if (!access.ok) {
          const statusCode = access.error.code === 'NOT_FOUND' ? 404 : 403;
          res.status(statusCode).json({ success: false, error: access.error.message });
          return;
        }

        const enrollmentToken = generateEnrollmentToken(access.data.id);

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.json({
          success: true,
          enrollmentToken,
          classroomId: access.data.id,
          classroomName: access.data.name,
        });
      } catch (error) {
        logger.error('Enrollment ticket error', { error: getErrorMessage(error) });
        res.status(500).json({ success: false, error: 'Internal error' });
      }
    })();
  });

  app.get('/api/enroll/:classroomId', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const classroomId = getFirstParam(req.params.classroomId);
        const authHeader = req.headers.authorization;

        if (classroomId === undefined || classroomId === '') {
          res.status(400).send('Missing classroomId');
          return;
        }

        if (authHeader?.startsWith('Bearer ') !== true) {
          res.status(401).send('Authorization header required');
          return;
        }

        const enrollmentToken = authHeader.slice(7);
        const payload = verifyEnrollmentToken(enrollmentToken);
        if (!payload) {
          res.status(403).send('Invalid enrollment token');
          return;
        }
        if (payload.classroomId !== classroomId) {
          res.status(403).send('Enrollment token does not match classroom');
          return;
        }

        const classroom = await classroomStorage.getClassroomById(classroomId);
        if (!classroom) {
          res.status(404).send('Classroom not found');
          return;
        }

        const publicUrl = getPublicBaseUrl(req);
        const aptRepoUrl = config.aptRepoUrl;
        const configuredLinuxAgentVersion = process.env.OPENPATH_LINUX_AGENT_VERSION?.trim() ?? '';
        if (!aptRepoUrl) {
          res.status(500).send('APT repo URL not configured');
          return;
        }

        const bashSingleQuote = (value: string): string => {
          const escaped = value.replace(/'/g, "'\\''");
          return `'${escaped}'`;
        };

        const script = `#!/bin/bash
set -euo pipefail

API_URL=${bashSingleQuote(publicUrl)}
CLASSROOM_ID=${bashSingleQuote(classroomId)}
CLASSROOM_NAME=${bashSingleQuote(classroom.name)}
ENROLLMENT_TOKEN=${bashSingleQuote(enrollmentToken)}
APT_BOOTSTRAP_URL=${bashSingleQuote(`${aptRepoUrl}/apt-bootstrap.sh`)}
LINUX_AGENT_VERSION=${bashSingleQuote(configuredLinuxAgentVersion)}

 echo ''
echo '==============================================='
echo ' OpenPath Enrollment: '"$CLASSROOM_NAME"
echo '==============================================='
echo ''

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Run with sudo"
    exit 1
fi

echo "[1/2] Instalando y registrando en aula..."
tmpfile="$(mktemp)"
trap 'rm -f "$tmpfile"' EXIT
curl -fsSL --proto '=https' --tlsv1.2 "$APT_BOOTSTRAP_URL" -o "$tmpfile"
bootstrap_cmd=(bash "$tmpfile" --api-url "$API_URL" --classroom "$CLASSROOM_NAME" --classroom-id "$CLASSROOM_ID" --enrollment-token "$ENROLLMENT_TOKEN")
if [ -n "$LINUX_AGENT_VERSION" ]; then
    bootstrap_cmd=(bash "$tmpfile" --package-version "$LINUX_AGENT_VERSION" --api-url "$API_URL" --classroom "$CLASSROOM_NAME" --classroom-id "$CLASSROOM_ID" --enrollment-token "$ENROLLMENT_TOKEN")
fi
"\${bootstrap_cmd[@]}"

echo "[2/2] Verificando..."
openpath health || true

echo ""
echo "========================================="
echo "  OK - Equipo listo en aula: $CLASSROOM_NAME"
echo "========================================="
echo ""
`;

        res.setHeader('Content-Type', 'text/x-shellscript');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline; filename="enroll.sh"');
        res.send(script);
      } catch (error) {
        logger.error('Enrollment script error', { error: getErrorMessage(error) });
        res.status(500).send('Internal error');
      }
    })();
  });

  app.get('/api/enroll/:classroomId/windows.ps1', (req: Request, res: Response): void => {
    void (async (): Promise<void> => {
      try {
        const authHeader = req.headers.authorization;

        if (authHeader?.startsWith('Bearer ') !== true) {
          res.status(401).send('Authorization header required');
          return;
        }

        const enrollmentToken = authHeader.slice(7);
        const payload = verifyEnrollmentToken(enrollmentToken);
        if (!payload) {
          res.status(403).send('Invalid enrollment token');
          return;
        }

        const requestedClassroomId = getFirstParam(req.params.classroomId);
        if (!requestedClassroomId) {
          res.status(400).send('Missing classroomId');
          return;
        }

        if (payload.classroomId !== requestedClassroomId) {
          res.status(403).send('Enrollment token does not match classroom');
          return;
        }

        const classroomId = payload.classroomId;
        const classroom = await classroomStorage.getClassroomById(classroomId);
        if (!classroom) {
          res.status(404).send('Classroom not found');
          return;
        }

        const publicUrl = getPublicBaseUrl(req);
        const psApiUrl = quotePowerShellSingle(publicUrl);
        const psClassroomId = quotePowerShellSingle(classroom.id);
        const psEnrollmentToken = quotePowerShellSingle(enrollmentToken);

        const script = `$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ApiUrl = ${psApiUrl}
$ClassroomId = ${psClassroomId}
$EnrollmentToken = ${psEnrollmentToken}
$Headers = @{ Authorization = "Bearer $EnrollmentToken" }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run PowerShell as Administrator'
}

$TempRoot = Join-Path $env:TEMP ("openpath-bootstrap-" + [Guid]::NewGuid().ToString('N'))
$WindowsRoot = Join-Path $TempRoot 'windows'
$null = New-Item -ItemType Directory -Path (Join-Path $WindowsRoot 'lib') -Force
$null = New-Item -ItemType Directory -Path (Join-Path $WindowsRoot 'scripts') -Force

Write-Host ''
Write-Host '==============================================='
Write-Host ' OpenPath Enrollment (Windows)'
Write-Host '==============================================='
Write-Host ''

$manifest = Invoke-RestMethod -Uri "$ApiUrl/api/agent/windows/bootstrap/latest.json" -Headers $Headers -Method Get
if (-not $manifest.success -or -not $manifest.files) {
    throw 'Bootstrap manifest unavailable'
}

if ($manifest.version) {
    $env:OPENPATH_VERSION = [string]$manifest.version
}

foreach ($file in $manifest.files) {
    $relativePath = [string]$file.path
    if (-not $relativePath) {
        continue
    }

    $destinationPath = Join-Path $WindowsRoot $relativePath
    $destinationDir = Split-Path $destinationPath -Parent
    if (-not (Test-Path $destinationDir)) {
        $null = New-Item -ItemType Directory -Path $destinationDir -Force
    }

    $encodedPath = [uri]::EscapeDataString($relativePath)
    $fileUrl = "$ApiUrl/api/agent/windows/bootstrap/file?path=$encodedPath"
    Invoke-WebRequest -Uri $fileUrl -Headers $Headers -OutFile $destinationPath -UseBasicParsing

    if ($file.sha256) {
        $expectedHash = ([string]$file.sha256).ToLowerInvariant()
        $actualHash = (Get-FileHash -Path $destinationPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $expectedHash) {
            throw "Checksum mismatch for $relativePath"
        }
    }
}

Push-Location $WindowsRoot
$installExitCode = 0
try {
    $global:LASTEXITCODE = 0
    & (Join-Path $WindowsRoot 'Install-OpenPath.ps1') -ApiUrl $ApiUrl -ClassroomId $ClassroomId -EnrollmentToken $EnrollmentToken -Unattended
    $installExitCode = [int]$LASTEXITCODE
}
finally {
    Pop-Location
    Remove-Item $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

if ($installExitCode -ne 0) {
    exit $installExitCode
}

Write-Host ''
Write-Host 'Installation completed. Current status:'
& 'C:\\OpenPath\\OpenPath.ps1' status
`;

        res.setHeader('Content-Type', 'text/x-powershell');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline; filename="enroll.ps1"');
        res.send(script);
      } catch (error) {
        logger.error('Windows enrollment script error', { error: getErrorMessage(error) });
        res.status(500).send('Internal error');
      }
    })();
  });
}
