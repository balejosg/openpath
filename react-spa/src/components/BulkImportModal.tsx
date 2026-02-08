import React, { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (values: string[], type: RuleType) => Promise<{ created: number; total: number }>;
}

const RULE_TYPE_OPTIONS: { value: RuleType; label: string; description: string }[] = [
  {
    value: 'whitelist',
    label: 'Dominios permitidos',
    description: 'Dominios que serán accesibles',
  },
  {
    value: 'blocked_subdomain',
    label: 'Subdominios bloqueados',
    description: 'Subdominios específicos a bloquear',
  },
  {
    value: 'blocked_path',
    label: 'Rutas bloqueadas',
    description: 'Rutas específicas a bloquear',
  },
];

const PLACEHOLDER_TEXT = `Pega los dominios aquí, uno por línea:

google.com
youtube.com
example.org

También puedes pegar listas separadas por comas o espacios.`;

/**
 * BulkImportModal - Modal for importing multiple rules at once.
 */
export const BulkImportModal: React.FC<BulkImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [text, setText] = useState('');
  const [ruleType, setRuleType] = useState<RuleType>('whitelist');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse text into array of values
  const parseValues = useCallback((input: string): string[] => {
    // Split by newlines, commas, or multiple spaces
    const values = input
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && !v.startsWith('#')); // Filter empty and comments

    // Remove duplicates
    return [...new Set(values)];
  }, []);

  const parsedValues = parseValues(text);
  const valueCount = parsedValues.length;

  const handleImport = async () => {
    if (valueCount === 0) {
      setError('Ingresa al menos un dominio');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const result = await onImport(parsedValues, ruleType);

      if (result.created > 0) {
        // Success - close modal
        setText('');
        setRuleType('whitelist');
        onClose();
      } else {
        setError('Todas las reglas ya existen');
      }
    } catch (err) {
      console.error('Import failed:', err);
      setError('Error al importar reglas');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    if (!isImporting) {
      setText('');
      setRuleType('whitelist');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar reglas" className="max-w-2xl">
      <div className="space-y-4">
        {/* Rule type selector */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de regla</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {RULE_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRuleType(option.value)}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all',
                  ruleType === option.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                )}
              >
                <div
                  className={cn(
                    'text-sm font-medium',
                    ruleType === option.value ? 'text-blue-700' : 'text-slate-700'
                  )}
                >
                  {option.label}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Textarea for domains */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            <FileText size={14} className="inline mr-1" />
            Dominios a importar
          </label>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder={PLACEHOLDER_TEXT}
            className={cn(
              'w-full h-48 px-3 py-2 text-sm font-mono',
              'border rounded-lg resize-none',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              error ? 'border-red-300 bg-red-50' : 'border-slate-300'
            )}
            disabled={isImporting}
          />

          {/* Count indicator */}
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-slate-500">
              {valueCount > 0 ? (
                <span className="text-blue-600 font-medium">
                  {valueCount} {valueCount === 1 ? 'dominio detectado' : 'dominios detectados'}
                </span>
              ) : (
                'Pega o escribe los dominios arriba'
              )}
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={valueCount === 0 || isImporting}
            isLoading={isImporting}
          >
            <Upload size={14} className="mr-1" />
            Importar {valueCount > 0 && `(${valueCount})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default BulkImportModal;
