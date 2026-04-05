function bashSingleQuote(value: string): string {
  const escaped = value.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

export interface LinuxEnrollmentScriptParams {
  publicUrl: string;
  classroomId: string;
  classroomName: string;
  enrollmentToken: string;
  aptRepoUrl: string;
  linuxAgentVersion: string;
}

export function buildLinuxEnrollmentScript({
  publicUrl,
  classroomId,
  classroomName,
  enrollmentToken,
  aptRepoUrl,
  linuxAgentVersion,
}: LinuxEnrollmentScriptParams): string {
  const bootstrapVersionOverride = linuxAgentVersion
    ? 'bootstrap_cmd=(bash "$tmpfile" --package-version "$LINUX_AGENT_VERSION" --api-url "$API_URL" --classroom "$CLASSROOM_NAME" --classroom-id "$CLASSROOM_ID" --enrollment-token "$ENROLLMENT_TOKEN")'
    : '';

  return `#!/bin/bash
set -euo pipefail

API_URL=${bashSingleQuote(publicUrl)}
CLASSROOM_ID=${bashSingleQuote(classroomId)}
CLASSROOM_NAME=${bashSingleQuote(classroomName)}
ENROLLMENT_TOKEN=${bashSingleQuote(enrollmentToken)}
APT_BOOTSTRAP_URL=${bashSingleQuote(`${aptRepoUrl}/apt-bootstrap.sh`)}
${linuxAgentVersion ? `LINUX_AGENT_VERSION=${bashSingleQuote(linuxAgentVersion)}` : ''}

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
${bootstrapVersionOverride}
"\${bootstrap_cmd[@]}"

echo "[2/2] Verificando..."
openpath health || true

echo ""
echo "========================================="
echo "  OK - Equipo listo en aula: $CLASSROOM_NAME"
echo "========================================="
echo ""
`;
}
