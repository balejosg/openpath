/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Rule Events Module
 * In-memory event bus for broadcasting whitelist change notifications
 * to connected SSE clients (Linux agents).
 */

import { EventEmitter } from 'node:events';
import { logger } from './logger.js';

// =============================================================================
// Event Bus
// =============================================================================

const eventBus = new EventEmitter();

// Allow many SSE connections (one per machine)
eventBus.setMaxListeners(500);

/**
 * Emit a whitelist-changed event for a specific group.
 * Called after any rule mutation (create, update, delete, bulk operations).
 *
 * @param groupId - The group whose whitelist changed
 */
export function emitWhitelistChanged(groupId: string): void {
  logger.debug('Emitting whitelist-changed event', { groupId });
  eventBus.emit('whitelist-changed', groupId);
}

/**
 * Emit whitelist-changed events for all groups.
 * Used when toggling the system status (enable/disable all groups).
 */
export function emitAllWhitelistsChanged(): void {
  logger.debug('Emitting whitelist-changed event for all groups');
  eventBus.emit('whitelist-changed', '*');
}

/**
 * Subscribe to whitelist-changed events for a specific group.
 * Returns an unsubscribe function for cleanup.
 *
 * @param groupId - The group to watch
 * @param callback - Called when the group's whitelist changes
 * @returns Unsubscribe function
 */
export function onWhitelistChanged(groupId: string, callback: () => void): () => void {
  const handler = (changedGroupId: string): void => {
    if (changedGroupId === groupId || changedGroupId === '*') {
      callback();
    }
  };

  eventBus.on('whitelist-changed', handler);

  return () => {
    eventBus.removeListener('whitelist-changed', handler);
  };
}

/**
 * Get the number of active SSE listeners (for diagnostics).
 */
export function getListenerCount(): number {
  return eventBus.listenerCount('whitelist-changed');
}
