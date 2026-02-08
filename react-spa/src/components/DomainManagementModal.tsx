import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Trash2, Plus, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { trpc } from '../lib/trpc';

// Domain validation regex
const DOMAIN_REGEX =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

interface Rule {
  id: string;
  groupId: string;
  type: 'whitelist' | 'blocked_subdomain' | 'blocked_path';
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

export const DomainManagementModal: React.FC<DomainManagementModalProps> = ({
  isOpen,
  onClose,
  groupId,
  groupName,
  onDomainsChanged,
  onToast,
}) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [inputError, setInputError] = useState('');
  const [adding, setAdding] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedCounts, setAdvancedCounts] = useState({ subdomain: 0, path: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch rules when modal opens
  const fetchRules = useCallback(async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      const data = await trpc.groups.listRules.query({ groupId, type: 'whitelist' });
      setRules(data);

      // Also fetch counts for advanced sections
      const [subdomains, paths] = await Promise.all([
        trpc.groups.listRules.query({ groupId, type: 'blocked_subdomain' }),
        trpc.groups.listRules.query({ groupId, type: 'blocked_path' }),
      ]);
      setAdvancedCounts({ subdomain: subdomains.length, path: paths.length });
    } catch (err) {
      console.error('Failed to fetch rules:', err);
      onToast('Error al cargar dominios', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, onToast]);

  useEffect(() => {
    if (isOpen) {
      void fetchRules();
      setSearch('');
      setNewDomain('');
      setInputError('');
      setShowAdvanced(false);
    }
  }, [isOpen, fetchRules]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && !loading) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, loading]);

  // Validate a single domain
  const validateDomain = (domain: string): string | null => {
    const trimmed = domain.trim().toLowerCase();
    if (!trimmed) return null;

    // Remove protocol if accidentally pasted
    const cleaned = trimmed.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    if (!DOMAIN_REGEX.test(cleaned)) {
      return `"${cleaned}" no es un dominio válido`;
    }

    if (rules.some((r) => r.value === cleaned)) {
      return `"${cleaned}" ya existe`;
    }

    return null; // Valid
  };

  // Parse input for multiple domains (newlines, commas, spaces)
  const parseDomainsFromInput = (input: string): string[] => {
    return input
      .split(/[\n,\s]+/)
      .map((d) =>
        d
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
      )
      .filter((d) => d.length > 0);
  };

  // Add domains
  const handleAddDomains = async () => {
    const domains = parseDomainsFromInput(newDomain);

    if (domains.length === 0) {
      setInputError('Introduce al menos un dominio');
      return;
    }

    // Validate all domains
    const validDomains: string[] = [];
    const errors: string[] = [];

    for (const domain of domains) {
      if (!DOMAIN_REGEX.test(domain)) {
        errors.push(`"${domain}" no es un dominio válido`);
      } else if (rules.some((r) => r.value === domain)) {
        errors.push(`"${domain}" ya existe`);
      } else if (!validDomains.includes(domain)) {
        validDomains.push(domain);
      }
    }

    if (validDomains.length === 0) {
      setInputError(errors[0] ?? 'No hay dominios válidos');
      return;
    }

    try {
      setAdding(true);
      setInputError('');

      if (validDomains.length === 1) {
        await trpc.groups.createRule.mutate({
          groupId,
          type: 'whitelist',
          value: validDomains[0],
        });
        onToast(`"${validDomains[0]}" añadido`, 'success');
      } else {
        const result = await trpc.groups.bulkCreateRules.mutate({
          groupId,
          type: 'whitelist',
          values: validDomains,
        });
        onToast(`${result.count.toString()} dominios añadidos`, 'success');
      }

      setNewDomain('');
      await fetchRules();
      onDomainsChanged();

      if (errors.length > 0) {
        setTimeout(
          () =>
            onToast(
              `${errors.length.toString()} dominios omitidos (duplicados o inválidos)`,
              'error'
            ),
          500
        );
      }
    } catch (err) {
      console.error('Failed to add domains:', err);
      onToast('Error al añadir dominios', 'error');
    } finally {
      setAdding(false);
    }
  };

  // Delete domain with undo
  const handleDeleteDomain = async (rule: Rule) => {
    // Optimistic update
    setRules((prev) => prev.filter((r) => r.id !== rule.id));

    try {
      await trpc.groups.deleteRule.mutate({ id: rule.id });

      onToast(`"${rule.value}" eliminado`, 'success', async () => {
        // Undo: re-create the rule
        try {
          await trpc.groups.createRule.mutate({
            groupId: rule.groupId,
            type: rule.type,
            value: rule.value,
            comment: rule.comment ?? undefined,
          });
          await fetchRules();
          onDomainsChanged();
          onToast(`"${rule.value}" restaurado`, 'success');
        } catch (err) {
          console.error('Failed to undo delete:', err);
          onToast('Error al restaurar dominio', 'error');
        }
      });

      onDomainsChanged();
    } catch (err) {
      // Revert optimistic update
      setRules((prev) => [...prev, rule]);
      console.error('Failed to delete rule:', err);
      onToast('Error al eliminar dominio', 'error');
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !adding) {
      e.preventDefault();
      void handleAddDomains();
    }
  };

  // Filter rules by search
  const filteredRules = rules.filter((r) => r.value.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Dominios Permitidos: ${groupName}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={`Buscar en ${rules.length.toString()} dominios...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Domain List */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              Cargando dominios...
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              {search ? 'No se encontraron dominios' : 'No hay dominios configurados'}
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {filteredRules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 group"
                >
                  <span className="text-sm text-slate-700 font-mono">{rule.value}</span>
                  <button
                    onClick={() => void handleDeleteDomain(rule)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add Domain Input */}
        <div className="space-y-1">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Añadir dominio (o pega varios)"
                value={newDomain}
                onChange={(e) => {
                  setNewDomain(e.target.value);
                  if (inputError) setInputError('');
                }}
                onKeyDown={handleKeyDown}
                className={cn(
                  'w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none',
                  inputError ? 'border-red-300 focus:ring-red-500' : 'border-slate-200'
                )}
              />
            </div>
            <Button
              onClick={() => void handleAddDomains()}
              disabled={adding || !newDomain.trim()}
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
          <p className="text-xs text-slate-400">
            Tip: Pega una lista de dominios separados por líneas, comas o espacios
          </p>
        </div>

        {/* Advanced Options */}
        <div className="border-t border-slate-100 pt-4">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Opciones avanzadas
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-2 pl-6">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">
                  Subdominios bloqueados ({advancedCounts.subdomain})
                </span>
                <span className="text-xs text-slate-400">Próximamente</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">
                  Rutas bloqueadas ({advancedCounts.path})
                </span>
                <span className="text-xs text-slate-400">Próximamente</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default DomainManagementModal;
