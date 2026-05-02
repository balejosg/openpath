export { waitForFirefoxExtensionUuid } from './firefox-extension-uuid';
export {
  buildWindowsBlockedDnsCommand,
  buildWindowsHttpProbeCommand,
  getStudentPolicyScenarioGroup,
} from './student-policy-env';
export { StudentPolicyDriver, waitForFirefoxExtensionRuntimeReady } from './student-policy-driver';
export { runStudentPolicySuite } from './student-policy-harness';
export type {
  HarnessClassroom,
  HarnessGroup,
  HarnessMachine,
  HarnessSchedule,
  HarnessSession,
  RunResult,
  StudentFixtureHosts,
  StudentPolicyDriverOptions,
  StudentScenario,
} from './student-policy-types';

import { runStudentPolicySuite } from './student-policy-harness';

if (require.main === module) {
  runStudentPolicySuite()
    .then((result) => {
      process.stdout.write(
        `Student policy Selenium readiness passed. Diagnostics: ${result.diagnosticsDir}\n`
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    });
}
