import { useEffect, useState } from 'react';
import { FolderTree, Globe, ShieldX, Clock, ShieldCheck } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/Card';
import { trpc } from '@/lib/trpc';
import { useAppStore } from '@/stores/appStore';

interface Stats {
  groupCount: number;
  whitelistCount: number;
  blockedCount: number;
  pendingRequests: number;
}

export default function DashboardOverviewView() {
  const allGroups = useAppStore((s) => s.allGroups);
  const [stats, setStats] = useState<Stats>({
    groupCount: 0,
    whitelistCount: 0,
    blockedCount: 0,
    pendingRequests: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        // Get pending requests count
        const requests = (await trpc.requests.list.query({ status: 'pending' })) as { id: string }[];

        // Calculate domain counts from groups
        let whitelistTotal = 0;
        let blockedTotal = 0;

        allGroups.forEach((g) => {
          whitelistTotal += g.stats?.whitelist ?? 0;
          blockedTotal += (g.stats?.blockedSubdomains ?? 0) + (g.stats?.blockedPaths ?? 0);
        });

        setStats({
          groupCount: allGroups.length,
          whitelistCount: whitelistTotal,
          blockedCount: blockedTotal,
          pendingRequests: requests.length,
        });
      } catch (error) {
        console.error('Error loading stats:', error);
      } finally {
        setIsLoading(false);
      }
    }

    void loadStats();
  }, [allGroups]);

  const statCards = [
    { label: 'Grupos Activos', value: stats.groupCount, icon: FolderTree, color: 'blue' },
    { label: 'Dominios Permitidos', value: stats.whitelistCount, icon: Globe, color: 'green' },
    { label: 'Sitios Bloqueados', value: stats.blockedCount, icon: ShieldX, color: 'red' },
    { label: 'Solicitudes Pendientes', value: stats.pendingRequests, icon: Clock, color: 'amber' },
  ];

  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    amber: 'bg-amber-100 text-amber-600',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-green-600" />
        <span className="text-green-800 font-medium">Estado del Sistema: Seguro</span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${colorClasses[stat.color as keyof typeof colorClasses]}`}>
                    <Icon size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                    <p className="text-sm text-slate-600">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Placeholder for charts and activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Tráfico de Solicitudes</h3>
            <div className="h-64 flex items-center justify-center text-slate-400">
              Gráfico (implementar con Recharts)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Actividad Reciente</h3>
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Sin actividad reciente</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
