import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  CheckCircle,
  Ban,
  Server,
  Shield,
  Loader2,
  ShieldCheck,
  ShieldOff,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import { trpc } from '../lib/trpc';

interface StatsData {
  groupCount: number;
  whitelistCount: number;
  blockedCount: number;
  pendingRequests: number;
}

interface SystemStatus {
  enabled: boolean;
  lastChecked: Date;
}

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

interface GroupFromAPI {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  whitelistCount: number;
  blockedSubdomainCount: number;
  blockedPathCount: number;
  createdAt?: string;
  updatedAt?: string | null;
}

interface DashboardProps {
  onNavigateToRules?: (group: { id: string; name: string }) => void;
}

type SortOption = 'name' | 'rules' | 'recent';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'rules', label: 'Más reglas' },
  { value: 'recent', label: 'Recientes' },
];

const MAX_QUICK_ACCESS_GROUPS = 6;

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

const Dashboard: React.FC<DashboardProps> = ({ onNavigateToRules }) => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Groups state
  const [groups, setGroups] = useState<GroupFromAPI[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const [groupStats, requestStats, sysStatus] = await Promise.all([
          trpc.groups.stats.query(),
          trpc.requests.stats.query(),
          trpc.groups.systemStatus.query(),
        ]);
        setStats({
          groupCount: groupStats.groupCount,
          whitelistCount: groupStats.whitelistCount,
          blockedCount: groupStats.blockedCount,
          pendingRequests: requestStats.pending,
        });
        setSystemStatus({
          enabled: sysStatus.enabled,
          lastChecked: new Date(),
        });
        setError(null);
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
        setError('Error al cargar estadísticas');
      } finally {
        setLoading(false);
      }
    };
    void fetchStats();
  }, []);

  // Fetch groups for quick access
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        setGroupsLoading(true);
        const apiGroups = await trpc.groups.list.query();
        setGroups(apiGroups);
        setGroupsError(null);
      } catch (err) {
        console.error('Failed to fetch groups:', err);
        setGroupsError('Error al cargar grupos');
      } finally {
        setGroupsLoading(false);
      }
    };
    void fetchGroups();
  }, []);

  // Sort and limit groups
  const sortedGroups = useMemo(() => {
    const sorted = [...groups].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.displayName.localeCompare(b.displayName);
        case 'rules': {
          const aTotal = a.whitelistCount + a.blockedSubdomainCount + a.blockedPathCount;
          const bTotal = b.whitelistCount + b.blockedSubdomainCount + b.blockedPathCount;
          return bTotal - aTotal;
        }
        case 'recent': {
          // Use updatedAt if available, otherwise createdAt
          const aDate = a.updatedAt ?? a.createdAt ?? '';
          const bDate = b.updatedAt ?? b.createdAt ?? '';
          return bDate.localeCompare(aDate);
        }
        default:
          return 0;
      }
    });
    return sorted.slice(0, MAX_QUICK_ACCESS_GROUPS);
  }, [groups, sortBy]);

  const hasMoreGroups = groups.length > MAX_QUICK_ACCESS_GROUPS;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowSortDropdown(false);
    if (showSortDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showSortDropdown]);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin text-slate-400" />
                Verificando estado...
              </>
            ) : systemStatus?.enabled ? (
              <>
                <ShieldCheck size={20} className="text-green-600" />
                Estado del Sistema: Seguro
              </>
            ) : (
              <>
                <ShieldOff size={20} className="text-amber-600" />
                Estado del Sistema: Deshabilitado
              </>
            )}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {loading
              ? 'Cargando información del sistema...'
              : systemStatus?.enabled
                ? 'Todos los servicios operan con normalidad.'
                : 'El sistema de filtrado está desactivado.'}
            {systemStatus?.lastChecked && !loading && (
              <span className="ml-1">
                Última verificación: {systemStatus.lastChecked.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="hidden sm:block">
          <Shield className="text-blue-500 w-12 h-12 opacity-20" />
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
        <div className="space-y-4">
          {/* Header with sort dropdown */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Acceso Rápido</h3>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSortDropdown(!showSortDropdown);
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                data-testid="sort-dropdown-button"
              >
                Ordenar: {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                <ChevronDown size={14} />
              </button>
              {showSortDropdown && (
                <div
                  className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10 min-w-[150px]"
                  data-testid="sort-dropdown-menu"
                >
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSortBy(option.value);
                        setShowSortDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${
                        sortBy === option.value ? 'text-blue-600 font-medium' : 'text-slate-600'
                      }`}
                      data-testid={`sort-option-${option.value}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Groups Grid */}
          {groupsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500">Cargando grupos...</span>
            </div>
          ) : groupsError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {groupsError}
            </div>
          ) : groups.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
              <Folder className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No hay grupos configurados.</p>
              <p className="text-slate-400 text-xs mt-1">
                Crea un grupo en &quot;Políticas de Grupo&quot; para empezar.
              </p>
            </div>
          ) : (
            <>
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                data-testid="quick-access-grid"
              >
                {sortedGroups.map((group) => {
                  const blockedCount = group.blockedSubdomainCount + group.blockedPathCount;
                  const isInactive = !group.enabled;

                  return (
                    <div
                      key={group.id}
                      className={`border rounded-lg p-4 transition-all ${
                        isInactive
                          ? 'bg-slate-50 opacity-60 border-slate-200'
                          : 'bg-white hover:border-blue-300 hover:shadow-md border-slate-200'
                      }`}
                      data-testid={`group-card-${group.id}`}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-2 rounded-lg ${
                              isInactive
                                ? 'bg-slate-100 text-slate-400'
                                : 'bg-blue-50 text-blue-600'
                            }`}
                          >
                            <Folder size={16} />
                          </div>
                          <div>
                            <h4 className="font-medium text-slate-900 text-sm">
                              {group.displayName}
                            </h4>
                            <p className="text-xs text-slate-400">{group.name}</p>
                          </div>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            isInactive
                              ? 'bg-slate-100 text-slate-500 border border-slate-200'
                              : 'bg-green-50 text-green-700 border border-green-200'
                          }`}
                        >
                          {isInactive ? 'Inactivo' : 'Activo'}
                        </span>
                      </div>

                      {/* Counts */}
                      <div className="flex items-center gap-4 mb-4 text-sm">
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle size={14} />
                          {group.whitelistCount}
                        </span>
                        <span className="flex items-center gap-1 text-slate-500">
                          <Ban size={14} />
                          {blockedCount}
                        </span>
                      </div>

                      {/* Action Button */}
                      <button
                        onClick={() => onNavigateToRules({ id: group.id, name: group.displayName })}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isInactive
                            ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                        data-testid={`manage-rules-${group.id}`}
                      >
                        Gestionar Reglas
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* View All Link */}
              {hasMoreGroups && (
                <div className="text-center pt-2">
                  <p className="text-sm text-slate-500">
                    Mostrando {sortedGroups.length} de {groups.length} grupos.{' '}
                    <span className="text-slate-400">
                      Ve a &quot;Políticas de Grupo&quot; para ver todos.
                    </span>
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
