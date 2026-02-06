import React, { useState, useEffect } from 'react';
import { Folder, CheckCircle, Ban, Server, Shield, Loader2 } from 'lucide-react';
import { trpc } from '../lib/trpc';

interface StatsData {
  groupCount: number;
  whitelistCount: number;
  blockedCount: number;
  pendingRequests: number;
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

const Dashboard = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const [groupStats, requestStats] = await Promise.all([
          trpc.groups.stats.query(),
          trpc.requests.stats.query(),
        ]);
        setStats({
          groupCount: groupStats.groupCount,
          whitelistCount: groupStats.whitelistCount,
          blockedCount: groupStats.blockedCount,
          pendingRequests: requestStats.pending,
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

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Estado del Sistema: Seguro</h2>
          <p className="text-slate-500 text-sm mt-1">
            Todos los servicios operan con normalidad. Última verificación: Hace 2 min.
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
    </div>
  );
};

export default Dashboard;
