import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Upload, FileText, AlertCircle, FileUp, Table, Info } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { parseCSV, type CSVParseResult } from '../lib/csv-parser';
import { validateRuleValue } from '../lib/ruleDetection';

type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (values: string[], type: RuleType) => Promise<{ created: number; total: number }>;
  /** Pre-populate the textarea with this text (e.g., from a dropped file) */
  initialText?: string;
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
 * Supports plain text, CSV with headers, and simple CSV formats.
 */
export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  initialText = '',
}) => {
  const [text, setText] = useState(initialText);
  const [ruleType, setRuleType] = useState<RuleType>('whitelist');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  // Sync text when initialText changes (e.g., file dropped on parent)
  useEffect(() => {
    if (initialText) {
      setText(initialText);
    }
  }, [initialText]);

  // Parse text using the CSV parser
  const parseResult: CSVParseResult = useMemo(() => {
    if (!text.trim()) {
      return {
        values: [],
        format: 'plain-text',
        totalRows: 0,
        skippedRows: 0,
        warnings: [],
      };
    }
    return parseCSV(text);
  }, [text]);

  // Validate each parsed value against the selected rule type
  const validationResults = useMemo(() => {
    const valid: string[] = [];
    const invalid: { value: string; error: string }[] = [];

    for (const value of parseResult.values) {
      const result = validateRuleValue(value, ruleType);
      if (result.valid) {
        valid.push(value);
      } else {
        invalid.push({ value, error: result.error ?? 'Formato inválido' });
      }
    }

    return { valid, invalid };
  }, [parseResult.values, ruleType]);

  const valueCount = parseResult.values.length;
  const validCount = validationResults.valid.length;
  const invalidCount = validationResults.invalid.length;

  const handleImport = async () => {
    if (validCount === 0) {
      setError(
        invalidCount > 0
          ? 'Ningún valor tiene formato válido. Corrige los errores antes de importar.'
          : 'Ingresa al menos un dominio'
      );
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const result = await onImport(validationResults.valid, ruleType);

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

  // Read file contents
  const readFileContents = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result;
        if (typeof content === 'string') {
          resolve(content);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }, []);

  // Handle dropped files
  const handleFileDrop = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setError(null);
      const validFiles: File[] = [];

      // Filter for text files
      for (const file of files) {
        if (
          file.type === 'text/plain' ||
          file.name.endsWith('.txt') ||
          file.name.endsWith('.csv') ||
          file.name.endsWith('.list')
        ) {
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) {
        setError('Solo se permiten archivos de texto (.txt, .csv, .list)');
        return;
      }

      try {
        const contents = await Promise.all(validFiles.map(readFileContents));
        const combinedContent = contents.join('\n');

        // Append to existing text or set if empty
        setText((prev) => (prev ? `${prev}\n${combinedContent}` : combinedContent));
      } catch {
        setError('Error al leer los archivos');
      }
    },
    [readFileContents]
  );

  // Drag event handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      dragCounter.current = 0;

      const { files } = e.dataTransfer;
      void handleFileDrop(files);
    },
    [handleFileDrop]
  );

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

        {/* Textarea for domains with drag & drop */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            <FileText size={14} className="inline mr-1" />
            Dominios a importar
          </label>
          <div
            ref={dropZoneRef}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="relative"
            data-testid="drop-zone"
          >
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              placeholder={PLACEHOLDER_TEXT}
              className={cn(
                'w-full h-48 px-3 py-2 text-sm font-mono',
                'border-2 rounded-lg resize-none transition-all',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                isDragOver
                  ? 'border-blue-400 bg-blue-50 border-dashed'
                  : error
                    ? 'border-red-300 bg-red-50'
                    : 'border-slate-300'
              )}
              disabled={isImporting}
            />

            {/* Drag overlay */}
            {isDragOver && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-blue-50/90 rounded-lg border-2 border-dashed border-blue-400 pointer-events-none"
                data-testid="drag-overlay"
              >
                <div className="text-center">
                  <FileUp size={32} className="mx-auto text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-blue-700">Suelta el archivo aquí</p>
                  <p className="text-xs text-blue-500 mt-1">.txt, .csv, .list</p>
                </div>
              </div>
            )}
          </div>

          {/* Count indicator and drag hint */}
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-slate-500">
              {valueCount > 0 ? (
                <span className="flex items-center gap-2">
                  <span className="text-blue-600 font-medium">
                    {validCount} {validCount === 1 ? 'válido' : 'válidos'}
                  </span>
                  {invalidCount > 0 && (
                    <span className="text-red-500 font-medium">
                      {invalidCount} {invalidCount === 1 ? 'inválido' : 'inválidos'}
                    </span>
                  )}
                  <span className="text-slate-400">
                    ({valueCount} {valueCount === 1 ? 'detectado' : 'detectados'})
                  </span>
                </span>
              ) : (
                'Pega o escribe los dominios arriba'
              )}
            </div>
            <div className="text-xs text-slate-400">
              <FileUp size={12} className="inline mr-1" />
              Arrastra archivos .txt o .csv aquí
            </div>
          </div>

          {/* CSV format indicator */}
          {parseResult.format !== 'plain-text' && valueCount > 0 && (
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-xs text-slate-600">
              <Table size={14} className="text-slate-400" />
              <span>
                Formato CSV detectado
                {parseResult.valueColumn && (
                  <span className="text-slate-500">
                    {' '}
                    — columna: <strong>{parseResult.valueColumn}</strong>
                  </span>
                )}
              </span>
            </div>
          )}

          {/* CSV warnings */}
          {parseResult.warnings.length > 0 && (
            <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg text-xs text-amber-700">
              <Info size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                {parseResult.warnings.map((warning, i) => (
                  <div key={i}>{warning}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Validation errors detail */}
        {invalidCount > 0 && (
          <div className="p-3 bg-red-50 rounded-lg text-sm" data-testid="validation-errors">
            <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
              <AlertCircle size={16} />
              {invalidCount}{' '}
              {invalidCount === 1 ? 'valor con formato inválido' : 'valores con formato inválido'}
            </div>
            <ul className="space-y-1 text-xs text-red-600">
              {validationResults.invalid.slice(0, 5).map((item, i) => (
                <li key={i} className="flex gap-2">
                  <code className="font-mono bg-red-100 px-1 rounded truncate max-w-[200px]">
                    {item.value}
                  </code>
                  <span className="text-red-500">{item.error}</span>
                </li>
              ))}
              {invalidCount > 5 && (
                <li className="text-red-400 italic">...y {String(invalidCount - 5)} más</li>
              )}
            </ul>
            {validCount > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                Solo se importarán los {String(validCount)} valores válidos.
              </p>
            )}
          </div>
        )}

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
            onClick={() => void handleImport()}
            disabled={validCount === 0 || isImporting}
            isLoading={isImporting}
          >
            <Upload size={14} className="mr-1" />
            Importar {validCount > 0 && `(${String(validCount)})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default BulkImportModal;
