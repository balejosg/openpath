import { config } from '../config.js';
import * as classroomStorage from '../lib/classroom-storage.js';
import { generateEnrollmentToken, verifyEnrollmentToken } from '../lib/enrollment-token.js';
import { buildLinuxEnrollmentScript } from '../lib/enrollment-script.js';
import {
  quotePowerShellSingle,
  resolveEnrollmentLinuxAgentVersionPin,
} from '../lib/server-assets.js';
import ClassroomService from './classroom.service.js';
import type { JWTPayload } from '../types/index.js';

export type EnrollmentServiceError =
  | { code: 'UNAUTHORIZED'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'BAD_REQUEST'; message: string }
  | { code: 'MISCONFIGURED'; message: string };

export type EnrollmentServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: EnrollmentServiceError };

export interface EnrollmentTicketOutput {
  classroomId: string;
  classroomName: string;
  enrollmentToken: string;
}

export interface EnrollmentScriptOutput {
  script: string;
}

export interface EnrollmentTokenAccess {
  classroomId: string;
  classroomName: string;
}

function hasEnrollmentRole(roles: readonly unknown[]): boolean {
  return roles.some((role): boolean => {
    if (typeof role !== 'object' || role === null) {
      return false;
    }

    const roleName = (role as { role?: unknown }).role;
    return roleName === 'admin' || roleName === 'teacher';
  });
}

function buildWindowsEnrollmentScript(params: {
  classroomId: string;
  enrollmentToken: string;
  publicUrl: string;
}): string {
  const psApiUrl = quotePowerShellSingle(params.publicUrl);
  const psClassroomId = quotePowerShellSingle(params.classroomId);
  const psEnrollmentToken = quotePowerShellSingle(params.enrollmentToken);

  return `$ErrorActionPreference = 'Stop'
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

$manifest = Invoke-RestMethod -Uri "$ApiUrl/api/agent/windows/bootstrap/manifest" -Headers $Headers -Method Get
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

    $encodedPath = (($relativePath -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $fileUrl = "$ApiUrl/api/agent/windows/bootstrap/files/$encodedPath"
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
}

async function resolveEnrollmentContext(input: {
  authorizationHeader?: string | undefined;
  classroomId: string;
}): Promise<
  EnrollmentServiceResult<{
    classroom: NonNullable<Awaited<ReturnType<typeof classroomStorage.getClassroomById>>>;
    enrollmentToken: string;
  }>
> {
  if (!input.classroomId) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Missing classroomId' },
    };
  }

  const authHeader = input.authorizationHeader;
  if (authHeader?.startsWith('Bearer ') !== true) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Authorization header required' },
    };
  }

  const enrollmentToken = authHeader.slice(7);
  const payload = verifyEnrollmentToken(enrollmentToken);
  if (!payload) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Invalid enrollment token' },
    };
  }

  if (payload.classroomId !== input.classroomId) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Enrollment token does not match classroom' },
    };
  }

  const classroom = await classroomStorage.getClassroomById(input.classroomId);
  if (!classroom) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Classroom not found' },
    };
  }

  return {
    ok: true,
    data: {
      classroom,
      enrollmentToken,
    },
  };
}

export async function resolveEnrollmentTokenAccess(
  authorizationHeader?: string
): Promise<EnrollmentServiceResult<EnrollmentTokenAccess>> {
  if (authorizationHeader?.startsWith('Bearer ') !== true) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Authorization header required' },
    };
  }

  const enrollmentToken = authorizationHeader.slice(7);
  const payload = verifyEnrollmentToken(enrollmentToken);
  if (!payload) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Invalid enrollment token' },
    };
  }

  const classroom = await classroomStorage.getClassroomById(payload.classroomId);
  if (!classroom) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Classroom not found' },
    };
  }

  return {
    ok: true,
    data: {
      classroomId: classroom.id,
      classroomName: classroom.name,
    },
  };
}

export async function issueEnrollmentTicket(input: {
  classroomId: string;
  user: JWTPayload;
}): Promise<EnrollmentServiceResult<EnrollmentTicketOutput>> {
  if (!hasEnrollmentRole(input.user.roles)) {
    return {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Teacher access required' },
    };
  }

  if (!input.classroomId) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'classroomId parameter required' },
    };
  }

  const access = await ClassroomService.ensureUserCanEnrollClassroom(input.user, input.classroomId);
  if (!access.ok) {
    return {
      ok: false,
      error: {
        code: access.error.code,
        message: access.error.message,
      },
    };
  }

  return {
    ok: true,
    data: {
      enrollmentToken: generateEnrollmentToken(access.data.id),
      classroomId: access.data.id,
      classroomName: access.data.name,
    },
  };
}

export async function buildLinuxEnrollmentBootstrap(input: {
  authorizationHeader?: string | undefined;
  classroomId: string;
  publicUrl: string;
}): Promise<EnrollmentServiceResult<EnrollmentScriptOutput>> {
  const context = await resolveEnrollmentContext({
    authorizationHeader: input.authorizationHeader,
    classroomId: input.classroomId,
  });
  if (!context.ok) {
    return context;
  }

  const aptRepoUrl = config.aptRepoUrl;
  if (!aptRepoUrl) {
    return {
      ok: false,
      error: { code: 'MISCONFIGURED', message: 'APT repo URL not configured' },
    };
  }

  const configuredLinuxAgentVersion = process.env.OPENPATH_LINUX_AGENT_VERSION?.trim() ?? '';
  const effectiveLinuxAgentVersion = await resolveEnrollmentLinuxAgentVersionPin(
    aptRepoUrl,
    configuredLinuxAgentVersion
  );

  return {
    ok: true,
    data: {
      script: buildLinuxEnrollmentScript({
        publicUrl: input.publicUrl,
        classroomId: context.data.classroom.id,
        classroomName: context.data.classroom.name,
        enrollmentToken: context.data.enrollmentToken,
        aptRepoUrl,
        linuxAgentVersion: effectiveLinuxAgentVersion,
      }),
    },
  };
}

export async function buildWindowsEnrollmentBootstrap(input: {
  authorizationHeader?: string | undefined;
  classroomId: string;
  publicUrl: string;
}): Promise<EnrollmentServiceResult<EnrollmentScriptOutput>> {
  const context = await resolveEnrollmentContext({
    authorizationHeader: input.authorizationHeader,
    classroomId: input.classroomId,
  });
  if (!context.ok) {
    return context;
  }

  return {
    ok: true,
    data: {
      script: buildWindowsEnrollmentScript({
        publicUrl: input.publicUrl,
        classroomId: context.data.classroom.id,
        enrollmentToken: context.data.enrollmentToken,
      }),
    },
  };
}

export default {
  buildLinuxEnrollmentBootstrap,
  buildWindowsEnrollmentBootstrap,
  issueEnrollmentTicket,
  resolveEnrollmentTokenAccess,
};
