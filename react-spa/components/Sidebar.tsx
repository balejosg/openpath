import React from 'react';
import { LayoutDashboard, Users, MonitorPlay, FolderTree, ShieldAlert, LogOut, Settings, Shield } from 'lucide-react';
import { NavItem } from '../types';
import { logout } from '../lib/auth';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen }) => {
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Panel de Control', icon: <LayoutDashboard size={20} /> },
    { id: 'classrooms', label: 'Aulas Seguras', icon: <MonitorPlay size={20} /> },
    { id: 'groups', label: 'Políticas de Grupo', icon: <FolderTree size={20} /> },
    { id: 'users', label: 'Usuarios y Roles', icon: <Users size={20} /> },
    { id: 'domains', label: 'Control de Dominios', icon: <ShieldAlert size={20} /> },
  ];

  return (
    <aside 
      className={`fixed top-0 left-0 z-40 h-screen transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0 w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 shadow-xl`}
    >
      {/* Branding */}
      <div className="h-16 flex items-center px-6 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Shield className="text-blue-500" size={24} strokeWidth={2.5} />
          <span className="text-lg font-semibold tracking-wide text-slate-100">
            OpenPath
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Menu Principal
        </div>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              activeTab === item.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span className={activeTab === item.id ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}>
              {item.icon}
            </span>
            <span className="font-medium text-sm">{item.label}</span>
          </button>
        ))}
      </div>

      {/* User Profile / Bottom */}
      <div className="p-4 bg-slate-950 border-t border-slate-800">
        <button className="flex items-center gap-3 px-3 py-2 w-full text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800 mb-1">
          <Settings size={18} />
          <span className="text-sm">Configuración</span>
        </button>
        <button 
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full text-red-400 hover:text-red-300 transition-colors rounded-lg hover:bg-red-950/30"
        >
          <LogOut size={18} />
          <span className="text-sm">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;