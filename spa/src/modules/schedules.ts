/**
 * Schedules Module
 * Weekly schedule grid for classroom reservations
 */

import { auth } from '../auth.js';
import { trpc } from '../trpc.js';
import { showToast } from '../utils.js';
import { logger } from '../lib/logger.js';
import type { Schedule, ScheduleSlot, ScheduleGroup } from '../types/index.js';

export const schedulesModule = {
    currentClassroomId: null as string | null,
    schedules: [] as Schedule[],
    groups: [] as ScheduleGroup[],

    // Time configuration
    START_HOUR: '08:00',
    END_HOUR: '15:00',
    SLOT_MINUTES: 60,
    DAY_NAMES: ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],

    /**
     * Initialize the schedules module
     */
    async init(classroomId: string): Promise<void> {
        this.currentClassroomId = classroomId;
        await this.loadGroups();
        await this.loadSchedules();
        this.render();
    },

    /**
     * Load available groups for the teacher
     */
    async loadGroups(): Promise<void> {
        try {
            const rawGroups = await trpc.requests.listGroups.query();
            // Map tRPC result { name, path, sha } to ScheduleGroup { id, name }
            this.groups = rawGroups.map(g => ({ id: g.name, name: g.name }));
        } catch (e) {
            logger.warn('Failed to load groups', { error: e instanceof Error ? e.message : String(e) });
            this.groups = [];
        }
    },

    /**
     * Load schedules for current classroom
     */
    async loadSchedules(): Promise<void> {
        if (!this.currentClassroomId) {
            this.schedules = [];
            return;
        }

        try {
            const result = await trpc.schedules.getByClassroom.query({ classroomId: this.currentClassroomId });
            this.schedules = result.schedules;
        } catch (e) {
            logger.error('Failed to load schedules', { error: e instanceof Error ? e.message : String(e) });
            this.schedules = [];
        }
    },

    /**
     * Render the schedule grid
     */
    render(): void {
        const container = document.getElementById('schedule-grid-container');
        if (!container) return;

        const timeSlots = this.generateTimeSlots(
            this.START_HOUR,
            this.END_HOUR,
            this.SLOT_MINUTES
        );

        // Build grid HTML
        let html = `
            <div class="schedule-grid">
                <div class="schedule-header">
                    <div class="schedule-time-header">Hora</div>
                    ${this.DAY_NAMES.slice(1).map((day: string) =>
            `<div class="schedule-day-header">${day}</div>`
        ).join('')}
                </div>
                <div class="schedule-body">
        `;

        for (const slot of timeSlots) {
            html += '<div class="schedule-row">';
            html += `<div class="schedule-time">${slot.start} - ${slot.end}</div>`;

            for (let day = 1; day <= 5; day++) {
                const schedule = this.findScheduleForSlot(day, slot.start, slot.end);
                html += this.renderCell(day, slot, schedule);
            }

            html += '</div>';
        }

        html += '</div></div>';

        // Groups legend
        html += this.renderGroupsLegend();

        container.innerHTML = html;
        this.attachEventListeners();
    },

    /**
     * Render a single grid cell
     */
    renderCell(dayOfWeek: number, slot: ScheduleSlot, schedule: Schedule | null): string {
        if (schedule) {
            const group = this.groups.find(g => g.id === schedule.groupId);
            const groupName = group?.name ?? schedule.groupId;
            // Assuming Schedule type has canEdit and isMine properties (from API)
            // If they are not in the Interface yet, we might need to add them or cast.
            // Interface: "active: boolean" only.
            // Interface updated to include isMine and canEdit
            const canEdit = (schedule.canEdit ?? false) || (schedule.isMine ?? false);

            return `
                <div class="schedule-cell schedule-cell-occupied ${schedule.isMine ? 'is-mine' : 'is-other'}"
                     data-schedule-id="${schedule.id}"
                     data-day="${dayOfWeek.toString()}"
                     data-start="${slot.start}"
                     data-end="${slot.end}"
                     title="${schedule.isMine ? 'Mi reserva' : 'Ocupado'}">
                    <span class="schedule-group-name">${groupName}</span>
                    ${canEdit ? '<button class="schedule-delete-btn" title="Eliminar">×</button>' : ''}
                </div>
            `;
        }

        // Empty cell - clickable for creating schedule
        return `
            <div class="schedule-cell schedule-cell-empty"
                 data-day="${dayOfWeek.toString()}"
                 data-start="${slot.start}"
                 data-end="${slot.end}"
                 title="Click to reserve">
                <span class="schedule-add-icon">+</span>
            </div>
        `;
    },

    /**
     * Render groups legend with colors
     */
    renderGroupsLegend(): string {
        // Get teacher's groups (filter if teacher role)
        const myGroups = auth.isAdmin()
            ? this.groups
            : this.groups.filter(g => {
                const teacherGroups = auth.getTeacherGroups();
                return teacherGroups.includes(g.id);
            });

        if (myGroups.length === 0) {
            return '<p class="schedule-no-groups">No tienes grupos asignados para reservar.</p>';
        }

        return `
            <div class="schedule-legend">
                <strong>Mis grupos:</strong>
                ${myGroups.map(g => `
                    <span class="schedule-legend-item" data-group-id="${g.id}">
                        <span class="schedule-legend-color"></span>
                        ${g.name}
                    </span>
                `).join('')}
            </div>
        `;
    },

    /**
     * Find schedule for a specific slot
     */
    findScheduleForSlot(dayOfWeek: number, startTime: string, endTime: string): Schedule | null {
        return this.schedules.find(s =>
            s.dayOfWeek === dayOfWeek &&
            s.startTime === startTime &&
            s.endTime === endTime
        ) ?? null;
    },

    /**
     * Attach event listeners to grid
     */
    attachEventListeners(): void {
        const container = document.getElementById('schedule-grid-container');
        if (!container) return;

        // Click on empty cell to create
        container.querySelectorAll('.schedule-cell-empty').forEach(cell => {
            cell.addEventListener('click', (e) => { void this.handleCellClick(e); });
        });

        // Click on delete button
        container.querySelectorAll('.schedule-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { void this.handleDeleteClick(e); });
        });
    },

    /**
     * Handle click on empty cell
     */
    async handleCellClick(e: Event): Promise<void> {
        const cell = e.currentTarget as HTMLElement;
        const dayOfWeek = parseInt(cell.dataset.day ?? '0');
        const startTime = cell.dataset.start ?? '';
        const endTime = cell.dataset.end ?? '';

        // Show group selection modal
        const groupId = await this.showGroupSelectionModal(dayOfWeek, startTime, endTime);
        if (!groupId) return;

        // Create schedule
        try {
            await trpc.schedules.create.mutate({
                classroomId: this.currentClassroomId ?? '',
                groupId: groupId,
                dayOfWeek: dayOfWeek,
                startTime: startTime,
                endTime: endTime
            });
            showToast('Reserva creada', 'success');
            // Reload
            await this.loadSchedules();
            this.render();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(message, 'error');
        }
    },

    /**
     * Handle delete button click
     */
    async handleDeleteClick(e: Event): Promise<void> {
        e.stopPropagation();
        const btn = e.target as HTMLElement;
        const cell = btn.closest('.schedule-cell');
        if (!cell || !(cell instanceof HTMLElement)) return;
        const scheduleId = cell.dataset.scheduleId;

        if (!scheduleId || !confirm('Delete this reservation?')) return;

        try {
            await trpc.schedules.delete.mutate({ id: scheduleId });
            await this.loadSchedules();
            this.render();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            showToast('Error: ' + message, 'error');
        }
    },

    /**
     * Show modal for group selection
     */
    showGroupSelectionModal(dayOfWeek: number, startTime: string, endTime: string): Promise<string | null> {
        return new Promise((resolve) => {
            const dayName = this.DAY_NAMES[dayOfWeek];
            const myGroups = auth.isAdmin()
                ? this.groups
                : this.groups.filter(g => {
                    const teacherGroups = auth.getTeacherGroups();
                    return teacherGroups.includes(g.id);
                });

            if (myGroups.length === 0) {
                showToast('No tienes grupos disponibles para reservar', 'error');
                resolve(null);
                return;
            }

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Reservar ${dayName ?? ''} ${startTime}-${endTime}</h3>
                        <button class="modal-close">×</button>
                    </div>
                    <form id="schedule-group-form">
                        <div class="form-group">
                            <label>Selecciona grupo</label>
                            <select id="schedule-group-select" required>
                                <option value="">-- Seleccionar --</option>
                                ${myGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-ghost modal-cancel">Cancelar</button>
                            <button type="submit" class="btn btn-primary">Reservar</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            // Event handlers
            const close = () => {
                modal.remove();
                resolve(null);
            };

            modal.querySelector('.modal-close')?.addEventListener('click', close);
            modal.querySelector('.modal-cancel')?.addEventListener('click', close);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) close();
            });

            modal.querySelector('#schedule-group-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                const select = modal.querySelector('#schedule-group-select');
                if (!select || !(select instanceof HTMLSelectElement)) return;
                const groupId = select.value;
                modal.remove();
                resolve(groupId);
            });
        });
    },

    generateTimeSlots(startHour = '08:00', endHour = '15:00', intervalMinutes = 60): ScheduleSlot[] {
        const slots: ScheduleSlot[] = [];
        const startParts = startHour.split(':').map(Number);
        let h = startParts[0] ?? 0;
        let m = startParts[1] ?? 0;

        const endParts = endHour.split(':').map(Number);
        const endH = endParts[0] ?? 0;
        const endM = endParts[1] ?? 0;

        while (h < endH || (h === endH && m < endM)) {
            const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            m += intervalMinutes;
            if (m >= 60) {
                h += Math.floor(m / 60);
                m = m % 60;
            }
            const end = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            slots.push({ start, end });
        }

        return slots;
    }
};

// Expose globally
declare global {
    interface Window {
        schedulesModule: typeof schedulesModule;
    }
}
window.schedulesModule = schedulesModule;
