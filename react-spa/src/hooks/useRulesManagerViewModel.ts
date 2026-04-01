import { createElement, useCallback, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Ban, Check } from 'lucide-react';
import { detectRuleType, validateRuleValue } from '../lib/ruleDetection';
import { readMultipleFiles } from '../lib/fileReader';
import { useGroupedRulesManager } from './useGroupedRulesManager';
import { useRulesManager, type FilterType } from './useRulesManager';

export type ViewMode = 'flat' | 'hierarchical';

interface UseRulesManagerViewModelOptions {
  groupId: string;
  onToast: (message: string, type: 'success' | 'error', undoAction?: () => void) => void;
  onError: (message: string) => void;
}

export function useRulesManagerViewModel({
  groupId,
  onToast,
  onError,
}: UseRulesManagerViewModelOptions) {
  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [newValue, setNewValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importInitialText, setImportInitialText] = useState('');
  const dragCounter = useRef(0);

  const flatHook = useRulesManager({
    groupId,
    onToast,
  });

  const groupedHook = useGroupedRulesManager({
    groupId,
    onToast,
  });

  const manager =
    viewMode === 'hierarchical'
      ? {
          rules: groupedHook.domainGroups.flatMap((group) => group.rules),
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

  const whitelistDomains = useMemo(() => {
    return manager.rules.filter((rule) => rule.type === 'whitelist').map((rule) => rule.value);
  }, [manager.rules]);

  const detectedType = useMemo(() => {
    if (!newValue.trim()) return null;
    return detectRuleType(newValue, whitelistDomains);
  }, [newValue, whitelistDomains]);

  const validationError = useMemo(() => {
    if (!newValue.trim() || !detectedType) return '';
    const result = validateRuleValue(newValue, detectedType.type);
    return result.valid ? '' : (result.error ?? '');
  }, [newValue, detectedType]);

  const handleAddRule = async (readOnly: boolean) => {
    if (readOnly) return;
    if (!newValue.trim() || adding) return;

    if (detectedType) {
      const validation = validateRuleValue(newValue, detectedType.type);
      if (!validation.valid) {
        setInputError(validation.error ?? 'Formato inválido');
        return;
      }
    }

    setAdding(true);
    setInputError('');

    const succeeded = await manager.addRule(newValue);
    if (succeeded) {
      setNewValue('');
    }

    setAdding(false);
  };

  const handleInputChange = (value: string) => {
    setNewValue(value);
    if (inputError) setInputError('');
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    await manager.bulkDeleteRules();
    setBulkDeleting(false);
  };

  const handleDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current++;
    if (event.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      dragCounter.current = 0;

      const { files } = event.dataTransfer;
      if (files.length === 0) return;

      void (async () => {
        try {
          const result = await readMultipleFiles(files);
          if (result.content) {
            setImportInitialText(result.content);
            setShowImportModal(true);
            if (result.skippedFiles.length > 0) {
              onError(`Archivos ignorados: ${result.skippedFiles.join(', ')}`);
            }
          } else if (result.skippedFiles.length > 0) {
            onError('Solo se permiten archivos .txt, .csv o .list');
          }
        } catch {
          onError('Error al leer los archivos');
        }
      })();
    },
    [onError]
  );

  const handleImportModalClose = useCallback(() => {
    setShowImportModal(false);
    setImportInitialText('');
  }, []);

  const handleViewModeChange = (nextViewMode: ViewMode) => {
    if (viewMode === nextViewMode) return;
    setViewMode(nextViewMode);
    void (nextViewMode === 'flat' ? flatHook.refetch() : groupedHook.refetch());
  };

  const emptyMessage = manager.search
    ? 'No se encontraron resultados para tu búsqueda'
    : manager.filter === 'allowed'
      ? 'No hay dominios permitidos'
      : manager.filter === 'blocked'
        ? 'No hay dominios bloqueados'
        : 'No hay reglas configuradas. Añade una para empezar.';

  const tabs = [
    { id: 'all' as FilterType, label: 'Todos', count: manager.counts.all },
    {
      id: 'allowed' as FilterType,
      label: 'Permitidas',
      count: manager.counts.allowed,
      icon: createElement(Check, { size: 14 }),
    },
    {
      id: 'blocked' as FilterType,
      label: 'Bloqueadas',
      count: manager.counts.blocked,
      icon: createElement(Ban, { size: 14 }),
    },
  ];

  return {
    viewMode,
    manager,
    groupedHook,
    newValue,
    inputError,
    adding,
    bulkDeleting,
    showImportModal,
    isDragOver,
    importInitialText,
    detectedType,
    validationError,
    tabs,
    emptyMessage,
    handleAddRule,
    handleInputChange,
    handleBulkDelete,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleImportModalClose,
    handleViewModeChange,
    openImportModal: () => setShowImportModal(true),
    closeImportModal: handleImportModalClose,
    setSearch: manager.setSearch,
    setFilter: manager.setFilter,
    setPage: manager.setPage,
    setShowImportModal,
  };
}
