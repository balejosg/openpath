/**
 * OpenPath - Config Module Unit Tests
 * Tests for localStorage configuration management
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

import type { SPAConfig } from '../src/types/index.js';

// =============================================================================
// localStorage Mock
// =============================================================================

class MockLocalStorage {
    private store = new Map<string, string>();

    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }

    get length(): number {
        return this.store.size;
    }

    key(index: number): string | null {
        const keys = Array.from(this.store.keys());
        return keys[index] ?? null;
    }
}

// Global mock for tests
let mockStorage: MockLocalStorage;

// Config implementation (copied to test in isolation)
const STORAGE_KEY = 'openpath-spa-config';

const config = {
    STORAGE_KEY,

    get(): Partial<SPAConfig> {
        try {
            return JSON.parse(mockStorage.getItem(this.STORAGE_KEY) ?? '{}') as Partial<SPAConfig>;
        } catch {
            return {};
        }
    },

    save(updates: Partial<SPAConfig>): Partial<SPAConfig> {
        const current = this.get();
        const merged = { ...current, ...updates };
        mockStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
        return merged;
    },

    isConfigured(): boolean {
        const current = this.get();
        return !!(current.owner && current.repo);
    },

    clear(): void {
        mockStorage.removeItem(this.STORAGE_KEY);
    },

    getRequired(): SPAConfig {
        const current = this.get();
        if (!current.owner || !current.repo) {
            throw new Error('Configuración incompleta');
        }
        return current as SPAConfig;
    }
};

// =============================================================================
// config.get() Tests
// =============================================================================

void describe('config.get()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should return empty object when no config stored', () => {
        const result = config.get();
        assert.deepStrictEqual(result, {});
    });

    void test('should return stored config', () => {
        const data = { owner: 'test-owner', repo: 'test-repo' };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        const result = config.get();
        assert.deepStrictEqual(result, data);
    });

    void test('should handle JSON parse errors', () => {
        mockStorage.setItem(STORAGE_KEY, 'invalid-json');
        const result = config.get();
        assert.deepStrictEqual(result, {});
    });
});

// =============================================================================
// config.save() Tests
// =============================================================================

void describe('config.save()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should save partial config', () => {
        const newConfig = { owner: 'new-owner', repo: 'new-repo' };
        const result = config.save(newConfig);
        assert.deepStrictEqual(result, newConfig);
        assert.strictEqual(mockStorage.getItem(STORAGE_KEY), JSON.stringify(newConfig));
    });

    void test('should merge with existing config', () => {
        const existing = { owner: 'old-owner', repo: 'old-repo', branch: 'main' };
        mockStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
        
        const updates = { repo: 'new-repo' };
        const result = config.save(updates);
        
        const expected = { owner: 'old-owner', repo: 'new-repo', branch: 'main' };
        assert.deepStrictEqual(result, expected);
        assert.strictEqual(mockStorage.getItem(STORAGE_KEY), JSON.stringify(expected));
    });

    void test('should update multiple fields', () => {
        const updates = { owner: 'openpath', repo: 'whitelist', branch: 'dev' };
        const result = config.save(updates);
        assert.deepStrictEqual(result, updates);
    });

    void test('should preserve unrelated fields', () => {
        config.save({ owner: 'test' });
        const result = config.save({ repo: 'repo' });
        assert.strictEqual(result.owner, 'test');
        assert.strictEqual(result.repo, 'repo');
    });

    void test('should handle empty updates', () => {
        const initial = { owner: 'test' };
        config.save(initial);
        const result = config.save({});
        assert.deepStrictEqual(result, initial);
    });

    void test('should save full config object', () => {
        const fullConfig: SPAConfig = {
            owner: 'owner',
            repo: 'repo',
            branch: 'branch',
            whitelistPath: 'path',
            gruposDir: 'grupos'
        };
        const result = config.save(fullConfig);
        assert.deepStrictEqual(result, fullConfig);
    });
});

// =============================================================================
// config.isConfigured() Tests
// =============================================================================

void describe('config.isConfigured()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should return false when empty', () => {
        assert.strictEqual(config.isConfigured(), false);
    });

    void test('should return false if owner missing', () => {
        config.save({ repo: 'test' });
        assert.strictEqual(config.isConfigured(), false);
    });

    void test('should return false if repo missing', () => {
        config.save({ owner: 'test' });
        assert.strictEqual(config.isConfigured(), false);
    });

    void test('should return true when owner and repo exist', () => {
        config.save({ owner: 'test', repo: 'test' });
        assert.strictEqual(config.isConfigured(), true);
    });

    void test('should ignore optional branch', () => {
        config.save({ owner: 'test', repo: 'test' });
        assert.strictEqual(config.isConfigured(), true);
    });

    void test('should return false with empty strings', () => {
        config.save({ owner: '', repo: '' });
        assert.strictEqual(config.isConfigured(), false);
    });

    void test('should return true with all fields', () => {
        config.save({ owner: 'o', repo: 'r', branch: 'b' });
        assert.strictEqual(config.isConfigured(), true);
    });
});

// =============================================================================
// config.clear() Tests
// =============================================================================

void describe('config.clear()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should remove from storage', () => {
        config.save({ owner: 'test' });
        config.clear();
        assert.strictEqual(mockStorage.getItem(STORAGE_KEY), null);
        assert.deepStrictEqual(config.get(), {});
    });

    void test('should not crash if already empty', () => {
        assert.doesNotThrow(() => {
            config.clear();
        });
    });

    void test('should clear all fields', () => {
        config.save({ owner: 'o', repo: 'r', branch: 'b' });
        config.clear();
        assert.deepStrictEqual(config.get(), {});
    });

    void test('should be independent of other keys', () => {
        mockStorage.setItem('other', 'value');
        config.clear();
        assert.strictEqual(mockStorage.getItem('other'), 'value');
    });
});

// =============================================================================
// config.getRequired() Tests
// =============================================================================

void describe('config.getRequired()', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should throw if incomplete', () => {
        assert.throws(
            () => config.getRequired(),
            /Configuración incompleta/
        );
    });

    void test('should throw if repo missing', () => {
        config.save({ owner: 'test' });
        assert.throws(
            () => config.getRequired(),
            /Configuración incompleta/
        );
    });

    void test('should throw if owner missing', () => {
        config.save({ repo: 'test' });
        assert.throws(
            () => config.getRequired(),
            /Configuración incompleta/
        );
    });

    void test('should return config if complete', () => {
        const full = { owner: 'o', repo: 'r', branch: 'b', whitelistPath: 'p' };
        config.save(full);
        const result = config.getRequired();
        assert.deepStrictEqual(result, full);
    });

    void test('should work after update', () => {
        config.save({ owner: 'o', repo: 'r', branch: 'b', whitelistPath: 'p' });
        const result = config.getRequired();
        assert.strictEqual(result.owner, 'o');
    });
});

// =============================================================================
// Persistence Tests
// =============================================================================

void describe('Config Persistence', () => {
    beforeEach(() => {
        mockStorage = new MockLocalStorage();
    });

    void test('should persist between instances', () => {
        const data = { owner: 'persisted' };
        config.save(data);
        
        // Simulating reload by calling get again
        const result = config.get();
        assert.strictEqual(result.owner, 'persisted');
    });

    void test('should handle storage updates', () => {
        config.save({ owner: 'v1' });
        config.save({ owner: 'v2' });
        const result = config.get();
        assert.strictEqual(result.owner, 'v2');
    });

    void test('should maintain partial updates', () => {
        config.save({ owner: 'first' });
        config.save({ repo: 'second' });
        config.save({ branch: 'third' });
        
        const result = config.get();
        assert.strictEqual(result.owner, 'first');
        assert.strictEqual(result.repo, 'second');
        assert.strictEqual(result.branch, 'third');
    });

    void test('should clear then save', () => {
        config.save({ owner: 'test' });
        config.clear();
        config.save({ repo: 'new-repo' });
        
        const result = config.get();
        assert.strictEqual(result.owner, undefined);
        assert.strictEqual(result.repo, 'new-repo');
    });

    void test('should use correct STORAGE_KEY', () => {
        assert.strictEqual(STORAGE_KEY, 'openpath-spa-config');
    });
});
