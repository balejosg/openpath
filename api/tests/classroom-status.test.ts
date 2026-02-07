/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Tests for classroom status calculation based on machine health
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// Import the service functions we need to test
// We'll test the logic by simulating the calculations

// Thresholds (must match classroom.service.ts)
const ONLINE_THRESHOLD_MINUTES = 5;
const STALE_THRESHOLD_MINUTES = 15;

type MachineStatus = 'online' | 'stale' | 'offline';
type ClassroomStatus = 'operational' | 'degraded' | 'offline';

interface MachineInfo {
  hostname: string;
  lastSeen: string | null;
  status: MachineStatus;
}

/**
 * Calculate machine status based on lastSeen timestamp
 */
function calculateMachineStatus(lastSeen: Date | null): MachineStatus {
  if (!lastSeen) return 'offline';

  const now = new Date();
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  if (diffMinutes <= ONLINE_THRESHOLD_MINUTES) return 'online';
  if (diffMinutes <= STALE_THRESHOLD_MINUTES) return 'stale';
  return 'offline';
}

/**
 * Calculate classroom status based on machine statuses
 */
function calculateClassroomStatus(machines: MachineInfo[]): ClassroomStatus {
  if (machines.length === 0) return 'operational';

  const onlineCount = machines.filter((m) => m.status === 'online').length;
  const offlineCount = machines.filter((m) => m.status === 'offline').length;

  if (onlineCount === machines.length) return 'operational';
  if (offlineCount === machines.length) return 'offline';
  return 'degraded';
}

void describe('Machine Status Calculation', () => {
  void test('should return offline for null lastSeen', () => {
    const status = calculateMachineStatus(null);
    assert.strictEqual(status, 'offline');
  });

  void test('should return online for machine seen within 5 minutes', () => {
    const now = new Date();
    const lastSeen = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago
    const status = calculateMachineStatus(lastSeen);
    assert.strictEqual(status, 'online');
  });

  void test('should return online for machine seen exactly 5 minutes ago', () => {
    const now = new Date();
    const lastSeen = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
    const status = calculateMachineStatus(lastSeen);
    assert.strictEqual(status, 'online');
  });

  void test('should return stale for machine seen 6 minutes ago', () => {
    const now = new Date();
    const lastSeen = new Date(now.getTime() - 6 * 60 * 1000); // 6 minutes ago
    const status = calculateMachineStatus(lastSeen);
    assert.strictEqual(status, 'stale');
  });

  void test('should return stale for machine seen 10 minutes ago', () => {
    const now = new Date();
    const lastSeen = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
    const status = calculateMachineStatus(lastSeen);
    assert.strictEqual(status, 'stale');
  });

  void test('should return stale for machine seen exactly 15 minutes ago', () => {
    const now = new Date();
    const lastSeen = new Date(now.getTime() - 15 * 60 * 1000); // 15 minutes ago
    const status = calculateMachineStatus(lastSeen);
    assert.strictEqual(status, 'stale');
  });

  void test('should return offline for machine seen 16 minutes ago', () => {
    const now = new Date();
    const lastSeen = new Date(now.getTime() - 16 * 60 * 1000); // 16 minutes ago
    const status = calculateMachineStatus(lastSeen);
    assert.strictEqual(status, 'offline');
  });

  void test('should return offline for machine seen 1 hour ago', () => {
    const now = new Date();
    const lastSeen = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
    const status = calculateMachineStatus(lastSeen);
    assert.strictEqual(status, 'offline');
  });

  void test('should return online for machine seen just now', () => {
    const status = calculateMachineStatus(new Date());
    assert.strictEqual(status, 'online');
  });
});

void describe('Classroom Status Calculation', () => {
  void test('should return operational for classroom with no machines', () => {
    const status = calculateClassroomStatus([]);
    assert.strictEqual(status, 'operational');
  });

  void test('should return operational when all machines are online', () => {
    const machines: MachineInfo[] = [
      { hostname: 'pc1', lastSeen: new Date().toISOString(), status: 'online' },
      { hostname: 'pc2', lastSeen: new Date().toISOString(), status: 'online' },
      { hostname: 'pc3', lastSeen: new Date().toISOString(), status: 'online' },
    ];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'operational');
  });

  void test('should return offline when all machines are offline', () => {
    const machines: MachineInfo[] = [
      { hostname: 'pc1', lastSeen: null, status: 'offline' },
      { hostname: 'pc2', lastSeen: null, status: 'offline' },
    ];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'offline');
  });

  void test('should return degraded when some machines are online and some offline', () => {
    const machines: MachineInfo[] = [
      { hostname: 'pc1', lastSeen: new Date().toISOString(), status: 'online' },
      { hostname: 'pc2', lastSeen: null, status: 'offline' },
    ];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'degraded');
  });

  void test('should return degraded when some machines are stale', () => {
    const machines: MachineInfo[] = [
      { hostname: 'pc1', lastSeen: new Date().toISOString(), status: 'online' },
      { hostname: 'pc2', lastSeen: new Date().toISOString(), status: 'stale' },
    ];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'degraded');
  });

  void test('should return degraded when all machines are stale', () => {
    const machines: MachineInfo[] = [
      { hostname: 'pc1', lastSeen: new Date().toISOString(), status: 'stale' },
      { hostname: 'pc2', lastSeen: new Date().toISOString(), status: 'stale' },
    ];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'degraded');
  });

  void test('should return operational for single online machine', () => {
    const machines: MachineInfo[] = [
      { hostname: 'pc1', lastSeen: new Date().toISOString(), status: 'online' },
    ];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'operational');
  });

  void test('should return offline for single offline machine', () => {
    const machines: MachineInfo[] = [{ hostname: 'pc1', lastSeen: null, status: 'offline' }];
    const status = calculateClassroomStatus(machines);
    assert.strictEqual(status, 'offline');
  });
});
