import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AuthShell } from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { trpc } from '@/lib/trpc';

interface SetupStatus {
  needsSetup: boolean;
  hasAdmin: boolean;
}

interface SetupResult {
  registrationToken: string;
  success: boolean;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Error inesperado.';
}

export default function SetupView() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 0 &&
      name.trim().length > 0 &&
      password.length >= 8 &&
      passwordsMatch &&
      !isSubmitting
    );
  }, [email, name, password, passwordsMatch, isSubmitting]);

  useEffect(() => {
    let isActive = true;

    async function loadStatus() {
      try {
        setIsChecking(true);
        const data = await trpc.setup.status.query();
        if (!isActive) return;
        setStatus(data as SetupStatus);
      } catch (err) {
        if (!isActive) return;
        setError(getErrorMessage(err));
      } finally {
        if (isActive) setIsChecking(false);
      }
    }

    void loadStatus();

    return () => {
      isActive = false;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSetupResult(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (!passwordsMatch) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await trpc.setup.createFirstAdmin.mutate({
        email: email.trim(),
        name: name.trim(),
        password,
      });

      const result = data as SetupResult;
      setSetupResult(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking) {
    return (
      <AuthShell title="Configuración inicial" subtitle="Verificando estado…">
        <div className="text-sm text-slate-600">Cargando…</div>
      </AuthShell>
    );
  }

  if (status && !status.needsSetup) {
    return (
      <AuthShell title="Configuración inicial" subtitle="El sistema ya está configurado.">
        <Card className="p-4">
          <div className="text-sm text-slate-700">
            Ya existe un administrador. Inicia sesión para continuar.
          </div>
          <div className="mt-4">
            <Button onClick={() => navigate('/login')}>Ir a login</Button>
          </div>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Configuración inicial" subtitle="Crea el primer usuario administrador.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); }}
          required
        />

        <Input
          label="Nombre"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          required
        />

        <Input
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); }}
          required
          hint="Mínimo 8 caracteres."
        />

        <Input
          label="Confirmar contraseña"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); }}
          required
          error={confirmPassword.length > 0 && !passwordsMatch ? 'Las contraseñas no coinciden.' : undefined}
        />

        {setupResult?.registrationToken ? (
          <Card className="p-4">
            <div className="text-sm font-semibold text-slate-900">Registration Token</div>
            <div className="mt-2 font-mono text-xs break-all text-slate-700">{setupResult.registrationToken}</div>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(setupResult.registrationToken)}
              >
                Copiar token
              </Button>
              <Button type="button" onClick={() => navigate('/login')}>
                Ir a login
              </Button>
            </div>
          </Card>
        ) : null}

        {error ? <div className="text-sm text-red-600 font-medium">{error}</div> : null}

        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => navigate('/login')}>
            Volver
          </Button>
          <Button type="submit" className="flex-1" disabled={!canSubmit}>
            {isSubmitting ? 'Creando…' : 'Crear usuario'}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
