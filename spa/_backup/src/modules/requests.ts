import { state } from './state.js';
import { relativeTime, escapeHtml, showToast } from '../utils.js';
import { trpc } from '../trpc.js';
import { auth } from '../auth.js';
import { logger } from '../lib/logger.js';

// Initialize requests section
export async function initRequestsSection(): Promise<void> {
    // Load saved config
    const savedUrl = localStorage.getItem('requests_api_url') ?? '';
    const savedToken = localStorage.getItem('requests_api_token') ?? '';

    const urlInput = document.getElementById('requests-api-url') as HTMLInputElement;
    const tokenInput = document.getElementById('requests-api-token') as HTMLInputElement;

    urlInput.value = savedUrl;
    tokenInput.value = savedToken;

    if (savedUrl && savedToken) {
        // RequestsAPI.init(savedUrl, savedToken); // No longer needed
        await checkRequestsServerStatus();
        await loadPendingRequests();
    }

    // Show requests section
    const section = document.getElementById('requests-section');
    if (section) section.classList.remove('hidden');
}

// Check server status
export async function checkRequestsServerStatus(): Promise<boolean> {
    const statusEl = document.getElementById('requests-server-status');
    if (!statusEl) return false;

    const dotEl = statusEl.querySelector('.status-dot');
    const textEl = statusEl.querySelector('.status-text');

    if (!dotEl || !textEl) return false;

    const url = localStorage.getItem('requests_api_url');
    if (!url) {
        dotEl.className = 'status-dot offline';
        textEl.textContent = 'No configurado';
        return false;
    }

    try {
        await trpc.healthcheck.live.query();
        // If it succeeds, it's online
        dotEl.className = 'status-dot online';
        textEl.textContent = 'Conectado';
        return true;
    } catch {
        dotEl.className = 'status-dot offline';
        textEl.textContent = 'Disconnected';
        return false;
    }
}

// Load pending requests
export async function loadPendingRequests(): Promise<void> {
    const listEl = document.getElementById('requests-list');
    const statEl = document.getElementById('stat-pending-requests');
    if (!listEl || !statEl) return;

    const url = localStorage.getItem('requests_api_url');
    if (!url && !auth.isAuthenticated()) {
        listEl.innerHTML = '<p class="empty-message">Configure the server URL or log in to see requests</p>';
        statEl.textContent = '—';
        return;
    }

    try {
        const requests = await trpc.requests.list.query({ status: 'pending' });

        // Update stat card
        statEl.textContent = requests.length.toString();

        // Highlight if there are pending requests
        const cardEl = document.getElementById('stat-requests-card');
        if (cardEl) {
            if (requests.length > 0) {
                cardEl.classList.add('has-pending');
            } else {
                cardEl.classList.remove('has-pending');
            }
        }

        if (requests.length === 0) {
            listEl.innerHTML = '<p class="empty-message success">No hay solicitudes pendientes</p>';
            return;
        }

        const isTeacher = auth.isTeacher();
        const isAdmin = auth.isAdmin() || state.canEdit;
        const teacherGroups = auth.getTeacherGroups();

        listEl.innerHTML = requests.map(req => {
            const canApprove = isAdmin || (isTeacher && teacherGroups.includes(req.groupId));

            // If teacher, only show groups they are assigned to in the select
            const availableGroupsForSelect = isAdmin
                ? state.allGroups.map(g => g.name)
                : state.allGroups.map(g => g.name).filter(name => teacherGroups.includes(name));

            return `
                <div class="request-item ${!canApprove ? 'read-only' : ''}" data-id="${req.id}">
                    <div class="request-info">
                        <span class="request-domain">${escapeHtml(req.domain)}</span>
                        <span class="request-time">${relativeTime(req.createdAt)}</span>
                        <span class="request-meta">
                            ${escapeHtml(req.requesterEmail || 'Anonymous')} •
                            <span class="request-reason">${escapeHtml(req.reason)}</span>
                        </span>
                        ${req.groupId ? `<span class="request-group-tag">Grupo: ${escapeHtml(req.groupId)}</span>` : ''}
                    </div>
                    <div class="request-actions">
                        ${canApprove ? `
                            <select class="request-group-select">
                                <option value="" disabled selected>Seleccionar grupo...</option>
                                ${availableGroupsForSelect.map(g => `<option value="${g}" ${req.groupId === g ? 'selected' : ''}>${g}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm btn-success request-approve-btn" onclick="window.approveRequest('${req.id}', this)">✓ Aprobar</button>
                            <button class="btn btn-sm btn-danger request-reject-btn" onclick="window.rejectRequest('${req.id}')">✗ Rechazar</button>
                        ` : '<span class="status-badge">Solo lectura</span>'}
                    </div>
                </div>
            `;
        }).join('');

    } catch (err: unknown) {
        logger.error('Error loading requests', { error: err instanceof Error ? err.message : String(err) });
        const message = err instanceof Error ? err.message : String(err);
        listEl.innerHTML = `<p class="error-message">Error cargando solicitudes: ${message}</p>`;
    }
}

// Global actions
declare global {
    interface Window {
        approveRequest: (id: string, btn: HTMLElement) => Promise<void>;
        rejectRequest: (id: string) => Promise<void>;
    }
}

window.approveRequest = async (id: string, btn: HTMLElement) => {
    const item = btn.closest('.request-item');
    if (!item) return;

    const select = item.querySelector('.request-group-select');
    if (!select || !(select instanceof HTMLSelectElement)) return;
    const groupId = select.value;

    if (!groupId) {
        showToast('Selecciona un grupo primero', 'error');
        return;
    }

    try {
        await trpc.requests.approve.mutate({ id, groupId: groupId });
        showToast('Solicitud aprobada');
        item.remove();
        void loadPendingRequests(); // Refresh count
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showToast('Error aprobando: ' + message, 'error');
    }
};

window.rejectRequest = async (id: string) => {
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return; // Cancelled

    try {
        await trpc.requests.reject.mutate({ id, reason: reason || undefined });
        showToast('Solicitud rechazada');
        const itemEl = document.querySelector(`.request-item[data-id="${id}"]`);
        if (itemEl) itemEl.remove();
        void loadPendingRequests(); // Refresh count
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showToast('Error rechazando: ' + message, 'error');
    }
};
