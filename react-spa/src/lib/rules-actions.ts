import { trpc } from './trpc';
import { detectRuleType, getRuleTypeBadge } from './ruleDetection';
import { isDuplicateError } from './error-utils';

export type ToastFn = (message: string, type: 'success' | 'error', undoAction?: () => void) => void;

export interface AddRuleWithDetectionParams {
  groupId: string;
  onToast: ToastFn;
  fetchRules: () => Promise<void>;
  fetchCounts: () => Promise<void>;
}

export interface BulkCreateRulesParams {
  groupId: string;
  onToast: ToastFn;
  fetchRules: () => Promise<void>;
  fetchCounts: () => Promise<void>;
}

export interface UpdateRuleParams {
  groupId: string;
  onToast: ToastFn;
  fetchRules: () => Promise<void>;
}

export interface DeleteRuleParams {
  onToast: ToastFn;
  fetchRules: () => Promise<void>;
  fetchCounts: () => Promise<void>;
}

export interface BulkDeleteRulesParams {
  ids: string[];
  clearSelection?: () => void;
  onToast: ToastFn;
  fetchRules: () => Promise<void>;
  fetchCounts: () => Promise<void>;
}

export interface RuleForUndo {
  id: string;
  groupId: string;
  type: 'whitelist' | 'blocked_subdomain' | 'blocked_path';
  value: string;
  comment: string | null | undefined;
}

export function readCreatedFlag(value: unknown): boolean | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const created = (value as { created?: unknown }).created;
  return typeof created === 'boolean' ? created : undefined;
}

export async function addRuleWithDetection(
  value: string,
  params: AddRuleWithDetectionParams
): Promise<boolean> {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Get existing whitelist for detection
  const existingWhitelist = await trpc.groups.listRules.query({
    groupId: params.groupId,
    type: 'whitelist',
  });
  const whitelistDomains = existingWhitelist.map((r) => r.value);

  // Detect type
  const detected = detectRuleType(trimmed, whitelistDomains);

  try {
    const result = await trpc.groups.createRule.mutate({
      groupId: params.groupId,
      type: detected.type,
      value: detected.cleanedValue,
    });

    const created = readCreatedFlag(result);
    if (created === false) {
      params.onToast(
        `"${detected.cleanedValue}" ya existe como ${getRuleTypeBadge(detected.type)}`,
        'error'
      );
      return false;
    }

    params.onToast(
      `"${detected.cleanedValue}" añadido como ${getRuleTypeBadge(detected.type)}`,
      'success'
    );
    await params.fetchRules();
    await params.fetchCounts();
    return true;
  } catch (err) {
    console.error('Failed to add rule:', err);

    if (isDuplicateError(err)) {
      params.onToast(
        `"${detected.cleanedValue}" ya existe como ${getRuleTypeBadge(detected.type)}`,
        'error'
      );
      return false;
    }

    params.onToast('Error al añadir regla', 'error');
    return false;
  }
}

export async function bulkCreateRulesAction(
  values: string[],
  type: 'whitelist' | 'blocked_subdomain' | 'blocked_path',
  params: BulkCreateRulesParams
): Promise<{ created: number; total: number }> {
  if (values.length === 0) return { created: 0, total: 0 };

  try {
    const result = await trpc.groups.bulkCreateRules.mutate({
      groupId: params.groupId,
      type,
      values,
    });

    const created = result.count;
    const total = values.length;

    if (created > 0) {
      params.onToast(
        created === total
          ? `${String(created)} reglas importadas`
          : `${String(created)} de ${String(total)} reglas importadas (${String(total - created)} duplicadas)`,
        'success'
      );
      await params.fetchRules();
      await params.fetchCounts();
    } else {
      params.onToast('Todas las reglas ya existen', 'error');
    }

    return { created, total };
  } catch (err) {
    console.error('Failed to bulk create rules:', err);
    params.onToast('Error al importar reglas', 'error');
    return { created: 0, total: values.length };
  }
}

export async function updateRuleAction(
  id: string,
  data: { value?: string; comment?: string | null },
  params: UpdateRuleParams
): Promise<boolean> {
  try {
    await trpc.groups.updateRule.mutate({
      id,
      groupId: params.groupId,
      value: data.value,
      comment: data.comment,
    });

    params.onToast('Regla actualizada', 'success');
    await params.fetchRules();
    return true;
  } catch (err) {
    console.error('Failed to update rule:', err);
    params.onToast('Error al actualizar regla', 'error');
    return false;
  }
}

export async function deleteRuleWithUndoAction(
  rule: RuleForUndo,
  params: DeleteRuleParams
): Promise<void> {
  try {
    await trpc.groups.deleteRule.mutate({ id: rule.id, groupId: rule.groupId });

    params.onToast(`"${rule.value}" eliminado`, 'success', () => {
      void (async () => {
        try {
          await trpc.groups.createRule.mutate({
            groupId: rule.groupId,
            type: rule.type,
            value: rule.value,
            comment: rule.comment ?? undefined,
          });
          await params.fetchRules();
          await params.fetchCounts();
          params.onToast(`"${rule.value}" restaurado`, 'success');
        } catch (err) {
          console.error('Failed to undo delete:', err);
          params.onToast('Error al restaurar regla', 'error');
        }
      })();
    });

    await params.fetchRules();
    await params.fetchCounts();
  } catch (err) {
    console.error('Failed to delete rule:', err);
    params.onToast('Error al eliminar regla', 'error');
  }
}

export async function bulkDeleteRulesWithUndoAction(params: BulkDeleteRulesParams): Promise<void> {
  if (params.ids.length === 0) return;

  try {
    const result = await trpc.groups.bulkDeleteRules.mutate({ ids: params.ids });

    const deletedRules = result.rules;
    const count = result.deleted;

    params.clearSelection?.();

    params.onToast(`${String(count)} reglas eliminadas`, 'success', () => {
      void (async () => {
        try {
          for (const rule of deletedRules) {
            await trpc.groups.createRule.mutate({
              groupId: rule.groupId,
              type: rule.type,
              value: rule.value,
              comment: rule.comment ?? undefined,
            });
          }
          await params.fetchRules();
          await params.fetchCounts();
          params.onToast(`${String(deletedRules.length)} reglas restauradas`, 'success');
        } catch (err) {
          console.error('Failed to undo bulk delete:', err);
          params.onToast('Error al restaurar reglas', 'error');
        }
      })();
    });

    await params.fetchRules();
    await params.fetchCounts();
  } catch (err) {
    console.error('Failed to bulk delete rules:', err);
    params.onToast('Error al eliminar reglas', 'error');
  }
}
