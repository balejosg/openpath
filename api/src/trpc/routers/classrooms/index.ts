import { router } from '../../trpc.js';
import { classroomMutationProcedures } from './mutations.js';
import { classroomQueryProcedures } from './queries.js';

export const classroomsRouter = router({
  ...classroomQueryProcedures,
  ...classroomMutationProcedures,
});

export default classroomsRouter;
