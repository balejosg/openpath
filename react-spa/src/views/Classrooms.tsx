import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Monitor,
  Plus,
  Trash2,
  Search,
  Clock,
  Laptop,
  X,
  AlertCircle,
  Loader2,
  Download,
  Copy,
  Check,
} from 'lucide-react';
import type { Classroom, ScheduleWithPermissions } from '../types';
import { trpc } from '../lib/trpc';
import WeeklyCalendar from '../components/WeeklyCalendar';
import ScheduleFormModal from '../components/ScheduleFormModal';

// Type for API group used in dropdown
interface GroupOption {
  id: string;
  name: string;
  displayName: string;
}

const Classrooms = () => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Schedules state
  const [schedules, setSchedules] = useState<ScheduleWithPermissions[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleWithPermissions | null>(null);
  const [scheduleFormDay, setScheduleFormDay] = useState<number | undefined>(undefined);
  const [scheduleFormStartTime, setScheduleFormStartTime] = useState<string | undefined>(undefined);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleDeleteTarget, setScheduleDeleteTarget] = useState<ScheduleWithPermissions | null>(
    null
  );

  // Enrollment state
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollToken, setEnrollToken] = useState<string | null>(null);
  const [enrollCopied, setEnrollCopied] = useState(false);
  const [loadingToken, setLoadingToken] = useState(false);

  // New classroom form state
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newError, setNewError] = useState('');

  // Mutation loading states
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch classrooms and groups from API
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [apiClassrooms, apiGroups] = await Promise.all([
        trpc.classrooms.list.query(),
        trpc.groups.list.query(),
      ]);

      // Map classrooms
      const mappedClassrooms = apiClassrooms.map((c) => ({
        id: c.id,
        name: c.name,
        displayName: c.displayName,
        computerCount: c.machineCount,
        activeGroup: c.activeGroupId ?? null,
        currentGroupId: c.currentGroupId ?? null,
        status: c.status,
        onlineMachineCount: c.onlineMachineCount,
      })) as Classroom[];

      setClassrooms(mappedClassrooms);
      setGroups(
        apiGroups.map((g) => ({
          id: g.id,
          name: g.name,
          displayName: g.displayName || g.name,
        }))
      );

      // Select first classroom if none selected
      if (mappedClassrooms.length > 0 && !selectedClassroom) {
        setSelectedClassroom(mappedClassrooms[0]);
      }
    } catch (err) {
      console.error('Failed to fetch classrooms:', err);
      setError('Error al cargar aulas');
    } finally {
      setLoading(false);
    }
  }, [selectedClassroom]);

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchSchedules = useCallback(async (classroomId: string) => {
    try {
      setLoadingSchedules(true);
      setScheduleError('');
      const result = await trpc.schedules.getByClassroom.query({ classroomId });
      setSchedules(result.schedules);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
      setScheduleError('Error al cargar horarios');
      setSchedules([]);
    } finally {
      setLoadingSchedules(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedClassroom) {
      setSchedules([]);
      return;
    }
    void fetchSchedules(selectedClassroom.id);
  }, [selectedClassroom?.id, fetchSchedules]);

  // Refetch when needed (without dependency on selectedClassroom)
  const refetchClassrooms = useCallback(async () => {
    try {
      const apiClassrooms = await trpc.classrooms.list.query();
      const mappedClassrooms = apiClassrooms.map((c) => ({
        id: c.id,
        name: c.name,
        displayName: c.displayName,
        computerCount: c.machineCount,
        activeGroup: c.activeGroupId ?? null,
        currentGroupId: c.currentGroupId ?? null,
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
    if (!searchQuery.trim()) return classrooms;
    const query = searchQuery.toLowerCase();
    return classrooms.filter(
      (room) =>
        room.name.toLowerCase().includes(query) ||
        (room.activeGroup?.toLowerCase().includes(query) ?? false)
    );
  }, [classrooms, searchQuery]);

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
        setSelectedClassroom(newClassroom);
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
      setSelectedClassroom(updated[0] ?? null);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Failed to delete classroom:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleGroupChange = async (groupId: string) => {
    if (!selectedClassroom) return;

    try {
      await trpc.classrooms.setActiveGroup.mutate({
        id: selectedClassroom.id,
        groupId: groupId || null,
      });
      const updatedClassrooms = await refetchClassrooms();
      // Update local selected classroom from the updated list
      const updated = updatedClassrooms.find((c) => c.id === selectedClassroom.id);
      if (updated) {
        setSelectedClassroom(updated);
      }
    } catch (err) {
      console.error('Failed to update active group:', err);
    }
  };

  const openNewModal = () => {
    setNewName('');
    setNewGroup('');
    setNewError('');
    setShowNewModal(true);
  };

  const openScheduleCreate = (dayOfWeek?: number, startTime?: string) => {
    setScheduleError('');
    setEditingSchedule(null);
    setScheduleFormDay(dayOfWeek);
    setScheduleFormStartTime(startTime);
    setScheduleFormOpen(true);
  };

  const openScheduleEdit = (schedule: ScheduleWithPermissions) => {
    setScheduleError('');
    setEditingSchedule(schedule);
    setScheduleFormDay(undefined);
    setScheduleFormStartTime(undefined);
    setScheduleFormOpen(true);
  };

  const handleScheduleSave = async (data: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    groupId: string;
  }) => {
    if (!selectedClassroom) return;

    try {
      setScheduleSaving(true);
      setScheduleError('');
      if (editingSchedule) {
        await trpc.schedules.update.mutate({
          id: editingSchedule.id,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          groupId: data.groupId,
        });
      } else {
        await trpc.schedules.create.mutate({
          classroomId: selectedClassroom.id,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          groupId: data.groupId,
        });
      }

      await fetchSchedules(selectedClassroom.id);
      setScheduleFormOpen(false);
      setEditingSchedule(null);
      setScheduleFormDay(undefined);
      setScheduleFormStartTime(undefined);
    } catch (err: unknown) {
      console.error('Failed to save schedule:', err);
      const message = err instanceof Error ? err.message : 'Error al guardar horario';
      setScheduleError(message);
    } finally {
      setScheduleSaving(false);
    }
  };

  const requestScheduleDelete = (schedule: ScheduleWithPermissions) => {
    setScheduleError('');
    setScheduleDeleteTarget(schedule);
  };

  const handleConfirmDeleteSchedule = async () => {
    if (!selectedClassroom || !scheduleDeleteTarget) return;

    try {
      setScheduleSaving(true);
      setScheduleError('');
      await trpc.schedules.delete.mutate({ id: scheduleDeleteTarget.id });
      await fetchSchedules(selectedClassroom.id);
      setScheduleDeleteTarget(null);
    } catch (err: unknown) {
      console.error('Failed to delete schedule:', err);
      const message = err instanceof Error ? err.message : 'Error al eliminar horario';
      setScheduleError(message);
    } finally {
      setScheduleSaving(false);
    }
  };

  const openEnrollModal = async () => {
    setLoadingToken(true);
    try {
      if (!selectedClassroom) {
        setError('Selecciona un aula primero');
        return;
      }

      const accessToken = localStorage.getItem('openpath_access_token');
      const response = await fetch(
        `/api/enroll/${encodeURIComponent(selectedClassroom.id)}/ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
      setShowEnrollModal(true);
    } catch (err: unknown) {
      console.error('Failed to get enrollment ticket:', err);
      setError('No se pudo generar el comando de instalacion');
    } finally {
      setLoadingToken(false);
    }
  };

  const apiUrl = window.location.origin;
  const enrollCommand =
    selectedClassroom && enrollToken
      ? `curl -fsSL -H 'Authorization: Bearer ${enrollToken}' '${apiUrl}/api/enroll/${encodeURIComponent(selectedClassroom.id)}' | sudo bash`
      : '';

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      {/* List Column */}
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-lg font-bold text-slate-800">Aulas</h2>
          <button
            onClick={openNewModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm font-medium"
          >
            <Plus size={16} /> Nueva
          </button>
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
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500 text-sm">Cargando aulas...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
              <span className="text-red-500 text-sm mt-2 block">{error}</span>
              <button
                onClick={() => void fetchData()}
                className="text-blue-600 hover:text-blue-800 text-sm mt-2"
              >
                Reintentar
              </button>
            </div>
          ) : filteredClassrooms.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No se encontraron aulas</div>
          ) : (
            filteredClassrooms.map((room) => (
              <div
                key={room.id}
                onClick={() => setSelectedClassroom(room)}
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
                  <span
                    className={`px-2 py-0.5 rounded-full border ${room.currentGroupId ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                  >
                    {room.currentGroupId
                      ? (groups.find((g) => g.id === room.currentGroupId)?.displayName ??
                        room.currentGroupId)
                      : 'Sin grupo'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail Column */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {!selectedClassroom ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Sin aulas</h2>
            <p className="text-slate-500 text-sm">
              Crea una nueva aula para ver su configuracion y estado.
            </p>
            <button
              onClick={openNewModal}
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2 transition-colors shadow-sm font-medium"
            >
              <Plus size={16} /> Crear aula
            </button>
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
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                    title="Eliminar Aula"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                    Grupo Activo
                  </label>
                  <select
                    value={selectedClassroom.activeGroup ?? ''}
                    onChange={(e) => void handleGroupChange(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 outline-none shadow-sm"
                  >
                    <option value="">Sin grupo activo</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.displayName}
                      </option>
                    ))}
                  </select>
                  {!selectedClassroom.activeGroup && selectedClassroom.currentGroupId && (
                    <p className="mt-2 text-xs text-slate-500 italic">
                      Actualmente usando{' '}
                      <span className="font-semibold text-slate-700">
                        {groups.find((g) => g.id === selectedClassroom.currentGroupId)
                          ?.displayName ?? selectedClassroom.currentGroupId}
                      </span>{' '}
                      por horario
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
                  onClick={() => openScheduleCreate(1, '08:00')}
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
                    groups={groups.map((g) => ({ id: g.id, displayName: g.displayName }))}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Nueva Aula</h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Grupo Inicial
                </label>
                <select
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Sin grupo</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowNewModal(false)}
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
          </div>
        </div>
      )}

      {/* Modal: Configurar Horario */}
      {scheduleFormOpen && selectedClassroom && (
        <ScheduleFormModal
          schedule={editingSchedule}
          defaultDay={scheduleFormDay}
          defaultStartTime={scheduleFormStartTime}
          groups={groups.map((g) => ({ id: g.id, displayName: g.displayName }))}
          saving={scheduleSaving}
          error={scheduleError}
          onSave={(data) => void handleScheduleSave(data)}
          onClose={() => {
            if (scheduleSaving) return;
            setScheduleFormOpen(false);
            setEditingSchedule(null);
            setScheduleFormDay(undefined);
            setScheduleFormStartTime(undefined);
            setScheduleError('');
          }}
        />
      )}

      {/* Modal: Confirmar Eliminación */}
      {showDeleteConfirm && selectedClassroom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Eliminar Aula</h3>
              <p className="text-sm text-slate-600 mb-6">
                ¿Estás seguro de que quieres eliminar <strong>{selectedClassroom.name}</strong>?
                Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleDeleteClassroom()}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting && <Loader2 size={16} className="animate-spin" />}
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación de Horario */}
      {scheduleDeleteTarget && selectedClassroom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Eliminar Horario</h3>
              <p className="text-sm text-slate-600 mb-6">
                ¿Eliminar este bloque ({scheduleDeleteTarget.startTime}–
                {scheduleDeleteTarget.endTime})? Esta acción no se puede deshacer.
              </p>
              {scheduleError && (
                <p className="text-red-500 text-sm flex items-center justify-center gap-1 mb-4">
                  <AlertCircle size={14} /> {scheduleError}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (scheduleSaving) return;
                    setScheduleDeleteTarget(null);
                    setScheduleError('');
                  }}
                  disabled={scheduleSaving}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleConfirmDeleteSchedule()}
                  disabled={scheduleSaving}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {scheduleSaving && <Loader2 size={16} className="animate-spin" />}
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Instalar Equipos */}
      {showEnrollModal && enrollToken && selectedClassroom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Instalar Equipos</h3>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Ejecuta este comando en cada PC del aula{' '}
              <strong>{selectedClassroom.displayName}</strong> para instalar y registrar el agente:
            </p>
            <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-xs overflow-x-auto relative">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(enrollCommand);
                  setEnrollCopied(true);
                  setTimeout(() => setEnrollCopied(false), 2000);
                }}
                className="absolute top-2 right-2 text-slate-400 hover:text-white"
                title="Copiar al portapapeles"
              >
                {enrollCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
              <pre className="whitespace-pre-wrap pr-8">{enrollCommand}</pre>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              El agente se auto-actualizará automáticamente vía APT. Asegúrate de tener conexión a
              internet en el equipo durante la instalación.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowEnrollModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Classrooms;
