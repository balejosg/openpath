import React from 'react';
import { AlertCircle, Clock, Download, Loader2, Monitor, Plus, Trash2 } from 'lucide-react';
import type {
  Classroom,
  ClassroomExemption,
  CurrentGroupSource,
  OneOffScheduleWithPermissions,
  ScheduleWithPermissions,
} from '../../types';
import WeeklyCalendar from '../WeeklyCalendar';
import { GroupLabel, getGroupSourcePhrase, type GroupLike } from '../groups/GroupLabel';
import { GroupSelect } from '../groups/GroupSelect';

interface CalendarGroupDisplay {
  id: string;
  displayName: string;
}

interface ClassroomDetailPaneProps {
  admin: boolean;
  allowedGroups: readonly GroupLike[];
  calendarGroupsForDisplay: CalendarGroupDisplay[];
  classroomConfigError: string;
  activeGroupSelectValue: string;
  defaultGroupSelectValue: string;
  selectedClassroom: Classroom | null;
  selectedClassroomSource: CurrentGroupSource;
  groupById: ReadonlyMap<string, GroupLike>;
  schedules: ScheduleWithPermissions[];
  sortedOneOffSchedules: OneOffScheduleWithPermissions[];
  loadingSchedules: boolean;
  scheduleError: string;
  activeSchedule: ScheduleWithPermissions | OneOffScheduleWithPermissions | null;
  exemptionByMachineId: ReadonlyMap<string, ClassroomExemption>;
  exemptionMutating: Partial<Record<string, boolean>>;
  exemptionsError: string | null;
  loadingExemptions: boolean;
  enrollModalLoadingToken: boolean;
  onOpenNewModal: () => void;
  onOpenDeleteDialog: () => void;
  onRequestActiveGroupChange: (next: string) => void;
  onDefaultGroupChange: (next: string) => void | Promise<void>;
  onOpenEnrollModal: () => void | Promise<void>;
  onCreateExemption: (machineId: string) => void | Promise<void>;
  onDeleteExemption: (machineId: string) => void | Promise<void>;
  onOpenScheduleCreate: (dayOfWeek?: number, startTime?: string) => void;
  onOpenScheduleEdit: (schedule: ScheduleWithPermissions) => void;
  onRequestScheduleDelete: (schedule: ScheduleWithPermissions) => void;
  onOpenOneOffScheduleCreate: () => void;
  onOpenOneOffScheduleEdit: (schedule: OneOffScheduleWithPermissions) => void;
  onRequestOneOffScheduleDelete: (schedule: OneOffScheduleWithPermissions) => void;
}

function formatOneOffDateLabel(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderClassroomStatus(classroom: Classroom) {
  if (classroom.status === 'operational') {
    return (
      <span className="text-green-700 font-medium flex items-center gap-2 text-sm">
        <div className="w-2 h-2 bg-green-500 rounded-full"></div> Operativo
      </span>
    );
  }

  if (classroom.status === 'degraded') {
    return (
      <span className="text-yellow-700 font-medium flex items-center gap-2 text-sm">
        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div> Degradado
      </span>
    );
  }

  return (
    <span className="text-red-700 font-medium flex items-center gap-2 text-sm">
      <div className="w-2 h-2 bg-red-500 rounded-full"></div> Sin conexión
    </span>
  );
}

function toSyntheticGroup(
  groupId: string | null | undefined,
  displayName?: string | null
): GroupLike | null {
  if (!groupId || !displayName) return null;
  return {
    id: groupId,
    name: displayName,
    displayName,
  };
}

export default function ClassroomDetailPane({
  admin,
  allowedGroups,
  calendarGroupsForDisplay,
  classroomConfigError,
  activeGroupSelectValue,
  defaultGroupSelectValue,
  selectedClassroom,
  selectedClassroomSource,
  groupById,
  schedules,
  sortedOneOffSchedules,
  loadingSchedules,
  scheduleError,
  activeSchedule,
  exemptionByMachineId,
  exemptionMutating,
  exemptionsError,
  loadingExemptions,
  enrollModalLoadingToken,
  onOpenNewModal,
  onOpenDeleteDialog,
  onRequestActiveGroupChange,
  onDefaultGroupChange,
  onOpenEnrollModal,
  onCreateExemption,
  onDeleteExemption,
  onOpenScheduleCreate,
  onOpenScheduleEdit,
  onRequestScheduleDelete,
  onOpenOneOffScheduleCreate,
  onOpenOneOffScheduleEdit,
  onRequestOneOffScheduleDelete,
}: ClassroomDetailPaneProps) {
  if (!selectedClassroom) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Sin aulas</h2>
        <p className="text-slate-500 text-sm">
          {admin
            ? 'Crea una nueva aula para ver su configuración y estado.'
            : 'Selecciona un aula para ver su configuración y estado.'}
        </p>
        {admin && (
          <button
            onClick={onOpenNewModal}
            className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2 transition-colors shadow-sm font-medium"
          >
            <Plus size={16} /> Crear aula
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">{selectedClassroom.name}</h2>
            <p className="text-slate-500 text-sm">Configuración y estado del aula</p>
          </div>
          <div className="flex gap-2">
            {admin && (
              <button
                onClick={onOpenDeleteDialog}
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
              value={activeGroupSelectValue}
              onChange={onRequestActiveGroupChange}
              groups={allowedGroups}
              includeNoneOption
              noneLabel="Sin grupo activo"
              inactiveBehavior="hide"
              unknownValueLabel={
                !admin && activeGroupSelectValue && !groupById.get(activeGroupSelectValue)
                  ? (selectedClassroom.currentGroupDisplayName ?? 'Aplicado por otro profesor')
                  : undefined
              }
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-blue-500 outline-none shadow-sm"
            />
            {!activeGroupSelectValue && selectedClassroom.currentGroupId && (
              <p className="mt-2 text-xs text-slate-500 italic">
                Actualmente usando{' '}
                <GroupLabel
                  variant="text"
                  className="font-semibold text-slate-700"
                  groupId={selectedClassroom.currentGroupId}
                  group={
                    selectedClassroom.currentGroupId
                      ? (groupById.get(selectedClassroom.currentGroupId) ??
                        toSyntheticGroup(
                          selectedClassroom.currentGroupId,
                          selectedClassroom.currentGroupDisplayName
                        ))
                      : null
                  }
                  source={selectedClassroomSource}
                  revealUnknownId={admin}
                  showSourceTag={false}
                />
                {(() => {
                  const phrase = getGroupSourcePhrase(selectedClassroomSource);
                  return phrase ? ` ${phrase}` : '';
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
              value={defaultGroupSelectValue}
              onChange={(next) => void onDefaultGroupChange(next)}
              disabled={!admin}
              groups={allowedGroups}
              includeNoneOption
              noneLabel="Sin grupo por defecto"
              inactiveBehavior="disable"
              unknownValueLabel={
                !admin && defaultGroupSelectValue && !groupById.get(defaultGroupSelectValue)
                  ? (selectedClassroom.defaultGroupDisplayName ?? 'Asignado por admin')
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
              {renderClassroomStatus(selectedClassroom)}
            </div>
            {selectedClassroom.computerCount > 0 && (
              <span className="text-xs text-slate-500">
                {selectedClassroom.onlineMachineCount}/{selectedClassroom.computerCount} en línea
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 flex-1 min-h-[300px] flex flex-col shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Monitor size={18} className="text-blue-500" />
            Máquinas Registradas
          </h3>
          <div className="flex items-center gap-2">
            {admin && (
              <button
                onClick={() => void onOpenEnrollModal()}
                disabled={enrollModalLoadingToken}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm font-medium disabled:opacity-50"
              >
                {enrollModalLoadingToken ? (
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

        {exemptionsError && (
          <div className="mb-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{exemptionsError}</span>
          </div>
        )}

        {selectedClassroom.machines && selectedClassroom.machines.length > 0 ? (
          <div className="flex-1 space-y-2 overflow-auto">
            {selectedClassroom.machines.map((machine) => {
              const exemption = exemptionByMachineId.get(machine.id);
              const isExempt = exemption !== undefined;
              const mutating = exemptionMutating[machine.id] ?? false;

              const statusColor =
                machine.status === 'online'
                  ? 'bg-green-500'
                  : machine.status === 'stale'
                    ? 'bg-yellow-500'
                    : 'bg-red-500';

              const expiresTime = exemption
                ? new Date(exemption.expiresAt).toTimeString().slice(0, 5)
                : null;

              return (
                <div
                  key={machine.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {machine.hostname}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {machine.status === 'online'
                          ? 'En línea'
                          : machine.status === 'stale'
                            ? 'Conexión inestable'
                            : 'Sin conexión'}
                        {machine.lastSeen
                          ? ` · Último: ${new Date(machine.lastSeen).toLocaleString()}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isExempt && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full border border-green-200 font-medium">
                        Sin restricción{expiresTime ? ` · hasta ${expiresTime}` : ''}
                      </span>
                    )}

                    {isExempt ? (
                      <button
                        onClick={() => void onDeleteExemption(machine.id)}
                        disabled={mutating}
                        className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-sm transition-colors shadow-sm font-medium disabled:opacity-50"
                      >
                        {mutating ? '...' : 'Restringir'}
                      </button>
                    ) : activeSchedule ? (
                      <button
                        onClick={() => void onCreateExemption(machine.id)}
                        disabled={mutating || loadingExemptions}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors shadow-sm font-medium disabled:opacity-50"
                      >
                        {mutating ? '...' : 'Liberar'}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
            <Monitor size={48} className="text-slate-300 mb-3" />
            <p className="text-slate-900 font-medium text-sm">Sin máquinas activas</p>
            <p className="text-slate-500 text-xs mt-1 max-w-xs">
              Instala el agente de OpenPath en los equipos para verlos aquí.
            </p>
          </div>
        )}

        {!activeSchedule && selectedClassroom.machines && selectedClassroom.machines.length > 0 && (
          <p className="mt-3 text-xs text-slate-500 italic">
            La liberación temporal solo está disponible cuando hay un bloque de horario activo.
          </p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 flex-1 flex flex-col shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Clock size={18} className="text-slate-500" />
            Horario del Aula
          </h3>
          <div className="flex gap-2">
            <button
              onClick={onOpenOneOffScheduleCreate}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm font-medium border border-slate-200"
            >
              <Plus size={16} /> Puntual
            </button>
            <button
              onClick={() => onOpenScheduleCreate()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-sm font-medium"
            >
              <Plus size={16} /> Semanal
            </button>
          </div>
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
              onAddClick={(dayOfWeek, startTime) => onOpenScheduleCreate(dayOfWeek, startTime)}
              onEditClick={onOpenScheduleEdit}
              onDeleteClick={onRequestScheduleDelete}
            />
            <p className="mt-3 text-xs text-slate-500">
              Tip: haz click en una celda para crear un bloque. Puedes editar o eliminar tus bloques
              desde el hover.
            </p>

            <div className="mt-5 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-900">Asignaciones puntuales</h4>
                <button
                  onClick={onOpenOneOffScheduleCreate}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    <Plus size={14} /> Nueva
                  </span>
                </button>
              </div>

              {sortedOneOffSchedules.length === 0 ? (
                <p className="text-xs text-slate-500">No hay asignaciones puntuales.</p>
              ) : (
                <div className="space-y-2">
                  {sortedOneOffSchedules.map((schedule) => {
                    const group =
                      groupById.get(schedule.groupId) ??
                      toSyntheticGroup(schedule.groupId, schedule.groupDisplayName);
                    const groupName = group
                      ? (group.displayName ?? group.name)
                      : schedule.canEdit || admin
                        ? schedule.groupId
                        : schedule.teacherName
                          ? `Reservado por ${schedule.teacherName}`
                          : 'Reservado por otro profesor';

                    return (
                      <div
                        key={schedule.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {groupName}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {formatOneOffDateLabel(schedule.startAt)} –{' '}
                            {formatOneOffDateLabel(schedule.endAt)}
                            {schedule.teacherName ? ` · ${schedule.teacherName}` : ''}
                          </p>
                        </div>

                        {schedule.canEdit && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => onOpenOneOffScheduleEdit(schedule)}
                              className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => onRequestOneOffScheduleDelete(schedule)}
                              className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
