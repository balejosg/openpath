import { trpc } from './trpc.js';

const form = document.getElementById('reset-password-form') as HTMLFormElement | null;
const statusEl = document.getElementById('reset-status') as HTMLDivElement | null;
const btn = document.getElementById('reset-btn') as HTMLButtonElement | null;

form?.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
        const email = (document.getElementById('reset-email') as HTMLInputElement).value;
        const token = (document.getElementById('reset-token') as HTMLInputElement).value;
        const password = (document.getElementById('reset-password') as HTMLInputElement).value;
        const passwordConfirm = (document.getElementById('reset-password-confirm') as HTMLInputElement).value;

        if (password !== passwordConfirm) {
            showStatus('Las contraseñas no coinciden.', 'error');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Procesando...';
        }
        statusEl?.classList.add('hidden');

        try {
            await trpc.auth.resetPassword.mutate({
                email,
                token,
                newPassword: password
            });

            showStatus('¡Contraseña actualizada con éxito! Redirigiendo al login...', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
        } catch (err) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Actualizar Contraseña';
            }
            const errorMessage = err instanceof Error ? err.message : 'Token inválido o expirado';
            showStatus('Error: ' + errorMessage, 'error');
        }
    })();
});

function showStatus(message: string, type: 'error' | 'success') {
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.classList.remove('hidden', 'error', 'success');
    statusEl.classList.add(type === 'error' ? 'error-message' : 'success-message');

    // Adding basic styles if classes are missing in style.css
    if (type === 'error') {
        statusEl.style.background = '#fde8e8';
        statusEl.style.color = '#c81e1e';
    } else {
        statusEl.style.background = '#def7ec';
        statusEl.style.color = '#03543f';
    }
}
