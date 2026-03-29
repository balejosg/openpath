import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface StudentScenario {
  machine?: {
    machineToken?: string;
    whitelistUrl?: string;
  };
}

interface ReconcileStudentScenarioOptions {
  scenarioPath: string;
  whitelistUrl: string;
}

function extractMachineToken(whitelistUrl: string): string {
  const match = /\/w\/([^/]+)\//.exec(whitelistUrl);
  if (!match?.[1]) {
    throw new Error(`Could not extract machine token from ${whitelistUrl}`);
  }

  return match[1];
}

export function reconcileStudentScenario({
  scenarioPath,
  whitelistUrl,
}: ReconcileStudentScenarioOptions): void {
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) as StudentScenario;
  const machineToken = extractMachineToken(whitelistUrl);

  scenario.machine = {
    ...(scenario.machine ?? {}),
    whitelistUrl,
    machineToken,
  };

  fs.writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');
}

function getOption(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(`Missing required option: ${name}`);
  }

  return value;
}

function runCli(): void {
  const scenarioPath = path.resolve(getOption('--scenario-file'));
  const whitelistUrl = getOption('--whitelist-url');
  reconcileStudentScenario({ scenarioPath, whitelistUrl });
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  runCli();
}
