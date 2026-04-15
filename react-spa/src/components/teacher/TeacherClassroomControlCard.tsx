import React from 'react';
import { Loader2, MonitorPlay } from 'lucide-react';
import type { useTeacherDashboardViewModel } from '../../hooks/useTeacherDashboardViewModel';
import { GroupSelect } from '../groups/GroupSelect';

type TeacherDashboardViewModel = ReturnType<typeof useTeacherDashboardViewModel>;

interface TeacherClassroomControlCardProps {
  viewModel: TeacherDashboardViewModel;
  onNavigateToRules?: (group: { id: string; name: string }) => void;
}

export const TeacherClassroomControlCard: React.FC<TeacherClassroomControlCardProps> = ({
  viewModel,
  onNavigateToRules,
}) => {
  const {
    classrooms,
    groups,
    groupById,
    groupsLoading,
    groupsError,
    selectedClassroomForControl,
    setSelectedClassroomForControl,
    selectedGroupForControl,
    setSelectedGroupForControl,
    controlLoading,
    controlError,
    handleTakeControl,
    teacherGroupsEnabled,
  } = viewModel;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <MonitorPlay className="text-blue-500" size={20} />
        Control Mando de Aula
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        Selecciona un aula y aplícale instantáneamente una de tus políticas. Esto anulará cualquier
        política por defecto.
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
          <GroupSelect
            id="teacher-control-group"
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
            value={selectedGroupForControl}
            onChange={setSelectedGroupForControl}
            disabled={groupsLoading || !!groupsError || groups.length === 0}
            groups={groups}
            includeNoneOption
            noneLabel="Restaurar por defecto (Sin Grupo)"
            inactiveBehavior="hide"
          />

          {groupsError && <p className="mt-2 text-xs text-red-600">{groupsError}</p>}

          {!groupsLoading && !groupsError && groups.length === 0 && (
            <p className="mt-2 text-xs text-slate-500 italic">
              {teacherGroupsEnabled
                ? 'No tienes políticas. Ve a "Mis Políticas" para crear una.'
                : 'No tienes políticas asignadas. Pide a un administrador que te asigne una.'}
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
          onClick={handleTakeControl}
          disabled={!selectedClassroomForControl || controlLoading}
          className="w-full mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          {controlLoading && <Loader2 size={16} className="animate-spin" />}
          {selectedGroupForControl ? 'Aplicar Política' : 'Liberar Aula'}
        </button>

        {controlError && <p className="text-xs text-red-600">{controlError}</p>}
      </div>
    </div>
  );
};
