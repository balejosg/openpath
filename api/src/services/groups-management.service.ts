import {
  cloneGroup,
  createGroup,
  deleteGroup,
  toggleSystemStatus,
  updateGroup,
} from './groups-management-mutations.service.js';
import {
  exportAllGroups,
  exportGroup,
  getStats,
  getSystemStatus,
} from './groups-management-query.service.js';

export {
  cloneGroup,
  createGroup,
  deleteGroup,
  exportAllGroups,
  exportGroup,
  getStats,
  getSystemStatus,
  toggleSystemStatus,
  updateGroup,
};

export const GroupsManagementService = {
  cloneGroup,
  createGroup,
  deleteGroup,
  exportAllGroups,
  exportGroup,
  getStats,
  getSystemStatus,
  toggleSystemStatus,
  updateGroup,
};

export default GroupsManagementService;
