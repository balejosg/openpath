import React from 'react';
import { AlertCircle, Copy, Check } from 'lucide-react';

import type { Classroom } from '../../types';
import { Modal } from '../ui/Modal';

interface EnrollClassroomModalProps {
  isOpen: boolean;
  enrollToken: string | null;
  selectedClassroom: Classroom | null;
  enrollPlatform: 'linux' | 'windows';
  enrollCommand: string;
  onClose: () => void;
  onSelectPlatform: (platform: 'linux' | 'windows') => void;
  onCopy: () => void;
  isCopied: boolean;
}

const EnrollClassroomModal: React.FC<EnrollClassroomModalProps> = ({
  isOpen,
  enrollToken,
  selectedClassroom,
  enrollPlatform,
  enrollCommand,
  onClose,
  onSelectPlatform,
  onCopy,
  isCopied,
}) => {
  if (!isOpen || !enrollToken || !selectedClassroom) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Instalar Equipos">
      <p className="text-sm text-slate-600 mb-3">
        Selecciona plataforma y ejecuta el comando en cada equipo del aula{' '}
        <strong>{selectedClassroom.displayName}</strong> para instalar y registrar el agente:
      </p>
      {selectedClassroom.currentGroupId === null ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>El equipo se registrará con navegación sin bloqueos hasta asignar un grupo al aula.</p>
        </div>
      ) : null}
      <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        <button
          onClick={() => onSelectPlatform('linux')}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
            enrollPlatform === 'linux'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Linux (Debian/Ubuntu)
        </button>
        <button
          onClick={() => onSelectPlatform('windows')}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
            enrollPlatform === 'windows'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Windows
        </button>
      </div>
      <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-xs overflow-x-auto relative">
        <button
          onClick={onCopy}
          className="absolute top-2 right-2 inline-flex items-center gap-1 text-slate-400 hover:text-white"
          title={isCopied ? 'Copiado' : 'Copiar al portapapeles'}
          aria-label={isCopied ? 'Copiado' : 'Copiar al portapapeles'}
        >
          {isCopied ? (
            <>
              <Check size={16} className="text-green-400" />
              <span className="text-[10px] font-semibold text-green-400">Copiado</span>
            </>
          ) : (
            <Copy size={16} />
          )}
        </button>
        <pre className="whitespace-pre-wrap pr-8">{enrollCommand}</pre>
      </div>
      {enrollPlatform === 'linux' ? (
        <p className="text-xs text-slate-500 mt-3">
          El agente se auto-actualizará automáticamente vía APT. Asegúrate de tener conexión a
          internet en el equipo durante la instalación.
        </p>
      ) : (
        <p className="text-xs text-slate-500 mt-3">
          Ejecuta PowerShell como Administrador. El instalador registra el equipo con token de aula
          y configura actualizaciones silenciosas diarias del agente.
        </p>
      )}
      <div className="mt-6 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  );
};

export default EnrollClassroomModal;
