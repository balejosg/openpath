import type { GroupVisibility } from '@openpath/shared';
import type { RuleType } from '../lib/groups-storage-shared.js';

export type GroupsServiceError =
  | { code: 'BAD_REQUEST'; message: string }
  | { code: 'FORBIDDEN'; message: string }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'CONFLICT'; message: string }
  | { code: 'INTERNAL_SERVER_ERROR'; message: string };

export type GroupsResult<T> = { ok: true; data: T } | { ok: false; error: GroupsServiceError };

export interface CreateGroupInput {
  name: string;
  displayName: string;
  visibility?: GroupVisibility | undefined;
  ownerUserId?: string | null | undefined;
}

export interface UpdateGroupInput {
  id: string;
  displayName: string;
  enabled: boolean;
  visibility?: GroupVisibility | undefined;
}

export interface CreateRuleInput {
  groupId: string;
  type: RuleType;
  value: string;
  comment?: string | undefined;
}

export interface BulkCreateRulesInput {
  groupId: string;
  type: RuleType;
  values: string[];
}

export interface UpdateRuleInput {
  id: string;
  groupId: string;
  value?: string | undefined;
  comment?: string | null | undefined;
}

export interface ExportResult {
  name: string;
  content: string;
}

export interface CloneGroupInput {
  sourceGroupId: string;
  name?: string | undefined;
  displayName: string;
  ownerUserId: string;
}
