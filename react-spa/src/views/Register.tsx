import React, { useState, useMemo } from 'react';
import { Mail, Lock, User, ArrowRight, Loader2, Shield, Briefcase } from 'lucide-react';
import { loginWithGoogle } from '../lib/auth';
import GoogleLoginButton from '../components/GoogleLoginButton';
import { trpc } from '../lib/trpc';

interface RegisterProps {
  onRegister: () => void;
  onNavigateToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onRegister, onNavigateToLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Director de TI');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Validation
  const passwordsMatch = password === confirmPassword;
  const passwordLongEnough = password.length >= 8;
  const isFormValid = useMemo(() => {
    return (
      name.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length >= 8 &&
      confirmPassword.length > 0 &&
      passwordsMatch
    );
  }, [name, email, password, confirmPassword, passwordsMatch]);

  // Show password mismatch error only after user has typed in confirm field
  const showPasswordMismatch = confirmPassword.length > 0 && !passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      if (!passwordsMatch) {
        setError('Las contraseñas no coinciden');
      } else if (!passwordLongEnough) {
        setError('La contraseña debe tener al menos 8 caracteres');
      }
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await trpc.auth.register.mutate({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      setSuccess(true);
      // Navigate to dashboard after short delay
      setTimeout(() => {
        onRegister();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Error al registrar la cuenta');
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (idToken: string) => {
    setIsLoading(true);
    setError('');
    try {
      await loginWithGoogle(idToken);
      onRegister();
    } catch (err: any) {
      setError(err.message || 'Error al registrarse con Google');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Branding Side - Right for Register */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col justify-center px-12 xl:px-24 relative overflow-hidden order-2">
        {/* Subtle pattern */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'linear-gradient(45deg, #ffffff 10%, transparent 10%)',
            backgroundSize: '20px 20px',
          }}
        ></div>

        <div className="relative z-10 text-right">
          <div className="inline-flex w-16 h-16 bg-emerald-600 rounded-2xl items-center justify-center mb-8 shadow-lg shadow-emerald-900/50">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
            Únete a la red más segura.
          </h1>
          <div className="space-y-4 flex flex-col items-end">
            <div className="bg-slate-800/50 p-4 rounded-lg border-l-4 border-emerald-500 max-w-sm backdrop-blur-sm">
              <h3 className="text-emerald-400 font-bold text-sm mb-1">Control Granular</h3>
              <p className="text-slate-300 text-sm">
                Define permisos específicos por aula, grupo o usuario individual.
              </p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg border-l-4 border-blue-500 max-w-sm backdrop-blur-sm">
              <h3 className="text-blue-400 font-bold text-sm mb-1">Auditoría Completa</h3>
              <p className="text-slate-300 text-sm">
                Registro inmutable de todas las acciones administrativas.
              </p>
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

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center gap-2">
              <span className="font-semibold">Error:</span> {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 text-green-600 text-sm rounded-lg border border-green-100 flex items-center gap-2">
              <span className="font-semibold">¡Bienvenido!</span> Cuenta creada exitosamente.
              Redirigiendo al Panel...
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Nombre Completo
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-all"
                  placeholder="Tu nombre completo"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Email Corporativo
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-all"
                  placeholder="admin@escuela.edu"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Cargo</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 bg-white transition-all appearance-none"
                >
                  <option>Director de TI</option>
                  <option>Administrador de Sistemas</option>
                  <option>Coordinador Académico</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-all ${
                      password.length > 0 && !passwordLongEnough
                        ? 'border-red-300'
                        : 'border-slate-300'
                    }`}
                    placeholder="Min 8 car."
                  />
                </div>
                {password.length > 0 && !passwordLongEnough && (
                  <p className="text-red-500 text-xs mt-1">Mínimo 8 caracteres</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Confirmar</label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full pl-4 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-all ${
                      showPasswordMismatch ? 'border-red-300' : 'border-slate-300'
                    }`}
                    placeholder="••••••••"
                  />
                </div>
                {showPasswordMismatch && (
                  <p className="text-red-500 text-xs mt-1">Las contraseñas no coinciden</p>
                )}
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs text-slate-500 leading-normal">
                Al registrarte, aceptas nuestros{' '}
                <a href="#" className="text-blue-600 font-semibold">
                  Términos de Servicio
                </a>{' '}
                y confirmas que representas a una institución educativa verificada.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  Crear Cuenta <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400">O también</span>
              </div>
            </div>

            <GoogleLoginButton onSuccess={handleGoogleSuccess} disabled={isLoading} />
          </form>

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
