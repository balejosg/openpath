import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Globe,
  Route,
  Plus,
  Trash2,
  Edit2,
  Square,
  CheckSquare,
  Minus,
  Save,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getRuleTypeBadge } from '../lib/ruleDetection';
import { getRootDomain } from '@openpath/shared/domain';
import type { Rule } from './RulesTable';

// =============================================================================
// Types
// =============================================================================

export interface DomainGroup {
  root: string;
  rules: Rule[];
  status: 'allowed' | 'blocked' | 'mixed';
}

interface HierarchicalRulesTableProps {
  /** Individual rules to be grouped client-side (legacy mode) */
  rules?: Rule[];
  /** Pre-grouped domain groups from the backend (preferred mode) */
  domainGroups?: DomainGroup[];
  loading?: boolean;
  readOnly?: boolean;
  onDelete: (rule: Rule) => void;
  onSave?: (id: string, data: { value?: string; comment?: string | null }) => Promise<boolean>;
  onAddSubdomain?: (rootDomain: string) => void;
  emptyMessage?: string;
  className?: string;
  // Selection props
  selectedIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
  onToggleSelectAll?: () => void;
  isAllSelected?: boolean;
  hasSelection?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export const HierarchicalRulesTable: React.FC<HierarchicalRulesTableProps> = ({
  rules,
  domainGroups: preGroupedDomains,
  loading = false,
  readOnly = false,
  onDelete,
  onSave,
  onAddSubdomain,
  emptyMessage = 'No hay reglas configuradas',
  className,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
  isAllSelected,
  hasSelection,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editComment, setEditComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = !readOnly && onSave !== undefined;
  const hasSelectionFeature =
    !readOnly &&
    selectedIds !== undefined &&
    onToggleSelection !== undefined &&
    onToggleSelectAll !== undefined;

  // Group rules by root domain (client-side grouping if no pre-grouped data)
  const groups = useMemo(() => {
    // If pre-grouped data is provided, use it directly
    if (preGroupedDomains && preGroupedDomains.length > 0) {
      return preGroupedDomains;
    }

    // Otherwise, group rules client-side (legacy mode)
    if (!rules || rules.length === 0) {
      return [];
    }

    const grouped = new Map<string, DomainGroup>();

    rules.forEach((rule) => {
      const root = getRootDomain(rule.value);
      const existing = grouped.get(root);
      if (existing) {
        existing.rules.push(rule);
      } else {
        grouped.set(root, { root, rules: [rule], status: 'mixed' });
      }
    });

    // Determine group status
    grouped.forEach((group) => {
      const allAllowed = group.rules.every((r) => r.type === 'whitelist');
      const allBlocked = group.rules.every((r) => r.type !== 'whitelist');
      group.status = allAllowed ? 'allowed' : allBlocked ? 'blocked' : 'mixed';
    });

    return Array.from(grouped.values()).sort((a, b) => a.root.localeCompare(b.root));
  }, [rules, preGroupedDomains]);

  // Toggle group expansion
  const toggleGroup = useCallback((root: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(root)) {
        next.delete(root);
      } else {
        next.add(root);
      }
      return next;
    });
  }, []);

  // Start editing a rule
  const startEdit = useCallback((rule: Rule) => {
    setEditingId(rule.id);
    setEditValue(rule.value);
    setEditComment(rule.comment ?? '');
  }, []);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
    setEditComment('');
  }, []);

  // Save edited rule
  const saveEdit = useCallback(async () => {
    if (!editingId || !onSave || isSaving) return;

    // Find rule in groups
    const allRules = groups.flatMap((g) => g.rules);
    const rule = allRules.find((r) => r.id === editingId);
    if (!rule) return;

    const valueChanged = editValue.trim() !== rule.value;
    const commentChanged = editComment !== (rule.comment ?? '');

    if (!valueChanged && !commentChanged) {
      cancelEdit();
      return;
    }

    if (!editValue.trim()) {
      return;
    }

    setIsSaving(true);
    const success = await onSave(editingId, {
      value: valueChanged ? editValue.trim() : undefined,
      comment: commentChanged ? editComment.trim() || null : undefined,
    });

    if (success) {
      cancelEdit();
    }
    setIsSaving(false);
  }, [editingId, editValue, editComment, groups, onSave, isSaving, cancelEdit]);

  // Handle keyboard events in edit mode
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit]
  );

  // Loading state
  if (loading) {
    return (
      <div className={cn('bg-white border border-slate-200 rounded-lg', className)}>
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Cargando reglas...
        </div>
      </div>
    );
  }

  // Empty state
  if (groups.length === 0) {
    return (
      <div className={cn('bg-white border border-slate-200 rounded-lg', className)}>
        <div className="py-12 text-center text-slate-400 text-sm">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white border border-slate-200 rounded-lg overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold tracking-wider">
              {hasSelectionFeature && (
                <th className="px-4 py-3 w-10">
                  <button
                    onClick={onToggleSelectAll}
                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    title={isAllSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                  >
                    {isAllSelected ? (
                      <CheckSquare size={18} className="text-blue-600" />
                    ) : hasSelection ? (
                      <Minus size={18} className="text-blue-400" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
              )}
              <th className="px-4 py-3 w-8"></th>
              <th className="px-4 py-3">Dominio / Regla</th>
              <th className="px-4 py-3 w-32">Estado</th>
              {!readOnly && <th className="px-4 py-3 w-24 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.root);
              const groupRuleIds = group.rules.map((r) => r.id);
              const selectedInGroup = groupRuleIds.filter((id) => selectedIds?.has(id)).length;
              const allGroupSelected = selectedInGroup === group.rules.length;
              const someGroupSelected = selectedInGroup > 0 && selectedInGroup < group.rules.length;

              return (
                <React.Fragment key={group.root || '__global_paths__'}>
                  {/* Group Header Row */}
                  <tr
                    className={cn(
                      'bg-slate-50/50 hover:bg-slate-100 transition-colors cursor-pointer',
                      isExpanded && 'bg-slate-100'
                    )}
                    onClick={() => toggleGroup(group.root)}
                  >
                    {hasSelectionFeature && (
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Toggle all rules in group
                            groupRuleIds.forEach((id) => {
                              if (allGroupSelected) {
                                if (selectedIds.has(id)) onToggleSelection(id);
                              } else {
                                if (!selectedIds.has(id)) onToggleSelection(id);
                              }
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                          title={allGroupSelected ? 'Deseleccionar grupo' : 'Seleccionar grupo'}
                        >
                          {allGroupSelected ? (
                            <CheckSquare size={18} className="text-blue-600" />
                          ) : someGroupSelected ? (
                            <Minus size={18} className="text-blue-400" />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-400">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {group.root ? (
                          <Globe size={16} className="text-slate-400 flex-shrink-0" />
                        ) : (
                          <Route size={16} className="text-slate-400 flex-shrink-0" />
                        )}
                        <span
                          className={cn(
                            'font-medium',
                            group.root ? 'text-slate-700' : 'text-slate-500 italic'
                          )}
                        >
                          {group.root || 'Rutas globales'}
                        </span>
                        <span className="text-xs text-slate-400 font-normal">
                          ({group.rules.length})
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full border font-medium',
                          group.status === 'allowed' &&
                            'bg-green-100 text-green-700 border-green-200',
                          group.status === 'blocked' && 'bg-red-100 text-red-700 border-red-200',
                          group.status === 'mixed' && 'bg-amber-100 text-amber-700 border-amber-200'
                        )}
                      >
                        {group.status === 'allowed'
                          ? 'Permitido'
                          : group.status === 'blocked'
                            ? 'Bloqueado'
                            : 'Mixto'}
                      </span>
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-right">
                        {onAddSubdomain && group.root && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddSubdomain(group.root);
                            }}
                            className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700 transition-colors"
                            title={`Añadir subdominio a ${group.root}`}
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>

                  {/* Child Rule Rows */}
                  {isExpanded &&
                    group.rules.map((rule) => {
                      const isSelected = selectedIds?.has(rule.id) ?? false;
                      const isEditing = editingId === rule.id;

                      return (
                        <tr
                          key={rule.id}
                          className={cn(
                            'bg-white hover:bg-slate-50 transition-colors group',
                            isSelected && 'bg-blue-50 hover:bg-blue-100',
                            isEditing && 'bg-amber-50 hover:bg-amber-50'
                          )}
                        >
                          {hasSelectionFeature && (
                            <td className="px-4 py-2">
                              <button
                                onClick={() => onToggleSelection(rule.id)}
                                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                                title={isSelected ? 'Deseleccionar' : 'Seleccionar'}
                                disabled={isEditing}
                              >
                                {isSelected ? (
                                  <CheckSquare size={18} className="text-blue-600" />
                                ) : (
                                  <Square size={18} />
                                )}
                              </button>
                            </td>
                          )}
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2 pl-12">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-300">↳</span>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={handleEditKeyDown}
                                  className="flex-1 px-2 py-1 text-sm font-mono border border-amber-300 rounded focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                                  autoFocus
                                  data-testid="edit-value-input"
                                />
                              ) : (
                                <span
                                  className={cn(
                                    'text-sm font-mono text-slate-600 break-all',
                                    canEdit && 'cursor-pointer hover:text-blue-600'
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (canEdit) startEdit(rule);
                                  }}
                                  title={canEdit ? 'Haz clic para editar' : undefined}
                                >
                                  {rule.value}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {getRuleTypeBadge(rule.type)}
                              </span>
                              {rule.source === 'auto_extension' && (
                                <span className="text-xs px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200">
                                  Auto (Firefox)
                                </span>
                              )}
                            </div>
                          </td>
                          {!readOnly && (
                            <td className="px-4 py-2 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => void saveEdit()}
                                    disabled={isSaving || !editValue.trim()}
                                    className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Guardar (Enter)"
                                    data-testid="save-edit-button"
                                  >
                                    {isSaving ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <Save size={14} />
                                    )}
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    disabled={isSaving}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
                                    title="Cancelar (Esc)"
                                    data-testid="cancel-edit-button"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {canEdit && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startEdit(rule);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title="Editar"
                                      data-testid="edit-button"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDelete(rule);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HierarchicalRulesTable;
