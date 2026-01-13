import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AuthShell } from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

export default function LoginView() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !isSubmitting;
  }, [email, password, isSubmitting]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title="Iniciar sesión" subtitle="Accede al panel de OpenPath.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); }}
          placeholder="tu@email.com"
          required
          error={error ? ' ' : undefined}
        />

        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); }}
          placeholder="••••••••"
          required
          error={error ? ' ' : undefined}
        />

        {error ? <div className="text-sm text-red-600 font-medium">{error}</div> : null}

        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-slate-600 hover:text-slate-900"
            onClick={() => navigate('/setup')}
          >
            Primera configuración
          </button>

          <a className="text-slate-600 hover:text-slate-900" href="#">
            Olvidé mi contraseña
          </a>
        </div>
      </form>
    </AuthShell>
  );
}
