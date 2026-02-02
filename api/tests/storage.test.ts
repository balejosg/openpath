import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import * as storage from '../src/lib/storage.js';
import * as userStorage from '../src/lib/user-storage.js';
import * as classroomStorage from '../src/lib/classroom-storage.js';
import * as scheduleStorage from '../src/lib/schedule-storage.js';

void describe('Storage Layer', () => {
  const randomSuffix = (): string => crypto.randomBytes(4).toString('hex');

  void describe('User Storage', () => {
    void it('should normalize email on creation', async () => {
      const email = ` TEST-${randomSuffix()}@Example.com `;
      const userData = {
        email,
        name: 'Test User',
        password: 'password123',
      };
      const user = await userStorage.createUser(userData);
      assert.strictEqual(user.email, email.toLowerCase().trim());
    });

    void it('should find user by email (case-insensitive)', async () => {
      const email = `test-${randomSuffix()}@example.com`;
      await userStorage.createUser({
        email,
        name: 'Test User',
        password: 'password123',
      });
      const user = await userStorage.getUserByEmail(email.toUpperCase());
      assert.ok(user);
      assert.strictEqual(user.email, email);
    });
  });

  void describe('Request Storage', () => {
    void it('should normalize domain on creation', async () => {
      const domain = ` GOOGLE-${randomSuffix()}.com `;
      const requestData = {
        domain,
        requesterEmail: 'user@example.com',
        groupId: 'default',
      };
      const request = await storage.createRequest(requestData);
      assert.strictEqual(request.domain, domain.toLowerCase().trim());
    });
  });

  void describe('Classroom Storage', () => {
    void it('should generate slug from name', async () => {
      const name = `Aula de Informática ${randomSuffix()}`;
      const room = await classroomStorage.createClassroom({
        name,
      });
      const expectedSlug = name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      assert.strictEqual(room.name, expectedSlug);
    });
  });

  void describe('Schedule Storage', () => {
    void it('should correctly detect overlapping times', () => {
      // Overlapping
      assert.strictEqual(scheduleStorage.timesOverlap('08:00', '10:00', '09:00', '11:00'), true);
      assert.strictEqual(scheduleStorage.timesOverlap('08:00', '10:00', '08:30', '09:30'), true);
      // Non-overlapping
      assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '09:00', '10:00'), false);
      assert.strictEqual(scheduleStorage.timesOverlap('08:00', '09:00', '10:00', '11:00'), false);
    });

    void it('should convert time to minutes', () => {
      assert.strictEqual(scheduleStorage.timeToMinutes('01:30'), 90);
      assert.strictEqual(scheduleStorage.timeToMinutes('00:00'), 0);
      assert.strictEqual(scheduleStorage.timeToMinutes('23:59'), 1439);
    });
  });
});
