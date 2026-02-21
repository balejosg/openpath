import React, { useMemo, useState } from 'react';
import {
  MoreHorizontal,
  ShieldCheck,
  Folder,
  ArrowRight,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Group } from '../types';
import { trpc } from '../lib/trpc';
import { isAdmin } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { useAllowedGroups } from '../hooks/useAllowedGroups';
import { useMutationFeedback } from '../hooks/useMutationFeedback';

interface GroupsProps {
  onNavigateToRules: (group: { id: string; name: string }) => void;
}

const Groups: React.FC<GroupsProps> = ({ onNavigateToRules }) => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const admin = isAdmin();

  const {
    groups: allowedGroups,
    isLoading,
    error: groupsQueryError,
    refetch: refetchGroups,
  } = useAllowedGroups();

  const groups = useMemo(() => {
    return allowedGroups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.displayName || g.name,
      domainCount: g.whitelistCount + g.blockedSubdomainCount + g.blockedPathCount,
      status: g.enabled ? 'Active' : 'Inactive',
    })) as Group[];
  }, [allowedGroups]);

  const loading = isLoading;
  const error = groupsQueryError ? 'Error al cargar grupos' : null;

  // Toast hook
  const { ToastContainer } = useToast();

  // New group form state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupError, setNewGroupError] = useState('');

  // Config form state
  const [configDescription, setConfigDescription] = useState('');
  const [configStatus, setConfigStatus] = useState<'Active' | 'Inactive'>('Active');

  // Mutation loading states
  const [saving, setSaving] = useState(false);
  const {
    error: configError,
    clearError: clearConfigError,
    captureError: captureConfigError,
  } = useMutationFeedback({
    badRequest: 'Revisa los datos del grupo antes de guardar.',
    conflict:
      'No se pudo guardar porque el grupo fue modificado recientemente. Recarga e intenta de nuevo.',
    fallback: 'No se pudo guardar la configuración del grupo. Intenta nuevamente.',
  });

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      setNewGroupError('El nombre del grupo es obligatorio');
      return;
    }

    try {
      setSaving(true);
      setNewGroupError('');
      await trpc.groups.create.mutate({
        name: newGroupName.trim().toLowerCase().replace(/\s+/g, '-'),
        displayName: newGroupDescription.trim() || newGroupName.trim(),
      });
      await refetchGroups();
      setNewGroupName('');
      setNewGroupDescription('');
      setShowNewModal(false);
    } catch (err) {
      console.error('Failed to create group:', err);
      setNewGroupError('Error al crear grupo. El nombre puede ya existir.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedGroup) return;

    try {
      setSaving(true);
      clearConfigError();
      await trpc.groups.update.mutate({
        id: selectedGroup.id,
        displayName: configDescription,
        enabled: configStatus === 'Active',
      });
      await refetchGroups();
      setShowConfigModal(false);
    } catch (err) {
      console.error('Failed to update group:', err);
      captureConfigError(err);
    } finally {
      setSaving(false);
    }
  };

  const openNewModal = () => {
    setNewGroupName('');
    setNewGroupDescription('');
    setNewGroupError('');
    setShowNewModal(true);
  };

  const openConfigModal = (group: Group) => {
    setSelectedGroup(group);
    setConfigDescription(group.description);
    setConfigStatus(group.status);
    clearConfigError();
    setShowConfigModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {admin ? 'Grupos de Seguridad' : 'Mis Políticas'}
          </h2>
          <p className="text-slate-500 text-sm">Gestiona políticas de acceso y restricciones.</p>
        </div>
        {admin && (
          <button
            onClick={openNewModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            + Nuevo Grupo
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-500">Cargando grupos...</span>
          </div>
        ) : error ? (
          <div className="col-span-full text-center py-12">
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto" />
            <span className="text-red-500 text-sm mt-2 block">{error}</span>
            <button
              onClick={() => void refetchGroups()}
              className="text-blue-600 hover:text-blue-800 text-sm mt-2"
            >
              Reintentar
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500">
            {admin
              ? 'No hay grupos configurados. Crea uno nuevo para empezar.'
              : 'Todavía no tienes políticas asignadas. Pide a un administrador que te asigne una.'}
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              className="bg-white border border-slate-200 rounded-lg p-5 hover:border-blue-300 transition-all group relative shadow-sm hover:shadow-md"
            >
              <div className="absolute top-4 right-4 opacity-100">
                <button className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded">
                  <MoreHorizontal size={18} />
                </button>
              </div>

              <div className="flex items-start gap-4 mb-4">
                <div
                  className={`p-3 rounded-lg ${group.status === 'Active' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}
                >
                  <Folder size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{group.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{group.description}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm py-2 border-t border-slate-100 border-b">
                  <span className="text-slate-500 flex items-center gap-2 text-xs">
                    <ShieldCheck size={14} /> Dominios
                  </span>
                  <span className="font-medium text-slate-900">{group.domainCount}</span>
                </div>

                <div className="flex justify-between items-center pt-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${group.status === 'Active' ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}
                  >
                    {group.status === 'Active' ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    onClick={() => openConfigModal(group)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium transition-opacity"
                  >
                    Configurar <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Nuevo Grupo - OUTSIDE the map loop */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Nuevo Grupo</h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                <input
                  type="text"
                  placeholder="Ej: grupo-primaria"
                  value={newGroupName}
                  onChange={(e) => {
                    setNewGroupName(e.target.value);
                    if (newGroupError) setNewGroupError('');
                  }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${newGroupError ? 'border-red-300' : 'border-slate-300'}`}
                />
                {newGroupError && (
                  <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {newGroupError}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <textarea
                  placeholder="Descripción del grupo..."
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none h-20 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowNewModal(false)}
                  disabled={saving}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleCreateGroup()}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  Crear Grupo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Configurar Grupo - OUTSIDE the map loop */}
      {showConfigModal && selectedGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Configurar: {selectedGroup.name}</h3>
              <button
                onClick={() => {
                  clearConfigError();
                  setShowConfigModal(false);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <textarea
                  value={configDescription}
                  onChange={(e) => setConfigDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none h-20 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfigStatus('Active')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${configStatus === 'Active' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    Activo
                  </button>
                  <button
                    onClick={() => setConfigStatus('Inactive')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${configStatus === 'Inactive' ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    Inactivo
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Dominios Permitidos
                </label>
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 text-sm text-slate-600">
                  {selectedGroup.domainCount} dominios configurados
                  <button
                    onClick={() => {
                      setShowConfigModal(false);
                      onNavigateToRules({ id: selectedGroup.id, name: selectedGroup.name });
                    }}
                    className="ml-2 text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Gestionar
                  </button>
                </div>
              </div>
              {configError && (
                <p className="text-sm text-red-600 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{configError}</span>
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    clearConfigError();
                    setShowConfigModal(false);
                  }}
                  disabled={saving}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleSaveConfig()}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
};

export default Groups;
