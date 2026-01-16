import { state } from './state.js';
import { auth } from '../auth.js';
import { trpc } from '../trpc.js';
import { showToast, escapeHtml } from '../utils.js';
import { openModal, closeModal } from './ui.js';
import { UserRole } from '@openpath/shared';
import { logger } from '../lib/logger.js';
import { z } from 'zod';

type UserRoleType = z.infer<typeof UserRole>;

export async function loadUsers(): Promise<void> {
    if (!auth.isAdmin()) return;

    const listEl = document.getElementById('users-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="loading">Loading users...</div>';

    try {
        const users = await trpc.users.list.query();

        listEl.innerHTML = `
            <table class="users-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Roles</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td>
                                <div class="user-name">${escapeHtml(u.name)}</div>
                                <div class="user-id">ID: ${u.id.substring(0, 8)}...</div>
                            </td>
                            <td>${escapeHtml(u.email)}</td>
                            <td>
                                <div class="roles-list">
                                    ${u.roles.length > 0
                ? u.roles.map(r => `
                                            <span class="role-badge role-${r.role}">
                                                ${r.role}
                                                <button onclick="window.revokeRole('${u.id}', '${r.id}')" title="Revoke role">×</button>
                                            </span>
                                        `).join('')
                : '<span class="no-roles">No roles</span>'
            }
                                    <button class="btn-icon-small" onclick="window.openAssignRoleModal('${u.id}', '${escapeHtml(u.name)}')" title="Assign role">+</button>
                                </div>
                            </td>
                            <td>
                                <span class="status-active">Active</span>
                            </td>
                            <td>
                                <button class="btn btn-ghost btn-sm" onclick="window.generateResetToken('${u.email}')" title="Generar token de recuperación">🔑</button>
                                <button class="btn btn-ghost btn-sm" onclick="window.editUser('${u.id}')">✏️</button>
                                <button class="btn btn-ghost btn-sm text-danger" onclick="window.deleteUser('${u.id}')">🗑️</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // Update stats
        const countEl = document.getElementById('stat-users-count');
        if (countEl) countEl.textContent = users.length.toString();

    } catch (err: unknown) {
        logger.error('Error loading users', { error: err instanceof Error ? err.message : String(err) });
        const message = err instanceof Error ? err.message : String(err);
        listEl.innerHTML = `<p class="error-message">Error loading users: ${message}</p>`;
    }
}

// Global actions
declare global {
    interface Window {
        revokeRole: (userId: string, roleArg: string) => Promise<void>;
        deleteUser: (userId: string) => Promise<void>;
        openAssignRoleModal: (userId: string, userName: string) => void;
        editUser: (userId: string) => Promise<void>;
        openNewUserModal: () => void;
        generateResetToken: (email: string) => Promise<void>;
    }
}


window.revokeRole = async (userId: string, roleArg: string) => {
    // roleArg is roleId here
    if (!confirm('Revoke this role?')) return;
    try {
        await trpc.users.revokeRole.mutate({ userId, roleId: roleArg });
        showToast('Role revoked');
        void loadUsers();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showToast('Error revoking role: ' + message, 'error');
    }
};

window.deleteUser = async (userId: string) => {
    if (!confirm('Delete user? This action cannot be undone.')) return;
    try {
        await trpc.users.delete.mutate({ id: userId });
        showToast('User deleted');
        void loadUsers();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showToast('Error deleting user: ' + message, 'error');
    }
};

window.generateResetToken = async (email: string) => {
    if (!confirm(`¿Generar un token de recuperación para ${email}? Los tokens anteriores para este usuario dejarán de funcionar.`)) return;
    try {
        const result = await trpc.auth.generateResetToken.mutate({ email });
        // Use a prompt or a custom modal to show the token so the admin can copy it
        window.prompt('Token generado con éxito. Copia este token y envíaselo al usuario:', result.token);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showToast('Error generando token: ' + message, 'error');
    }
};


window.openAssignRoleModal = (userId: string, userName: string) => {
    const idInput = document.getElementById('assign-role-user-id') as HTMLInputElement;
    const nameDisplay = document.getElementById('assign-role-user-name');
    idInput.value = userId;
    if (nameDisplay) nameDisplay.textContent = userName;

    // Populate groups select
    const select = document.getElementById('assign-role-groups');
    if (select) {
        select.innerHTML = state.allGroups.map(g =>
            `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name)}</option>`
        ).join('');
    }

    // Toggle groups select based on role
    const roleSelect = document.getElementById('assign-role-select') as HTMLSelectElement;
    const groupsDiv = document.getElementById('assign-role-groups-div');

    roleSelect.onchange = () => {
        if (roleSelect.value === 'teacher') {
            groupsDiv?.classList.remove('hidden');
        } else {
            groupsDiv?.classList.add('hidden');
        }
    };
    roleSelect.value = 'teacher'; // default
    roleSelect.onchange(new Event('change')); // trigger

    openModal('modal-assign-role');
};

window.editUser = async (userId: string) => {
    try {
        const user = await trpc.users.get.query({ id: userId });

        const idInput = document.getElementById('edit-user-id') as HTMLInputElement;
        const nameInput = document.getElementById('edit-user-name') as HTMLInputElement;
        const emailInput = document.getElementById('edit-user-email') as HTMLInputElement;
        // const activeInput = document.getElementById('edit-user-active') as HTMLInputElement;

        idInput.value = user.id;
        nameInput.value = user.name;
        emailInput.value = user.email;
        // user.isActive check? interface User doesn't have isActive.

        openModal('modal-edit-user');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showToast('Error loading user: ' + message, 'error');
    }
};

window.openNewUserModal = () => {
    (document.getElementById('new-user-form') as HTMLFormElement).reset();
    openModal('modal-new-user');
};

// Init Listeners
export function initUsersListeners(): void {
    // New User Form
    document.getElementById('new-user-form')?.addEventListener('submit', (e) => {
        void (async () => {
            e.preventDefault();
            const data = {
                name: (document.getElementById('new-user-name') as HTMLInputElement).value,
                email: (document.getElementById('new-user-email') as HTMLInputElement).value,
                password: (document.getElementById('new-user-password') as HTMLInputElement).value
                // role handled by separate call or API?
                // Original JS had role in form.
            };

            try {
                await trpc.users.create.mutate(data);
                closeModal('modal-new-user');
                showToast('User created');
                await loadUsers();
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                showToast('Error creating user: ' + message, 'error');
            }
        })();
    });

    // Assign Role Form
    document.getElementById('assign-role-form')?.addEventListener('submit', (e) => {
        void (async () => {
            e.preventDefault();
            const userId = (document.getElementById('assign-role-user-id') as HTMLInputElement).value;
            const role = (document.getElementById('assign-role-select') as HTMLSelectElement).value as UserRoleType;

            // Get selected groups
            const select = document.getElementById('assign-role-groups') as HTMLSelectElement;
            const groupIds = Array.from(select.selectedOptions).map(opt => opt.value);

            try {
                await trpc.users.assignRole.mutate({ userId, role, groupIds });
                closeModal('modal-assign-role');
                showToast('Role assigned');
                await loadUsers();
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                showToast('Error assigning role: ' + message, 'error');
            }
        })();
    });

    // Edit User Form
    document.getElementById('edit-user-form')?.addEventListener('submit', (e) => {
        void (async () => {
            e.preventDefault();
            const userId = (document.getElementById('edit-user-id') as HTMLInputElement).value;
            const updates: { name: string; email: string; password?: string } = {
                name: (document.getElementById('edit-user-name') as HTMLInputElement).value,
                email: (document.getElementById('edit-user-email') as HTMLInputElement).value,
                // isActive...
            };

            const password = (document.getElementById('edit-user-password') as HTMLInputElement).value;
            if (password) updates.password = password;

            try {
                await trpc.users.update.mutate({ id: userId, ...updates });
                closeModal('modal-edit-user');
                showToast('User updated');
                await loadUsers();
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                showToast('Error updating user: ' + message, 'error');
            }
        })();
    });
}
