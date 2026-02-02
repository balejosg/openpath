/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Drizzle ORM Table Relations
 * Defines relationships for relational queries (e.g., db.query.classrooms.findMany({ with: { machines: true } }))
 */

import { relations } from 'drizzle-orm';
import {
  users,
  roles,
  classrooms,
  machines,
  schedules,
  tokens,
  passwordResetTokens,
} from './schema.js';

// =============================================================================
// User Relations
// =============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(roles),
  schedules: many(schedules),
  tokens: many(tokens),
  passwordResetTokens: many(passwordResetTokens),
}));

// =============================================================================
// Role Relations
// =============================================================================

export const rolesRelations = relations(roles, ({ one }) => ({
  user: one(users, {
    fields: [roles.userId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [roles.createdBy],
    references: [users.id],
  }),
}));

// =============================================================================
// Classroom Relations
// =============================================================================

export const classroomsRelations = relations(classrooms, ({ many }) => ({
  machines: many(machines),
  schedules: many(schedules),
}));

// =============================================================================
// Machine Relations
// =============================================================================

export const machinesRelations = relations(machines, ({ one }) => ({
  classroom: one(classrooms, {
    fields: [machines.classroomId],
    references: [classrooms.id],
  }),
}));

// =============================================================================
// Schedule Relations
// =============================================================================

export const schedulesRelations = relations(schedules, ({ one }) => ({
  classroom: one(classrooms, {
    fields: [schedules.classroomId],
    references: [classrooms.id],
  }),
  teacher: one(users, {
    fields: [schedules.teacherId],
    references: [users.id],
  }),
}));

// =============================================================================
// Token Relations
// =============================================================================

export const tokensRelations = relations(tokens, ({ one }) => ({
  user: one(users, {
    fields: [tokens.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));
