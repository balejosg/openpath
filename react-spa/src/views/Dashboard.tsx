import React from 'react';
import {
  Folder,
  CheckCircle,
  Ban,
  Shield,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Server,
} from 'lucide-react';
import { GroupLabel } from '../components/groups/GroupLabel';
import { DashboardQuickAccessSection } from '../components/dashboard/DashboardQuickAccessSection';
import { useDashboardViewModel } from '../hooks/useDashboardViewModel';

interface StatCardColor {
  bg: string;
  text: string;
  badgeBg: string;
  badgeText: string;
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: StatCardColor;
  subtext: string;
}

interface DashboardProps {
  onNavigateToRules?: (group: { id: string; name: string }) => void;
  onNavigateToClassroom?: (classroom: { id: string; name: string }) => void;
}

const StatCard = ({ title, value, icon, color, subtext }: StatCardProps) => (
  <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2 rounded-lg ${color.bg} ${color.text}`}>{icon}</div>
      <span
        className={`text-xs font-medium px-2 py-1 rounded-full ${color.badgeBg} ${color.badgeText}`}
      >
        {subtext}
      </span>
    </div>
    <div>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      <p className="text-slate-500 text-sm font-medium">{title}</p>
    </div>
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ onNavigateToRules, onNavigateToClassroom }) => {
  const {
    loading,
    error,
    stats,
    systemStatus,
    classrooms,
    classroomsLoading,
    classroomsError,
    groups,
    groupsLoading,
    groupsError,
    sortBy,
    setSortBy,
    showSortDropdown,
    setShowSortDropdown,
    sortedGroups,
    hasMoreGroups,
    activeGroupsByClassroom,
  } = useDashboardViewModel();

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h2
            className="text-xl font-semibold text-slate-800 flex items-center gap-2"
            data-testid="dashboard-system-status"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin text-slate-400" />
                Verificando estado...
              </>
            ) : !systemStatus ? (
              <>
                <AlertCircle size={20} className="text-slate-500" />
                Estado del Sistema: No disponible
              </>
            ) : systemStatus.activeGroups > 0 ? (
              <>
                <ShieldCheck size={20} className="text-green-600" />
                Estado del Sistema: Seguro
              </>
            ) : (
              <>
                <ShieldOff size={20} className="text-amber-600" />
                Estado del Sistema: Sin grupos habilitados
              </>
            )}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {loading
              ? 'Cargando información del sistema...'
              : !systemStatus
                ? 'No se pudo obtener el estado del sistema.'
                : systemStatus.activeGroups > 0
                  ? `Hay ${String(systemStatus.activeGroups)} grupo(s) habilitado(s) aplicando reglas.`
                  : 'No hay grupos habilitados; habilita uno para aplicar reglas.'}
            {systemStatus?.lastChecked && !loading && (
              <span className="ml-1">
                Última verificación: {systemStatus.lastChecked.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        <div className="w-full sm:w-[340px] bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Grupo vigente por aula
            </p>
            <Shield className="text-slate-400 w-4 h-4" />
          </div>

          {classroomsLoading ? (
            <div className="flex items-center gap-2 mt-3 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin text-slate-400" />
              Cargando aulas...
            </div>
          ) : classroomsError ? (
            <p className="mt-3 text-sm text-red-600">{classroomsError}</p>
          ) : activeGroupsByClassroom.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              {classrooms.length === 0
                ? 'No hay aulas configuradas.'
                : 'No hay aulas con grupo asignado.'}
            </p>
          ) : (
            <ul className="mt-3 space-y-2 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
              {activeGroupsByClassroom.map((row) => {
                const rowContent = (
                  <>
                    <span className="text-sm text-slate-700 truncate">{row.classroomName}</span>
                    <GroupLabel
                      className="text-xs whitespace-nowrap"
                      groupId={row.groupId}
                      group={row.group}
                      source={row.source}
                      revealUnknownId
                      showSourceTag={row.source !== 'none'}
                      showInactiveTag
                    />
                  </>
                );

                return (
                  <li key={row.classroomId}>
                    {onNavigateToClassroom ? (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white"
                        data-testid={`dashboard-classroom-${row.classroomId}`}
                        onClick={() =>
                          onNavigateToClassroom({
                            id: row.classroomId,
                            name: row.classroomName,
                          })
                        }
                      >
                        {rowContent}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                        {rowContent}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Grupos Activos"
          value={loading ? '...' : String(stats?.groupCount ?? 0)}
          icon={<Folder size={20} />}
          color={{
            bg: 'bg-blue-50',
            text: 'text-blue-600',
            badgeBg: 'bg-blue-50',
            badgeText: 'text-blue-700',
          }}
          subtext="Total"
        />
        <StatCard
          title="Dominios Permitidos"
          value={loading ? '...' : String(stats?.whitelistCount ?? 0)}
          icon={<CheckCircle size={20} />}
          color={{
            bg: 'bg-emerald-50',
            text: 'text-emerald-600',
            badgeBg: 'bg-emerald-50',
            badgeText: 'text-emerald-700',
          }}
          subtext="Whitelist"
        />
        <StatCard
          title="Sitios Bloqueados"
          value={loading ? '...' : String(stats?.blockedCount ?? 0)}
          icon={<Ban size={20} />}
          color={{
            bg: 'bg-slate-100',
            text: 'text-slate-600',
            badgeBg: 'bg-slate-100',
            badgeText: 'text-slate-600',
          }}
          subtext="Seguridad"
        />
        <StatCard
          title="Solicitudes Pendientes"
          value={loading ? '...' : String(stats?.pendingRequests ?? 0)}
          icon={<Server size={20} />}
          color={{
            bg: 'bg-amber-50',
            text: 'text-amber-600',
            badgeBg: 'bg-amber-50',
            badgeText: 'text-amber-700',
          }}
          subtext={stats?.pendingRequests ? 'Atención req.' : 'Sin pendientes'}
        />
      </div>

      {/* Error message if stats failed to load */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Cargando estadísticas...</span>
        </div>
      )}

      {/* Quick Access Section */}
      {onNavigateToRules && (
        <DashboardQuickAccessSection
          groups={groups}
          groupsLoading={groupsLoading}
          groupsError={groupsError}
          sortedGroups={sortedGroups}
          sortBy={sortBy}
          showSortDropdown={showSortDropdown}
          setSortBy={setSortBy}
          setShowSortDropdown={setShowSortDropdown}
          hasMoreGroups={hasMoreGroups}
          onNavigateToRules={onNavigateToRules}
        />
      )}
    </div>
  );
};

export default Dashboard;
