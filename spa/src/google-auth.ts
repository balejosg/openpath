import { trpc } from './trpc.js';
import { auth } from './auth.js';
import { logger } from './lib/logger.js';
import { showToast } from './utils.js';
import type { RoleInfo } from '@openpath/shared';

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize(config: GoogleInitConfig): void;
                    renderButton(element: HTMLElement, options: GoogleButtonOptions): void;
                    prompt(callback?: (notification: PromptNotification) => void): void;
                    disableAutoSelect(): void;
                    revoke(email: string, callback?: () => void): void;
                };
            };
        };
    }
}

interface GoogleInitConfig {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: 'popup' | 'redirect';
    itp_support?: boolean;
}

interface GoogleButtonOptions {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    locale?: string;
    width?: number;
}

interface GoogleCredentialResponse {
    credential: string;
    select_by: string;
}

interface PromptNotification {
    isNotDisplayed(): boolean;
    isSkippedMoment(): boolean;
    isDismissedMoment(): boolean;
    getNotDisplayedReason(): string;
    getSkippedReason(): string;
    getDismissedReason(): string;
}

interface AppConfig {
    googleClientId: string;
}

let cachedConfig: AppConfig | null = null;

async function fetchConfig(): Promise<AppConfig> {
    if (cachedConfig) return cachedConfig;
    
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error(`Config fetch failed: ${String(response.status)}`);
        }
        cachedConfig = await response.json() as AppConfig;
        return cachedConfig;
    } catch (error) {
        logger.error('Failed to fetch app config', { error });
        return { googleClientId: '' };
    }
}

function getClientId(): string {
    return cachedConfig?.googleClientId ?? '';
}

/**
 * Wait for the Google Identity Services script to load.
 * The GSI script is loaded with async/defer, so it may not be available immediately.
 * 
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 5000)
 * @param pollIntervalMs - Polling interval in milliseconds (default: 100)
 * @returns Promise that resolves to true if GSI loaded, false if timeout
 */
async function waitForGoogleScript(timeoutMs = 5000, pollIntervalMs = 100): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
        if (window.google) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
    return false;
}

export const googleAuth = {
    initialized: false,

    async loadConfig(): Promise<boolean> {
        const config = await fetchConfig();
        return !!config.googleClientId;
    },

    init(): boolean {
        const clientId = getClientId();
        if (!clientId) {
            logger.warn('Google Client ID not configured');
            return false;
        }

        if (!window.google) {
            logger.warn('Google Identity Services script not loaded');
            return false;
        }

        window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => {
                logger.info('Received Google credential response');
                void this.handleCredentialResponse(response);
            },
            auto_select: false,
            cancel_on_tap_outside: true,
            ux_mode: 'popup',
            itp_support: true,
        });

        this.initialized = true;
        return true;
    },

    async renderButton(elementId: string): Promise<boolean> {
        const element = document.getElementById(elementId);
        if (!element) {
            logger.warn('Google sign-in button container not found', { elementId });
            return false;
        }

        if (!window.google) {
            logger.info('Waiting for Google Identity Services to load...');
            const loaded = await waitForGoogleScript();
            if (!loaded) {
                logger.warn('Google Identity Services failed to load within timeout');
                return false;
            }
        }

        if (!this.initialized) {
            if (!this.init()) {
                return false;
            }
        }

        // GSI is guaranteed to be loaded at this point after waitForGoogleScript
        const gsi = window.google;
        if (!gsi) {
            logger.error('Google Identity Services unexpectedly unavailable');
            return false;
        }
        const containerWidth = element.parentElement?.offsetWidth ?? element.offsetWidth;
        const buttonWidth = Math.min(containerWidth - 32, 386);
        
        const buttonOptions: GoogleButtonOptions = {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
        };
        if (buttonWidth > 200) {
            buttonOptions.width = buttonWidth;
        }
        gsi.accounts.id.renderButton(element, buttonOptions);

        logger.info('Google Sign-In button rendered successfully');
        return true;
    },

    async handleCredentialResponse(response: GoogleCredentialResponse): Promise<void> {
        const loginBtn = document.getElementById('google-signin-btn');
        const errorEl = document.getElementById('login-error');

        try {
            if (loginBtn) loginBtn.classList.add('is-loading');
            if (errorEl) errorEl.textContent = '';

            const result = await trpc.auth.googleLogin.mutate({
                idToken: response.credential
            });

            auth.storeTokens({
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn,
            });

            const user = result.user as unknown as { 
                id: string; 
                email: string; 
                name: string; 
                roles: RoleInfo[] 
            };
            
            auth.storeUser({
                id: user.id,
                email: user.email,
                name: user.name,
                roles: user.roles
            });

            window.location.reload();
        } catch (error) {
            logger.error('Google login failed', { error });
            const message = error instanceof Error ? error.message : 'Error de autenticación con Google';
            if (errorEl) {
                errorEl.textContent = message;
            } else {
                showToast(message, 'error');
            }
        } finally {
            if (loginBtn) loginBtn.classList.remove('is-loading');
        }
    },

    prompt(): void {
        if (!this.initialized) {
            this.init();
        }
        if (window.google) {
            window.google.accounts.id.prompt();
        }
    },

    logout(): void {
        if (window.google) {
            window.google.accounts.id.disableAutoSelect();
        }
    },

    isConfigured(): boolean {
        return !!getClientId();
    }
};
