import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Bell,
  Shield,
  Database,
  Key,
  Info,
  X,
  AlertCircle,
} from 'lucide-react';

const Settings: React.FC = () => {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Notification preferences state
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [domainRequests, setDomainRequests] = useState(true);
  const [weeklyReports, setWeeklyReports] = useState(false);

  const handleChangePassword = () => {
    setPasswordError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Todos los campos son obligatorios');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }

    // Simulate success
    setPasswordSuccess(true);
    setTimeout(() => {
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(false);
    }, 1500);
  };

  const openPasswordModal = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess(false);
    setShowPasswordModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-100 rounded-lg">
          <SettingsIcon className="text-slate-600" size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Configuración</h1>
          <p className="text-sm text-slate-500">Administra las preferencias del sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Notificaciones */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Bell className="text-blue-600" size={20} />
            </div>
            <h2 className="font-semibold text-slate-800">Notificaciones</h2>
          </div>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-slate-600">Alertas de seguridad</span>
              <input
                type="checkbox"
                checked={securityAlerts}
                onChange={(e) => setSecurityAlerts(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-slate-600">Nuevas solicitudes de dominio</span>
              <input
                type="checkbox"
                checked={domainRequests}
                onChange={(e) => setDomainRequests(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-slate-600">Reportes semanales</span>
              <input
                type="checkbox"
                checked={weeklyReports}
                onChange={(e) => setWeeklyReports(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>
          </div>
        </div>

        {/* Seguridad */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-50 rounded-lg">
              <Shield className="text-green-600" size={20} />
            </div>
            <h2 className="font-semibold text-slate-800">Seguridad</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Autenticación de dos factores</span>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">
                Próximamente
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Tiempo de sesión</span>
              <span className="text-sm text-slate-800 font-medium">8 horas</span>
            </div>
            <button
              onClick={openPasswordModal}
              className="w-full mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium py-2 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Cambiar contraseña
            </button>
          </div>
        </div>

        {/* Base de Datos */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Database className="text-purple-600" size={20} />
            </div>
            <h2 className="font-semibold text-slate-800">Base de Datos</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Estado</span>
              <span className="flex items-center gap-1 text-green-600 font-medium">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span> Conectada
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tipo</span>
              <span className="text-slate-800">PostgreSQL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Último backup</span>
              <span className="text-slate-800">Hace 2 horas</span>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Key className="text-orange-600" size={20} />
            </div>
            <h2 className="font-semibold text-slate-800">API Keys</h2>
          </div>
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Token principal</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  Activo
                </span>
              </div>
              <code className="text-xs text-slate-500 mt-1 block">••••••••••••••••</code>
            </div>
            <button className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium py-2 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
              Regenerar token
            </button>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center gap-2 text-sm text-slate-400 pt-4">
        <Info size={16} />
        <span>OpenPath v4.1.0 - Los cambios se guardan automáticamente</span>
      </div>

      {/* Modal: Cambiar Contraseña */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Cambiar Contraseña</h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {passwordSuccess ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="text-green-600" size={32} />
                </div>
                <p className="text-green-700 font-medium">¡Contraseña actualizada correctamente!</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Contraseña actual
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Ingresa tu contraseña actual"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Confirmar nueva contraseña
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la nueva contraseña"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${passwordError ? 'border-red-300' : 'border-slate-300'}`}
                  />
                </div>

                {passwordError && (
                  <p className="text-red-500 text-xs flex items-center gap-1">
                    <AlertCircle size={12} /> {passwordError}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowPasswordModal(false)}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleChangePassword}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Cambiar Contraseña
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
