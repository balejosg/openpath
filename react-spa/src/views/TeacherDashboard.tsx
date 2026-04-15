import React from 'react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TeacherActiveClassroomsCard } from '../components/teacher/TeacherActiveClassroomsCard';
import { TeacherClassroomControlCard } from '../components/teacher/TeacherClassroomControlCard';
import { TeacherDashboardHero } from '../components/teacher/TeacherDashboardHero';
import { useTeacherDashboardViewModel } from '../hooks/useTeacherDashboardViewModel';

interface TeacherDashboardProps {
  onNavigateToRules?: (group: { id: string; name: string }) => void;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigateToRules }) => {
  const viewModel = useTeacherDashboardViewModel();

  return (
    <div className="space-y-6">
      <TeacherDashboardHero
        classroomsLoading={viewModel.classroomsLoading}
        activeCount={viewModel.activeClassrooms.length}
        classroomsError={viewModel.classroomsError}
        onRetry={() => void viewModel.refetchClassrooms()}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TeacherClassroomControlCard viewModel={viewModel} onNavigateToRules={onNavigateToRules} />
        <TeacherActiveClassroomsCard viewModel={viewModel} />
      </div>

      <ConfirmDialog
        isOpen={viewModel.controlConfirm !== null}
        title="Confirmar cambio"
        confirmLabel={viewModel.controlConfirm?.nextGroupId ? 'Reemplazar' : 'Liberar Aula'}
        cancelLabel="Cancelar"
        isLoading={viewModel.controlLoading}
        errorMessage={viewModel.controlConfirm ? (viewModel.controlError ?? undefined) : undefined}
        onClose={() => {
          viewModel.setControlConfirm(null);
          viewModel.setControlError(null);
        }}
        onConfirm={async () => {
          if (!viewModel.controlConfirm) return;
          const ok = await viewModel.applyControlChange(
            viewModel.controlConfirm.classroomId,
            viewModel.controlConfirm.nextGroupId
          );
          if (!ok) return;
          viewModel.setControlConfirm(null);
        }}
      >
        <p className="text-sm text-slate-600">
          El aula ya tiene una política aplicada manualmente (
          <strong>{viewModel.controlConfirm?.currentName}</strong>).
        </p>
        <p className="text-sm text-slate-600">
          {viewModel.controlConfirm?.nextGroupId ? 'Reemplazar por' : 'Liberar (sin grupo)'}:{' '}
          <strong>{viewModel.controlConfirm?.nextName}</strong>?
        </p>
      </ConfirmDialog>
    </div>
  );
};

export default TeacherDashboard;
