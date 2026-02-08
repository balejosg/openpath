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
    helpText:
      'Bloquea URLs específicas dentro de dominios permitidos. ' +
      'Útil para bloquear secciones específicas como juegos o anuncios. ' +
      'Formato: dominio.com/ruta o */ruta (bloquea en todos los sitios). ' +
      'Soporta wildcards: *.example.com/ads/* bloquea rutas /ads/ en subdominios.',
    placeholder: 'Añadir ruta (ej: facebook.com/gaming o */tracking.js)',
    emptyMessage: 'No hay rutas bloqueadas',
    tipText: 'Solo funciona en navegadores (Firefox, Chrome, Edge)',
    allowBulkAdd: true,
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

// Path validation - strict format: domain.com/path or */path
const validatePath = (value: string): { valid: boolean; warning?: string } => {
  // Auto-strip protocol if present
  const cleaned = value.replace(/^https?:\/\//, '').replace(/^\*:\/\//, '');

  // Must contain a /
  if (!cleaned.includes('/')) {
    return { valid: false };
  }

  // Split into domain and path parts
  const slashIndex = cleaned.indexOf('/');
  const domainPart = cleaned.substring(0, slashIndex);
  const pathPart = cleaned.substring(slashIndex);

  // Validate domain part: must be * or valid domain (with optional *. prefix)
  if (domainPart !== '*') {
    const DOMAIN_REGEX =
      /^(?:\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
    if (!DOMAIN_REGEX.test(domainPart)) {
      return { valid: false };
    }
  }

  // Validate path part: at least "/x", no spaces, no double slashes
  if (pathPart.length < 2) {
    return { valid: false };
  }
  if (/\s/.test(pathPart)) {
    return { valid: false };
  }
  if (pathPart.includes('//')) {
    return { valid: false };
  }

  // Warn if domain-agnostic (blocks on ALL sites)
  if (domainPart === '*') {
    return {
      valid: true,
      warning: 'Esta regla bloqueará esta ruta en TODOS los sitios web',
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

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'ml-2 px-1.5 py-0.5 text-xs rounded-full',
                      isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
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
          validatePattern={
            activeTab === 'blocked_subdomain'
              ? validateSubdomain
              : activeTab === 'blocked_path'
                ? validatePath
                : undefined
          }
        />
      </div>
    </Modal>
  );
};

export default DomainManagementModal;
