import React, { useState } from 'react';
import { ArrowLeft, Plus, Trash2, ShieldCheck, Globe, Hash, Info, Filter } from 'lucide-react';
import { useGroupRules } from '../hooks/useGroups';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

interface GroupRulesProps {
  groupId: string;
  groupName: string;
  onBack: () => void;
}

const GroupRules: React.FC<GroupRulesProps> = ({ groupId, groupName, onBack }) => {
  const { rules, isLoading, error, createRule, isCreating, deleteRule } = useGroupRules(groupId);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    type: 'whitelist' as 'whitelist' | 'blocked_subdomain' | 'blocked_path',
    value: '',
    comment: '',
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    try {
      await createRule({ ...newRule, groupId });
      setIsAddModalOpen(false);
      setNewRule({ ...newRule, value: '', comment: '' });
    } catch (err: any) {
      setAddError(err.message || 'Error al añadir regla');
    }
  };

  const handleDeleteRule = async (id: string, value: string) => {
    if (window.confirm(`¿Eliminar la regla "${value}"?`)) {
      try {
        await deleteRule(id);
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  const filteredRules = rules.filter(rule => 
    rule.value.toLowerCase().includes(filter.toLowerCase()) || 
    (rule.comment && rule.comment.toLowerCase().includes(filter.toLowerCase()))
  );

  const getBadgeClass = (type: string) => {
    switch (type) {
      case 'whitelist': return 'bg-green-100 text-green-700 border-green-200';
      case 'blocked_subdomain': return 'bg-red-100 text-red-700 border-red-200';
      case 'blocked_path': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'whitelist': return 'Permitido';
      case 'blocked_subdomain': return 'Bloqueado (Sub)';
      case 'blocked_path': return 'Bloqueado (Path)';
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reglas: {groupName}</h2>
          <p className="text-slate-500 text-sm">Gestiona dominios permitidos y bloqueados para este grupo.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50/50">
          <div className="relative w-full md:w-96">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input 
              placeholder="Filtrar reglas..." 
              className="pl-10"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          <Button onClick={() => setIsAddModalOpen(true)} className="w-full md:w-auto">
            <Plus size={18} className="mr-2" /> Añadir Regla
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3">Valor / Dominio</th>
                <th className="px-6 py-3">Comentario</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-5 w-20 bg-slate-100 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-5 w-40 bg-slate-100 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-5 w-32 bg-slate-100 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-5 w-8 bg-slate-100 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    {filter ? 'No se encontraron reglas que coincidan con el filtro.' : 'No hay reglas configuradas para este grupo.'}
                  </td>
                </tr>
              ) : (
                filteredRules.map(rule => (
                  <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${getBadgeClass(rule.type)}`}>
                        {getTypeText(rule.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-700">
                      {rule.value}
                    </td>
                    <td className="px-6 py-4 text-slate-500 italic text-xs">
                      {rule.comment || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteRule(rule.id, rule.value)}
                        className="text-slate-400 hover:text-red-600 transition-colors p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Rule Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Añadir Nueva Regla"
      >
        <form onSubmit={handleAddRule} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Tipo de Regla</label>
            <select 
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all"
              value={newRule.type}
              onChange={e => setNewRule({ ...newRule, type: e.target.value })}
            >
              <option value="whitelist">Permitir Dominio (Whitelist)</option>
              <option value="blocked_subdomain">Bloquear Subdominio</option>
              <option value="blocked_path">Bloquear Ruta (Path)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Valor / Dominio</label>
            <Input 
              placeholder={newRule.type === 'whitelist' ? 'google.com' : 'sub.domain.com'}
              value={newRule.value}
              onChange={e => setNewRule({ ...newRule, value: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Comentario (opcional)</label>
            <Input 
              placeholder="ej: Requerido para Classroom"
              value={newRule.comment}
              onChange={e => setNewRule({ ...newRule, comment: e.target.value })}
            />
          </div>

          {addError && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
              {addError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={isCreating}>
              Guardar Regla
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default GroupRules;
