import { useEffect, useMemo, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { trpc } from '@/lib/trpc';
import type { Group } from '@/types';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface DashboardLayoutProps {
  children?: ReactNode;
}

const titleByPathname: { match: (pathname: string) => boolean; title: string }[] = [
  { match: (p) => p === '/dashboard', title: 'Panel de Control' },
  { match: (p) => p.startsWith('/dashboard/classrooms'), title: 'Aulas Seguras' },
  { match: (p) => p.startsWith('/dashboard/groups'), title: 'Políticas de Grupo' },
  { match: (p) => p.startsWith('/dashboard/users'), title: 'Usuarios y Roles' },
  { match: (p) => p.startsWith('/dashboard/requests'), title: 'Solicitudes' },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { pathname } = useLocation();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setAllGroups = useAppStore((s) => s.setAllGroups);

  const title = useMemo(() => {
    const found = titleByPathname.find((rule) => rule.match(pathname));
    return found?.title ?? 'Panel de Control';
  }, [pathname]);

  // Load groups when dashboard mounts
  useEffect(() => {
    async function loadGroups() {
      try {
        const groups = await trpc.groups.list.query();
        // Map backend response to Group type with stats
        const mappedGroups: Group[] = groups.map((g: any) => ({
          ...g,
          stats: {
            whitelist: g.whitelistCount ?? 0,
            blockedSubdomains: g.blockedSubdomainCount ?? 0,
            blockedPaths: g.blockedPathCount ?? 0,
          },
        }));
        setAllGroups(mappedGroups);
      } catch (error) {
        console.error('Failed to load groups:', error);
      }
    }
    void loadGroups();
  }, [setAllGroups]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />

      <button
        type="button"
        onClick={() => { setSidebarOpen(false); }}
        className={cn(
          'fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] transition-opacity duration-200',
          'lg:hidden',
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="lg:pl-72">
        <Header title={title} />

        <main className="px-4 py-6 lg:px-6">
          <div className="mx-auto w-full max-w-6xl">{children ?? <Outlet />}</div>
        </main>
      </div>
    </div>
  );
}
