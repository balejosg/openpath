import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Gauge, GraduationCap, Layers, ShieldCheck, Users, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { title: 'Panel de Control', href: '/dashboard', icon: Gauge },
  { title: 'Aulas Seguras', href: '/dashboard/classrooms', icon: GraduationCap },
  { title: 'Políticas de Grupo', href: '/dashboard/groups', icon: Layers },
  { title: 'Usuarios y Roles', href: '/dashboard/users', icon: Users },
  { title: 'Solicitudes', href: '/dashboard/requests', icon: ShieldCheck },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  return (
    <aside
      id="dashboard-sidebar"
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white',
        'transition-transform duration-200 ease-out',
        'lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}
      aria-label="Sidebar navigation"
    >
      <div className="h-full flex flex-col">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-slate-900 text-slate-50 grid place-items-center shadow-sm shadow-slate-900/15">
                <span className="text-sm font-semibold">OP</span>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 leading-none">OpenPath</div>
                <div className="mt-1 text-xs text-slate-500 leading-none">Dashboard</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { setSidebarOpen(false); }}
              className={cn(
                'inline-flex items-center justify-center rounded-md h-9 w-9',
                'text-slate-700 hover:bg-slate-100 active:bg-slate-200/70',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50',
                'lg:hidden',
              )}
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="px-3 pb-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => { setSidebarOpen(false); }}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                    'transition-colors duration-150',
                    isActive
                      ? 'bg-slate-900 text-slate-50'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 flex-none',
                      isActive ? 'text-slate-50' : 'text-slate-400 group-hover:text-slate-600',
                    )}
                  />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="mt-auto px-5 py-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-medium text-slate-700">Default-deny, centralized.</div>
            <div className="mt-1 text-xs text-slate-500">Only what you approve exists.</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
