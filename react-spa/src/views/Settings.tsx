import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  Bell,
  Shield,
  Database,
  Key,
  Info,
  X,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { trpc } from '../lib/trpc';

interface SystemInfo {
  version: string;
  database: {
    connected: boolean;
    type: string;
  };
  session: {
    accessTokenExpiry: string;
    accessTokenExpiryHuman: string;
    refreshTokenExpiry: string;
    refreshTokenExpiryHuman: string;
  };
  backup?: {
    lastBackupAt: string | null;
    lastBackupHuman: string | null;
    lastBackupStatus: 'success' | 'failed' | null;
  };
  uptime: number;
}

interface ApiToken {
  id: string;
  name: string;
  maskedToken: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  isExpired: boolean;
}

interface NewTokenResponse {
  id: string;
  name: string;
  token: string;
  expiresAt: string | null;
  createdAt: string;
}

interface NotificationPrefs {
  securityAlerts: boolean;
  domainRequests: boolean;
  weeklyReports: boolean;
}

const NOTIFICATION_PREFS_KEY = 'openpath.notificationPrefs';

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  securityAlerts: true,
  domainRequests: true,
  weeklyReports: false,
};

const getStoredNotificationPrefs = (): NotificationPrefs => {
  if (typeof window === 'undefined') {
    return DEFAULT_NOTIFICATION_PREFS;
  }

  const raw = window.localStorage.getItem(NOTIFICATION_PREFS_KEY);
  if (!raw) {
    return DEFAULT_NOTIFICATION_PREFS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      securityAlerts: parsed.securityAlerts ?? DEFAULT_NOTIFICATION_PREFS.securityAlerts,
      domainRequests: parsed.domainRequests ?? DEFAULT_NOTIFICATION_PREFS.domainRequests,
      weeklyReports: parsed.weeklyReports ?? DEFAULT_NOTIFICATION_PREFS.weeklyReports,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
};

const Settings: React.FC = () => {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // System info from API
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [systemInfoLoading, setSystemInfoLoading] = useState(true);

  // API Tokens state
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [showCreateTokenModal, setShowCreateTokenModal] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenExpiry, setNewTokenExpiry] = useState<number | null>(null);
  const [createdToken, setCreatedToken] = useState<NewTokenResponse | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [tokenActionLoading, setTokenActionLoading] = useState<string | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  const passwordResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPasswordResetTimer = () => {
    if (!passwordResetTimerRef.current) return;
    clearTimeout(passwordResetTimerRef.current);
    passwordResetTimerRef.current = null;
  };

  // Fetch API tokens
  const fetchTokens = useCallback(async () => {
    try {
      setTokensLoading(true);
      const tokens = await trpc.apiTokens.list.query();
      setApiTokens(tokens);
    } catch (err) {
      console.error('Failed to fetch API tokens:', err);
    } finally {
      setTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch system info on mount
    const fetchSystemInfo = async () => {
      try {
        setSystemInfoLoading(true);
        const info = await trpc.healthcheck.systemInfo.query();
        setSystemInfo(info);
      } catch (err) {
        console.error('Failed to fetch system info:', err);
      } finally {
        setSystemInfoLoading(false);
      }
    };
    void fetchSystemInfo();
    void fetchTokens();

    return () => {
      clearPasswordResetTimer();
    };
  }, [fetchTokens]);

  // Notification preferences state
  const [securityAlerts, setSecurityAlerts] = useState(
    () => getStoredNotificationPrefs().securityAlerts
  );
  const [domainRequests, setDomainRequests] = useState(
    () => getStoredNotificationPrefs().domainRequests
  );
  const [weeklyReports, setWeeklyReports] = useState(
    () => getStoredNotificationPrefs().weeklyReports
  );

  useEffect(() => {
    window.localStorage.setItem(
      NOTIFICATION_PREFS_KEY,
      JSON.stringify({ securityAlerts, domainRequests, weeklyReports })
    );
  }, [securityAlerts, domainRequests, weeklyReports]);

  const closePasswordModal = () => {
    clearPasswordResetTimer();
    setShowPasswordModal(false);
  };

  const handleChangePassword = async () => {
    clearPasswordResetTimer();
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

    try {
      setIsChangingPassword(true);
      await (
        trpc as unknown as {
          auth: {
            changePassword: {
              mutate: (input: { currentPassword: string; newPassword: string }) => Promise<unknown>;
            };
          };
        }
      ).auth.changePassword.mutate({
        currentPassword,
        newPassword,
      });

      setPasswordSuccess(true);
      passwordResetTimerRef.current = setTimeout(() => {
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordSuccess(false);
        passwordResetTimerRef.current = null;
      }, 1500);
    } catch (err) {
      console.error('Failed to change password:', err);
      setPasswordError('No se pudo cambiar la contraseña. Verifica tu contraseña actual.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const openPasswordModal = () => {
    clearPasswordResetTimer();
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess(false);
    setShowPasswordModal(true);
  };

  // API Token handlers
  const handleCreateToken = async () => {
    if (!newTokenName.trim()) {
      setTokenError('El nombre es obligatorio');
      return;
    }
    if (newTokenName.length > 100) {
      setTokenError('El nombre es demasiado largo (máx. 100 caracteres)');
      return;
    }

    try {
      setTokenError('');
      setTokenActionLoading('create');
      const result = await trpc.apiTokens.create.mutate({
        name: newTokenName.trim(),
        expiresInDays: newTokenExpiry ?? undefined,
      });
      setCreatedToken(result);
      void fetchTokens();
    } catch (err) {
      console.error('Failed to create token:', err);
      setTokenError('Error al crear el token');
    } finally {
      setTokenActionLoading(null);
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    if (
      !confirm('¿Estás seguro de que deseas revocar este token? Esta acción no se puede deshacer.')
    ) {
      return;
    }

    try {
      setTokenActionLoading(tokenId);
      await trpc.apiTokens.revoke.mutate({ id: tokenId });
      void fetchTokens();
    } catch (err) {
      console.error('Failed to revoke token:', err);
    } finally {
      setTokenActionLoading(null);
    }
  };

  const handleRegenerateToken = async (tokenId: string) => {
    if (
      !confirm(
        '¿Estás seguro de que deseas regenerar este token? El token anterior dejará de funcionar.'
      )
    ) {
      return;
    }

    try {
      setTokenActionLoading(tokenId);
      const result = await trpc.apiTokens.regenerate.mutate({ id: tokenId });
      setCreatedToken(result);
      setShowCreateTokenModal(true);
      void fetchTokens();
    } catch (err) {
      console.error('Failed to regenerate token:', err);
    } finally {
      setTokenActionLoading(null);
    }
  };

  const copyToClipboard = async (text: string, tokenId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTokenId(tokenId);
      setTimeout(() => setCopiedTokenId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const closeTokenModal = useCallback(() => {
    setShowCreateTokenModal(false);
    setNewTokenName('');
    setNewTokenExpiry(null);
    setCreatedToken(null);
    setTokenError('');
  }, []);

  useEffect(() => {
    if (!showCreateTokenModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (tokenActionLoading === 'create') {
        return;
      }

      closeTokenModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCreateTokenModal, tokenActionLoading, closeTokenModal]);

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
              <span className="text-sm text-slate-800 font-medium">
                {systemInfoLoading ? '...' : (systemInfo?.session.accessTokenExpiryHuman ?? 'N/A')}
              </span>
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
              {systemInfoLoading ? (
                <Loader2 size={16} className="animate-spin text-slate-400" />
              ) : systemInfo?.database.connected ? (
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span> Conectada
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-600 font-medium">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span> Desconectada
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tipo</span>
              <span className="text-slate-800">
                {systemInfoLoading ? '...' : (systemInfo?.database.type ?? 'N/A')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Último backup</span>
              {systemInfoLoading ? (
                <Loader2 size={16} className="animate-spin text-slate-400" />
              ) : systemInfo?.backup?.lastBackupHuman ? (
                <span
                  className={`text-sm ${systemInfo.backup.lastBackupStatus === 'failed' ? 'text-red-600' : 'text-slate-800'}`}
                >
                  {systemInfo.backup.lastBackupHuman}
                </span>
              ) : (
                <span className="text-slate-400 text-xs">No disponible</span>
              )}
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 rounded-lg">
                <Key className="text-orange-600" size={20} />
              </div>
              <h2 className="font-semibold text-slate-800">API Keys</h2>
            </div>
            <button
              onClick={() => setShowCreateTokenModal(true)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              <Plus size={16} /> Crear token
            </button>
          </div>
          <div className="space-y-3">
            {tokensLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-slate-400" />
              </div>
            ) : apiTokens.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm">
                No tienes tokens API. Crea uno para acceder a la API.
              </div>
            ) : (
              apiTokens.map((token) => (
                <div key={token.id} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-700">{token.name}</span>
                      {token.isExpired ? (
                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          Expirado
                        </span>
                      ) : (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          Activo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleRegenerateToken(token.id)}
                        disabled={tokenActionLoading === token.id}
                        className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                        title="Regenerar token"
                      >
                        {tokenActionLoading === token.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <RefreshCw size={16} />
                        )}
                      </button>
                      <button
                        onClick={() => void handleRevokeToken(token.id)}
                        disabled={tokenActionLoading === token.id}
                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Revocar token"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <code className="text-xs text-slate-500 mt-1 block font-mono">
                    {token.maskedToken}
                  </code>
                  <div className="flex gap-4 mt-1 text-xs text-slate-400">
                    {token.createdAt && (
                      <span>Creado: {new Date(token.createdAt).toLocaleDateString()}</span>
                    )}
                    {token.expiresAt && (
                      <span>Expira: {new Date(token.expiresAt).toLocaleDateString()}</span>
                    )}
                    {token.lastUsedAt && (
                      <span>Último uso: {new Date(token.lastUsedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center gap-2 text-sm text-slate-400 pt-4">
        <Info size={16} />
        <span>
          OpenPath v{systemInfoLoading ? '...' : (systemInfo?.version ?? '?')} - Los cambios se
          guardan automáticamente
        </span>
      </div>

      {/* Modal: Cambiar Contraseña */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Cambiar Contraseña</h3>
              <button onClick={closePasswordModal} className="text-slate-400 hover:text-slate-600">
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
                    onClick={closePasswordModal}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void handleChangePassword()}
                    disabled={isChangingPassword}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isChangingPassword ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" /> Guardando...
                      </span>
                    ) : (
                      'Cambiar Contraseña'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Crear/Ver Token API */}
      {showCreateTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {createdToken ? 'Token Creado' : 'Crear Token API'}
              </h3>
              <button
                onClick={closeTokenModal}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Cerrar modal de token API"
              >
                <X size={20} />
              </button>
            </div>

            {createdToken ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
                    <p className="text-sm text-amber-800">
                      <strong>¡Importante!</strong> Copia este token ahora. No podrás verlo de
                      nuevo.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                  <p className="text-sm text-slate-800">{createdToken.name}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Token</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-slate-100 rounded text-xs font-mono break-all">
                      {createdToken.token}
                    </code>
                    <button
                      onClick={() => void copyToClipboard(createdToken.token, createdToken.id)}
                      className="p-2 text-slate-500 hover:text-blue-600 transition-colors"
                      title="Copiar token"
                    >
                      {copiedTokenId === createdToken.id ? (
                        <Check size={18} className="text-green-600" />
                      ) : (
                        <Copy size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {createdToken.expiresAt && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Expira</label>
                    <p className="text-sm text-slate-800">
                      {new Date(createdToken.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                )}

                <button
                  onClick={closeTokenModal}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Entendido
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre del token
                  </label>
                  <input
                    type="text"
                    value={newTokenName}
                    onChange={(e) => {
                      setNewTokenName(e.target.value);
                      if (tokenError) {
                        setTokenError('');
                      }
                    }}
                    placeholder="Ej: API de producción"
                    maxLength={100}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Expiración (opcional)
                  </label>
                  <select
                    value={newTokenExpiry ?? ''}
                    onChange={(e) =>
                      setNewTokenExpiry(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Sin expiración</option>
                    <option value="7">7 días</option>
                    <option value="30">30 días</option>
                    <option value="90">90 días</option>
                    <option value="365">1 año</option>
                  </select>
                </div>

                {tokenError && (
                  <p className="text-red-500 text-xs flex items-center gap-1">
                    <AlertCircle size={12} /> {tokenError}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={closeTokenModal}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void handleCreateToken()}
                    disabled={tokenActionLoading === 'create'}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {tokenActionLoading === 'create' && (
                      <Loader2 size={16} className="animate-spin" />
                    )}
                    Crear Token
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
