import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';

interface GroupCardProps {
  name: string;
  path?: string;
  whitelistCount: number;
  enabled?: boolean;
  onClick: () => void;
}

function GroupCard({ name, path, whitelistCount, enabled, onClick }: GroupCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left',
        'rounded-lg border border-slate-200 bg-white shadow-sm',
        'px-5 py-4',
        'hover:border-slate-300 hover:bg-slate-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-900 truncate">{name}</div>
          {path && <div className="mt-1 text-sm text-slate-600 truncate">{path}</div>}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-sm font-medium text-slate-700">{whitelistCount} dominios</div>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
              enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
            )}
          >
            {enabled ? 'Activo' : 'Pausado'}
          </span>
          <span className="text-slate-400">→</span>
        </div>
      </div>
    </button>
  );
}

export default function GroupsListView() {
  const navigate = useNavigate();
  const { isAdmin, isTeacher } = useAuth();

  const allGroups = useAppStore((s) => s.allGroups);

  const visibleGroups = useMemo(() => {
    if (isTeacher && !isAdmin) {
      return allGroups;
    }
    return allGroups;
  }, [allGroups, isAdmin, isTeacher]);

  if (visibleGroups.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-slate-900 font-semibold">
          {isTeacher ? 'No tienes grupos asignados' : 'No hay grupos configurados'}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Políticas de Grupo</h2>
          <p className="mt-1 text-sm text-slate-600">
            Selecciona un grupo para editar reglas y configuración.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {visibleGroups.map((g) => (
          <GroupCard
            key={g.name}
            name={g.displayName || g.name}
            path={g.path}
            whitelistCount={g.stats?.whitelist ?? g.whitelistCount ?? 0}
            enabled={g.enabled}
            onClick={() => navigate(`/dashboard/groups/${encodeURIComponent(g.name)}`)}
          />
        ))}
      </div>
    </div>
  );
}
