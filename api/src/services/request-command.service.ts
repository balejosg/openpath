import { createRequest, deleteRequest } from './request-command-requests.service.js';
import { approveRequest, rejectRequest } from './request-command-review.service.js';

export { approveRequest, createRequest, deleteRequest, rejectRequest };
export type { RequestCreationInput, StoredDomainRequest } from './request-command-shared.js';

export const RequestCommandService = {
  createRequest,
  approveRequest,
  rejectRequest,
  deleteRequest,
};

export default RequestCommandService;
