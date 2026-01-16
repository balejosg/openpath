import { state, setCurrentUser, setCanEdit } from './state.js';
import { showScreen } from './ui.js';
import { loadDashboard } from './groups.js';
import { loadUsers } from './users.js';
import { auth } from '../auth.js';
import { schedulesModule } from './schedules.js';
import { trpc } from '../trpc.js';
import { logger } from '../lib/logger.js';
import { setup } from '../setup.js';
import { googleAuth } from '../google-auth.js';

function showDashboardWithUser(user: ReturnType<typeof auth.getUser>): void {
    if (!user) return;
    
    setCurrentUser(user);
    setCanEdit(auth.isAdmin());
    
    const userName = user.name || user.email;
    const userEl = document.getElementById('current-user');
    if (userEl) userEl.textContent = userName;

    updateEditUI();
    showScreen('dashboard-screen');
}

async function refreshUserDataInBackground(): Promise<void> {
    try {
        await auth.getMe();
        const user = auth.getUser();
        if (user) {
            setCurrentUser(user);
            setCanEdit(auth.isAdmin());
            updateEditUI();
        }
    } catch {
        logger.debug('Background user refresh failed');
    }
    
    await loadDashboard();
}

export async function init(): Promise<void> {
    try {
        const status = await setup.checkStatus();
        if (status.needsSetup) {
            await setup.initSetupPage();
            showScreen('setup-screen');
            return;
        }
    } catch (e) {
        logger.warn('Setup status check failed, continuing to login', { 
            error: e instanceof Error ? e.message : String(e) 
        });
    }

    const isJWTLoggedIn = auth.isAuthenticated();
    console.warn('[init] isAuthenticated:', isJWTLoggedIn);

    if (!isJWTLoggedIn) {
        console.warn('[init] Not authenticated, showing login screen');
        showScreen('login-screen');
        const configLoaded = await googleAuth.loadConfig();
        if (configLoaded) {
            await googleAuth.renderButton('google-signin-btn');
        }
        

        return;
    }

    const cachedUser = auth.getUser();
    console.warn('[init] Cached user:', cachedUser ? 'exists' : 'null');
    
    if (cachedUser) {
        console.warn('[init] Using cached user, showing dashboard immediately');
        showDashboardWithUser(cachedUser);
        void refreshUserDataInBackground();
        return;
    }

    console.warn('[init] No cached user, showing dashboard and fetching user data');
    showScreen('dashboard-screen');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    
    try {
        console.warn('[init] Calling auth.getMe()...');
        await auth.getMe();
        const user = auth.getUser();
        console.warn('[init] Got user from getMe:', user ? 'success' : 'null');
        if (user) {
            setCurrentUser(user);
            setCanEdit(auth.isAdmin());
            
            const userName = user.name || user.email;
            const userEl = document.getElementById('current-user');
            if (userEl) userEl.textContent = userName;
            
            updateEditUI();
            await loadDashboard();
            console.warn('[init] Dashboard fully loaded');
        } else {
            console.error('[init] getUser returned null, showing login screen');
            showScreen('login-screen');
        }
    } catch (err) {
        logger.error('Failed to load user', { error: err instanceof Error ? err.message : String(err) });
        console.error('[init] Exception in getMe:', err);
        showScreen('login-screen');
    }
}

export function updateEditUI(): void {
    const isAdmin = auth.isAdmin() || state.canEdit;
    const isTeacher = auth.isTeacher();

    const editButtons = document.querySelectorAll(
        '#new-group-btn, #save-config-btn, #delete-group-btn, #add-rule-btn, #bulk-add-btn'
    );
    editButtons.forEach(btn => {
        (btn as HTMLElement).style.display = isAdmin ? '' : 'none';
    });

    const usersSection = document.getElementById('users-section');
    if (usersSection) {
        usersSection.classList.toggle('hidden', !auth.isAdmin());
        const adminBtn = document.getElementById('admin-users-btn');
        if (auth.isAdmin()) {
            void loadUsers();
            if (adminBtn) adminBtn.classList.remove('hidden');
        } else {
            if (adminBtn) adminBtn.classList.add('hidden');
        }
    }

    const teacherBanner = document.getElementById('teacher-banner');
    if (teacherBanner) {
        if (isTeacher && !isAdmin) {
            teacherBanner.classList.remove('hidden');
            const nameEl = document.getElementById('teacher-name');
            if (nameEl && state.currentUser) nameEl.textContent = state.currentUser.name || state.currentUser.email;

            const groups = auth.getTeacherGroups();
            const groupsEl = document.getElementById('teacher-assigned-groups');
            if (groupsEl) groupsEl.textContent = groups.length > 0 ? groups.join(', ') : 'no groups yet';
        } else {
            teacherBanner.classList.add('hidden');
        }
    }

    const header = document.querySelector('.header-right');
    const existingBadge = document.getElementById('readonly-badge');

    if (!isAdmin && !existingBadge && !isTeacher) {
        const badge = document.createElement('span');
        badge.id = 'readonly-badge';
        badge.className = 'user-badge';
        badge.textContent = 'Read-only';
        badge.style.background = 'rgba(234, 179, 8, 0.2)';
        badge.style.color = '#eab308';
        if (header) header.insertBefore(badge, header.firstChild);
    } else if (isAdmin && existingBadge) {
        existingBadge.remove();
    }

    const scheduleSection = document.getElementById('schedule-section');
    if (scheduleSection) {
        const showSchedule = isAdmin || isTeacher;
        scheduleSection.classList.toggle('hidden', !showSchedule);

        if (showSchedule) {
            void initScheduleSection();
        }
    }
}

async function initScheduleSection(): Promise<void> {
    const select = document.getElementById('schedule-classroom-select') as HTMLSelectElement;

    select.dataset.initialized = 'true';

    try {
        const classrooms = await trpc.classrooms.list.query();

        select.innerHTML = '<option value="">Select classroom...</option>';
        classrooms.forEach((c) => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = c.displayName || c.name;
            select.appendChild(option);
        });
    } catch (e) {
        logger.error('Failed to load classrooms for schedule', { error: e instanceof Error ? e.message : String(e) });
    }

    select.addEventListener('change', () => void (async () => {
        const classroomId = select.value;
        if (classroomId) {
            await schedulesModule.init(classroomId);
        } else {
            const container = document.getElementById('schedule-grid-container');
            if (container) container.innerHTML = '<p class="empty-message">Select a classroom to view its schedule</p>';
        }
    })());

    document.getElementById('schedule-refresh-btn')?.addEventListener('click', () => void (async () => {
        const classroomId = select.value;
        if (classroomId) {
            await schedulesModule.loadSchedules();
            schedulesModule.render();
        }
    })());
}
