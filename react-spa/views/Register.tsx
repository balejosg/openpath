import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, Loader2, Shield, AlertCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';

interface RegisterProps {
  onRegister: () => void;
  onNavigateToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onRegister, onNavigateToLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    // Validate password length
    if (formData.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setIsLoading(true);
    try {
      await trpc.auth.register.mutate({
        email: formData.email,
        name: formData.name,
        password: formData.password,
      });
      // Registration successful - show success and redirect to login
      setSuccess(true);
      setTimeout(() => {
        onNavigateToLogin();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Error al crear la cuenta. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Branding Side - Right for Register */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col justify-center px-12 xl:px-24 relative overflow-hidden order-2">
         {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-5" style={{backgroundImage: 'linear-gradient(45deg, #ffffff 10%, transparent 10%)', backgroundSize: '20px 20px'}}></div>

        <div className="relative z-10 text-right">
          <div className="inline-flex w-16 h-16 bg-emerald-600 rounded-2xl items-center justify-center mb-8 shadow-lg shadow-emerald-900/50">
             <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-6 leading-tight">Únete a la red más segura.</h1>
          <div className="space-y-4 flex flex-col items-end">
              <div className="bg-slate-800/50 p-4 rounded-lg border-l-4 border-emerald-500 max-w-sm backdrop-blur-sm">
                  <h3 className="text-emerald-400 font-bold text-sm mb-1">Control Granular</h3>
                  <p className="text-slate-300 text-sm">Define permisos específicos por aula, grupo o usuario individual.</p>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-lg border-l-4 border-blue-500 max-w-sm backdrop-blur-sm">
                  <h3 className="text-blue-400 font-bold text-sm mb-1">Auditoría Completa</h3>
                  <p className="text-slate-300 text-sm">Registro inmutable de todas las acciones administrativas.</p>
              </div>
          </div>
        </div>
      </div>

      {/* Form Side */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50 order-1">
        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-slate-200">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Registro Institucional</h2>
            <p className="text-slate-500 text-sm mt-2">Crea una nueva cuenta de administrador</p>
          </div>

          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={32} className="text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Cuenta creada</h3>
              <p className="text-slate-500 text-sm mt-2">Redirigiendo al inicio de sesión...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg border border-red-200 text-sm">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre Completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-all"
                    placeholder="Ej. María García"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email Corporativo</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-all"
                    placeholder="admin@escuela.edu"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-all"
                      placeholder="Min 8 car."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Confirmar</label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="w-full pl-4 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-xs text-slate-500 leading-normal">
                  Al registrarte, aceptas nuestros <a href="#" className="text-blue-600 font-semibold">Términos de Servicio</a> y confirmas que representas a una institución educativa verificada.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : <>Crear Cuenta <ArrowRight size={18} /></>}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm">
            <span className="text-slate-500">¿Ya tienes cuenta? </span>
            <button onClick={onNavigateToLogin} className="text-blue-600 font-bold hover:underline">
              Iniciar Sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
