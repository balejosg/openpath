import { LogOut, Menu } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';

interface HeaderProps {
  title: string;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts.at(0);
  const last = parts.length > 1 ? parts.at(-1) : undefined;

  const firstChar = first ? first[0] : undefined;
  const lastChar = last ? last[0] : undefined;

  return (firstChar ? firstChar.toUpperCase() : '') + (lastChar ? lastChar.toUpperCase() : '');
}

export function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  const displayName = user?.name ? user.name : 'Usuario';
  const initials = user?.name ? getInitials(user.name) : '?';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="h-16 px-4 lg:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              'inline-flex items-center justify-center rounded-md h-10 w-10',
              'text-slate-700 hover:bg-slate-100 active:bg-slate-200/70',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50',
              'lg:hidden',
            )}
            aria-controls="dashboard-sidebar"
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 truncate">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-slate-900 text-slate-50 grid place-items-center shadow-sm shadow-slate-900/15">
              <span className="text-xs font-semibold">{initials}</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900 leading-none truncate max-w-[16rem]">{displayName}</div>
              <div className="mt-1 text-xs text-slate-500 leading-none">Cuenta</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void logout()}
            className={cn(
              'inline-flex items-center gap-2 rounded-md h-10 px-3',
              'text-slate-700 hover:bg-slate-100 active:bg-slate-200/70',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50',
            )}
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </header>
  );
}
