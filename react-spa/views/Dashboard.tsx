import React from 'react';
import { Folder, CheckCircle, Ban, Server, TrendingUp, Shield, Loader2, AlertCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDashboardStats } from '../hooks/useDashboardStats';

const data = [
  { name: 'Lun', requests: 4 },
  { name: 'Mar', requests: 3 },
  { name: 'Mie', requests: 2 },
  { name: 'Jue', requests: 7 },
  { name: 'Vie', requests: 5 },
  { name: 'Sab', requests: 1 },
  { name: 'Dom', requests: 2 },
];

const StatCard = ({ title, value, icon, color, subtext, isLoading }: any) => (
  <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2 rounded-lg ${color.bg} ${color.text}`}>
        {icon}
      </div>
      <span className={`text-xs font-medium px-2 py-1 rounded-full ${color.badgeBg} ${color.badgeText}`}>
        {subtext}
      </span>
    </div>
    <div>
      {isLoading ? (
        <div className="h-8 w-16 bg-slate-100 animate-pulse rounded mb-2"></div>
      ) : (
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      )}
      <p className="text-slate-500 text-sm font-medium">{title}</p>
    </div>
  </div>
);

const Dashboard = ({ onNavigateToRequests }: { onNavigateToRequests?: () => void }) => {
  const { stats, isLoading, error, pendingRequests } = useDashboardStats();

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 p-6 rounded-lg flex items-center gap-4 text-red-700">
        <AlertCircle className="w-6 h-6" />
        <div>
          <h3 className="font-semibold">Error al cargar datos del dashboard</h3>
          <p className="text-sm opacity-90">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm flex items-center justify-between">
         <div>
            <h2 className="text-xl font-semibold text-slate-800">
              {isLoading ? 'Verificando estado...' : 'Estado del Sistema: Seguro'}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Conectando con el servidor...
                </span>
              ) : (
                'Todos los servicios operan con normalidad. Datos sincronizados en tiempo real.'
              )}
            </p>
         </div>
         <div className="hidden sm:block">
            <Shield className={`text-blue-500 w-12 h-12 ${isLoading ? 'opacity-10 animate-pulse' : 'opacity-20'}`} />
         </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Grupos Activos" 
          value={stats.groupCount} 
          icon={<Folder size={20} />} 
          color={{ bg: 'bg-blue-50', text: 'text-blue-600', badgeBg: 'bg-blue-50', badgeText: 'text-blue-700' }}
          subtext="Total"
          isLoading={isLoading}
        />
        <StatCard 
          title="Reglas de Acceso" 
          value={stats.domainCount} 
          icon={<CheckCircle size={20} />} 
          color={{ bg: 'bg-emerald-50', text: 'text-emerald-600', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700' }}
          subtext="Configuradas"
          isLoading={isLoading}
        />
        <StatCard 
          title="Aulas Registradas" 
          value={stats.classroomCount} 
          icon={<Ban size={20} />} 
          color={{ bg: 'bg-slate-100', text: 'text-slate-600', badgeBg: 'bg-slate-100', badgeText: 'text-slate-600' }}
          subtext="Infraestructura"
          isLoading={isLoading}
        />
        <StatCard 
          title="Solicitudes Pendientes" 
          value={stats.pendingRequestsCount} 
          icon={<Server size={20} />} 
          color={{ bg: 'bg-amber-50', text: 'text-amber-600', badgeBg: 'bg-amber-50', badgeText: 'text-amber-700' }}
          subtext="Atención req."
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <TrendingUp size={18} className="text-slate-400" />
              Tráfico de Solicitudes
            </h3>
            <div className="flex gap-2">
                <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded">Semana</span>
                <span className="text-xs font-medium px-2 py-1 text-slate-400 hover:bg-slate-50 rounded cursor-pointer">Mes</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '6px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  itemStyle={{ color: '#2563eb' }}
                />
                <Area type="monotone" dataKey="requests" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorRequests)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">Solicitudes Pendientes</h3>
          <div className="space-y-0">
            {isLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="py-3 flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-slate-100 animate-pulse mt-1.5" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-slate-100 animate-pulse rounded w-3/4" />
                    <div className="h-2 bg-slate-50 animate-pulse rounded w-1/2" />
                  </div>
                </div>
              ))
            ) : pendingRequests.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-50" />
                <p className="text-sm text-slate-500 font-medium">Todo al día</p>
                <p className="text-xs text-slate-400">No hay solicitudes pendientes</p>
              </div>
            ) : (
              pendingRequests.slice(0, 5).map((req: any) => (
                <div key={req.id} className="flex gap-3 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors -mx-2 px-2 rounded">
                  <div className="mt-1.5">
                     <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate font-medium">
                      {req.domain}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 truncate">De: {req.requesterEmail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <button 
            onClick={onNavigateToRequests}
            className="w-full mt-4 text-center text-sm text-blue-600 hover:text-blue-700 font-medium py-2 border border-blue-100 rounded bg-blue-50/50 hover:bg-blue-50 transition-colors"
          >
            Ver Todas las Solicitudes
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;