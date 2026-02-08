import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from './ui/Modal';
import { cn } from '../lib/utils';
import { trpc } from '../lib/trpc';
import { RuleList, RuleType } from './RuleList';

interface Rule {
  id: string;
  groupId: string;
  type: RuleType;
  value: string;
  comment: string | null;
  createdAt: string;
}

interface DomainManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  onDomainsChanged: () => void;
  onToast: (message: string, type: 'success' | 'error', undoAction?: () => void) => void;
}

type TabType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

interface TabConfig {
  id: TabType;
  label: string;
  helpText?: string;
  placeholder: string;
  emptyMessage: string;
  tipText?: string;
  allowBulkAdd: boolean;
}

const TABS: TabConfig[] = [
  {
    id: 'whitelist',
    label: 'Dominios',
    placeholder: 'Añadir dominio (o pega varios)',
    emptyMessage: 'No hay dominios configurados',
    tipText: 'Tip: Pega una lista de dominios separados por líneas, comas o espacios',
    allowBulkAdd: true,
  },
  {
    id: 'blocked_subdomain',
    label: 'Subdominios bloqueados',
    helpText:
      'Los dominios en la lista blanca permiten automáticamente todos sus subdominios. ' +
      'Usa esta sección para bloquear subdominios específicos dentro de dominios permitidos. ' +
      'Ejemplo: Si google.com está permitido, puedes bloquear ads.google.com aquí. ' +
      'Soporta wildcards: *.tracking.example.com bloqueará cualquier subdominio de tracking.example.com',
    placeholder: 'Añadir subdominio (ej: ads.google.com o *.tracking.com)',
    emptyMessage: 'No hay subdominios bloqueados',
    tipText: 'Soporta wildcards: *.subdomain.com',
    allowBulkAdd: true,
  },
  {
    id: 'blocked_path',
    label: 'Rutas bloqueadas',
    placeholder: '',
    emptyMessage: '',
    allowBulkAdd: false,
  },
];

// Subdomain validation - supports wildcards like *.example.com
const validateSubdomain = (value: string): { valid: boolean; warning?: string } => {
  // Pattern: optional *. prefix, then standard domain
  const SUBDOMAIN_REGEX =
    /^(?:\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

  if (!SUBDOMAIN_REGEX.test(value)) {
    return { valid: false };
  }

  // Warn if it looks like a root domain (no subdomain part beyond TLD)
  const cleanValue = value.replace(/^\*\./, '');
  const parts = cleanValue.split('.');
  if (parts.length === 2) {
    return {
      valid: true,
      warning: 'Este parece un dominio raíz. ¿Debería estar en la lista blanca en su lugar?',
    };
  }

  return { valid: true };
};

export const DomainManagementModal: React.FC<DomainManagementModalProps> = ({
  isOpen,
  onClose,
  groupId,
  groupName,
  onDomainsChanged,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('whitelist');
  const [rules, setRules] = useState<Record<TabType, Rule[]>>({
    whitelist: [],
    blocked_subdomain: [],
    blocked_path: [],
  });
  const [loading, setLoading] = useState(true);

  // Fetch all rules when modal opens
  const fetchRules = useCallback(async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      const [whitelist, subdomains, paths] = await Promise.all([
        trpc.groups.listRules.query({ groupId, type: 'whitelist' }),
        trpc.groups.listRules.query({ groupId, type: 'blocked_subdomain' }),
        trpc.groups.listRules.query({ groupId, type: 'blocked_path' }),
      ]);
      setRules({
        whitelist,
        blocked_subdomain: subdomains,
        blocked_path: paths,
      });
    } catch (err) {
      console.error('Failed to fetch rules:', err);
      onToast('Error al cargar reglas', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, onToast]);

  useEffect(() => {
    if (isOpen) {
      void fetchRules();
      setActiveTab('whitelist');
    }
  }, [isOpen, fetchRules]);

  // Handle rules changed - refetch and notify parent
  const handleRulesChanged = async () => {
    await fetchRules();
    onDomainsChanged();
  };

  // Get tab config
  const getTabConfig = (tabId: TabType): TabConfig => {
    return TABS.find((t) => t.id === tabId) ?? TABS[0];
  };

  // Get count badge for tab
  const getTabCount = (tabId: TabType): number => {
    return rules[tabId].length;
  };

  const currentTab = getTabConfig(activeTab);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Gestionar Reglas: ${groupName}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {TABS.map((tab) => {
            const count = getTabCount(tab.id);
            const isActive = activeTab === tab.id;
            const isDisabled = tab.id === 'blocked_path';

            return (
              <button
                key={tab.id}
                onClick={() => !isDisabled && setActiveTab(tab.id)}
                disabled={isDisabled}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : isDisabled
                      ? 'border-transparent text-slate-300 cursor-not-allowed'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'ml-2 px-1.5 py-0.5 text-xs rounded-full',
                      isActive
                        ? 'bg-blue-100 text-blue-600'
                        : isDisabled
                          ? 'bg-slate-100 text-slate-300'
                          : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {count}
                  </span>
                )}
                {isDisabled && <span className="ml-2 text-xs text-slate-300">(Próximamente)</span>}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'blocked_path' ? (
          // Placeholder for path rules
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <span className="text-4xl mb-4">🚧</span>
            <h3 className="text-lg font-medium text-slate-600">Próximamente</h3>
            <p className="text-sm text-center max-w-md mt-2">
              El bloqueo de rutas específicas estará disponible en una próxima versión. Esta función
              solo funcionará en navegadores (Firefox y Chrome).
            </p>
          </div>
        ) : (
          <RuleList
            groupId={groupId}
            ruleType={activeTab}
            rules={rules[activeTab]}
            loading={loading}
            onRulesChanged={handleRulesChanged}
            onToast={onToast}
            placeholder={currentTab.placeholder}
            helpText={currentTab.helpText}
            allowBulkAdd={currentTab.allowBulkAdd}
            emptyMessage={currentTab.emptyMessage}
            tipText={currentTab.tipText}
            validatePattern={activeTab === 'blocked_subdomain' ? validateSubdomain : undefined}
          />
        )}
      </div>
    </Modal>
  );
};

export default DomainManagementModal;
