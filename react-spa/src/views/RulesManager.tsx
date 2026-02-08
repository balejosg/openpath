import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  Plus,
  Check,
  Ban,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Tabs } from '../components/ui/Tabs';
import { RulesTable } from '../components/RulesTable';
import { BulkActionBar } from '../components/BulkActionBar';
import { Button } from '../components/ui/Button';
import { useRulesManager, FilterType } from '../hooks/useRulesManager';
import { useToast } from '../components/ui/Toast';
import { detectRuleType, getRuleTypeBadge } from '../lib/ruleDetection';
import { cn } from '../lib/utils';

interface RulesManagerProps {
  groupId: string;
  groupName: string;
  onBack: () => void;
}

/**
 * RulesManager - Full-page view for managing domain rules.
 */
export const RulesManager: React.FC<RulesManagerProps> = ({ groupId, groupName, onBack }) => {
  const { success, error: toastError, ToastContainer } = useToast();

  // New rule input state
  const [newValue, setNewValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const {
    rules,
    total,
    loading,
    error,
    page,
    setPage,
    totalPages,
    filter,
    setFilter,
    search,
    setSearch,
    counts,
    selectedIds,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    isAllSelected,
    hasSelection,
    addRule,
    deleteRule,
    bulkDeleteRules,
    refetch,
  } = useRulesManager({
    groupId,
    onToast: (message, type, undoAction) => {
      if (type === 'success') {
        success(message, undoAction);
      } else {
        toastError(message);
      }
    },
  });

  // Get whitelist domains for type detection
  const whitelistDomains = useMemo(() => {
    return rules.filter((r) => r.type === 'whitelist').map((r) => r.value);
  }, [rules]);

  // Detect type for current input
  const detectedType = useMemo(() => {
    if (!newValue.trim()) return null;
    return detectRuleType(newValue, whitelistDomains);
  }, [newValue, whitelistDomains]);

  // Handle add rule
  const handleAddRule = async () => {
    if (!newValue.trim() || adding) return;

    setAdding(true);
    setInputError('');

    const succeeded = await addRule(newValue);
    if (succeeded) {
      setNewValue('');
    }

    setAdding(false);
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

  // Handle bulk delete
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    await bulkDeleteRules();
    setBulkDeleting(false);
  };

  // Tab configuration
  const tabs = [
    { id: 'all' as FilterType, label: 'Todos', count: counts.all },
    {
      id: 'allowed' as FilterType,
      label: 'Permitidos',
      count: counts.allowed,
      icon: <Check size={14} />,
    },
    {
      id: 'blocked' as FilterType,
      label: 'Bloqueados',
      count: counts.blocked,
      icon: <Ban size={14} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          title="Volver a grupos"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Gestión de Reglas</h2>
          <p className="text-slate-500 text-sm">{groupName}</p>
        </div>
      </div>

      {/* Search and Add */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={`Buscar en ${String(counts.all)} reglas...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Add rule input */}
        <div className="flex gap-2 sm:w-auto w-full">
          <div className="flex-1 sm:w-80">
            <input
              type="text"
              placeholder="Añadir dominio, subdominio o ruta..."
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
      </div>

      {/* Detection hint */}
      {detectedType && !inputError && (
        <p className="text-xs text-slate-500 flex items-center gap-1 -mt-2">
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

      {/* Error message */}
      {inputError && (
        <p className="text-red-500 text-xs flex items-center gap-1 -mt-2">
          <AlertCircle size={12} />
          {inputError}
        </p>
      )}

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={filter} onChange={(id) => setFilter(id as FilterType)} />

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={() => void refetch()}
            className="text-red-700 hover:text-red-800 text-sm mt-2 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Rules Table */}
      {!error && (
        <RulesTable
          rules={rules}
          loading={loading}
          onDelete={(rule) => void deleteRule(rule)}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          onToggleSelectAll={toggleSelectAll}
          isAllSelected={isAllSelected}
          hasSelection={hasSelection}
          emptyMessage={
            search
              ? 'No se encontraron resultados para tu búsqueda'
              : filter === 'allowed'
                ? 'No hay dominios permitidos'
                : filter === 'blocked'
                  ? 'No hay dominios bloqueados'
                  : 'No hay reglas configuradas. Añade una para empezar.'
          }
        />
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-500">
            Mostrando {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} de {total} reglas
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-slate-600">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer />

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onDelete={() => void handleBulkDelete()}
        onClear={clearSelection}
        isDeleting={bulkDeleting}
      />
    </div>
  );
};

export default RulesManager;
