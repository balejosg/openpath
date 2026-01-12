export function showScreen(screenId: string): void {
    document.querySelectorAll('.screen').forEach(s => { s.classList.add('hidden'); });
    document.getElementById(screenId)?.classList.remove('hidden');
}

function isLucideAvailable(): boolean {
    return typeof (window as unknown as { lucide?: unknown }).lucide !== 'undefined';
}

export function updateIcons(root: ParentNode = document): void {
    const win = window as unknown as { lucide?: { createIcons: (options?: { root?: ParentNode }) => void } };
    if (!win.lucide) return;
    win.lucide.createIcons({ root });
}

export function initSidebar(): void {
    const navItems = document.querySelectorAll<HTMLButtonElement>('.nav-item[data-screen]');
    navItems.forEach((item) => {
        item.addEventListener('click', () => {
            const screenId = item.getAttribute('data-screen');
            if (!screenId) return;

            navigateToScreen(screenId);
            closeSidebarOnMobile();
        });
    });

    document.getElementById('menu-toggle')?.addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-backdrop')?.addEventListener('click', closeSidebar);

    if (isLucideAvailable()) updateIcons(document);
}

export function toggleSidebar(): void {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-backdrop')?.classList.toggle('hidden');
}

export function closeSidebar(): void {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-backdrop')?.classList.add('hidden');
}

export function closeSidebarOnMobile(): void {
    if (window.innerWidth < 768) closeSidebar();
}

export function setActiveNavItem(screenId: string): void {
    document.querySelectorAll('.nav-item[data-screen]').forEach((item) => {
        item.classList.toggle('active', item.getAttribute('data-screen') === screenId);
    });
}

export function updatePageTitle(title: string): void {
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = title;
}

export function navigateToScreen(screenId: string): void {
    document.querySelectorAll('.main-content .screen').forEach((el) => {
        el.classList.add('hidden');
    });

    document.getElementById(screenId)?.classList.remove('hidden');

    setActiveNavItem(screenId);

    const titles: Record<string, string> = {
        'overview-screen': 'Dashboard',
        'classrooms-screen': 'Gestión de Aulas',
        'groups-screen': 'Grupos',
        'users-screen': 'Usuarios',
        'requests-screen': 'Solicitudes',
    };

    updatePageTitle(titles[screenId] ?? 'OpenPath');

    if (isLucideAvailable()) updateIcons(document.getElementById(screenId) ?? document);
}

export function openModal(id: string): void {
    document.getElementById(id)?.classList.remove('hidden');
}

export function closeModal(id: string): void {
    document.getElementById(id)?.classList.add('hidden');
}

export function initModals(): void {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });

    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                closeModal(modal.id);
            }
        });
    });
}

const THEME_KEY = 'openpath-theme';

export function initTheme(): void {
    const savedTheme = localStorage.getItem(THEME_KEY) ?? 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

export function toggleTheme(): void {
    const currentTheme = document.documentElement.getAttribute('data-theme') ?? 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme: string): void {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }

    const win = window as unknown as { lucide?: { createIcons: (options?: { root?: ParentNode }) => void } };
    if (!win.lucide) return;

    const themeToggleButton = document.getElementById('theme-toggle-btn');
    if (themeToggleButton) {
        themeToggleButton.innerHTML = theme === 'dark'
            ? '<i data-lucide="sun"></i>'
            : '<i data-lucide="moon"></i>';
        win.lucide.createIcons({ root: themeToggleButton });
    }
}
