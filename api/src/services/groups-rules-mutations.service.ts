import * as groupsStorage from '../lib/groups-storage.js';
import { cleanRuleValue, validateRuleValue } from '@openpath/shared/rules-validation';
import type { Rule } from '../lib/groups-storage.js';

import DomainEventsService from './domain-events.service.js';
import type {
  BulkCreateRulesInput,
  CreateRuleInput,
  GroupsResult,
  UpdateRuleInput,
} from './groups-service-shared.js';
import {
  defaultRulesDependencies,
  ensureGroupExists,
  type GroupsRulesDependencies,
} from './groups-rules-shared.js';

export async function createRule(
  input: CreateRuleInput,
  deps: GroupsRulesDependencies = defaultRulesDependencies
): Promise<GroupsResult<{ id: string }>> {
  const cleanedValue = cleanRuleValue(input.value, input.type === 'blocked_path');
  if (!cleanedValue) {
    return { ok: false, error: { code: 'BAD_REQUEST', message: 'Value is required' } };
  }

  const validation = validateRuleValue(cleanedValue, input.type);
  if (!validation.valid) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: validation.error ?? 'Invalid rule value format' },
    };
  }

  const group = await ensureGroupExists(input.groupId, deps);
  if (!group.ok) {
    return group;
  }

  const dispatcher = DomainEventsService.createDispatcher({
    publishWhitelistChanged: deps.publishWhitelistChanged,
  });
  const result = await DomainEventsService.withQueuedEvents(async (events) => {
    return deps.withTransaction(async (tx) => {
      const created = await deps.createRule(
        input.groupId,
        input.type,
        cleanedValue,
        input.comment ?? null,
        'manual',
        tx
      );
      if (created.success && created.id) {
        events.publishWhitelistChanged(input.groupId);
      }
      return created;
    });
  }, dispatcher);

  if (!result.success) {
    return {
      ok: false,
      error: { code: 'CONFLICT', message: result.error ?? 'Rule already exists' },
    };
  }

  if (!result.id) {
    return {
      ok: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create rule' },
    };
  }

  return { ok: true, data: { id: result.id } };
}

export async function deleteRule(
  id: string,
  groupId?: string,
  deps: Pick<
    GroupsRulesDependencies,
    'deleteRule' | 'getRuleById' | 'publishWhitelistChanged' | 'withTransaction'
  > = defaultRulesDependencies
): Promise<GroupsResult<{ deleted: boolean }>> {
  let ruleGroupId = groupId;
  if (!ruleGroupId) {
    const rule = await deps.getRuleById(id);
    ruleGroupId = rule?.groupId;
  }

  const dispatcher = DomainEventsService.createDispatcher({
    publishWhitelistChanged: deps.publishWhitelistChanged,
  });
  const deleted = await DomainEventsService.withQueuedEvents(async (events) => {
    return deps.withTransaction(async (tx) => {
      const wasDeleted = await deps.deleteRule(id, tx);
      if (wasDeleted && ruleGroupId) {
        events.publishWhitelistChanged(ruleGroupId);
      }
      return wasDeleted;
    });
  }, dispatcher);

  return { ok: true, data: { deleted } };
}

export async function bulkDeleteRules(
  ids: string[],
  options?: { rules?: Rule[] },
  deps: Pick<
    GroupsRulesDependencies,
    'bulkDeleteRules' | 'getRulesByIds' | 'publishWhitelistChanged' | 'withTransaction'
  > = defaultRulesDependencies
): Promise<GroupsResult<{ deleted: number; rules: Rule[] }>> {
  if (ids.length === 0) {
    return { ok: true, data: { deleted: 0, rules: [] } };
  }

  const rules = options?.rules ?? (await deps.getRulesByIds(ids));
  const dispatcher = DomainEventsService.createDispatcher({
    publishWhitelistChanged: deps.publishWhitelistChanged,
  });
  const deleted = await DomainEventsService.withQueuedEvents(async (events) => {
    return deps.withTransaction(async (tx) => {
      const deletedCount = await deps.bulkDeleteRules(ids, tx);

      if (deletedCount > 0) {
        const affectedGroups = new Set(rules.map((rule) => rule.groupId));
        for (const groupId of affectedGroups) {
          events.publishWhitelistChanged(groupId);
        }
      }

      return deletedCount;
    });
  }, dispatcher);

  return { ok: true, data: { deleted, rules } };
}

export async function updateRule(input: UpdateRuleInput): Promise<GroupsResult<Rule>> {
  const group = await ensureGroupExists(input.groupId);
  if (!group.ok) {
    return group;
  }

  const existingRule = await groupsStorage.getRuleById(input.id);
  if (!existingRule) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } };
  }

  if (existingRule.groupId !== input.groupId) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'Rule does not belong to this group' },
    };
  }

  let cleanedValue = input.value;
  const didChangeExport =
    cleanedValue !== undefined &&
    cleanRuleValue(cleanedValue, existingRule.type === 'blocked_path') !== existingRule.value;

  if (cleanedValue !== undefined) {
    cleanedValue = cleanRuleValue(cleanedValue, existingRule.type === 'blocked_path');
    if (!cleanedValue) {
      return { ok: false, error: { code: 'BAD_REQUEST', message: 'Value cannot be empty' } };
    }

    const validation = validateRuleValue(cleanedValue, existingRule.type);
    if (!validation.valid) {
      return {
        ok: false,
        error: { code: 'BAD_REQUEST', message: validation.error ?? 'Invalid rule value format' },
      };
    }
  }

  const updated = await DomainEventsService.withQueuedEvents(async (events) => {
    return defaultRulesDependencies.withTransaction(async (tx) => {
      const result = await (defaultRulesDependencies.updateRule ?? groupsStorage.updateRule)(
        {
          id: input.id,
          value: cleanedValue,
          comment: input.comment,
        },
        tx
      );

      if (result && didChangeExport) {
        events.publishWhitelistChanged(input.groupId);
      }

      return result;
    });
  });

  if (!updated) {
    return {
      ok: false,
      error: { code: 'CONFLICT', message: 'A rule with this value already exists' },
    };
  }

  return { ok: true, data: updated };
}

export async function bulkCreateRules(
  input: BulkCreateRulesInput
): Promise<GroupsResult<{ count: number }>> {
  const group = await ensureGroupExists(input.groupId);
  if (!group.ok) {
    return group;
  }

  const preservePath = input.type === 'blocked_path';
  const cleanedValues = input.values.map((value) => cleanRuleValue(value, preservePath));

  const count = await DomainEventsService.withQueuedEvents(async (events) => {
    return defaultRulesDependencies.withTransaction(async (tx) => {
      const createdCount = await (
        defaultRulesDependencies.bulkCreateRules ?? groupsStorage.bulkCreateRules
      )(input.groupId, input.type, cleanedValues, 'manual', tx);

      if (createdCount > 0) {
        events.publishWhitelistChanged(input.groupId);
      }

      return createdCount;
    });
  });

  return { ok: true, data: { count } };
}
