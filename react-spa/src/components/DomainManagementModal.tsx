import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal } from './ui/Modal';
import { FilterChips } from './ui/FilterChips';
import { cn } from '../lib/utils';
import { trpc } from '../lib/trpc';
import { RuleType } from './RuleList';
import { Search, Trash2, Plus, Loader2, AlertCircle, Check, Ban, Info } from 'lucide-react';
import { Button } from './ui/Button';
import { detectRuleType, getRuleTypeBadge } from '../lib/ruleDetection';

interface Rule {
  id: string;
  groupId: string;
  type: RuleType;
  value: string;
  comment: string | null;
  createdAt: string;
}

interface DomainManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  onDomainsChanged: () => void;
  onToast: (message: string, type: 'success' | 'error', undoAction?: () => void) => void;
}

type FilterType = 'all' | 'allowed' | 'blocked';

// Domain validation regex
const DOMAIN_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

// Subdomain validation regex (supports wildcards like *.example.com)
const SUBDOMAIN_REGEX =
  /^(?:\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

// Path validation
const validatePath = (value: string): boolean => {
  const cleaned = value.replace(/^https?:\/\//, '').replace(/^\*:\/\//, '');
  if (!cleaned.includes('/')) return false;

  const slashIndex = cleaned.indexOf('/');
  const domainPart = cleaned.substring(0, slashIndex);
  const pathPart = cleaned.substring(slashIndex);

  if (domainPart !== '*') {
    if (!SUBDOMAIN_REGEX.test(domainPart)) return false;
  }

  if (pathPart.length < 2) return false;
  if (/\s/.test(pathPart)) return false;
  if (pathPart.includes('//')) return false;

  return true;
};

// Validate based on detected type
const validateForType = (value: string, type: RuleType): boolean => {
  switch (type) {
    case 'whitelist':
      return DOMAIN_REGEX.test(value);
    case 'blocked_subdomain':
      return SUBDOMAIN_REGEX.test(value);
    case 'blocked_path':
      return validatePath(value);
  }
};

export const DomainManagementModal: React.FC<DomainManagementModalProps> = ({
  isOpen,
  onClose,
  groupId,
  groupName,
  onDomainsChanged,
  onToast,
}) => {
  const [allRules, setAllRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [newValue, setNewValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [adding, setAdding] = useState(false);
  const isSubmittingRef = useRef(false);
  const pendingValuesRef = useRef<Set<string>>(new Set());

  // Fetch all rules when modal opens
  const fetchRules = useCallback(async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      const [whitelist, subdomains, paths] = await Promise.all([
        trpc.groups.listRules.query({ groupId, type: 'whitelist' }),
        trpc.groups.listRules.query({ groupId, type: 'blocked_subdomain' }),
        trpc.groups.listRules.query({ groupId, type: 'blocked_path' }),
      ]);
      // Combine all rules into a single array
      const combined = [...whitelist, ...subdomains, ...paths];
      // Sort by type (whitelist first), then by value
      combined.sort((a, b) => {
        if (a.type === 'whitelist' && b.type !== 'whitelist') return -1;
        if (a.type !== 'whitelist' && b.type === 'whitelist') return 1;
        return a.value.localeCompare(b.value);
      });
      setAllRules(combined);
    } catch (err) {
      console.error('Failed to fetch rules:', err);
      onToast('Error al cargar reglas', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, onToast]);

  useEffect(() => {
    if (isOpen) {
      void fetchRules();
      setActiveFilter('all');
      setSearch('');
      setNewValue('');
      setInputError('');
    }
  }, [isOpen, fetchRules]);

  // Get whitelist domains for detection
  const whitelistDomains = useMemo(
    () => allRules.filter((r) => r.type === 'whitelist').map((r) => r.value),
    [allRules]
  );

  // Detect type for current input
  const detectedType = useMemo(() => {
    if (!newValue.trim()) return null;
    return detectRuleType(newValue, whitelistDomains);
  }, [newValue, whitelistDomains]);

  // Filter counts
  const counts = useMemo(() => {
    const allowed = allRules.filter((r) => r.type === 'whitelist').length;
    const blocked = allRules.filter((r) => r.type !== 'whitelist').length;
    return { all: allRules.length, allowed, blocked };
  }, [allRules]);

  // Filtered rules
  const filteredRules = useMemo(() => {
    let filtered = allRules;

    // Apply category filter
    if (activeFilter === 'allowed') {
      filtered = filtered.filter((r) => r.type === 'whitelist');
    } else if (activeFilter === 'blocked') {
      filtered = filtered.filter((r) => r.type !== 'whitelist');
    }

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((r) => r.value.toLowerCase().includes(searchLower));
    }

    return filtered;
  }, [allRules, activeFilter, search]);

  // Handle rules changed
  const handleRulesChanged = async () => {
    await fetchRules();
    onDomainsChanged();
  };

  // Add rule with auto-detected type
  const handleAddRule = async () => {
    // Prevent double submission via ref AND state (belt and suspenders)
    if (isSubmittingRef.current || adding) return;
    isSubmittingRef.current = true;

    // Capture and validate input immediately
    const inputValue = newValue.trim();
    if (!inputValue) {
      isSubmittingRef.current = false;
      return;
    }

    // Detect type for the captured value
    const detected = detectRuleType(inputValue, whitelistDomains);
    if (!detected) {
      setInputError('Introduce un valor válido');
      isSubmittingRef.current = false;
      return;
    }

    const { type, cleanedValue } = detected;

    // Validate
    if (!validateForType(cleanedValue, type)) {
      setInputError(`"${cleanedValue}" no es un formato válido`);
      isSubmittingRef.current = false;
      return;
    }

    // Create a unique key for this rule (type + value)
    const ruleKey = `${type}:${cleanedValue}`;

    // Check for duplicates in existing rules
    if (allRules.some((r) => r.value === cleanedValue && r.type === type)) {
      setInputError(`"${cleanedValue}" ya existe`);
      isSubmittingRef.current = false;
      return;
    }

    // Check for duplicates in pending submissions (prevents rapid double-clicks)
    if (pendingValuesRef.current.has(ruleKey)) {
      isSubmittingRef.current = false;
      return;
    }

    // Mark this value as pending BEFORE any async operation
    pendingValuesRef.current.add(ruleKey);

    // Clear input IMMEDIATELY to prevent re-submission on rapid events
    setNewValue('');
    setAdding(true);
    setInputError('');

    try {
      await trpc.groups.createRule.mutate({
        groupId,
        type,
        value: cleanedValue,
      });

      onToast(`"${cleanedValue}" añadido como ${getRuleTypeBadge(type)}`, 'success');
      await handleRulesChanged();
    } catch (err) {
      console.error('Failed to add rule:', err);
      onToast('Error al añadir regla', 'error');
      // Restore input value on error so user can retry
      setNewValue(inputValue);
    } finally {
      setAdding(false);
      isSubmittingRef.current = false;
      pendingValuesRef.current.delete(ruleKey);
    }
  };

  // Delete rule with undo
  const handleDeleteRule = async (rule: Rule) => {
    try {
      await trpc.groups.deleteRule.mutate({ id: rule.id, groupId: rule.groupId });

      onToast(`"${rule.value}" eliminado`, 'success', () => {
        void (async () => {
          try {
            await trpc.groups.createRule.mutate({
              groupId: rule.groupId,
              type: rule.type,
              value: rule.value,
              comment: rule.comment ?? undefined,
            });
            await handleRulesChanged();
            onToast(`"${rule.value}" restaurado`, 'success');
          } catch (err) {
            console.error('Failed to undo delete:', err);
            onToast('Error al restaurar elemento', 'error');
          }
        })();
      });

      await handleRulesChanged();
    } catch (err) {
      console.error('Failed to delete rule:', err);
      onToast('Error al eliminar elemento', 'error');
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !adding && newValue.trim()) {
      e.preventDefault();
      void handleAddRule();
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewValue(e.target.value);
    if (inputError) setInputError('');
  };

  // Filter options for chips
  const filterOptions = [
    { id: 'all' as FilterType, label: 'Todos', count: counts.all },
    {
      id: 'allowed' as FilterType,
      label: 'Permitidos',
      count: counts.allowed,
      icon: <Check size={12} />,
    },
    {
      id: 'blocked' as FilterType,
      label: 'Bloqueados',
      count: counts.blocked,
      icon: <Ban size={12} />,
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Gestionar Reglas: ${groupName}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Filter Chips */}
        <FilterChips
          options={filterOptions}
          activeId={activeFilter}
          onChange={(id) => setActiveFilter(id as FilterType)}
        />

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={`Buscar en ${allRules.length.toString()} reglas...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Rules List */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              Cargando...
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              {search ? 'No se encontraron resultados' : 'No hay reglas configuradas'}
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {filteredRules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
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

        {/* Add Input (Omnibar) */}
        <div className="space-y-1">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Añadir regla (dominio, subdominio o ruta)..."
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
              onClick={() => void handleAddRule()}
              disabled={adding || !newValue.trim()}
              isLoading={adding}
              size="md"
            >
              <Plus size={16} className="mr-1" />
              Añadir
            </Button>
          </div>

          {/* Error message */}
          {inputError && (
            <p className="text-red-500 text-xs flex items-center gap-1">
              <AlertCircle size={12} />
              {inputError}
            </p>
          )}

          {/* Auto-detection hint */}
          {detectedType && !inputError && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Info size={12} />
              Se añadirá como:{' '}
              <span
                className={cn(
                  'font-medium',
                  detectedType.type === 'whitelist' ? 'text-green-600' : 'text-red-600'
                )}
              >
                {getRuleTypeBadge(detectedType.type)}
              </span>
              {detectedType.confidence === 'medium' && (
                <span className="text-amber-600"> (sugerido)</span>
              )}
            </p>
          )}

          {/* Collapsed help */}
          {!newValue.trim() && (
            <p className="text-xs text-slate-400">
              Escribe un dominio, subdominio (ej: ads.google.com) o ruta (ej: facebook.com/gaming)
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default DomainManagementModal;
