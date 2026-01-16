/**
 * UI Management (Screens, Modals, Tabs)
 */

export function showScreen(screenId: string): void {
    document.querySelectorAll('.screen').forEach(s => { s.classList.add('hidden'); });
    document.getElementById(screenId)?.classList.remove('hidden');
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
}
