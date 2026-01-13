import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { RuleType } from '@/types';

type ApiRuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';


interface GroupData {
  enabled: boolean;
  whitelist: string[];
  blockedSubdomains: string[];
  blockedPaths: string[];
}

function toApiRuleType(type: RuleType): ApiRuleType {
  if (type === 'blockedSubdomains') return 'blocked_subdomain';
  if (type === 'blockedPaths') return 'blocked_path';
  return 'whitelist';
}

function typeLabel(type: RuleType): string {
  if (type === 'blockedSubdomains') return 'Subdominios bloqueados';
  if (type === 'blockedPaths') return 'Rutas bloqueadas';
  return 'Whitelist';
}

function emptyState(type: RuleType, hasSearch: boolean): string {
  if (hasSearch) return 'No hay resultados.';
  if (type === 'whitelist') return 'No hay dominios en esta sección.';
  return 'No hay reglas en esta sección.';
}

export default function GroupDetailView() {
  const navigate = useNavigate();
  const params = useParams();
  const groupName = params.name ? decodeURIComponent(params.name) : '';

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupData, setGroupData] = useState<GroupData | null>(null);

  const [currentRuleType, setCurrentRuleType] = useState<RuleType>('whitelist');
  const [search, setSearch] = useState('');

  const [newRuleModalOpen, setNewRuleModalOpen] = useState(false);
  const [newRuleValue, setNewRuleValue] = useState('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!groupName) return;

    setIsLoading(true);
    setLoadError(null);

    try {
      const group = (await trpc.groups.getByName.query({ name: groupName })) as {
        id: string;
        enabled: boolean;
      };

      const rules = (await trpc.groups.listRules.query({ groupId: group.id })) as {
        id: string;
        type: ApiRuleType;
        value: string;
      }[];

      const whitelist = rules.filter((r) => r.type === 'whitelist').map((r) => r.value);
      const blockedSubdomains = rules.filter((r) => r.type === 'blocked_subdomain').map((r) => r.value);
      const blockedPaths = rules.filter((r) => r.type === 'blocked_path').map((r) => r.value);

      setGroupId(group.id);
      setGroupData({ enabled: group.enabled, whitelist, blockedSubdomains, blockedPaths });
      setCurrentRuleType('whitelist');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [groupName]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentRules = useMemo(() => {
    if (!groupData) return [];
    const rules = groupData[currentRuleType];
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) => r.toLowerCase().includes(q));
  }, [groupData, currentRuleType, search]);

  const counts = useMemo(() => {
    if (!groupData) return { whitelist: 0, blockedSubdomains: 0, blockedPaths: 0 };
    return {
      whitelist: groupData.whitelist.length,
      blockedSubdomains: groupData.blockedSubdomains.length,
      blockedPaths: groupData.blockedPaths.length,
    };
  }, [groupData]);

  const updateEnabled = useCallback((enabled: boolean) => {
    setGroupData((prev) => (prev ? { ...prev, enabled } : prev));
  }, []);

  const deleteRule = useCallback(
    async (value: string) => {
      if (!groupId || !groupData) return;

      const apiType = toApiRuleType(currentRuleType);

      const rules = (await trpc.groups.listRules.query({ groupId, type: apiType })) as {
        id: string;
        value: string;
      }[];

      const match = rules.find((r) => r.value === value);
      if (!match) return;

      await trpc.groups.deleteRule.mutate({ id: match.id });

      setGroupData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [currentRuleType]: prev[currentRuleType].filter((r) => r !== value),
        };
      });
    },
    [currentRuleType, groupData, groupId],
  );

  const saveGroup = useCallback(async () => {
    if (!groupId || !groupData) return;

    await trpc.groups.update.mutate({
      id: groupId,
      displayName: groupName,
      enabled: groupData.enabled,
    });

    const [currentWhitelist, currentBlocked, currentPaths] = await Promise.all([
      trpc.groups.listRules.query({ groupId, type: 'whitelist' }),
      trpc.groups.listRules.query({ groupId, type: 'blocked_subdomain' }),
      trpc.groups.listRules.query({ groupId, type: 'blocked_path' }),
    ]);

    const serverRules = {
      whitelist: (currentWhitelist as { id: string; value: string }[]).map((r) => r.value),
      blockedSubdomains: (currentBlocked as { id: string; value: string }[]).map((r) => r.value),
      blockedPaths: (currentPaths as { id: string; value: string }[]).map((r) => r.value),
    };

    type RuleTypeKey = 'whitelist' | 'blockedSubdomains' | 'blockedPaths';
    const types: { key: RuleTypeKey; apiType: ApiRuleType; current: { id: string; value: string }[] }[] = [
      { key: 'whitelist', apiType: 'whitelist', current: currentWhitelist as { id: string; value: string }[] },
      { key: 'blockedSubdomains', apiType: 'blocked_subdomain', current: currentBlocked as { id: string; value: string }[] },
      { key: 'blockedPaths', apiType: 'blocked_path', current: currentPaths as { id: string; value: string }[] },
    ];

    for (const { key, apiType, current } of types) {
      const localValues = groupData[key];
      const serverValues = serverRules[key];

      const toAdd = localValues.filter((v) => !serverValues.includes(v));
      if (toAdd.length > 0) {
        await trpc.groups.bulkCreateRules.mutate({
          groupId,
          type: apiType,
          values: toAdd,
        });
      }

      const toRemove = serverValues.filter((v) => !localValues.includes(v));
      for (const value of toRemove) {
        const match = current.find((r) => r.value === value);
        if (match) {
          await trpc.groups.deleteRule.mutate({ id: match.id });
        }
      }
    }
  }, [groupData, groupId, groupName]);

  const deleteGroup = useCallback(async () => {
    if (!groupId) return;
    await trpc.groups.delete.mutate({ id: groupId });
    navigate('/dashboard/groups');
  }, [groupId, navigate]);

  const addRule = useCallback(() => {
    const value = newRuleValue.trim();
    if (!value) return;

    setGroupData((prev) => {
      if (!prev) return prev;
      const current = prev[currentRuleType];
      if (current.includes(value)) return prev;
      return { ...prev, [currentRuleType]: [...current, value] };
    });

    setNewRuleValue('');
    setNewRuleModalOpen(false);
  }, [currentRuleType, newRuleValue]);

  if (!groupName) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-slate-900 font-semibold">Grupo no válido.</div>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => navigate('/dashboard/groups')}>
              Volver
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-slate-900 font-semibold">Cargando…</div>
        </CardContent>
      </Card>
    );
  }

  if (loadError || !groupData) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-slate-900 font-semibold">Error cargando grupo</div>
          <div className="mt-1 text-sm text-slate-600">{loadError}</div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/dashboard/groups')}>
              Volver
            </Button>
            <Button onClick={() => void load()}>Reintentar</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate('/dashboard/groups')}>
              ←
            </Button>
            <h2 className="text-lg font-semibold text-slate-900 truncate">{groupName}</h2>
            <Badge variant={groupData.enabled ? 'success' : 'warning'}>
              {groupData.enabled ? 'Activo' : 'Pausado'}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-slate-600">Editando políticas del grupo.</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={groupData.enabled ? 'secondary' : 'primary'} onClick={() => { updateEnabled(!groupData.enabled); }}>
            {groupData.enabled ? 'Pausar' : 'Activar'}
          </Button>
          <Button onClick={() => void saveGroup()}>Guardar</Button>
          <Button variant="danger" onClick={() => { setDeleteModalOpen(true); }}>
            Eliminar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['whitelist', 'blockedSubdomains', 'blockedPaths'] as RuleType[]).map((t) => {
              const active = t === currentRuleType;
              const count = t === 'whitelist' ? counts.whitelist : t === 'blockedSubdomains' ? counts.blockedSubdomains : counts.blockedPaths;
              return (
                <button
                  key={t}
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium',
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                  )}
                  onClick={() => { setCurrentRuleType(t); }}
                >
                  <span>{typeLabel(t)}</span>
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs',
                      active ? 'bg-white/20 text-white' : 'bg-white text-slate-700',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <div className="w-full sm:w-72">
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); }}
                placeholder="Buscar…"
              />
            </div>
            <Button onClick={() => { setNewRuleModalOpen(true); }}>Añadir</Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {currentRules.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">{emptyState(currentRuleType, Boolean(search.trim()))}</div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {currentRules.map((r) => (
                <li key={r} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{r}</div>
                  </div>
                  <Button variant="ghost" onClick={() => void deleteRule(r)}>
                    Eliminar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal open={newRuleModalOpen} onClose={() => { setNewRuleModalOpen(false); }} title="Añadir regla">
        <div className="space-y-4">
          <div className="text-sm text-slate-600">{typeLabel(currentRuleType)}</div>
          <Input
            label="Valor"
            value={newRuleValue}
            onChange={(e) => { setNewRuleValue(e.target.value); }}
            placeholder="ej: example.com"
          />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setNewRuleModalOpen(false); }}>
              Cancelar
            </Button>
            <Button onClick={addRule}>Añadir</Button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteModalOpen} onClose={() => { setDeleteModalOpen(false); }} title="Eliminar grupo">
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            Esto eliminará el grupo y todas sus reglas.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setDeleteModalOpen(false); }}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void deleteGroup()}>
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
