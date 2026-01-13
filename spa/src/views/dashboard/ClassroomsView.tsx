import { useCallback, useEffect, useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, MonitorPlay, Plus, Trash2 } from 'lucide-react';

import { ScheduleGrid } from '@/components/schedule/ScheduleGrid';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { useAppStore } from '@/stores/appStore';

interface Classroom {
  id: string;
  name: string;
  displayName: string | null;
  defaultGroupId: string | null;
  activeGroupId: string | null;
  machines?: { status?: string; hostname: string; lastSeen?: string | null }[];
}

interface Machine {
  id: string;
  hostname: string;
  classroomId: string | null;
  version: string | null;
  lastSeen: string | null;
  hasDownloadToken: boolean;
  downloadTokenLastRotatedAt: string | null;
}

export default function ClassroomsView() {
  const { isAdmin } = useAuth();
  const allGroups = useAppStore((s) => s.allGroups);

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedClassroom, setExpandedClassroom] = useState<string | null>(null);

  const [newClassroomModalOpen, setNewClassroomModalOpen] = useState(false);
  const [newClassroomName, setNewClassroomName] = useState('');
  const [newClassroomGroup, setNewClassroomGroup] = useState('');

  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenUrl, setTokenUrl] = useState('');

  const loadClassrooms = useCallback(async () => {
    try {
      const data = (await trpc.classrooms.list.query()) as Classroom[];
      setClassrooms(data);
    } catch (err) {
      console.error('Failed to load classrooms:', err);
    }
  }, []);

  const loadMachines = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = (await trpc.classrooms.listMachines.query({})) as Machine[];
      setMachines(data);
    } catch (err) {
      console.error('Failed to load machines:', err);
    }
  }, [isAdmin]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([loadClassrooms(), loadMachines()]);
      setIsLoading(false);
    };
    void load();
  }, [loadClassrooms, loadMachines]);

  const handleCreateClassroom = useCallback(async () => {
    if (!newClassroomName.trim()) return;
    try {
      await trpc.classrooms.create.mutate({
        name: newClassroomName.trim(),
        displayName: newClassroomName.trim(),
        defaultGroupId: newClassroomGroup || undefined,
      });
      setNewClassroomModalOpen(false);
      setNewClassroomName('');
      setNewClassroomGroup('');
      await loadClassrooms();
    } catch (err) {
      console.error('Failed to create classroom:', err);
    }
  }, [loadClassrooms, newClassroomGroup, newClassroomName]);

  const handleDeleteClassroom = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`¿Eliminar aula "${name}" y desvincular todas sus máquinas?`)) return;
      try {
        await trpc.classrooms.delete.mutate({ id });
        await loadClassrooms();
      } catch (err) {
        console.error('Failed to delete classroom:', err);
      }
    },
    [loadClassrooms],
  );

  const handleChangeGroup = useCallback(
    async (classroomId: string, groupId: string) => {
      try {
        await trpc.classrooms.setActiveGroup.mutate({ id: classroomId, groupId: groupId || null });
        await loadClassrooms();
      } catch (err) {
        console.error('Failed to change group:', err);
      }
    },
    [loadClassrooms],
  );

  const handleRotateToken = useCallback(
    async (machineId: string) => {
      try {
        const result = (await trpc.classrooms.rotateMachineToken.mutate({ machineId })) as {
          whitelistUrl: string;
        };
        setTokenUrl(result.whitelistUrl);
        setTokenModalOpen(true);
        await loadMachines();
      } catch (err) {
        console.error('Failed to rotate token:', err);
      }
    },
    [loadMachines],
  );

  const handleDeleteMachine = useCallback(
    async (hostname: string) => {
      if (!confirm(`¿Eliminar máquina "${hostname}"?`)) return;
      try {
        await trpc.classrooms.deleteMachine.mutate({ hostname });
        await loadMachines();
      } catch (err) {
        console.error('Failed to delete machine:', err);
      }
    },
    [loadMachines],
  );

  const formatDate = (isoDate: string | null): string => {
    if (!isoDate) return 'Nunca';
    const date = new Date(isoDate);
    return date.toLocaleDateString('es-ES') + ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-slate-900 font-semibold">Cargando…</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Aulas Seguras</h2>
          <p className="mt-1 text-sm text-slate-600">Administración de aulas y dispositivos</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setNewClassroomModalOpen(true); }}>
            <Plus size={16} className="mr-2" />
            Nueva Aula
          </Button>
        )}
      </div>

      {classrooms.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <MonitorPlay size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600 mb-4">No hay aulas configuradas</p>
            {isAdmin && (
              <Button onClick={() => { setNewClassroomModalOpen(true); }}>Crear primera aula</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {classrooms.map((c) => {
            const isExpanded = expandedClassroom === c.id;

            return (
              <Card key={c.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <MonitorPlay size={20} className="text-slate-600 shrink-0" />
                        <h3 className="text-base font-semibold text-slate-900 truncate">
                          {c.displayName || c.name}
                        </h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {c.machines?.length ?? 0} computadoras
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="min-w-0">
                        <label className="text-xs text-slate-600 block mb-1">Grupo activo:</label>
                        <select
                          value={c.activeGroupId || ''}
                          onChange={(e) => handleChangeGroup(c.id, e.target.value)}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">-- Por defecto: {c.defaultGroupId || 'ninguno'} --</option>
                          {allGroups.map((g) => (
                            <option key={g.name} value={g.name}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setExpandedClassroom(isExpanded ? null : c.id); }}
                      >
                        <Calendar size={16} className="mr-1" />
                        Horarios
                        {isExpanded ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />}
                      </Button>

                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClassroom(c.id, c.displayName || c.name)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-slate-200">
                      <h4 className="text-sm font-semibold text-slate-900 mb-4">
                        Horario Semanal - {c.displayName || c.name}
                      </h4>
                      <ScheduleGrid classroomId={c.id} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isAdmin && machines.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-slate-900">Máquinas Registradas</h3>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                      Hostname
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                      Versión
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                      Última conexión
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                      Token
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                      Última rotación
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {machines.map((m) => (
                    <tr key={m.id}>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{m.hostname}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{m.version || 'unknown'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{formatDate(m.lastSeen)}</td>
                      <td className="px-6 py-4">
                        {m.hasDownloadToken ? (
                          <Badge variant="success">✓ Configurado</Badge>
                        ) : (
                          <Badge variant="warning">⚠ Sin configurar</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatDate(m.downloadTokenLastRotatedAt)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Button variant="primary" size="sm" onClick={() => handleRotateToken(m.id)}>
                            🔄 Rotar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMachine(m.hostname)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal
        open={newClassroomModalOpen}
        onClose={() => { setNewClassroomModalOpen(false); }}
        title="Nueva Aula"
      >
        <div className="space-y-4">
          <Input
            label="Nombre del aula"
            value={newClassroomName}
            onChange={(e) => { setNewClassroomName(e.target.value); }}
            placeholder="ej: Informática 1"
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Grupo por defecto</label>
            <select
              value={newClassroomGroup}
              onChange={(e) => { setNewClassroomGroup(e.target.value); }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Seleccionar grupo --</option>
              {allGroups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setNewClassroomModalOpen(false); }}>
              Cancelar
            </Button>
            <Button onClick={() => void handleCreateClassroom()}>Crear</Button>
          </div>
        </div>
      </Modal>

      <Modal open={tokenModalOpen} onClose={() => { setTokenModalOpen(false); }} title="Nueva URL de Whitelist">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Copia esta URL. Solo se mostrará una vez.
          </p>
          <Input
            value={tokenUrl}
            readOnly
            onClick={(e) => { (e.target as HTMLInputElement).select(); }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="primary"
              onClick={() => {
                void navigator.clipboard.writeText(tokenUrl);
              }}
            >
              📋 Copiar
            </Button>
            <Button variant="secondary" onClick={() => { setTokenModalOpen(false); }}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
