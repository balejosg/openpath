import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Folder, Loader2, ShieldCheck, ShieldOff, MonitorPlay, Calendar } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { useAllowedGroups } from '../hooks/useAllowedGroups';

interface ClassroomFromAPI {
  id: string;
  name: string;
  displayName: string;
  defaultGroupId: string | null;
  activeGroupId: string | null;
  currentGroupId: string | null;
  currentGroupSource: 'manual' | 'schedule' | 'default' | 'none' | null;
}

interface TeacherDashboardProps {
  onNavigateToRules?: (group: { id: string; name: string }) => void;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigateToRules }) => {
  const [classrooms, setClassrooms] = useState<ClassroomFromAPI[]>([]);
  const [classroomsLoading, setClassroomsLoading] = useState(true);
  const [classroomsError, setClassroomsError] = useState<string | null>(null);

  const {
    groups,
    groupById,
    options: groupOptions,
    isLoading: groupsLoading,
    error: groupsQueryError,
  } = useAllowedGroups();

  const groupsError = groupsQueryError ? 'No se pudieron cargar tus grupos' : null;

  const [selectedClassroomForControl, setSelectedClassroomForControl] = useState<string>('');
  const [selectedGroupForControl, setSelectedGroupForControl] = useState<string>('');
  const [controlLoading, setControlLoading] = useState(false);

  const fetchClassrooms = useCallback(async () => {
    try {
      setClassroomsLoading(true);
      const apiClassrooms = await trpc.classrooms.list.query();
      setClassrooms(
        apiClassrooms.map((c) => ({
          id: c.id,
          name: c.name,
          displayName: c.displayName,
          defaultGroupId: c.defaultGroupId ?? null,
          activeGroupId: c.activeGroupId ?? null,
          currentGroupId: c.currentGroupId ?? null,
          currentGroupSource: c.currentGroupSource,
        }))
      );
      setClassroomsError(null);
    } catch (err) {
      console.error('Failed to fetch classrooms:', err);
      setClassroomsError('Error al cargar aulas');
    } finally {
      setClassroomsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchClassrooms();

    const classroomsInterval = window.setInterval(() => {
      void fetchClassrooms();
    }, 30000);

    const onFocus = () => {
      void fetchClassrooms();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(classroomsInterval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchClassrooms]);

  const activeGroupsByClassroom = useMemo(() => {
    return classrooms
      .map((c) => {
        const groupId = c.currentGroupId;
        if (!groupId) return null;

        const group = groupById.get(groupId);
        const classroomName = c.displayName || c.name;
        const groupName = group ? group.displayName || group.name : groupId;

        const inferredSource = (() => {
          if (c.currentGroupSource) return c.currentGroupSource;
          if (c.activeGroupId) return 'manual';
          if (!c.currentGroupId) return 'none';
          if (c.defaultGroupId && c.currentGroupId === c.defaultGroupId) return 'default';
          return 'schedule';
        })();

        const badgeVariant =
          inferredSource === 'manual'
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : inferredSource === 'schedule'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : inferredSource === 'default'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-500 border-slate-200';

        const sourceLabel =
          inferredSource === 'manual'
            ? 'manual'
            : inferredSource === 'schedule'
              ? 'horario'
              : inferredSource === 'default'
                ? 'defecto'
                : '';

        const badgeParts = [groupName];
        if (sourceLabel) badgeParts.push(sourceLabel);

        return {
          classroomId: c.id,
          classroomName,
          badgeText: badgeParts.join(' · '),
          badgeVariant,
          sourceLabel,
          groupId: groupId,
          isActive: !!c.activeGroupId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => a.classroomName.localeCompare(b.classroomName));
  }, [classrooms, groupById]);

  const myActiveClasses = useMemo(() => {
    if (groups.length === 0) return [];
    const allowedGroupIds = new Set(groups.map((g) => g.id));
    return activeGroupsByClassroom.filter((c) => allowedGroupIds.has(c.groupId));
  }, [activeGroupsByClassroom, groups]);

  const handleTakeControl = async () => {
    if (!selectedClassroomForControl) return;
    setControlLoading(true);
    try {
      await trpc.classrooms.setActiveGroup.mutate({
        id: selectedClassroomForControl,
        groupId: selectedGroupForControl || null,
      });
      await fetchClassrooms();
      setSelectedClassroomForControl('');
      setSelectedGroupForControl('');
    } catch (e) {
      console.error(e);
      alert('Error al aplicar el grupo al aula');
    } finally {
      setControlLoading(false);
    }
  };

  const handleReleaseClass = async (classroomId: string) => {
    try {
      await trpc.classrooms.setActiveGroup.mutate({
        id: classroomId,
        groupId: null,
      });
      await fetchClassrooms();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            ¡Hola, Profesor!
          </h2>
          <p className="text-slate-500 text-sm mt-1 mb-4">
            Desde aquí puedes gestionar el acceso a internet de tus aulas de forma rápida.
          </p>

          {classroomsLoading ? (
            <div className="flex items-center gap-2 mt-3 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin text-slate-400" />
              Verificando estado...
            </div>
          ) : myActiveClasses.length > 0 ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg border border-green-200 w-fit">
              <ShieldCheck size={20} />
              <span className="font-medium text-sm">
                Tienes {myActiveClasses.length} aula(s) con tus políticas aplicadas.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 w-fit">
              <ShieldOff size={20} />
              <span className="font-medium text-sm">
                No tienes políticas aplicadas activamente en este momento.
              </span>
            </div>
          )}

          {classroomsError && !classroomsLoading && (
            <div className="mt-3 text-sm text-red-600">
              {classroomsError}{' '}
              <button
                type="button"
                onClick={() => void fetchClassrooms()}
                className="underline hover:text-red-800"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <MonitorPlay className="text-blue-500" size={20} />
            Control Mando de Aula
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Selecciona un aula y aplícale instantáneamente una de tus políticas. Esto anulará
            cualquier política por defecto.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Aula</label>
              <select
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                value={selectedClassroomForControl}
                onChange={(e) => setSelectedClassroomForControl(e.target.value)}
              >
                <option value="">Seleccionar Aula...</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName || c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Política a aplicar
              </label>
              <select
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                value={selectedGroupForControl}
                onChange={(e) => setSelectedGroupForControl(e.target.value)}
                disabled={groupsLoading || !!groupsError || groups.length === 0}
              >
                <option value="">Restaurar por defecto (Sin Grupo)</option>
                {groupOptions.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>

              {groupsError && <p className="mt-2 text-xs text-red-600">{groupsError}</p>}

              {!groupsLoading && !groupsError && groups.length === 0 && (
                <p className="mt-2 text-xs text-slate-500 italic">
                  No tienes políticas asignadas. Pide a un administrador que te asigne una.
                </p>
              )}

              {(() => {
                if (!onNavigateToRules) return null;
                if (!selectedGroupForControl) return null;
                const selected = groupById.get(selectedGroupForControl);
                if (!selected) return null;

                return (
                  <button
                    type="button"
                    onClick={() => onNavigateToRules({ id: selected.id, name: selected.name })}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                  >
                    Gestionar reglas de esta política
                  </button>
                );
              })()}
            </div>

            <button
              onClick={() => void handleTakeControl()}
              disabled={!selectedClassroomForControl || controlLoading}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {controlLoading && <Loader2 size={16} className="animate-spin" />}
              {selectedGroupForControl ? 'Aplicar Política' : 'Liberar Aula'}
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Calendar className="text-indigo-500" size={20} />
            Mis Clases Activas
          </h3>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {classroomsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : myActiveClasses.length === 0 ? (
              <div className="text-center py-8">
                <Folder className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No tienes clases en curso.</p>
              </div>
            ) : (
              myActiveClasses.map((c) => (
                <div
                  key={c.classroomId}
                  className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex items-center justify-between"
                >
                  <div>
                    <h4 className="font-semibold text-slate-800 text-sm">{c.classroomName}</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Usando: <span className="font-medium text-slate-700">{c.badgeText}</span>
                    </p>
                  </div>
                  {c.isActive && c.sourceLabel === 'manual' && (
                    <button
                      onClick={() => void handleReleaseClass(c.classroomId)}
                      className="text-xs bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg transition-colors font-medium shadow-sm"
                    >
                      Terminar Clase
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
