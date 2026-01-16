import { trpc } from './trpc.js';
import { logger } from './lib/logger.js';

declare global {
    interface Window {
        highlightRequest?: (requestId: string) => void;
    }
}

interface SubscribeResponse {
    success: boolean;
    error?: string;
}

/**
 * Push Notifications Manager
 * Handles push subscription management for teachers
 */
export const pushManager = {
    isSupported(): boolean {
        return 'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window &&
            window.isSecureContext;
    },

    /**
     * Get current permission status
     */
    getPermissionStatus(): NotificationPermission | 'unsupported' {
        if (!this.isSupported()) return 'unsupported';
        return Notification.permission;
    },

    /**
     * Register service worker
     */
    async registerServiceWorker(): Promise<ServiceWorkerRegistration> {
        if (!this.isSupported()) {
            throw new Error('Push notifications not supported in this browser');
        }

        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });
            logger.info('[Push] Service Worker registered', { scope: registration.scope });
            return registration;
        } catch (error) {
            logger.error('[Push] Service Worker registration failed', { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    },

    /**
     * Get or wait for service worker registration
     */
    async getRegistration(): Promise<ServiceWorkerRegistration> {
        if (navigator.serviceWorker.controller) {
            return navigator.serviceWorker.ready;
        }
        return this.registerServiceWorker();
    },

    /**
     * Request notification permission
     */
    async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
        if (!this.isSupported()) {
            return 'unsupported';
        }

        const permission = await Notification.requestPermission();
        logger.info('[Push] Permission result', { permission });
        return permission;
    },

    /**
     * Get VAPID public key from server
     */
    async getVapidKey(): Promise<string> {
        const result = await trpc.push.getVapidKey.query();
        if (!result.publicKey) {
            throw new Error('Failed to get VAPID key');
        }
        return result.publicKey;
    },

    /**
     * Convert VAPID key to Uint8Array for subscription
     */
    urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    },

    /**
     * Subscribe to push notifications
     */
    async subscribe(): Promise<SubscribeResponse> {
        // Check permission
        const permission = await this.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Permission denied for notifications');
        }

        // Get service worker registration
        const registration = await this.getRegistration();

        // Get VAPID key from server
        const vapidKey = await this.getVapidKey();
        const applicationServerKey = this.urlBase64ToUint8Array(vapidKey);

        // Subscribe
        // Type assertion needed: TypeScript 5.x has strict ArrayBuffer vs SharedArrayBuffer
        // generics in Uint8Array. At runtime, Uint8Array IS a valid BufferSource.
        // This is a known TypeScript limitation, not a code issue.
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey as unknown as BufferSource
        });

        logger.info('[Push] Subscribed', { endpoint: subscription.endpoint });

        // Send subscription to server
        // Convert PushSubscription to plain object for tRPC
        const subJSON = subscription.toJSON();

        // Ensure keys are present (toJSON returns PushSubscriptionJSON which has optional keys)
        const { endpoint, keys } = subJSON;
        const p256dh = keys?.p256dh;
        const auth = keys?.auth;
        if (!endpoint || !p256dh || !auth) {
            throw new Error('Invalid subscription object generated');
        }

        await trpc.push.subscribe.mutate({
            subscription: {
                endpoint,
                expirationTime: subJSON.expirationTime ?? null,
                keys: {
                    p256dh,
                    auth
                }
            }
        });

        logger.info('[Push] Subscription registered on server');
        return { success: true };
    },

    /**
     * Check if already subscribed
     */
    async getSubscription(): Promise<PushSubscription | null> {
        if (!this.isSupported()) return null;

        try {
            const registration = await navigator.serviceWorker.ready;
            return await registration.pushManager.getSubscription();
        } catch {
            return null;
        }
    },

    /**
     * Unsubscribe from push notifications
     */
    async unsubscribe(): Promise<{ success: boolean; message?: string }> {
        const subscription = await this.getSubscription();
        if (!subscription) {
            return { success: true, message: 'Not subscribed' };
        }

        // Unsubscribe locally
        await subscription.unsubscribe();

        // Remove from server
        try {
            await trpc.push.unsubscribe.mutate({ endpoint: subscription.endpoint });
        } catch (error) {
            logger.warn('[Push] Server unsubscribe failed', { error: error instanceof Error ? error.message : String(error) });
        }

        logger.info('[Push] Unsubscribed');
        return { success: true };
    },

    /**
     * Initialize push notifications UI
     * Call this after login
     */
    async init(): Promise<void> {
        if (!this.isSupported()) {
            logger.info('[Push] Push notifications not supported (requires secure context)');
            return;
        }

        try {
            await this.registerServiceWorker();
        } catch (error) {
            logger.warn('Push init failed', { error: error instanceof Error ? error.message : String(error) });
            return;
        }

        navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data as Record<string, unknown> | null;
            if (data && typeof data === 'object' && data.type === 'NAVIGATE') {
                // Handle navigation request from SW
                const requestId = data.requestId as string | undefined;
                if (requestId && typeof window.highlightRequest === 'function') {
                    window.highlightRequest(requestId);
                }
            }
        });
    }
};
