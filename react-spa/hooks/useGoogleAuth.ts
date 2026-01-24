import { useState, useEffect, useCallback } from 'react';

// Types
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

export interface GoogleInitConfig {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: 'popup' | 'redirect';
    itp_support?: boolean;
    use_fedcm_for_prompt?: boolean;
}

export interface GoogleButtonOptions {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    locale?: string;
    width?: number;
}

export interface GoogleCredentialResponse {
    credential: string;
    select_by: string;
}

export interface PromptNotification {
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

export function useGoogleAuth() {
    const [isInitialized, setIsInitialized] = useState(false);
    const [clientId, setClientId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Effect 1: Fetch configuration
    useEffect(() => {
        let mounted = true;
        
        async function fetchConfig() {
            try {
                const response = await fetch('/api/config');
                if (!response.ok) {
                    throw new Error(`Config fetch failed: ${response.status}`);
                }
                const data = await response.json() as AppConfig;
                
                if (mounted) {
                    if (!data.googleClientId) {
                        setError('Google Client ID not configured');
                    } else {
                        setClientId(data.googleClientId);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch app config', err);
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch config');
                }
            } finally {
                if (mounted) setIsLoading(false);
            }
        }

        fetchConfig();

        return () => {
            mounted = false;
        };
    }, []);

    // Helper: Wait for script
    const waitForGoogleScript = useCallback(async (timeoutMs = 5000, pollIntervalMs = 100): Promise<boolean> => {
        const startTime = Date.now();
        
        // Immediate check
        if (typeof window !== 'undefined' && window.google) {
            return true;
        }

        while (Date.now() - startTime < timeoutMs) {
            if (typeof window !== 'undefined' && window.google) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
        
        return false;
    }, []);

    const initGoogleAuth = useCallback(async (callback: (response: GoogleCredentialResponse) => void) => {
        if (!clientId) {
            console.warn('Google Client ID not loaded yet');
            return false;
        }

        const loaded = await waitForGoogleScript();
        if (!loaded) {
            console.warn('Google Identity Services script not loaded');
            return false;
        }

        if (!window.google) return false;

        window.google.accounts.id.initialize({
            client_id: clientId,
            callback,
            auto_select: false,
            cancel_on_tap_outside: true,
            ux_mode: 'popup',
            itp_support: true,
            use_fedcm_for_prompt: true,
        });

        setIsInitialized(true);
        return true;
    }, [clientId, waitForGoogleScript]);

    const renderGoogleButton = useCallback(async (elementId: string) => {
        if (!isInitialized) {
            console.warn('renderGoogleButton called before initGoogleAuth');
            return;
        }

        const loaded = await waitForGoogleScript();
        if (!loaded || !window.google) {
            console.error('Google Identity Services unexpectedly unavailable');
            return;
        }

        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Google sign-in button container '${elementId}' not found`);
            return;
        }

        const containerWidth = element.parentElement?.offsetWidth ?? element.offsetWidth;
        // logic from reference
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

        window.google.accounts.id.renderButton(element, buttonOptions);
    }, [isInitialized, waitForGoogleScript]);

    return {
        isInitialized,
        isLoading,
        error,
        isConfigured: !!clientId,
        initGoogleAuth,
        renderGoogleButton
    };
}
