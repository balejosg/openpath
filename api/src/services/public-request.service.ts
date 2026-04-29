import {
  createSubmittedMachineRequest,
  decideAutoMachineRequest,
  type AutoMachineRequestOutcome,
  type CreateSubmittedMachineRequestInput,
  type PendingMachineRequestOutcome,
  type PublicRequestResult,
  type PublicRequestServiceError,
} from './machine-request-admission.service.js';

export type {
  AutoMachineRequestOutcome,
  PendingMachineRequestOutcome,
  PublicRequestResult,
  PublicRequestServiceError,
};

export async function submitMachineRequest(
  input: CreateSubmittedMachineRequestInput
): Promise<PublicRequestResult<PendingMachineRequestOutcome>> {
  return createSubmittedMachineRequest(input);
}

export async function handleAutoMachineRequest(
  input: Parameters<typeof decideAutoMachineRequest>[0]
): Promise<PublicRequestResult<AutoMachineRequestOutcome>> {
  return decideAutoMachineRequest(input);
}

export default {
  handleAutoMachineRequest,
  submitMachineRequest,
};
