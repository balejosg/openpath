import React from 'react';
import { Plus, Trash2, Search, Laptop, AlertCircle, Loader2, Copy, Check } from 'lucide-react';
import type { Classroom } from '../types';
import type { AllowedGroupOption } from '../hooks/useAllowedGroups';
import { useClassroomGroupControls } from '../hooks/useClassroomGroupControls';
import { useClassroomMachines } from '../hooks/useClassroomMachines';
import { useClassroomSchedules } from '../hooks/useClassroomSchedules';
import { useClassroomsViewModel } from '../hooks/useClassroomsViewModel';
import ClassroomDetailPane from '../components/classrooms/ClassroomDetailPane';
import ScheduleFormModal from '../components/ScheduleFormModal';
import OneOffScheduleFormModal from '../components/OneOffScheduleFormModal';
import { GroupLabel, inferGroupSource, type GroupLike } from '../components/groups/GroupLabel';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog, DangerConfirmDialog } from '../components/ui/ConfirmDialog';

interface ClassroomListPaneProps {
  admin: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenNewModal: () => void;
  isInitialLoading: boolean;
  loadError: string | null;
  filteredClassrooms: Classroom[];
  selectedClassroomId: string | null;
  onSelectClassroom: (id: string) => void;
  groupById: ReadonlyMap<string, GroupLike>;
  onRetry: () => void;
}

const ClassroomListPane: React.FC<ClassroomListPaneProps> = ({
  admin,
  searchQuery,
  onSearchChange,
  onOpenNewModal,
  isInitialLoading,
  loadError,
  filteredClassrooms,
  selectedClassroomId,
  onSelectClassroom,
  groupById,
  onRetry,
}) => {
  return (
    <div className="w-full md:w-1/3 flex flex-col gap-4">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-lg font-bold text-slate-800">Aulas</h2>
        {admin && (
          <button
            onClick={onOpenNewModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm font-medium"
            data-testid="classrooms-new-button"
          >
            <Plus size={16} /> Nueva Aula
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar aula..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-lg py-2.5 pl-9 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none shadow-sm transition-all"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
        {isInitialLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-500 text-sm">Cargando aulas...</span>
          </div>
        ) : loadError ? (
          <div className="text-center py-8">
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
            <span className="text-red-500 text-sm mt-2 block">{loadError}</span>
            <button onClick={onRetry} className="text-blue-600 hover:text-blue-800 text-sm mt-2">
              Reintentar
            </button>
          </div>
        ) : filteredClassrooms.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">No se encontraron aulas</div>
        ) : (
          filteredClassrooms.map((room) => {
            const inferredSource = inferGroupSource({
              currentGroupSource: room.currentGroupSource ?? null,
              activeGroupId: room.activeGroup,
              currentGroupId: room.currentGroupId,
              defaultGroupId: room.defaultGroupId,
            });

            return (
              <div
                key={room.id}
                onClick={() => onSelectClassroom(room.id)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedClassroomId === room.id
                    ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3
                    className={`font-semibold text-sm ${
                      selectedClassroomId === room.id ? 'text-blue-800' : 'text-slate-800'
                    }`}
                  >
                    {room.name}
                  </h3>
                  {selectedClassroomId === room.id && (
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Laptop size={12} /> {room.computerCount} Equipos
                  </span>
                  <GroupLabel
                    groupId={room.currentGroupId}
                    group={room.currentGroupId ? groupById.get(room.currentGroupId) : null}
                    source={inferredSource}
                    revealUnknownId={admin}
                    showSourceTag={inferredSource !== 'none'}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

interface NewClassroomModalProps {
  isOpen: boolean;
  saving: boolean;
  newName: string;
  newGroup: string;
  newError: string;
  groupOptions: AllowedGroupOption[];
  onClose: () => void;
  onNameChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onCreate: () => void;
}

const NewClassroomModal: React.FC<NewClassroomModalProps> = ({
  isOpen,
  saving,
  newName,
  newGroup,
  newError,
  groupOptions,
  onClose,
  onNameChange,
  onGroupChange,
  onCreate,
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen onClose={onClose} title="Nueva Aula" className="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Aula</label>
          <input
            type="text"
            placeholder="Ej: Laboratorio C"
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
              newError ? 'border-red-300' : 'border-slate-300'
            }`}
          />
          {newError && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
              <AlertCircle size={12} /> {newError}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Grupo Inicial</label>
          <select
            value={newGroup}
            onChange={(e) => onGroupChange(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">Sin grupo</option>
            {groupOptions.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onCreate}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Crear Aula
          </button>
        </div>
      </div>
    </Modal>
  );
};

interface EnrollClassroomModalProps {
  isOpen: boolean;
  enrollToken: string | null;
  selectedClassroom: Classroom | null;
  enrollPlatform: 'linux' | 'windows';
  enrollCommand: string;
  onClose: () => void;
  onSelectPlatform: (platform: 'linux' | 'windows') => void;
  onCopy: () => void;
  isCopied: boolean;
}

const EnrollClassroomModal: React.FC<EnrollClassroomModalProps> = ({
  isOpen,
  enrollToken,
  selectedClassroom,
  enrollPlatform,
  enrollCommand,
  onClose,
  onSelectPlatform,
  onCopy,
  isCopied,
}) => {
  if (!isOpen || !enrollToken || !selectedClassroom) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Instalar Equipos">
      <p className="text-sm text-slate-600 mb-3">
        Selecciona plataforma y ejecuta el comando en cada equipo del aula{' '}
        <strong>{selectedClassroom.displayName}</strong> para instalar y registrar el agente:
      </p>
      <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button
          onClick={() => onSelectPlatform('linux')}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
            enrollPlatform === 'linux'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Linux (Debian/Ubuntu)
        </button>
        <button
          onClick={() => onSelectPlatform('windows')}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
            enrollPlatform === 'windows'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Windows
        </button>
      </div>
      <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-xs overflow-x-auto relative">
        <button
          onClick={onCopy}
          className="absolute top-2 right-2 inline-flex items-center gap-1 text-slate-400 hover:text-white"
          title={isCopied ? 'Copiado' : 'Copiar al portapapeles'}
          aria-label={isCopied ? 'Copiado' : 'Copiar al portapapeles'}
        >
          {isCopied ? (
            <>
              <Check size={16} className="text-green-400" />
              <span className="text-[10px] font-semibold text-green-400">Copiado</span>
            </>
          ) : (
            <Copy size={16} />
          )}
        </button>
        <pre className="whitespace-pre-wrap pr-8">{enrollCommand}</pre>
      </div>
      {enrollPlatform === 'linux' ? (
        <p className="text-xs text-slate-500 mt-3">
          El agente se auto-actualizará automáticamente vía APT. Asegúrate de tener conexión a
          internet en el equipo durante la instalación.
        </p>
      ) : (
        <p className="text-xs text-slate-500 mt-3">
          Ejecuta PowerShell como Administrador. El instalador registra el equipo con token de aula
          y configura actualizaciones silenciosas diarias del agente.
        </p>
      )}
      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  );
};

const Classrooms = () => {
  const {
    admin,
    allowedGroups,
    calendarGroupsForDisplay,
    deleteDialog,
    filteredClassrooms,
    groupById,
    groupOptions,
    isInitialLoading,
    loadError,
    newModal,
    refetchClassrooms,
    retryLoad,
    searchQuery,
    selectedClassroom,
    selectedClassroomId,
    setSearchQuery,
    setSelectedClassroomId,
  } = useClassroomsViewModel();

  const {
    activeGroupOverwriteConfirm,
    activeGroupOverwriteLoading,
    activeGroupSelectValue,
    classroomConfigError,
    closeActiveGroupOverwriteConfirm,
    confirmActiveGroupOverwrite,
    defaultGroupSelectValue,
    handleDefaultGroupChange,
    requestActiveGroupChange,
    resolveGroupName,
    selectedClassroomSource,
  } = useClassroomGroupControls({
    admin,
    selectedClassroom,
    groupById,
    refetchClassrooms,
    setSelectedClassroom: (classroom) => setSelectedClassroomId(classroom?.id ?? null),
  });

  const {
    schedules,
    oneOffSchedules,
    loadingSchedules,
    scheduleFormOpen,
    editingSchedule,
    scheduleFormDay,
    scheduleFormStartTime,
    oneOffFormOpen,
    editingOneOffSchedule,
    scheduleSaving,
    scheduleError,
    scheduleDeleteTarget,
    openScheduleCreate,
    openScheduleEdit,
    closeScheduleForm,
    openOneOffScheduleCreate,
    openOneOffScheduleEdit,
    closeOneOffScheduleForm,
    handleScheduleSave,
    handleOneOffScheduleSave,
    requestScheduleDelete,
    requestOneOffScheduleDelete,
    closeScheduleDelete,
    handleConfirmDeleteSchedule,
  } = useClassroomSchedules({
    selectedClassroomId: selectedClassroom?.id ?? null,
    onSchedulesUpdated: async () => {
      await refetchClassrooms();
    },
  });

  const {
    activeSchedule,
    exemptionByMachineId,
    exemptionMutating,
    exemptionsError,
    handleCreateExemption,
    handleDeleteExemption,
    loadingExemptions,
    sortedOneOffSchedules,
    enrollModal,
  } = useClassroomMachines({
    selectedClassroom,
    schedules,
    oneOffSchedules,
    refetchClassrooms,
  });

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      <ClassroomListPane
        admin={admin}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenNewModal={newModal.open}
        isInitialLoading={isInitialLoading}
        loadError={loadError}
        filteredClassrooms={filteredClassrooms}
        selectedClassroomId={selectedClassroomId}
        onSelectClassroom={(id) => setSelectedClassroomId(id)}
        groupById={groupById}
        onRetry={retryLoad}
      />

      {/* Detail Column */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        <ClassroomDetailPane
          admin={admin}
          allowedGroups={allowedGroups}
          calendarGroupsForDisplay={calendarGroupsForDisplay}
          classroomConfigError={classroomConfigError}
          activeGroupSelectValue={activeGroupSelectValue}
          defaultGroupSelectValue={defaultGroupSelectValue}
          selectedClassroom={selectedClassroom}
          selectedClassroomSource={selectedClassroomSource}
          groupById={groupById}
          schedules={schedules}
          sortedOneOffSchedules={sortedOneOffSchedules}
          loadingSchedules={loadingSchedules}
          scheduleError={scheduleError}
          activeSchedule={activeSchedule}
          exemptionByMachineId={exemptionByMachineId}
          exemptionMutating={exemptionMutating}
          exemptionsError={exemptionsError}
          loadingExemptions={loadingExemptions}
          enrollModalLoadingToken={enrollModal.loadingToken}
          onOpenNewModal={newModal.open}
          onOpenDeleteDialog={deleteDialog.open}
          onRequestActiveGroupChange={requestActiveGroupChange}
          onDefaultGroupChange={handleDefaultGroupChange}
          onOpenEnrollModal={enrollModal.open}
          onCreateExemption={handleCreateExemption}
          onDeleteExemption={handleDeleteExemption}
          onOpenScheduleCreate={openScheduleCreate}
          onOpenScheduleEdit={openScheduleEdit}
          onRequestScheduleDelete={requestScheduleDelete}
          onOpenOneOffScheduleCreate={openOneOffScheduleCreate}
          onOpenOneOffScheduleEdit={openOneOffScheduleEdit}
          onRequestOneOffScheduleDelete={requestOneOffScheduleDelete}
        />
      </div>

      <NewClassroomModal
        isOpen={newModal.isOpen}
        saving={newModal.saving}
        newName={newModal.newName}
        newGroup={newModal.newGroup}
        newError={newModal.newError}
        groupOptions={groupOptions}
        onClose={newModal.close}
        onNameChange={newModal.setName}
        onGroupChange={newModal.setGroup}
        onCreate={() => void newModal.create()}
      />

      <ConfirmDialog
        isOpen={activeGroupOverwriteConfirm !== null}
        title="Reemplazar grupo activo"
        confirmLabel="Reemplazar"
        cancelLabel="Cancelar"
        isLoading={activeGroupOverwriteLoading}
        onClose={closeActiveGroupOverwriteConfirm}
        onConfirm={() => void confirmActiveGroupOverwrite()}
      >
        <p className="text-sm text-slate-600">
          Este aula ya tiene un grupo aplicado manualmente (
          <strong>{resolveGroupName(activeGroupOverwriteConfirm?.currentGroupId ?? null)}</strong>
          ).
        </p>
        <p className="text-sm text-slate-600">
          ¿Reemplazar por{' '}
          <strong>{resolveGroupName(activeGroupOverwriteConfirm?.nextGroupId ?? null)}</strong>?
        </p>
      </ConfirmDialog>

      {/* Modal: Configurar Horario */}
      {scheduleFormOpen && selectedClassroom && (
        <ScheduleFormModal
          key={editingSchedule?.id ?? 'create'}
          schedule={editingSchedule}
          defaultDay={scheduleFormDay}
          defaultStartTime={scheduleFormStartTime}
          groups={allowedGroups}
          saving={scheduleSaving}
          error={scheduleError}
          onSave={(data) => void handleScheduleSave(data)}
          onClose={closeScheduleForm}
        />
      )}

      {oneOffFormOpen && selectedClassroom && (
        <OneOffScheduleFormModal
          key={editingOneOffSchedule?.id ?? 'one-off-create'}
          schedule={editingOneOffSchedule}
          groups={allowedGroups}
          saving={scheduleSaving}
          error={scheduleError}
          onSave={(data) => void handleOneOffScheduleSave(data)}
          onClose={closeOneOffScheduleForm}
        />
      )}

      {/* Modal: Confirmar Eliminación */}
      {deleteDialog.isOpen && selectedClassroom && (
        <DangerConfirmDialog
          isOpen
          title="Eliminar Aula"
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          isLoading={deleteDialog.deleting}
          onClose={deleteDialog.close}
          onConfirm={() => void deleteDialog.confirm()}
        >
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-600" size={24} />
            </div>
            <p className="text-sm text-slate-600">
              ¿Estás seguro de que quieres eliminar <strong>{selectedClassroom.name}</strong>?
            </p>
            <p className="text-xs text-slate-500 mt-1">Esta acción no se puede deshacer.</p>
          </div>
        </DangerConfirmDialog>
      )}

      {/* Modal: Confirmar Eliminación de Horario */}
      {scheduleDeleteTarget && selectedClassroom && (
        <DangerConfirmDialog
          isOpen
          title="Eliminar Horario"
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          isLoading={scheduleSaving}
          errorMessage={scheduleError}
          onClose={closeScheduleDelete}
          onConfirm={() => void handleConfirmDeleteSchedule()}
        >
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-600" size={24} />
            </div>
            <p className="text-sm text-slate-600">
              ¿Eliminar este bloque ({scheduleDeleteTarget.label})?
            </p>
            <p className="text-xs text-slate-500 mt-1">Esta acción no se puede deshacer.</p>
          </div>
        </DangerConfirmDialog>
      )}

      <EnrollClassroomModal
        isOpen={enrollModal.isOpen}
        enrollToken={enrollModal.enrollToken}
        selectedClassroom={selectedClassroom}
        enrollPlatform={enrollModal.enrollPlatform}
        enrollCommand={enrollModal.enrollCommand}
        onClose={enrollModal.close}
        onSelectPlatform={enrollModal.selectPlatform}
        onCopy={enrollModal.copy}
        isCopied={enrollModal.isCopied}
      />
    </div>
  );
};

export default Classrooms;
