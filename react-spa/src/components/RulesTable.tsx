import React, { useState, useMemo, useCallback } from 'react';
import {
  Trash2,
  Edit2,
  Check,
  Ban,
  Route,
  Loader2,
  Square,
  CheckSquare,
  Minus,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Save,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getRuleTypeBadge } from '../lib/ruleDetection';

export type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

export type SortField = 'value' | 'type' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export interface Rule {
  id: string;
  groupId: string;
  type: RuleType;
  value: string;
  source?: 'manual' | 'auto_extension';
  comment: string | null;
  createdAt: string;
}

interface RulesTableProps {
  rules: Rule[];
  loading: boolean;
  onDelete: (rule: Rule) => void;
  onEdit?: (rule: Rule) => void;
  onSave?: (id: string, data: { value?: string; comment?: string | null }) => Promise<boolean>;
  readOnly?: boolean;
  emptyMessage?: string;
  className?: string;
  // Selection props
  selectedIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
  onToggleSelectAll?: () => void;
  isAllSelected?: boolean;
  hasSelection?: boolean;
}

/**
 * RulesTable - Displays rules in a table format with actions.
 */
export const RulesTable: React.FC<RulesTableProps> = ({
  rules,
  loading,
  onDelete,
  onEdit: _onEdit,
  onSave,
  readOnly = false,
  emptyMessage = 'No hay reglas configuradas',
  className,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
  isAllSelected,
  hasSelection,
}) => {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editComment, setEditComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hasSelectionFeature =
    !readOnly && selectedIds !== undefined && onToggleSelection !== undefined;

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

    const rule = rules.find((r) => r.id === editingId);
    if (!rule) return;

    // Check if anything changed
    const valueChanged = editValue.trim() !== rule.value;
    const commentChanged = editComment !== (rule.comment ?? '');

    if (!valueChanged && !commentChanged) {
      cancelEdit();
      return;
    }

    if (!editValue.trim()) {
      return; // Don't save empty value
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
  }, [editingId, editValue, editComment, rules, onSave, isSaving, cancelEdit]);

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

  // Handle column header click for sorting
  const handleSort = useCallback((field: SortField) => {
    setSortConfig((current) => {
      if (current?.field === field) {
        // Toggle direction or clear if already desc
        if (current.direction === 'asc') {
          return { field, direction: 'desc' };
        }
        return null; // Clear sort
      }
      // New field, start with asc
      return { field, direction: 'asc' };
    });
  }, []);

  // Sort rules based on current config
  const sortedRules = useMemo(() => {
    if (!sortConfig) return rules;

    return [...rules].sort((a, b) => {
      const { field, direction } = sortConfig;
      let comparison = 0;

      switch (field) {
        case 'value':
          comparison = a.value.localeCompare(b.value);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }

      return direction === 'desc' ? -comparison : comparison;
    });
  }, [rules, sortConfig]);

  // Render sort indicator
  const renderSortIcon = (field: SortField) => {
    if (sortConfig?.field !== field) {
      return <ArrowUpDown size={14} className="text-slate-300" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp size={14} className="text-blue-600" />
    ) : (
      <ArrowDown size={14} className="text-blue-600" />
    );
  };

  // Render sortable header
  const renderSortableHeader = (field: SortField, label: string, headerClassName: string) => (
    <th className={headerClassName}>
      <button
        onClick={() => handleSort(field)}
        className="flex items-center gap-1 hover:text-slate-700 transition-colors group/sort"
        data-testid={`sort-${field}`}
      >
        {label}
        <span className="opacity-50 group-hover/sort:opacity-100 transition-opacity">
          {renderSortIcon(field)}
        </span>
      </button>
    </th>
  );

  const getTypeIcon = (type: RuleType) => {
    switch (type) {
      case 'whitelist':
        return <Check size={12} className="text-green-600" />;
      case 'blocked_subdomain':
        return <Ban size={12} className="text-red-600" />;
      case 'blocked_path':
        return <Route size={12} className="text-red-600" />;
    }
  };

  const getTypeBadgeClass = (type: RuleType) => {
    return type === 'whitelist'
      ? 'bg-green-100 text-green-700 border-green-200'
      : 'bg-red-100 text-red-700 border-red-200';
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
  };

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

  if (rules.length === 0) {
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
              {renderSortableHeader('value', 'Valor', 'px-4 py-3')}
              {renderSortableHeader('type', 'Tipo', 'px-4 py-3 w-32')}
              <th className="px-4 py-3 hidden md:table-cell">Comentario</th>
              {renderSortableHeader('createdAt', 'Fecha', 'px-4 py-3 w-28 hidden sm:table-cell')}
              {!readOnly && <th className="px-4 py-3 w-20 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRules.map((rule) => {
              const isSelected = selectedIds?.has(rule.id) ?? false;
              const isEditing = editingId === rule.id;
              return (
                <tr
                  key={rule.id}
                  className={cn(
                    'hover:bg-slate-50 transition-colors group',
                    isSelected && 'bg-blue-50 hover:bg-blue-100',
                    isEditing && 'bg-amber-50 hover:bg-amber-50'
                  )}
                >
                  {hasSelectionFeature && (
                    <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        className="w-full px-2 py-1 text-sm font-mono border border-amber-300 rounded focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                        autoFocus
                        data-testid="edit-value-input"
                      />
                    ) : (
                      <span
                        className={cn(
                          'text-sm text-slate-800 font-mono break-all',
                          onSave && 'cursor-pointer hover:text-blue-600'
                        )}
                        onClick={() => onSave && startEdit(rule)}
                        onDoubleClick={() => onSave && startEdit(rule)}
                        title={onSave ? 'Haz clic para editar' : undefined}
                      >
                        {rule.value}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border font-medium',
                          getTypeBadgeClass(rule.type)
                        )}
                      >
                        {getTypeIcon(rule.type)}
                        {getRuleTypeBadge(rule.type)}
                      </span>
                      {rule.source === 'auto_extension' && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full border font-medium bg-cyan-50 text-cyan-700 border-cyan-200">
                          Auto (Firefox)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editComment}
                        onChange={(e) => setEditComment(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        placeholder="Comentario (opcional)"
                        className="w-full px-2 py-1 text-sm border border-amber-300 rounded focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                        data-testid="edit-comment-input"
                      />
                    ) : (
                      <span
                        className={cn(
                          'text-sm text-slate-500 truncate max-w-xs block',
                          onSave && 'cursor-pointer hover:text-blue-600'
                        )}
                        onClick={() => onSave && startEdit(rule)}
                        onDoubleClick={() => onSave && startEdit(rule)}
                        title={onSave ? 'Haz clic para editar' : undefined}
                      >
                        {rule.comment ?? '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs text-slate-400">{formatDate(rule.createdAt)}</span>
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-3">
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
                          {onSave && (
                            <button
                              onClick={() => startEdit(rule)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Editar"
                              data-testid="edit-button"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => onDelete(rule)}
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
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RulesTable;
