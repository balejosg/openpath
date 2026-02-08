import React, { useState, useEffect, useRef } from 'react';
import { Search, Trash2, Plus, Loader2, AlertCircle, Info, Check, Ban } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { trpc } from '../lib/trpc';
import { getRuleTypeBadge } from '../lib/ruleDetection';

// Domain validation regex (exact domain)
const DOMAIN_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

// Subdomain validation regex (supports wildcards like *.example.com)
const SUBDOMAIN_REGEX =
  /^(?:\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

export type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

interface Rule {
  id: string;
  groupId: string;
  type: RuleType;
  value: string;
  comment: string | null;
  createdAt: string;
}

interface RuleListProps {
  groupId: string;
  ruleType: RuleType;
  rules: Rule[];
  loading: boolean;
  onRulesChanged: () => Promise<void>;
  onToast: (message: string, type: 'success' | 'error', undoAction?: () => void) => void;
  placeholder: string;
  helpText?: string;
  allowBulkAdd?: boolean;
  emptyMessage: string;
  tipText?: string;
  validatePattern?: (value: string) => { valid: boolean; warning?: string };
  showTypeIndicator?: boolean;
}

export const RuleList: React.FC<RuleListProps> = ({
  groupId,
  ruleType,
  rules,
  loading,
  onRulesChanged,
  onToast,
  placeholder,
  helpText,
  allowBulkAdd = true,
  emptyMessage,
  tipText,
  validatePattern,
  showTypeIndicator = false,
}) => {
  const [search, setSearch] = useState('');
  const [newValue, setNewValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [inputWarning, setInputWarning] = useState('');
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (!loading) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading]);

  // Default validation based on rule type
  const getValidationRegex = (): RegExp => {
    if (ruleType === 'blocked_subdomain') {
      return SUBDOMAIN_REGEX;
    }
    return DOMAIN_REGEX;
  };

  // Validate a single value
  const validateValue = (value: string): { valid: boolean; error?: string; warning?: string } => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return { valid: false };

    // Remove protocol if accidentally pasted
    // For paths, preserve the /path portion; for domains, strip it
    let cleaned = trimmed.replace(/^https?:\/\//, '');
    if (ruleType !== 'blocked_path') {
      cleaned = cleaned.replace(/\/.*$/, '');
    }

    // Use custom validation if provided
    if (validatePattern) {
      const result = validatePattern(cleaned);
      if (!result.valid) {
        return { valid: false, error: `"${cleaned}" no es un patrón válido` };
      }
      if (result.warning) {
        return { valid: true, warning: result.warning };
      }
    } else {
      // Default validation
      const regex = getValidationRegex();
      if (!regex.test(cleaned)) {
        return { valid: false, error: `"${cleaned}" no es un dominio válido` };
      }
    }

    // Check for duplicates
    if (rules.some((r) => r.value === cleaned)) {
      return { valid: false, error: `"${cleaned}" ya existe` };
    }

    return { valid: true };
  };

  // Parse input for multiple values (newlines, commas, spaces for domains; newlines/commas for paths)
  const parseValuesFromInput = (input: string): string[] => {
    // For paths, don't split on spaces (paths might have encoded spaces or be complex)
    // and don't strip the path portion
    const splitRegex = ruleType === 'blocked_path' ? /[\n,]+/ : /[\n,\s]+/;

    return input
      .split(splitRegex)
      .map((d) => {
        let cleaned = d
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '');
        // Only strip path for domain-based rules
        if (ruleType !== 'blocked_path') {
          cleaned = cleaned.replace(/\/.*$/, '');
        }
        return cleaned;
      })
      .filter((d) => d.length > 0);
  };

  // Add values
  const handleAddValues = async () => {
    const values = parseValuesFromInput(newValue);

    if (values.length === 0) {
      setInputError('Introduce al menos un valor');
      return;
    }

    // Validate all values
    const validValues: string[] = [];
    const errors: string[] = [];
    const regex = getValidationRegex();

    for (const value of values) {
      if (validatePattern) {
        const result = validatePattern(value);
        if (!result.valid) {
          errors.push(`"${value}" no es un patrón válido`);
        } else if (rules.some((r) => r.value === value)) {
          errors.push(`"${value}" ya existe`);
        } else if (!validValues.includes(value)) {
          validValues.push(value);
        }
      } else {
        if (!regex.test(value)) {
          errors.push(`"${value}" no es un dominio válido`);
        } else if (rules.some((r) => r.value === value)) {
          errors.push(`"${value}" ya existe`);
        } else if (!validValues.includes(value)) {
          validValues.push(value);
        }
      }
    }

    if (validValues.length === 0) {
      setInputError(errors[0] ?? 'No hay valores válidos');
      return;
    }

    try {
      setAdding(true);
      setInputError('');
      setInputWarning('');

      if (validValues.length === 1) {
        await trpc.groups.createRule.mutate({
          groupId,
          type: ruleType,
          value: validValues[0],
        });
        onToast(`"${validValues[0]}" añadido`, 'success');
      } else if (allowBulkAdd) {
        const result = await trpc.groups.bulkCreateRules.mutate({
          groupId,
          type: ruleType,
          values: validValues,
        });
        onToast(`${result.count.toString()} elementos añadidos`, 'success');
      } else {
        // Add one by one if bulk not allowed
        for (const value of validValues) {
          await trpc.groups.createRule.mutate({
            groupId,
            type: ruleType,
            value,
          });
        }
        onToast(`${validValues.length.toString()} elementos añadidos`, 'success');
      }

      setNewValue('');
      await onRulesChanged();

      if (errors.length > 0) {
        setTimeout(
          () =>
            onToast(
              `${errors.length.toString()} elementos omitidos (duplicados o inválidos)`,
              'error'
            ),
          500
        );
      }
    } catch (err) {
      console.error('Failed to add values:', err);
      onToast('Error al añadir elementos', 'error');
    } finally {
      setAdding(false);
    }
  };

  // Delete rule with undo
  const handleDeleteRule = async (rule: Rule) => {
    try {
      await trpc.groups.deleteRule.mutate({ id: rule.id });

      onToast(`"${rule.value}" eliminado`, 'success', () => {
        // Undo: re-create the rule
        void (async () => {
          try {
            await trpc.groups.createRule.mutate({
              groupId: rule.groupId,
              type: rule.type,
              value: rule.value,
              comment: rule.comment ?? undefined,
            });
            await onRulesChanged();
            onToast(`"${rule.value}" restaurado`, 'success');
          } catch (err) {
            console.error('Failed to undo delete:', err);
            onToast('Error al restaurar elemento', 'error');
          }
        })();
      });

      await onRulesChanged();
    } catch (err) {
      console.error('Failed to delete rule:', err);
      onToast('Error al eliminar elemento', 'error');
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !adding) {
      e.preventDefault();
      void handleAddValues();
    }
  };

  // Handle input change with validation feedback
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewValue(value);

    if (inputError) setInputError('');

    // Show warning for single value input
    if (value.trim() && !value.includes(',') && !value.includes('\n') && !value.includes(' ')) {
      const result = validateValue(value);
      setInputWarning(result.warning ?? '');
    } else {
      setInputWarning('');
    }
  };

  // Filter rules by search
  const filteredRules = rules.filter((r) => r.value.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Help Text */}
      {helpText && (
        <div className="flex gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p>{helpText}</p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={`Buscar en ${rules.length.toString()} elementos...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Rule List */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            Cargando...
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            {search ? 'No se encontraron resultados' : emptyMessage}
          </div>
        ) : (
          <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {filteredRules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {showTypeIndicator && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full flex-shrink-0',
                        rule.type === 'whitelist'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      )}
                    >
                      {rule.type === 'whitelist' ? <Check size={10} /> : <Ban size={10} />}
                      {getRuleTypeBadge(rule.type)}
                    </span>
                  )}
                  <span className="text-sm text-slate-700 font-mono truncate">{rule.value}</span>
                </div>
                <button
                  onClick={() => void handleDeleteRule(rule)}
                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add Input */}
      <div className="space-y-1">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={newValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className={cn(
                'w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none',
                inputError ? 'border-red-300 focus:ring-red-500' : 'border-slate-200'
              )}
            />
          </div>
          <Button
            onClick={() => void handleAddValues()}
            disabled={adding || !newValue.trim()}
            isLoading={adding}
            size="md"
          >
            <Plus size={16} className="mr-1" />
            Añadir
          </Button>
        </div>
        {inputError && (
          <p className="text-red-500 text-xs flex items-center gap-1">
            <AlertCircle size={12} />
            {inputError}
          </p>
        )}
        {inputWarning && !inputError && (
          <p className="text-amber-600 text-xs flex items-center gap-1">
            <AlertCircle size={12} />
            {inputWarning}
          </p>
        )}
        {tipText && <p className="text-xs text-slate-400">{tipText}</p>}
      </div>
    </div>
  );
};

export default RuleList;
