/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 * 
 * Setup Module - First-time admin setup
 * Handles the initial configuration when no admins exist
 */

import { z } from 'zod';
import { getErrorMessage, parseApiResponse } from '@openpath/shared';
import { auth } from './auth.js';
import { logger } from './lib/logger.js';
import { getElement } from './lib/dom.js';

const SetupStatusSchema = z.object({
    needsSetup: z.boolean(),
    hasAdmin: z.boolean(),
    error: z.string().optional(),
});

const CreateAdminResponseSchema = z.object({
    success: z.boolean(),
    registrationToken: z.string(),
    user: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string(),
    }),
});

const TokenResponseSchema = z.object({
    registrationToken: z.string(),
});

type CreateAdminResponse = z.infer<typeof CreateAdminResponseSchema>;

interface SetupStatus {
    needsSetup: boolean;
    hasAdmin: boolean;
    error?: string;
}

function getApiUrl(): string {
    return localStorage.getItem('requests_api_url') ?? '';
}

/**
 * Check if the server needs initial setup
 */
export async function checkStatus(): Promise<SetupStatus> {
    const apiUrl = getApiUrl();
    if (apiUrl === '') {
        return { needsSetup: false, hasAdmin: true, error: 'API URL not configured' };
    }

    try {
        const response = await fetch(`${apiUrl}/api/setup/status`);
        const data = await parseApiResponse(response, SetupStatusSchema);

        if (!response.ok) {
            throw new Error(data.error ?? 'Failed to check setup status');
        }

        return {
            needsSetup: data.needsSetup,
            hasAdmin: data.hasAdmin
        };
    } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error('Setup status check failed', { error: errorMessage });
        return { needsSetup: false, hasAdmin: true, error: errorMessage };
    }
}

/**
 * Create the first admin user
 */
export async function createFirstAdmin(email: string, name: string, password: string): Promise<CreateAdminResponse> {
    const apiUrl = getApiUrl();
    if (apiUrl === '') {
        throw new Error('API URL not configured');
    }

    const response = await fetch(`${apiUrl}/api/setup/first-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error ?? 'Failed to create admin');
    }

    return parseApiResponse(response, CreateAdminResponseSchema);
}

/**
 * Get the registration token (requires admin auth)
 */
export async function getRegistrationToken(): Promise<string> {
    const apiUrl = getApiUrl();
    if (apiUrl === '') {
        throw new Error('API URL not configured');
    }

    const response = await fetch(`${apiUrl}/api/setup/registration-token`, {
        headers: auth.getAuthHeaders()
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error ?? 'Failed to get registration token');
    }

    const data = await parseApiResponse(response, TokenResponseSchema);
    return data.registrationToken;
}

/**
 * Regenerate the registration token (requires admin auth)
 */
export async function regenerateToken(): Promise<string> {
    const apiUrl = getApiUrl();
    if (apiUrl === '') {
        throw new Error('API URL not configured');
    }

    const response = await fetch(`${apiUrl}/api/setup/regenerate-token`, {
        method: 'POST',
        headers: auth.getAuthHeaders()
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error ?? 'Failed to regenerate token');
    }

    const data = await parseApiResponse(response, TokenResponseSchema);
    return data.registrationToken;
}

/**
 * Initialize the setup page (for integrated setup in index.html)
 */
export async function initSetupPage(): Promise<void> {
    const loadingEl = getElement('setup-loading');
    const headerEl = getElement('setup-header');
    const formContainer = getElement('setup-form-container');
    const completeContainer = getElement('setup-complete-container');
    const alreadyContainer = getElement('setup-already-container');

    loadingEl?.classList.remove('hidden');
    headerEl?.classList.add('hidden');
    formContainer?.classList.add('hidden');
    completeContainer?.classList.add('hidden');
    alreadyContainer?.classList.add('hidden');

    const status = await checkStatus();

    loadingEl?.classList.add('hidden');
    headerEl?.classList.remove('hidden');

    if (status.error !== undefined && status.error !== 'API URL not configured') {
        const errorEl = getElement('setup-error');
        if (errorEl !== null) {
            errorEl.textContent = status.error;
            errorEl.classList.remove('hidden');
        }
        formContainer?.classList.remove('hidden');
        return;
    }

    if (status.needsSetup) {
        formContainer?.classList.remove('hidden');
    } else {
        alreadyContainer?.classList.remove('hidden');
    }
}

/**
 * Show the setup complete screen with registration token
 */
export function showSetupComplete(token: string): void {
    const formContainer = getElement('setup-form-container');
    const completeContainer = getElement('setup-complete-container');

    formContainer?.classList.add('hidden');
    completeContainer?.classList.remove('hidden');

    const tokenEl = getElement('setup-registration-token');
    if (tokenEl !== null) {
        tokenEl.textContent = token;
    }
}

// Export as object for backwards compatibility
export const setup = {
    checkStatus,
    createFirstAdmin,
    getRegistrationToken,
    regenerateToken,
    initSetupPage,
    showSetupComplete
};

// Make available globally for HTML onclick handlers
declare global {
    interface Window {
        setup: typeof setup;
    }
}
window.setup = setup;
