/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Tests for classroom status calculation based on machine health
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  CLASSROOM_MACHINE_ONLINE_THRESHOLD_MINUTES,
  CLASSROOM_MACHINE_STALE_THRESHOLD_MINUTES,
  calculateClassroomMachineStatus,
  calculateClassroomStatus,
  type ClassroomMachineStatus,
} from '@openpath/shared';

interface TestMachine {
  status: ClassroomMachineStatus;
}

void describe('Machine Status Calculation', () => {
  void test('should return offline for null lastSeen', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const status = calculateClassroomMachineStatus(null, now);
    assert.strictEqual(status, 'offline');
  });

  void test('should return online for machine seen within 5 minutes', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const lastSeen = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago
    const status = calculateClassroomMachineStatus(lastSeen, now);
    assert.strictEqual(status, 'online');
  });

  void test('should return online for machine seen exactly 5 minutes ago', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const lastSeen = new Date(
      now.getTime() - CLASSROOM_MACHINE_ONLINE_THRESHOLD_MINUTES * 60 * 1000
    );
    const status = calculateClassroomMachineStatus(lastSeen, now);
    assert.strictEqual(status, 'online');
  });

  void test('should return stale for machine seen 6 minutes ago', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const lastSeen = new Date(
      now.getTime() - (CLASSROOM_MACHINE_ONLINE_THRESHOLD_MINUTES + 1) * 60 * 1000
    );
    const status = calculateClassroomMachineStatus(lastSeen, now);
    assert.strictEqual(status, 'stale');
  });

  void test('should return stale for machine seen 10 minutes ago', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const lastSeen = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
    const status = calculateClassroomMachineStatus(lastSeen, now);
    assert.strictEqual(status, 'stale');
  });

  void test('should return stale for machine seen exactly 15 minutes ago', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const lastSeen = new Date(
      now.getTime() - CLASSROOM_MACHINE_STALE_THRESHOLD_MINUTES * 60 * 1000
    );
    const status = calculateClassroomMachineStatus(lastSeen, now);
    assert.strictEqual(status, 'stale');
  });

  void test('should return offline for machine seen 16 minutes ago', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const lastSeen = new Date(
      now.getTime() - (CLASSROOM_MACHINE_STALE_THRESHOLD_MINUTES + 1) * 60 * 1000
    );
    const status = calculateClassroomMachineStatus(lastSeen, now);
    assert.strictEqual(status, 'offline');
  });

  void test('should return offline for machine seen 1 hour ago', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const lastSeen = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
    const status = calculateClassroomMachineStatus(lastSeen, now);
    assert.strictEqual(status, 'offline');
  });

  void test('should return online for machine seen just now', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const status = calculateClassroomMachineStatus(now, now);
    assert.strictEqual(status, 'online');
  });
});

void describe('Classroom Status Calculation', () => {
  void test('should return operational for classroom with no machines', () => {
    const status = calculateClassroomStatus([]);
    assert.strictEqual(status, 'operational');
  });

  void test('should return operational when all machines are online', () => {
    const machines: TestMachine[] = [
      { status: 'online' },
      { status: 'online' },
      { status: 'online' },
    ];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'operational');
  });

  void test('should return offline when all machines are offline', () => {
    const machines: TestMachine[] = [{ status: 'offline' }, { status: 'offline' }];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'offline');
  });

  void test('should return degraded when some machines are online and some offline', () => {
    const machines: TestMachine[] = [{ status: 'online' }, { status: 'offline' }];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'degraded');
  });

  void test('should return degraded when some machines are stale', () => {
    const machines: TestMachine[] = [{ status: 'online' }, { status: 'stale' }];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'degraded');
  });

  void test('should return degraded when all machines are stale', () => {
    const machines: TestMachine[] = [{ status: 'stale' }, { status: 'stale' }];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'degraded');
  });

  void test('should return operational for single online machine', () => {
    const machines: TestMachine[] = [{ status: 'online' }];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'operational');
  });

  void test('should return offline for single offline machine', () => {
    const machines: TestMachine[] = [{ status: 'offline' }];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'offline');
  });
});
