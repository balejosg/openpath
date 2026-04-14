import { router } from '../../trpc.js';
import { groupManagementProcedures } from './management.js';
import { groupQueryProcedures } from './queries.js';
import { groupRuleProcedures } from './rules.js';

export const groupsRouter = router({
  ...groupQueryProcedures,
  ...groupManagementProcedures,
  ...groupRuleProcedures,
});

export default groupsRouter;
