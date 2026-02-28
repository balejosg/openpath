import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Monitor,
  Plus,
  Trash2,
  Search,
  Clock,
  Laptop,
  AlertCircle,
  Loader2,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import type { Classroom } from '../types';
import { trpc } from '../lib/trpc';
import { isAdmin } from '../lib/auth';
import { getAuthTokenForHeader } from '../lib/auth-storage';
import { useAllowedGroups } from '../hooks/useAllowedGroups';
import { useClassroomConfigActions } from '../hooks/useClassroomConfigActions';
import { useClassroomSchedules } from '../hooks/useClassroomSchedules';
import { useScheduleBoundaryInvalidation } from '../hooks/useScheduleBoundaryInvalidation';
import { useClipboard } from '../hooks/useClipboard';
import { useListDetailSelection } from '../hooks/useListDetailSelection';
import { normalizeSearchTerm, useNormalizedSearch } from '../hooks/useNormalizedSearch';
import WeeklyCalendar from '../components/WeeklyCalendar';
import ScheduleFormModal from '../components/ScheduleFormModal';
import {
  GroupLabel,
  inferGroupSource,
  getGroupSourcePhrase,
} from '../components/groups/GroupLabel';
import { GroupSelect } from '../components/groups/GroupSelect';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog, DangerConfirmDialog } from '../components/ui/ConfirmDialog';

const Classrooms = () => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeGroupOverwriteConfirm, setActiveGroupOverwriteConfirm] = useState<{
    classroomId: string;
    currentGroupId: string;
    nextGroupId: string | null;
  } | null>(null);
  const [activeGroupOverwriteLoading, setActiveGroupOverwriteLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearchQuery = useNormalizedSearch(searchQuery);
  const admin = isAdmin();

  const {
    groups: allowedGroups,
    groupById,
    options: groupOptions,
    isLoading: groupsLoading,
    error: groupsQueryError,
    refetch: refetchGroups,
  } = useAllowedGroups();

  const allowedGroupsError = groupsQueryError ? 'Error al cargar aulas' : null;
  const isInitialLoading = loading || groupsLoading;
  const loadError = error ?? allowedGroupsError;

  const calendarGroupsForDisplay = useMemo(
    () => allowedGroups.map((g) => ({ id: g.id, displayName: g.displayName || g.name })),
    [allowedGroups]
  );

  // Enrollment state
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollToken, setEnrollToken] = useState<string | null>(null);
  const [enrollPlatform, setEnrollPlatform] = useState<'linux' | 'windows'>('linux');
  const [loadingToken, setLoadingToken] = useState(false);

  const {
    copy: copyEnrollCommand,
    isCopied: isEnrollCommandCopied,
    clearCopied: clearEnrollCommandCopied,
  } = useClipboard();

  const closeEnrollModal = () => {
    clearEnrollCommandCopied();
    setShowEnrollModal(false);
  };

  // New classroom form state
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newError, setNewError] = useState('');

  // Mutation loading states
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch classrooms from API
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const apiClassrooms = await trpc.classrooms.list.query();

      // Map classrooms
      const mappedClassrooms = apiClassrooms.map((c) => ({
        id: c.id,
        name: c.name,
        displayName: c.displayName,
        defaultGroupId: c.defaultGroupId ?? null,
        computerCount: c.machineCount,
        activeGroup: c.activeGroupId ?? null,
        currentGroupId: c.currentGroupId ?? null,
        currentGroupSource: c.currentGroupSource,
        status: c.status,
        onlineMachineCount: c.onlineMachineCount,
      })) as Classroom[];

      setClassrooms(mappedClassrooms);
    } catch (err) {
      console.error('Failed to fetch classrooms:', err);
      setError('Error al cargar aulas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, []);

  // Refetch when needed (without dependency on selectedClassroom)
  const refetchClassrooms = useCallback(async () => {
    try {
      const apiClassrooms = await trpc.classrooms.list.query();
      const mappedClassrooms = apiClassrooms.map((c) => ({
        id: c.id,
        name: c.name,
        displayName: c.displayName,
        defaultGroupId: c.defaultGroupId ?? null,
        computerCount: c.machineCount,
        activeGroup: c.activeGroupId ?? null,
        currentGroupId: c.currentGroupId ?? null,
        currentGroupSource: c.currentGroupSource,
        status: c.status,
        onlineMachineCount: c.onlineMachineCount,
      })) as Classroom[];
      setClassrooms(mappedClassrooms);
      return mappedClassrooms;
    } catch (err) {
      console.error('Failed to refetch classrooms:', err);
      return [];
    }
  }, []);

  // Filter classrooms based on search
  const filteredClassrooms = useMemo(() => {
    if (!normalizedSearchQuery) return classrooms;
    return classrooms.filter(
      (room) =>
        normalizeSearchTerm(room.name).includes(normalizedSearchQuery) ||
        (room.activeGroup
          ? normalizeSearchTerm(room.activeGroup).includes(normalizedSearchQuery)
          : false)
    );
  }, [classrooms, normalizedSearchQuery]);

  const { selectedItem: selectedClassroom, setSelectedId: setSelectedClassroomId } =
    useListDetailSelection(filteredClassrooms);

  const handleCreateClassroom = async () => {
    if (!newName.trim()) {
      setNewError('El nombre del aula es obligatorio');
      return;
    }

    try {
      setSaving(true);
      setNewError('');
      const created = await trpc.classrooms.create.mutate({
        name: newName.trim(),
        defaultGroupId: newGroup || undefined,
      });
      const updated = await refetchClassrooms();
      const newClassroom = updated.find((c) => c.id === created.id);
      if (newClassroom) {
        setSelectedClassroomId(newClassroom.id);
      }
      setNewName('');
      setNewGroup('');
      setShowNewModal(false);
    } catch (err) {
      console.error('Failed to create classroom:', err);
      setNewError('Error al crear aula');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClassroom = async () => {
    if (!selectedClassroom) return;

    try {
      setDeleting(true);
      await trpc.classrooms.delete.mutate({ id: selectedClassroom.id });
      const updated = await refetchClassrooms();
      setSelectedClassroomId(updated[0]?.id ?? null);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Failed to delete classroom:', err);
    } finally {
      setDeleting(false);
    }
  };

  const { classroomConfigError, handleGroupChange, handleDefaultGroupChange } =
    useClassroomConfigActions({
      selectedClassroom,
      refetchClassrooms,
      setSelectedClassroom: (classroom) => setSelectedClassroomId(classroom?.id ?? null),
    });

  const openNewModal = () => {
    setNewName('');
    setNewGroup('');
    setNewError('');
    setShowNewModal(true);
  };

  const closeNewModal = () => {
    if (saving) return;
    setShowNewModal(false);
  };

  const resolveGroupName = (groupId: string | null) => {
    if (!groupId) return 'Sin grupo activo';
    const group = groupById.get(groupId);
    return group?.displayName ?? group?.name ?? groupId;
  };

  const requestActiveGroupChange = useCallback(
    (next: string) => {
      if (!selectedClassroom) return;

      const currentActiveGroupId = selectedClassroom.activeGroup ?? null;
      const nextGroupId = next || null;

      if (currentActiveGroupId && currentActiveGroupId !== nextGroupId) {
        setActiveGroupOverwriteConfirm({
          classroomId: selectedClassroom.id,
          currentGroupId: currentActiveGroupId,
          nextGroupId,
        });
        return;
      }

      void handleGroupChange(next);
    },
    [selectedClassroom, handleGroupChange]
  );

  const {
    schedules,
    loadingSchedules,
    scheduleFormOpen,
    editingSchedule,
    scheduleFormDay,
    scheduleFormStartTime,
    scheduleSaving,
    scheduleError,
    scheduleDeleteTarget,
    openScheduleCreate,
    openScheduleEdit,
    closeScheduleForm,
    handleScheduleSave,
    requestScheduleDelete,
    closeScheduleDelete,
    handleConfirmDeleteSchedule,
  } = useClassroomSchedules({
    selectedClassroomId: selectedClassroom?.id ?? null,
    onSchedulesUpdated: async () => {
      await refetchClassrooms();
    },
  });

  useScheduleBoundaryInvalidation({
    schedules,
    enabled: !!selectedClassroom && !selectedClassroom.activeGroup,
    onBoundary: () => {
      void refetchClassrooms();
    },
  });

  const openEnrollModal = async () => {
    setLoadingToken(true);
    try {
      if (!selectedClassroom) {
        setError('Selecciona un aula primero');
        return;
      }

      const authToken = getAuthTokenForHeader();
      const response = await fetch(
        `/api/enroll/${encodeURIComponent(selectedClassroom.id)}/ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${String(response.status)}`);
      }

      const data = (await response.json()) as {
        success: boolean;
        enrollmentToken?: string;
      };

      if (!data.success || !data.enrollmentToken) {
        throw new Error('No enrollment token received');
      }

      setEnrollToken(data.enrollmentToken);
      setEnrollPlatform('linux');
      setShowEnrollModal(true);
    } catch (err: unknown) {
      console.error('Failed to get enrollment ticket:', err);
      setError('No se pudo generar el comando de instalacion');
    } finally {
      setLoadingToken(false);
    }
  };

  const apiUrl = window.location.origin;
  const linuxEnrollCommand =
    selectedClassroom && enrollToken
      ? `curl -fsSL -H 'Authorization: Bearer ${enrollToken}' '${apiUrl}/api/enroll/${encodeURIComponent(selectedClassroom.id)}' | sudo bash`
      : '';
  const windowsEnrollScriptUrl =
    selectedClassroom && enrollToken
      ? `${apiUrl}/api/enroll/${encodeURIComponent(selectedClassroom.id)}/windows.ps1`
      : '';
  const windowsEnrollCommand =
    selectedClassroom && enrollToken
      ? [
          'powershell -NoProfile -ExecutionPolicy Bypass -Command',
          `"$t='${enrollToken}'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;`,
          `irm -Headers @{Authorization=('Bearer '+$t)} '${windowsEnrollScriptUrl}' | iex"`,
        ].join(' ')
      : '';
  const enrollCommand = enrollPlatform === 'windows' ? windowsEnrollCommand : linuxEnrollCommand;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      {/* List Column */}
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-lg font-bold text-slate-800">Aulas</h2>
          {admin && (
            <button
              onClick={openNewModal}
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
            onChange={(e) => setSearchQuery(e.target.value)}
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
              <button
                onClick={() => {
                  void refetchGroups();
                  void fetchData();
                }}
                className="text-blue-600 hover:text-blue-800 text-sm mt-2"
              >
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
                  onClick={() => setSelectedClassroomId(room.id)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedClassroom?.id === room.id
                      ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3
                      className={`font-semibold text-sm ${selectedClassroom?.id === room.id ? 'text-blue-800' : 'text-slate-800'}`}
                    >
                      {room.name}
                    </h3>
                    {selectedClassroom?.id === room.id && (
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

      {/* Detail Column */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {!selectedClassroom ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Sin aulas</h2>
            <p className="text-slate-500 text-sm">
              {admin
                ? 'Crea una nueva aula para ver su configuración y estado.'
                : 'Selecciona un aula para ver su configuración y estado.'}
            </p>
            {admin && (
              <button
                onClick={openNewModal}
                className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2 transition-colors shadow-sm font-medium"
              >
                <Plus size={16} /> Crear aula
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Header of Detail */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">
                    {selectedClassroom.name}
                  </h2>
                  <p className="text-slate-500 text-sm">Configuración y estado del aula</p>
                </div>
                <div className="flex gap-2">
                  {admin && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                      title="Eliminar Aula"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <label
                    htmlFor="classroom-active-group"
                    className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block"
                  >
                    Grupo Activo
                  </label>
                  <GroupSelect
                    id="classroom-active-group"
                    value={selectedClassroom.activeGroup ?? ''}
                    onChange={requestActiveGroupChange}
                    groups={allowedGroups}
                    includeNoneOption
                    noneLabel="Sin grupo activo"
                    inactiveBehavior="hide"
                    unknownValueLabel={
                      !admin &&
                      selectedClassroom.activeGroup &&
                      !groupById.get(selectedClassroom.activeGroup)
                        ? 'Aplicado por otro profesor'
                        : undefined
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 outline-none shadow-sm"
                  />
                  {!selectedClassroom.activeGroup && selectedClassroom.currentGroupId && (
                    <p className="mt-2 text-xs text-slate-500 italic">
                      Actualmente usando{' '}
                      {(() => {
                        const source = inferGroupSource({
                          currentGroupSource: selectedClassroom.currentGroupSource ?? null,
                          activeGroupId: selectedClassroom.activeGroup,
                          currentGroupId: selectedClassroom.currentGroupId,
                          defaultGroupId: selectedClassroom.defaultGroupId,
                        });

                        const phrase = getGroupSourcePhrase(source);

                        return (
                          <>
                            <GroupLabel
                              variant="text"
                              className="font-semibold text-slate-700"
                              groupId={selectedClassroom.currentGroupId}
                              group={
                                selectedClassroom.currentGroupId
                                  ? groupById.get(selectedClassroom.currentGroupId)
                                  : null
                              }
                              source={source}
                              revealUnknownId={admin}
                              showSourceTag={false}
                            />
                            {phrase ? ` ${phrase}` : ''}
                          </>
                        );
                      })()}
                    </p>
                  )}
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <label
                    htmlFor="classroom-default-group"
                    className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block"
                  >
                    Grupo por defecto
                  </label>
                  <GroupSelect
                    id="classroom-default-group"
                    value={selectedClassroom.defaultGroupId ?? ''}
                    onChange={(next) => void handleDefaultGroupChange(next)}
                    disabled={!admin}
                    groups={allowedGroups}
                    includeNoneOption
                    noneLabel="Sin grupo por defecto"
                    inactiveBehavior="disable"
                    unknownValueLabel={
                      !admin &&
                      selectedClassroom.defaultGroupId &&
                      !groupById.get(selectedClassroom.defaultGroupId)
                        ? 'Asignado por admin'
                        : undefined
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 outline-none shadow-sm disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <p className="mt-2 text-xs text-slate-500 italic">
                    Se usa cuando no hay grupo activo ni bloque de horario vigente.
                  </p>
                  {classroomConfigError && (
                    <p className="mt-2 text-xs text-red-600 flex items-start gap-1">
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{classroomConfigError}</span>
                    </p>
                  )}
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                      Estado
                    </label>
                    {selectedClassroom.status === 'operational' && (
                      <span className="text-green-700 font-medium flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div> Operativo
                      </span>
                    )}
                    {selectedClassroom.status === 'degraded' && (
                      <span className="text-yellow-700 font-medium flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div> Degradado
                      </span>
                    )}
                    {selectedClassroom.status === 'offline' && (
                      <span className="text-red-700 font-medium flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div> Sin conexión
                      </span>
                    )}
                  </div>
                  {selectedClassroom.computerCount > 0 && (
                    <span className="text-xs text-slate-500">
                      {selectedClassroom.onlineMachineCount}/{selectedClassroom.computerCount} en
                      línea
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Machines Section */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 flex-1 min-h-[300px] flex flex-col shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Monitor size={18} className="text-blue-500" />
                  Máquinas Registradas
                </h3>
                <div className="flex items-center gap-2">
                  {admin && (
                    <button
                      onClick={() => void openEnrollModal()}
                      disabled={loadingToken}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm font-medium disabled:opacity-50"
                    >
                      {loadingToken ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Download size={16} />
                      )}
                      Instalar equipos
                    </button>
                  )}
                  <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200 font-medium">
                    Total: {selectedClassroom.computerCount}
                  </span>
                </div>
              </div>

              {/* Empty State Style */}
              <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                <Monitor size={48} className="text-slate-300 mb-3" />
                <p className="text-slate-900 font-medium text-sm">Sin máquinas activas</p>
                <p className="text-slate-500 text-xs mt-1 max-w-xs">
                  Instala el agente de OpenPath en los equipos para verlos aquí.
                </p>
              </div>
            </div>

            {/* Schedule Section */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 flex-1 flex flex-col shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Clock size={18} className="text-slate-500" />
                  Horario del Aula
                </h3>
                <button
                  onClick={() => openScheduleCreate(undefined, '08:00')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm font-medium"
                >
                  <Plus size={16} /> Nuevo
                </button>
              </div>

              {loadingSchedules ? (
                <div className="flex items-center justify-center py-10 text-slate-500 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  <span className="ml-2">Cargando horarios...</span>
                </div>
              ) : (
                <>
                  {scheduleError && (
                    <div className="mb-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center gap-2">
                      <AlertCircle size={16} />
                      <span>{scheduleError}</span>
                    </div>
                  )}
                  <WeeklyCalendar
                    schedules={schedules}
                    groups={calendarGroupsForDisplay}
                    onAddClick={(dayOfWeek, startTime) => openScheduleCreate(dayOfWeek, startTime)}
                    onEditClick={(s) => openScheduleEdit(s)}
                    onDeleteClick={(s) => requestScheduleDelete(s)}
                  />
                  <p className="mt-3 text-xs text-slate-500">
                    Tip: haz click en una celda para crear un bloque. Puedes editar o eliminar tus
                    bloques desde el hover.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal: Nueva Aula */}
      {showNewModal && (
        <Modal isOpen onClose={closeNewModal} title="Nueva Aula" className="max-w-md">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nombre del Aula
              </label>
              <input
                type="text"
                placeholder="Ej: Laboratorio C"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (newError) setNewError('');
                }}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${newError ? 'border-red-300' : 'border-slate-300'}`}
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
                onChange={(e) => setNewGroup(e.target.value)}
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
                onClick={closeNewModal}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCreateClassroom()}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                Crear Aula
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={activeGroupOverwriteConfirm !== null}
        title="Reemplazar grupo activo"
        confirmLabel="Reemplazar"
        cancelLabel="Cancelar"
        isLoading={activeGroupOverwriteLoading}
        onClose={() => setActiveGroupOverwriteConfirm(null)}
        onConfirm={async () => {
          if (!activeGroupOverwriteConfirm) return;

          if (selectedClassroom?.id !== activeGroupOverwriteConfirm.classroomId) {
            setActiveGroupOverwriteConfirm(null);
            return;
          }

          setActiveGroupOverwriteLoading(true);
          try {
            await handleGroupChange(activeGroupOverwriteConfirm.nextGroupId);
            setActiveGroupOverwriteConfirm(null);
          } finally {
            setActiveGroupOverwriteLoading(false);
          }
        }}
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

      {/* Modal: Confirmar Eliminación */}
      {showDeleteConfirm && selectedClassroom && (
        <DangerConfirmDialog
          isOpen
          title="Eliminar Aula"
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          isLoading={deleting}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={() => void handleDeleteClassroom()}
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
              ¿Eliminar este bloque ({scheduleDeleteTarget.startTime}–{scheduleDeleteTarget.endTime}
              )?
            </p>
            <p className="text-xs text-slate-500 mt-1">Esta acción no se puede deshacer.</p>
          </div>
        </DangerConfirmDialog>
      )}

      {/* Modal: Instalar Equipos */}
      {showEnrollModal && enrollToken && selectedClassroom && (
        <Modal isOpen={showEnrollModal} onClose={closeEnrollModal} title="Instalar Equipos">
          <p className="text-sm text-slate-600 mb-3">
            Selecciona plataforma y ejecuta el comando en cada equipo del aula{' '}
            <strong>{selectedClassroom.displayName}</strong> para instalar y registrar el agente:
          </p>
          <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              onClick={() => setEnrollPlatform('linux')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                enrollPlatform === 'linux'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Linux (Debian/Ubuntu)
            </button>
            <button
              onClick={() => setEnrollPlatform('windows')}
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
              onClick={() => void copyEnrollCommand(enrollCommand, 'enroll-command')}
              className="absolute top-2 right-2 inline-flex items-center gap-1 text-slate-400 hover:text-white"
              title={isEnrollCommandCopied('enroll-command') ? 'Copiado' : 'Copiar al portapapeles'}
              aria-label={
                isEnrollCommandCopied('enroll-command') ? 'Copiado' : 'Copiar al portapapeles'
              }
            >
              {isEnrollCommandCopied('enroll-command') ? (
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
              Ejecuta PowerShell como Administrador. El instalador registra el equipo con token de
              aula y configura actualizaciones silenciosas diarias del agente.
            </p>
          )}
          <div className="mt-6 flex justify-end">
            <button
              onClick={closeEnrollModal}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
            >
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Classrooms;
