import React from 'react';
import { FileUp, Info } from 'lucide-react';
import { BulkActionBar } from '../components/BulkActionBar';
import { BulkImportModal } from '../components/BulkImportModal';
import { RulesManagerHeader } from '../components/rules-manager/RulesManagerHeader';
import { RulesManagerPagination } from '../components/rules-manager/RulesManagerPagination';
import { RulesManagerTableSection } from '../components/rules-manager/RulesManagerTableSection';
import { RulesManagerToolbar } from '../components/rules-manager/RulesManagerToolbar';
import { useToast } from '../components/ui/Toast';
import { exportRules } from '../lib/exportRules';
import { useRulesManagerViewModel } from '../hooks/useRulesManagerViewModel';

interface RulesManagerProps {
  groupId: string;
  groupName: string;
  readOnly?: boolean;
  onBack: () => void;
}

export const RulesManager: React.FC<RulesManagerProps> = ({
  groupId,
  groupName,
  readOnly = false,
  onBack,
}) => {
  const { success, error: toastError, ToastContainer } = useToast();
  const viewModel = useRulesManagerViewModel({
    groupId,
    onToast: (message, type, undoAction) => {
      if (type === 'success') {
        success(message, undoAction);
      } else {
        toastError(message);
      }
    },
    onError: toastError,
  });

  return (
    <div
      className="space-y-6 relative"
      onDragEnter={readOnly ? undefined : viewModel.handleDragEnter}
      onDragLeave={readOnly ? undefined : viewModel.handleDragLeave}
      onDragOver={readOnly ? undefined : viewModel.handleDragOver}
      onDrop={readOnly ? undefined : viewModel.handleDrop}
    >
      {!readOnly && viewModel.isDragOver && (
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

      <RulesManagerHeader
        groupName={groupName}
        viewMode={viewModel.viewMode}
        onBack={onBack}
        onViewModeChange={viewModel.handleViewModeChange}
      />

      {readOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 text-sm flex items-start gap-2">
          <Info size={16} className="mt-0.5 text-amber-700" />
          <div>
            <p className="font-medium">Vista de solo lectura</p>
            <p className="text-amber-800">Clona este grupo para editar sus reglas.</p>
          </div>
        </div>
      )}

      <RulesManagerToolbar
        readOnly={readOnly}
        search={viewModel.manager.search}
        countsAll={viewModel.manager.counts.all}
        newValue={viewModel.newValue}
        adding={viewModel.adding}
        loading={viewModel.manager.loading}
        inputError={viewModel.inputError}
        validationError={viewModel.validationError}
        rulesCount={viewModel.manager.rules.length}
        detectedType={viewModel.detectedType}
        onSearchChange={viewModel.manager.setSearch}
        onInputChange={viewModel.handleInputChange}
        onAddRule={() => {
          void viewModel.handleAddRule(readOnly);
        }}
        onAddKeyDown={(event) => {
          if (event.key === 'Enter' && !viewModel.adding && viewModel.newValue.trim()) {
            event.preventDefault();
            void viewModel.handleAddRule(readOnly);
          }
        }}
        onOpenImport={viewModel.openImportModal}
        onExport={(format) => exportRules(viewModel.manager.rules, format, `${groupName}-rules`)}
      />

      <RulesManagerTableSection
        tabs={viewModel.tabs}
        filter={viewModel.manager.filter}
        error={viewModel.manager.error}
        viewMode={viewModel.viewMode}
        rules={viewModel.manager.rules}
        domainGroups={viewModel.groupedHook.domainGroups}
        loading={viewModel.manager.loading}
        readOnly={readOnly}
        selectedIds={viewModel.manager.selectedIds}
        isAllSelected={viewModel.manager.isAllSelected}
        hasSelection={viewModel.manager.hasSelection}
        emptyMessage={viewModel.emptyMessage}
        onFilterChange={viewModel.manager.setFilter}
        onRetry={() => {
          void viewModel.manager.refetch();
        }}
        onDelete={(rule) => {
          void viewModel.manager.deleteRule(rule);
        }}
        onSave={viewModel.manager.updateRule}
        onToggleSelection={viewModel.manager.toggleSelection}
        onToggleSelectAll={viewModel.manager.toggleSelectAll}
      />

      <RulesManagerPagination
        viewMode={viewModel.viewMode}
        loading={viewModel.manager.loading}
        error={viewModel.manager.error}
        page={viewModel.manager.page}
        totalPages={viewModel.manager.totalPages}
        total={viewModel.manager.total}
        totalGroups={viewModel.groupedHook.totalGroups}
        visibleGroups={viewModel.groupedHook.domainGroups.length}
        onPageChange={viewModel.manager.setPage}
      />

      <ToastContainer />

      {!readOnly && (
        <BulkActionBar
          selectedCount={viewModel.manager.selectedIds.size}
          onDelete={() => void viewModel.handleBulkDelete()}
          onClear={viewModel.manager.clearSelection}
          isDeleting={viewModel.bulkDeleting}
        />
      )}

      {!readOnly && (
        <BulkImportModal
          isOpen={viewModel.showImportModal}
          onClose={viewModel.closeImportModal}
          onImport={viewModel.manager.bulkCreateRules}
          initialText={viewModel.importInitialText}
        />
      )}
    </div>
  );
};

export default RulesManager;
