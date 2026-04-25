import { StudentPolicyServerClient } from './student-policy-client';
import { StudentPolicyDriver } from './student-policy-driver';
import {
  getDiagnosticsDir,
  getPolicyMode,
  getStudentPolicyCoverageProfile,
  loadScenarioFromEnv,
  optionalEnv,
} from './student-policy-env';
import {
  runFallbackPropagationProbe,
  runStudentPolicyMatrix,
  runStudentPolicyMatrixPhaseTwo,
  writeStudentPolicyScenarioTimings,
} from './student-policy-scenarios';
import type {
  PolicyMode,
  RunResult,
  StudentPolicyCoverageProfile,
  StudentPolicyDriverOptions,
} from './student-policy-types';

type StudentPolicySuite = 'matrix' | 'matrix-phase-two' | 'fallback-propagation';

interface StudentPolicyPhasePlan {
  name: string;
  suite: StudentPolicySuite;
  useBrowser: boolean;
}

export function getStudentPolicyPhasePlan(
  mode: PolicyMode,
  coverageProfile: StudentPolicyCoverageProfile
): StudentPolicyPhasePlan[] {
  if (coverageProfile === 'fallback-propagation') {
    if (mode !== 'fallback') {
      throw new Error('The fallback-propagation coverage profile requires fallback mode');
    }

    return [{ name: 'fallback-propagation', suite: 'fallback-propagation', useBrowser: true }];
  }

  return [
    { name: 'phase-one', suite: 'matrix', useBrowser: true },
    { name: 'phase-two', suite: 'matrix-phase-two', useBrowser: false },
  ];
}

export async function runStudentPolicySuite(
  options: StudentPolicyDriverOptions = {}
): Promise<RunResult> {
  const scenario = await loadScenarioFromEnv();
  const client = new StudentPolicyServerClient(scenario);
  const mode = getPolicyMode();
  const coverageProfile = getStudentPolicyCoverageProfile();
  const diagnosticsDir =
    options.diagnosticsDir ??
    optionalEnv('OPENPATH_STUDENT_DIAGNOSTICS_DIR') ??
    getDiagnosticsDir();

  const runPhase = async (
    phaseName: string,
    runner: (driver: StudentPolicyDriver) => Promise<void>,
    phaseOptions: { useBrowser?: boolean } = {}
  ): Promise<void> => {
    const driver = new StudentPolicyDriver(scenario, {
      ...options,
      diagnosticsDir,
    });

    try {
      if (phaseOptions.useBrowser !== false) {
        await driver.setup();
      }
      if (mode === 'fallback') {
        await driver.withSseDisabled(async () => {
          await runner(driver);
        });
      } else {
        await runner(driver);
      }
    } catch (error) {
      try {
        await driver.saveDiagnostics(`student-policy-${phaseName}-failure`);
      } catch {
        // Best effort diagnostics.
      }
      throw error;
    } finally {
      await driver.teardown();
    }
  };

  try {
    for (const phase of getStudentPolicyPhasePlan(mode, coverageProfile)) {
      await runPhase(
        phase.name,
        async (driver) => {
          if (phase.suite === 'matrix') {
            await runStudentPolicyMatrix(client, driver, mode);
            return;
          }

          if (phase.suite === 'matrix-phase-two') {
            await runStudentPolicyMatrixPhaseTwo(client, driver, mode);
            return;
          }

          await runFallbackPropagationProbe(client, driver, mode);
        },
        { useBrowser: phase.useBrowser }
      );
    }
  } finally {
    writeStudentPolicyScenarioTimings(diagnosticsDir);
  }

  return { success: true, diagnosticsDir };
}
