import { logger } from './logger.js';

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

class MemoryStorage implements StorageLike {
    private readonly store = new Map<string, string>();

    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }
}

const memoryStorage = new MemoryStorage();

function getLocalStorageOrNull(): Storage | null {
    if (typeof window === 'undefined') return null;

    try {
        const ls = window.localStorage;
        const probeKey = '__openpath_storage_probe__';
        ls.setItem(probeKey, '1');
        ls.removeItem(probeKey);
        return ls;
    } catch (error) {
        logger.warn('localStorage unavailable; falling back to in-memory storage', { error });
        return null;
    }
}

export function getStorage(): StorageLike {
    return getLocalStorageOrNull() ?? memoryStorage;
}

export function isLocalStorageAvailable(): boolean {
    return getLocalStorageOrNull() !== null;
}
