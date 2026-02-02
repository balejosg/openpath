import React, { useState } from 'react';
import { Folder, CheckCircle, Ban, Server, TrendingUp, Shield, X } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const data = [
  { name: 'Lun', requests: 4 },
  { name: 'Mar', requests: 3 },
  { name: 'Mie', requests: 2 },
  { name: 'Jue', requests: 7 },
  { name: 'Vie', requests: 5 },
  { name: 'Sab', requests: 1 },
  { name: 'Dom', requests: 2 },
];

const StatCard = ({ title, value, icon, color, subtext }: any) => (
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
  const [showAuditModal, setShowAuditModal] = useState(false);

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
          value="6"
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
          value="124"
          icon={<CheckCircle size={20} />}
          color={{
            bg: 'bg-emerald-50',
            text: 'text-emerald-600',
            badgeBg: 'bg-emerald-50',
            badgeText: 'text-emerald-700',
          }}
          subtext="+5 este mes"
        />
        <StatCard
          title="Sitios Bloqueados"
          value="18"
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
          value="3"
          icon={<Server size={20} />}
          color={{
            bg: 'bg-amber-50',
            text: 'text-amber-600',
            badgeBg: 'bg-amber-50',
            badgeText: 'text-amber-700',
          }}
          subtext="Atención req."
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
              <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded">
                Semana
              </span>
              <span className="text-xs font-medium px-2 py-1 text-slate-400 hover:bg-slate-50 rounded cursor-pointer">
                Mes
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    borderColor: '#e2e8f0',
                    color: '#1e293b',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  }}
                  itemStyle={{ color: '#2563eb' }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRequests)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">Auditoría Reciente</h3>
          <div className="space-y-0">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex gap-3 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors -mx-2 px-2 rounded"
              >
                <div className="mt-1">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                </div>
                <div>
                  <p className="text-sm text-slate-700">
                    Cambio de política en{' '}
                    <span className="font-semibold text-slate-900">Grupo QA-1</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Usuario: admin@local • Hace 2h</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowAuditModal(true)}
            className="w-full mt-4 text-center text-sm text-blue-600 hover:text-blue-700 font-medium py-2 border border-blue-100 rounded bg-blue-50/50 hover:bg-blue-50 transition-colors"
          >
            Ver Registro Completo
          </button>
        </div>
      </div>

      {/* Modal: Registro de Auditoría */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Registro de Auditoría</h3>
              <button
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex gap-3 py-3 border-b border-slate-100 last:border-0">
                  <div className="mt-1">
                    <div
                      className={`w-2 h-2 rounded-full ${i % 3 === 0 ? 'bg-green-500' : i % 3 === 1 ? 'bg-blue-500' : 'bg-amber-500'}`}
                    ></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">
                      {i % 3 === 0 && (
                        <>
                          Dominio <span className="font-semibold">google.com</span> añadido a
                          whitelist
                        </>
                      )}
                      {i % 3 === 1 && (
                        <>
                          Cambio de política en <span className="font-semibold">Grupo QA-1</span>
                        </>
                      )}
                      {i % 3 === 2 && (
                        <>
                          Usuario <span className="font-semibold">teacher@school.edu</span>{' '}
                          desactivado
                        </>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Usuario: admin@local • Hace {i + 1}h
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-slate-200 mt-4">
              <button
                onClick={() => setShowAuditModal(false)}
                className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
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

export default Dashboard;
