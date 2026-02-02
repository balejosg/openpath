/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Push Notification Module
 * Handles Web Push subscriptions and notification sending
 * Storage: PostgreSQL via Drizzle ORM
 */

import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import webPush from 'web-push';
import { db } from '../db/index.js';
import { pushSubscriptions } from '../db/schema.js';
import { logger } from './logger.js';
import { config } from '../config.js';
import type { DomainRequest } from '../types/index.js';

// =============================================================================
// Types
// =============================================================================

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  groupIds: string[];
  subscription: PushSubscriptionData;
  userAgent: string;
  createdAt: string;
}

interface NotificationPayload {
  title: string;
  body: string;
  icon: string;
  badge: string;
  data: {
    requestId: string;
    domain: string;
    groupId: string;
    url: string;
  };
}

interface NotificationResult {
  sent: number;
  failed: number;
  disabled?: boolean;
  noSubscriptions?: boolean;
  total?: number;
}

// =============================================================================
// Configuration
// =============================================================================

const VAPID_CONFIGURED =
  config.vapidPublicKey !== '' && config.vapidPrivateKey !== '' && config.vapidSubject !== '';

if (VAPID_CONFIGURED) {
  webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
} else {
  logger.warn('VAPID keys not configured - push notifications disabled', {
    hint: 'Generate keys with: npx web-push generate-vapid-keys',
  });
}

// =============================================================================
// Storage Functions (Postgres)
// =============================================================================

/**
 * Convert database row to SubscriptionRecord.
 * @param row - Database row from push_subscriptions table
 * @returns SubscriptionRecord object
 */
function dbRowToRecord(row: typeof pushSubscriptions.$inferSelect): SubscriptionRecord {
  return {
    id: row.id,
    userId: row.userId,
    groupIds: row.groupIds,
    subscription: {
      endpoint: row.endpoint,
      expirationTime: null,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    },
    userAgent: row.userAgent ?? '',
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

/**
 * Save a push subscription for a user.
 * Upserts based on endpoint to prevent duplicates.
 *
 * @param userId - User ID owning the subscription
 * @param groupIds - Array of group IDs the user subscribes to
 * @param subscription - The Web Push subscription object from the browser
 * @param userAgent - Optional User Agent string
 * @returns Promise resolving to the saved subscription record
 */
export async function saveSubscription(
  userId: string,
  groupIds: string[],
  subscription: PushSubscriptionData,
  userAgent = ''
): Promise<SubscriptionRecord> {
  // Remove existing subscription with same endpoint (upsert behavior)
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint));

  const record = {
    id: `push_${uuidv4().slice(0, 8)}`,
    userId,
    groupIds,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent,
  };

  await db.insert(pushSubscriptions).values(record);

  return {
    id: record.id,
    userId,
    groupIds,
    subscription,
    userAgent,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get all subscriptions for a specific group.
 * Used to broadcast notifications to all teachers of a group.
 *
 * @param groupId - Group ID to filter by
 * @returns Promise resolving to array of subscriptions
 */
export async function getSubscriptionsForGroup(groupId: string): Promise<SubscriptionRecord[]> {
  const rows = await db.select().from(pushSubscriptions);
  // Filter by groupId (array contains)
  return rows.filter((row) => row.groupIds.includes(groupId)).map(dbRowToRecord);
}

/**
 * Get all subscriptions for a specific user.
 *
 * @param userId - User ID to filter by
 * @returns Promise resolving to array of subscriptions
 */
export async function getSubscriptionsForUser(userId: string): Promise<SubscriptionRecord[]> {
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return rows.map(dbRowToRecord);
}

/**
 * Delete a subscription by its endpoint URL.
 *
 * @param endpoint - The unique endpoint URL of the subscription
 * @returns Promise resolving to true if deleted, false otherwise
 */
export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
  const result = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning({ id: pushSubscriptions.id });
  return result.length > 0;
}

/**
 * Delete a subscription by its ID.
 *
 * @param id - The subscription ID
 * @returns Promise resolving to true if deleted, false otherwise
 */
export async function deleteSubscriptionById(id: string): Promise<boolean> {
  const result = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.id, id))
    .returning({ id: pushSubscriptions.id });
  return result.length > 0;
}

// =============================================================================
// Notification Functions
// =============================================================================

/**
 * Notify all teachers associated with a group about a new domain request.
 * Filters subscriptions to those relevant to the request's group.
 * Handles automatic cleanup of expired (410 Gone) subscriptions.
 *
 * @param request - The domain request object
 * @returns Promise resolving to the result summary (sent, failed, total)
 */
export async function notifyTeachersOfNewRequest(
  request: DomainRequest
): Promise<NotificationResult> {
  if (!VAPID_CONFIGURED) {
    return { sent: 0, failed: 0, disabled: true };
  }

  const subscriptions = await getSubscriptionsForGroup(request.groupId);

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, noSubscriptions: true };
  }

  const payload: NotificationPayload = {
    title: '📨 Nueva solicitud',
    body: `Dominio: ${request.domain}`,
    icon: config.pushIconPath,
    badge: config.pushBadgePath,
    data: {
      requestId: request.id,
      domain: request.domain,
      groupId: request.groupId,
      url: `/?highlight=${request.id}`,
    },
  };

  const results = await Promise.allSettled(
    subscriptions.map((sub) => webPush.sendNotification(sub.subscription, JSON.stringify(payload)))
  );

  let sent = 0;
  let failed = 0;

  for (const [i, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      sent++;
    } else {
      failed++;
      const reason = result.reason as { statusCode?: number; message?: string } | undefined;
      if (reason?.statusCode === 410) {
        const sub = subscriptions[i];
        if (sub !== undefined) {
          await deleteSubscriptionByEndpoint(sub.subscription.endpoint);
          logger.info('Removed expired push subscription', { subscriptionId: sub.id });
        }
      } else {
        logger.error('Push notification failed', {
          error: reason?.message,
          requestId: request.id,
          subscriptionId: subscriptions[i]?.id,
        });
      }
    }
  }

  logger.info('Push notifications sent', {
    sent,
    total: subscriptions.length,
    requestId: request.id,
  });
  return { sent, failed, total: subscriptions.length };
}

/**
 * Get the VAPID public key for frontend use.
 *
 * @returns The VAPID public key or null if not configured
 */
export function getVapidPublicKey(): string | null {
  return config.vapidPublicKey || null;
}

/**
 * Check if push notifications are enabled (VAPID keys configured).
 *
 * @returns true if enabled, false otherwise
 */
export function isPushEnabled(): boolean {
  return VAPID_CONFIGURED;
}

export default {
  saveSubscription,
  getSubscriptionsForGroup,
  getSubscriptionsForUser,
  deleteSubscriptionByEndpoint,
  deleteSubscriptionById,
  notifyTeachersOfNewRequest,
  getVapidPublicKey,
  isPushEnabled,
};
