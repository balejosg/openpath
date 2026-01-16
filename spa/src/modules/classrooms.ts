import { getErrorMessage } from '@openpath/shared';
import { state } from './state.js';
import { auth } from '../auth.js';
import { trpc } from '../trpc.js';
import { showToast, escapeHtml } from '../utils.js';
import { openModal, closeModal } from './ui.js';
import { getElement } from '../lib/dom.js';
import type { Classroom } from '../types/index.js';

let allClassrooms: Classroom[] = [];

interface MachineWithToken {
    id: string;
    hostname: string;
    classroomId: string | null;
    version: string | null;
    lastSeen: string | null;
    hasDownloadToken: boolean;
    downloadTokenLastRotatedAt: string | null;
}

let allMachines: MachineWithToken[] = [];

/**
 * Load classrooms from the API
 */
export async function loadClassrooms(): Promise<void> {
    const section = getElement('classrooms-section');
    const listEl = getElement('classrooms-list');

    // Only show for admins
    if (!auth.isAdmin() && !state.canEdit) {
        section?.classList.add('hidden');
        return;
    }

    section?.classList.remove('hidden');

    try {
        allClassrooms = await trpc.classrooms.list.query();
        renderClassroomsList();
        void loadMachines();
    } catch (error: unknown) {
        if (listEl) {
            const message = getErrorMessage(error);
            listEl.innerHTML = `<p class="empty-message error">Error: ${escapeHtml(message)}</p>`;
        }
    }
}

/**
 * Render the list of classrooms
 */
export function renderClassroomsList(): void {
    const listEl = getElement('classrooms-list');
    if (!listEl) return;

    if (allClassrooms.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <p>No classrooms configured</p>
                <button class="btn btn-primary" onclick="window.openNewClassroomModal()">Create first classroom</button>
            </div>
        `;
        return;
    }

    listEl.innerHTML = allClassrooms.map(c => `
        <div class="classroom-card" data-id="${c.id}">
            <div class="classroom-info">
                <h3>🏫 ${escapeHtml(c.displayName || c.name)}</h3>
                <p>${(c.machines?.length ?? 0).toString()} computers</p>
            </div>
            <div class="classroom-group">
                <label>Active group:</label>
                <select class="active-group-select" onchange="window.changeClassroomGroup('${c.id}', this.value)">
                    <option value="">-- Default: ${escapeHtml(c.defaultGroupId ?? 'none')} --</option>
                    ${state.allGroups.map(g => `
                        <option value="${g.name}" ${c.activeGroupId === g.name ? 'selected' : ''}>${g.name}</option>
                    `).join('')}
                </select>
            </div>
            <div class="classroom-actions">
                <button class="btn btn-ghost btn-icon" onclick="window.deleteClassroom('${c.id}')" title="Delete classroom">🗑️</button>
            </div>
        </div>
    `).join('');
}

/**
 * Change the active group for a classroom
 */
export async function changeClassroomGroup(classroomId: string, groupId: string): Promise<void> {
    try {
        await trpc.classrooms.setActiveGroup.mutate({ id: classroomId, groupId: groupId || null });
        showToast(groupId ? `Active group: ${groupId}` : 'Using default group');
        await loadClassrooms();
    } catch (error: unknown) {
        const message = getErrorMessage(error);
        showToast('Error: ' + message, 'error');
        void loadClassrooms(); // Reload to reset select
    }
}

/**
 * Delete a classroom
 */
export async function deleteClassroom(classroomId: string): Promise<void> {
    if (!confirm('Delete this classroom and unlink all its machines?')) return;
    try {
        await trpc.classrooms.delete.mutate({ id: classroomId });
        showToast('Classroom deleted');
        await loadClassrooms();
    } catch (error: unknown) {
        const message = getErrorMessage(error);
        showToast('Error: ' + message, 'error');
    }
}

/**
 * Initialize classroom management event listeners
 */
export function initClassroomListeners(): void {
    // New Classroom Button
    getElement('new-classroom-btn')?.addEventListener('click', () => {
        openNewClassroomModal();
    });

    // New Classroom Form
    getElement('new-classroom-form')?.addEventListener('submit', (e) => {
        void (async () => {
            e.preventDefault();
            const nameInput = getElement<HTMLInputElement>('new-classroom-name');
            const groupInput = getElement<HTMLSelectElement>('new-classroom-default-group');

            if (!nameInput || !groupInput) return;

            const name = nameInput.value;
            const defaultGroupId = groupInput.value;

            try {
                await trpc.classrooms.create.mutate({
                    name,
                    displayName: name,
                    defaultGroupId: defaultGroupId || undefined
                });
                closeModal('modal-new-classroom');
                getElement<HTMLFormElement>('new-classroom-form')?.reset();
                showToast('Classroom created');
                await loadClassrooms();
            } catch (error: unknown) {
                const message = getErrorMessage(error);
                showToast('Error: ' + message, 'error');
            }
        })();
    });
}


// Export for global window access (and declaration in window.d.ts if needed)
// BUT since we are modules, we should attach them to window in a specific initialization file, OR keep doing it here.
// I'll attach here to maintain compatibility with HTML onClick handlers.

declare global {
    interface Window {
        openNewClassroomModal: () => void;
        changeClassroomGroup: (classroomId: string, groupId: string) => Promise<void>;
        deleteClassroom: (classroomId: string) => Promise<void>;
        rotateMachineToken: (machineId: string) => Promise<void>;
        deleteMachine: (hostname: string) => Promise<void>;
    }
}

function openNewClassroomModal() {
    // Populate groups dropdown
    const select = getElement('new-classroom-default-group');
    if (select) {
        select.innerHTML = '<option value="">-- Select group --</option>' +
            state.allGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    }
    openModal('modal-new-classroom');
}

window.openNewClassroomModal = openNewClassroomModal;
window.changeClassroomGroup = changeClassroomGroup;
window.deleteClassroom = deleteClassroom;
window.rotateMachineToken = rotateMachineToken;
window.deleteMachine = deleteMachineByHostname;

export async function loadMachines(): Promise<void> {
    const section = getElement('machines-section');
    const listEl = getElement('machines-list');

    if (!auth.isAdmin()) {
        section?.classList.add('hidden');
        return;
    }

    section?.classList.remove('hidden');

    try {
        allMachines = await trpc.classrooms.listMachines.query({});
        renderMachinesList();
    } catch (error: unknown) {
        if (listEl) {
            const message = getErrorMessage(error);
            listEl.innerHTML = `<p class="empty-message error">Error: ${escapeHtml(message)}</p>`;
        }
    }
}

function formatDate(isoDate: string | null): string {
    if (!isoDate) return 'Never';
    const date = new Date(isoDate);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMachinesList(): void {
    const listEl = getElement('machines-list');
    if (!listEl) return;

    if (allMachines.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <p>No machines registered</p>
                <p class="text-muted">Machines register automatically during installation</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = `
        <table class="machines-table">
            <thead>
                <tr>
                    <th>Hostname</th>
                    <th>Version</th>
                    <th>Last Seen</th>
                    <th>Token Status</th>
                    <th>Last Rotated</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${allMachines.map(m => `
                    <tr data-id="${m.id}">
                        <td><strong>${escapeHtml(m.hostname)}</strong></td>
                        <td>${escapeHtml(m.version ?? 'unknown')}</td>
                        <td>${formatDate(m.lastSeen)}</td>
                        <td>${m.hasDownloadToken ? '<span class="badge badge-success">✓ Configured</span>' : '<span class="badge badge-warning">⚠ Not set</span>'}</td>
                        <td>${formatDate(m.downloadTokenLastRotatedAt)}</td>
                        <td class="actions-cell">
                            <button class="btn btn-sm btn-primary" onclick="window.rotateMachineToken('${m.id}')" title="Rotate token and get new URL">🔄 Rotate</button>
                            <button class="btn btn-sm btn-ghost" onclick="window.deleteMachine('${escapeHtml(m.hostname)}')" title="Delete machine">🗑️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function rotateMachineToken(machineId: string): Promise<void> {
    try {
        const result = await trpc.classrooms.rotateMachineToken.mutate({ machineId });
        
        showToast('Token rotated successfully');
        
        const urlDisplay = document.createElement('div');
        urlDisplay.className = 'token-url-display';
        urlDisplay.innerHTML = `
            <div class="modal-backdrop" onclick="this.parentElement.remove()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <h3>New Whitelist URL</h3>
                    <p class="text-muted">Copy this URL. It will only be shown once.</p>
                    <input type="text" class="form-control" value="${escapeHtml(result.whitelistUrl)}" readonly onclick="this.select()">
                    <div class="modal-actions">
                        <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${escapeHtml(result.whitelistUrl)}'); this.textContent = 'Copied!';">📋 Copy</button>
                        <button class="btn btn-ghost" onclick="this.closest('.token-url-display').remove()">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(urlDisplay);
        
        await loadMachines();
    } catch (error: unknown) {
        const message = getErrorMessage(error);
        showToast('Error: ' + message, 'error');
    }
}

async function deleteMachineByHostname(hostname: string): Promise<void> {
    if (!confirm(`Delete machine "${hostname}"?`)) return;
    try {
        await trpc.classrooms.deleteMachine.mutate({ hostname });
        showToast('Machine deleted');
        await loadMachines();
    } catch (error: unknown) {
        const message = getErrorMessage(error);
        showToast('Error: ' + message, 'error');
    }
}

export function initMachineListeners(): void {
    getElement('refresh-machines-btn')?.addEventListener('click', () => {
        void loadMachines();
    });
}
