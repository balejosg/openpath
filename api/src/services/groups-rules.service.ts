import {
  getRuleById,
  getRulesByIds,
  listRules,
  listRulesGrouped,
  listRulesPaginated,
} from './groups-rules-query.service.js';
import {
  bulkCreateRules,
  bulkDeleteRules,
  createRule,
  deleteRule,
  updateRule,
} from './groups-rules-mutations.service.js';

export {
  bulkCreateRules,
  bulkDeleteRules,
  createRule,
  deleteRule,
  getRuleById,
  getRulesByIds,
  listRules,
  listRulesGrouped,
  listRulesPaginated,
  updateRule,
};

export const GroupsRulesService = {
  bulkCreateRules,
  bulkDeleteRules,
  createRule,
  deleteRule,
  getRuleById,
  getRulesByIds,
  listRules,
  listRulesGrouped,
  listRulesPaginated,
  updateRule,
};

export default GroupsRulesService;
