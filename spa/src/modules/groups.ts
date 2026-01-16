import { state } from './state.js';
import { showScreen } from './ui.js';
import { showToast, escapeHtml } from '../utils.js';
import { auth } from '../auth.js';
import { initRequestsSection } from './requests.js';
import { loadClassrooms } from './classrooms.js';
import { logger } from '../lib/logger.js';
import { trpc } from '../trpc.js';

type RuleType = 'whitelist' | 'blocked_subdomain' | 'blocked_path';

interface APIGroup {
    id: string;
    name: string;
    displayName: string;
    enabled: boolean;
    whitelistCount: number;
    blockedSubdomainCount: number;
    blockedPathCount: number;
}

interface APIRule {
    id: string;
    groupId: string;
    type: RuleType;
    value: string;
    comment: string | null;
}

export async function loadDashboard(): Promise<void> {
    try {
        const groups = await trpc.groups.list.query() as APIGroup[];

        state.allGroups = groups.map(g => ({
            id: g.id,
            name: g.name,
            path: g.name,
            sha: g.id,
            stats: {
                whitelist: g.whitelistCount,
                blockedSubdomains: g.blockedSubdomainCount,
                blockedPaths: g.blockedPathCount
            },
            enabled: g.enabled
        }));

        const isTeacher = auth.isTeacher();
        const isAdmin = auth.isAdmin() || state.canEdit;
        const assignedGroups = isTeacher && !isAdmin ? auth.getAssignedGroups() : null;

        const visibleGroups = assignedGroups
            ? state.allGroups.filter(g => assignedGroups.includes(g.name))
            : state.allGroups;

        let totalWhitelist = 0;
        let totalBlocked = 0;
        for (const g of visibleGroups) {
            totalWhitelist += g.stats?.whitelist ?? 0;
            totalBlocked += (g.stats?.blockedSubdomains ?? 0) + (g.stats?.blockedPaths ?? 0);
        }

        const statGroups = document.getElementById('stat-groups');
        const statWhitelist = document.getElementById('stat-whitelist');
        const statBlocked = document.getElementById('stat-blocked');

        if (statGroups) statGroups.textContent = visibleGroups.length.toString();
        if (statWhitelist) statWhitelist.textContent = totalWhitelist.toString();
        if (statBlocked) statBlocked.textContent = totalBlocked.toString();

        renderGroupsList();

        await initRequestsSection();
        
        if (auth.isAdmin() || state.canEdit) {
            await loadClassrooms();
        }
    } catch (err) {
        logger.error('Dashboard error', { error: err instanceof Error ? err.message : String(err) });
        if (err instanceof Error) {
            showToast('Error cargando datos: ' + err.message, 'error');
        }
    }
}

export function renderGroupsList(): void {
    const list = document.getElementById('groups-list');
    if (!list) return;

    const isTeacher = auth.isTeacher();
    const isAdmin = auth.isAdmin() || state.canEdit;

    let visibleGroups = state.allGroups;
    if (isTeacher && !isAdmin) {
        const assignedGroups = auth.getAssignedGroups();
        visibleGroups = state.allGroups.filter(g => assignedGroups.includes(g.name));
    }

    if (visibleGroups.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>${isTeacher ? 'No tienes grupos asignados' : 'No hay grupos configurados'}</p>
                ${state.canEdit ? '<button class="btn btn-primary" onclick="window.openNewGroupModal()">Crear primer grupo</button>' : ''}
            </div>
        `;
        return;
    }

    list.innerHTML = visibleGroups.map(g => `
        <div class="group-card" onclick="window.openGroup('${escapeHtml(g.name)}')">
            <div class="group-info">
                <h3>${escapeHtml(g.name)}</h3>
                <p>${g.path}</p>
            </div>
            <div class="group-stats">${(g.stats?.whitelist ?? 0).toString()} dominios</div>
            <span class="group-status ${g.enabled ? 'active' : 'paused'}">
                ${g.enabled ? 'Activo' : 'Pausado'}
            </span>
            <span class="btn btn-ghost">-></span>
        </div>
    `).join('');
}

export async function openGroup(name: string): Promise<void> {
    try {
        const group = await trpc.groups.getByName.query({ name }) as APIGroup;
        const rules = await trpc.groups.listRules.query({ groupId: group.id }) as APIRule[];

        const whitelistRules = rules.filter(r => r.type === 'whitelist').map(r => r.value);
        const blockedSubRules = rules.filter(r => r.type === 'blocked_subdomain').map(r => r.value);
        const blockedPathRules = rules.filter(r => r.type === 'blocked_path').map(r => r.value);

        state.currentGroup = name;
        state.currentGroupData = {
            enabled: group.enabled,
            whitelist: whitelistRules,
            blockedSubdomains: blockedSubRules,
            blockedPaths: blockedPathRules
        };
        state.currentGroupSha = group.id;
        state.currentRuleType = 'whitelist';

        const titleEl = document.getElementById('editor-title');
        if (titleEl) titleEl.textContent = `Editando: ${name}`;

        const nameDisplayEl = document.getElementById('group-name-display');
        if (nameDisplayEl) nameDisplayEl.textContent = name;

        const enabledSelect = document.getElementById('group-enabled') as HTMLSelectElement;
        enabledSelect.value = group.enabled ? '1' : '0';

        const exportUrlEl = document.getElementById('export-url');
        if (exportUrlEl) exportUrlEl.textContent = '';

        showScreen('editor-screen');
        updateRuleCounts();
        renderRules();

        enabledSelect.disabled = !state.canEdit;

        document.querySelectorAll('.tab').forEach((t) => {
            const el = t as HTMLElement;
            el.classList.toggle('active', el.dataset.type === 'whitelist');
        });
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error abriendo grupo: ' + err.message, 'error');
        }
    }
}

export function renderRules(): void {
    if (!state.currentGroupData) return;

    const typeKey = state.currentRuleType;
    const searchInput = document.getElementById('search-rules') as HTMLInputElement;
    const search = searchInput.value.toLowerCase();

    const rulesList = state.currentGroupData[typeKey];
    const displayed = search
        ? rulesList.filter((r: string) => r.toLowerCase().includes(search))
        : rulesList;

    const list = document.getElementById('rules-list');
    if (!list) return;

    if (displayed.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <p>${search ? 'No results' : 'No rules in this section'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = displayed.map((r: string) => `
        <div class="rule-item">
            <span class="rule-value">${escapeHtml(r)}</span>
            ${state.canEdit ? `<button class="btn btn-ghost btn-icon rule-delete" onclick="window.deleteRule('${escapeHtml(r)}', event)">X</button>` : ''}
        </div>
    `).join('');
}

export function updateRuleCounts(): void {
    if (!state.currentGroupData) return;

    const wEl = document.getElementById('count-whitelist');
    const bSubEl = document.getElementById('count-blockedSubdomains');
    const bPathEl = document.getElementById('count-blockedPaths');

    if (wEl) wEl.textContent = state.currentGroupData.whitelist.length.toString();
    if (bSubEl) bSubEl.textContent = state.currentGroupData.blockedSubdomains.length.toString();
    if (bPathEl) bPathEl.textContent = state.currentGroupData.blockedPaths.length.toString();
}

function mapRuleType(type: 'whitelist' | 'blockedSubdomains' | 'blockedPaths'): RuleType {
    if (type === 'blockedSubdomains') return 'blocked_subdomain';
    if (type === 'blockedPaths') return 'blocked_path';
    return 'whitelist';
}

export async function deleteRule(value: string, event: Event): Promise<void> {
    if (!state.canEdit) return;
    event.stopPropagation();
    if (!state.currentGroupData || !state.currentGroupSha) return;

    const groupId = state.currentGroupSha;
    const apiType = mapRuleType(state.currentRuleType);

    try {
        const rules = await trpc.groups.listRules.query({ groupId, type: apiType }) as APIRule[];
        const ruleToDelete = rules.find(r => r.value === value);
        
        if (ruleToDelete) {
            await trpc.groups.deleteRule.mutate({ id: ruleToDelete.id });
            
            const typeKey = state.currentRuleType;
            state.currentGroupData[typeKey] = state.currentGroupData[typeKey].filter(r => r !== value);
            
            showToast('Regla eliminada');
            renderRules();
            updateRuleCounts();
        }
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error eliminando regla: ' + err.message, 'error');
        }
    }
}

export async function saveCurrentGroup(_message: string): Promise<void> {
    if (!state.currentGroupData || !state.currentGroupSha) return;

    const groupId = state.currentGroupSha;
    const enabledSelect = document.getElementById('group-enabled') as HTMLSelectElement;
    const newEnabled = enabledSelect.value === '1';

    try {
        const group = state.allGroups.find(g => g.sha === groupId);
        if (group) {
            await trpc.groups.update.mutate({
                id: groupId,
                displayName: group.name,
                enabled: newEnabled
            });
        }

        showToast('Cambios guardados');
        renderRules();
        updateRuleCounts();
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error guardando: ' + err.message, 'error');
        }
    }
}

export async function deleteGroup(): Promise<void> {
    if (!state.canEdit || !state.currentGroupSha) return;
    if (!confirm('Delete this group and all its rules?')) return;

    try {
        await trpc.groups.delete.mutate({ id: state.currentGroupSha });
        showToast('Grupo eliminado');
        showScreen('dashboard-screen');
        void loadDashboard();
    } catch (err) {
        if (err instanceof Error) {
            showToast('Error eliminando grupo: ' + err.message, 'error');
        }
    }
}

declare global {
    interface Window {
        openGroup: (name: string) => Promise<void>;
        deleteRule: (value: string, event: Event) => Promise<void>;
        openNewGroupModal: () => void;
        deleteGroup: () => Promise<void>;
    }
}

window.openGroup = openGroup;
window.deleteRule = deleteRule;
window.openNewGroupModal = () => {
    if (!state.canEdit) return;
    const modalId = 'modal-new-group';
    document.getElementById(modalId)?.classList.remove('hidden');
};
window.deleteGroup = deleteGroup;
