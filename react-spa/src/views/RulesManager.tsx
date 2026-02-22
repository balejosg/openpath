import React, { useState, useMemo, useCallback, useRef } from 'react';
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
  Upload,
  FileUp,
  List,
  GitBranch,
} from 'lucide-react';
import { Tabs } from '../components/ui/Tabs';
import { RulesTable } from '../components/RulesTable';
import { HierarchicalRulesTable } from '../components/HierarchicalRulesTable';
import { BulkActionBar } from '../components/BulkActionBar';
import { BulkImportModal } from '../components/BulkImportModal';
import { ExportDropdown } from '../components/ExportDropdown';
import { Button } from '../components/ui/Button';
import { useRulesManager, FilterType } from '../hooks/useRulesManager';
import { useGroupedRulesManager } from '../hooks/useGroupedRulesManager';
import { useToast } from '../components/ui/Toast';
import { detectRuleType, getRuleTypeBadge, validateRuleValue } from '../lib/ruleDetection';
import { exportRules } from '../lib/exportRules';
import { readMultipleFiles } from '../lib/fileReader';
import { cn } from '../lib/utils';

type ViewMode = 'flat' | 'hierarchical';

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

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('flat');

  // New rule input state
  const [newValue, setNewValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Page-level drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [importInitialText, setImportInitialText] = useState('');
  const dragCounter = useRef(0);

  // Toast handler shared by both hooks
  const handleToast = useCallback(
    (message: string, type: 'success' | 'error', undoAction?: () => void) => {
      if (type === 'success') {
        success(message, undoAction);
      } else {
        toastError(message);
      }
    },
    [success, toastError]
  );

  // Flat view hook (used for flat mode)
  const flatHook = useRulesManager({
    groupId,
    onToast: handleToast,
  });

  // Grouped view hook (used for hierarchical mode)
  const groupedHook = useGroupedRulesManager({
    groupId,
    onToast: handleToast,
  });

  // Use the appropriate hook based on view mode
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
    bulkCreateRules,
    updateRule,
    refetch,
  } =
    viewMode === 'hierarchical'
      ? {
          // Map grouped hook to flat interface
          rules: groupedHook.domainGroups.flatMap((g) => g.rules),
          total: groupedHook.totalRules,
          loading: groupedHook.loading,
          error: groupedHook.error,
          page: groupedHook.page,
          setPage: groupedHook.setPage,
          totalPages: groupedHook.totalPages,
          filter: groupedHook.filter,
          setFilter: groupedHook.setFilter,
          search: groupedHook.search,
          setSearch: groupedHook.setSearch,
          counts: groupedHook.counts,
          selectedIds: groupedHook.selectedIds,
          toggleSelection: groupedHook.toggleSelection,
          toggleSelectAll: groupedHook.toggleSelectAll,
          clearSelection: groupedHook.clearSelection,
          isAllSelected: groupedHook.isAllSelected,
          hasSelection: groupedHook.hasSelection,
          addRule: groupedHook.addRule,
          deleteRule: groupedHook.deleteRule,
          bulkDeleteRules: groupedHook.bulkDeleteRules,
          bulkCreateRules: groupedHook.bulkCreateRules,
          updateRule: groupedHook.updateRule,
          refetch: groupedHook.refetch,
        }
      : flatHook;

  // Get whitelist domains for type detection
  const whitelistDomains = useMemo(() => {
    return rules.filter((r) => r.type === 'whitelist').map((r) => r.value);
  }, [rules]);

  // Detect type for current input
  const detectedType = useMemo(() => {
    if (!newValue.trim()) return null;
    return detectRuleType(newValue, whitelistDomains);
  }, [newValue, whitelistDomains]);

  // Real-time validation for current input
  const validationError = useMemo(() => {
    if (!newValue.trim() || !detectedType) return '';
    const result = validateRuleValue(newValue, detectedType.type);
    return result.valid ? '' : (result.error ?? '');
  }, [newValue, detectedType]);

  // Handle add rule
  const handleAddRule = async () => {
    if (!newValue.trim() || adding) return;

    // Validate format before sending to API
    if (detectedType) {
      const validation = validateRuleValue(newValue, detectedType.type);
      if (!validation.valid) {
        setInputError(validation.error ?? 'Formato inválido');
        return;
      }
    }

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

  // Page-level drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      dragCounter.current = 0;

      const { files } = e.dataTransfer;
      if (files.length === 0) return;

      void (async () => {
        try {
          const result = await readMultipleFiles(files);
          if (result.content) {
            setImportInitialText(result.content);
            setShowImportModal(true);
            if (result.skippedFiles.length > 0) {
              toastError(`Archivos ignorados: ${result.skippedFiles.join(', ')}`);
            }
          } else if (result.skippedFiles.length > 0) {
            toastError('Solo se permiten archivos .txt, .csv o .list');
          }
        } catch {
          toastError('Error al leer los archivos');
        }
      })();
    },
    [toastError]
  );

  // Reset initial text when modal closes
  const handleImportModalClose = useCallback(() => {
    setShowImportModal(false);
    setImportInitialText('');
  }, []);

  // Tab configuration
  const tabs = [
    { id: 'all' as FilterType, label: 'Todos', count: counts.all },
    {
      id: 'allowed' as FilterType,
      label: 'Permitidas',
      count: counts.allowed,
      icon: <Check size={14} />,
    },
    {
      id: 'blocked' as FilterType,
      label: 'Bloqueadas',
      count: counts.blocked,
      icon: <Ban size={14} />,
    },
  ];

  return (
    <div
      className="space-y-6 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Page-level drag overlay */}
      {isDragOver && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-blue-50/95 rounded-xl border-2 border-dashed border-blue-400 pointer-events-none"
          data-testid="page-drag-overlay"
        >
          <div className="text-center">
            <FileUp size={48} className="mx-auto text-blue-500 mb-3" />
            <p className="text-lg font-medium text-blue-700">Suelta los archivos aquí</p>
            <p className="text-sm text-blue-500 mt-1">Se abrirá el importador con el contenido</p>
            <p className="text-xs text-blue-400 mt-2">.txt, .csv, .list</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
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

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => {
              if (viewMode === 'flat') return;
              setViewMode('flat');
              void flatHook.refetch();
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              viewMode === 'flat'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
            title="Vista plana"
          >
            <List size={16} />
            <span className="hidden sm:inline">Lista</span>
          </button>
          <button
            onClick={() => {
              if (viewMode === 'hierarchical') return;
              setViewMode('hierarchical');
              void groupedHook.refetch();
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              viewMode === 'hierarchical'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
            title="Vista jerárquica"
          >
            <GitBranch size={16} />
            <span className="hidden sm:inline">Árbol</span>
          </button>
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
                inputError || validationError
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-slate-200'
              )}
            />
          </div>
          <Button
            onClick={() => void handleAddRule()}
            disabled={adding || !newValue.trim() || !!validationError}
            isLoading={adding}
            size="md"
          >
            <Plus size={16} className="mr-1" />
            Añadir
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowImportModal(true)}
            size="md"
            title="Importar múltiples reglas"
          >
            <Upload size={16} className="mr-1" />
            Importar
          </Button>
          <ExportDropdown
            onExport={(format) => exportRules(rules, format, `${groupName}-rules`)}
            rulesCount={rules.length}
            disabled={loading}
          />
        </div>
      </div>

      {/* Detection hint + validation feedback */}
      {detectedType && !inputError && !validationError && (
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

      {/* Real-time validation error */}
      {validationError && !inputError && (
        <p className="text-red-500 text-xs flex items-center gap-1 -mt-2">
          <AlertCircle size={12} />
          {validationError}
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
      {!error && viewMode === 'flat' && (
        <RulesTable
          rules={rules}
          loading={loading}
          onDelete={(rule) => void deleteRule(rule)}
          onSave={updateRule}
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

      {/* Hierarchical Rules Table */}
      {!error && viewMode === 'hierarchical' && (
        <HierarchicalRulesTable
          domainGroups={groupedHook.domainGroups}
          loading={loading}
          onDelete={(rule) => void deleteRule(rule)}
          onSave={updateRule}
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
            {viewMode === 'hierarchical' ? (
              <>
                Mostrando {groupedHook.domainGroups.length} de {groupedHook.totalGroups} grupos (
                {total} reglas)
              </>
            ) : (
              <>
                Mostrando {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} de {total} reglas
              </>
            )}
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

      {/* Bulk import modal */}
      <BulkImportModal
        isOpen={showImportModal}
        onClose={handleImportModalClose}
        onImport={bulkCreateRules}
        initialText={importInitialText}
      />
    </div>
  );
};

export default RulesManager;
