/**
 * Utility functions
 */

import type { ToastType } from './types/index.js';

export function showToast(message: string, type: ToastType = 'success'): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

export function relativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin.toString()} min ago`;
    if (diffHour < 24) return `${diffHour.toString()}h ago`;
    if (diffDay < 7) return `${diffDay.toString()} days ago`;
    return date.toLocaleDateString();
}

export function escapeHtml(text: string | null | undefined): string {
    if (!text) return '';
    // Use a simpler approach than creating a DIV if safe, but DIV is standard for escaping.
    // However, in SSR limited envs, this might fail. We are in SPA.
    // Using built-in replacement for performance and safety without DOM access? 
    // Stick to existing logic to match behavior.
    if (typeof document === 'undefined') return text; // For robustness

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
