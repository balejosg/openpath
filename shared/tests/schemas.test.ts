/* eslint-disable @typescript-eslint/no-floating-promises */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  DomainSchema,
  RequestStatus,
  RequestPriority,
  UserRole,
  MachineStatus,
  HealthStatus,
  DomainRequest,
  User,
  SafeUser,
  RoleInfo,
  Role,
  Classroom,
  Machine,
  Schedule,
  HealthReport,
  PushSubscription,
  CreateRequestDTO,
  CreateUserDTO,
  LoginDTO,
  CreateClassroomDTO,
  CreateScheduleDTO,
  CreatePushSubscriptionDTO,
  UpdateRequestStatusDTO,
} from '../src/schemas/index.js';

// =============================================================================
// Enum Schema Tests
// =============================================================================

describe('Enum Schemas', () => {
  describe('RequestStatus', () => {
    it('accepts valid values', () => {
      assert.doesNotThrow(() => RequestStatus.parse('pending'));
      assert.doesNotThrow(() => RequestStatus.parse('approved'));
      assert.doesNotThrow(() => RequestStatus.parse('rejected'));
    });

    it('rejects invalid values', () => {
      assert.throws(() => RequestStatus.parse('invalid'));
      assert.throws(() => RequestStatus.parse(''));
      assert.throws(() => RequestStatus.parse(null));
    });
  });

  describe('RequestPriority', () => {
    it('accepts valid values', () => {
      assert.doesNotThrow(() => RequestPriority.parse('low'));
      assert.doesNotThrow(() => RequestPriority.parse('normal'));
      assert.doesNotThrow(() => RequestPriority.parse('high'));
      assert.doesNotThrow(() => RequestPriority.parse('urgent'));
    });

    it('rejects invalid values', () => {
      assert.throws(() => RequestPriority.parse('critical'));
      assert.throws(() => RequestPriority.parse('medium'));
    });
  });

  describe('UserRole', () => {
    it('accepts valid values', () => {
      assert.doesNotThrow(() => UserRole.parse('admin'));
      assert.doesNotThrow(() => UserRole.parse('teacher'));
      assert.doesNotThrow(() => UserRole.parse('student'));
    });

    it('rejects invalid values', () => {
      assert.throws(() => UserRole.parse('superadmin'));
      assert.throws(() => UserRole.parse('guest'));
    });
  });

  describe('MachineStatus', () => {
    it('accepts valid values', () => {
      assert.doesNotThrow(() => MachineStatus.parse('online'));
      assert.doesNotThrow(() => MachineStatus.parse('offline'));
      assert.doesNotThrow(() => MachineStatus.parse('unknown'));
    });

    it('rejects invalid values', () => {
      assert.throws(() => MachineStatus.parse('maintenance'));
    });
  });

  describe('HealthStatus', () => {
    it('matches shared contract fixture', () => {
      const fixturePath = new URL('../../tests/contracts/health-statuses.txt', import.meta.url);
      const expected = readFileSync(fixturePath, 'utf8')
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

      assert.deepStrictEqual(HealthStatus.options, expected);
    });

    it('accepts valid values', () => {
      assert.doesNotThrow(() => HealthStatus.parse('HEALTHY'));
      assert.doesNotThrow(() => HealthStatus.parse('DEGRADED'));
      assert.doesNotThrow(() => HealthStatus.parse('CRITICAL'));
      assert.doesNotThrow(() => HealthStatus.parse('FAIL_OPEN'));
      assert.doesNotThrow(() => HealthStatus.parse('STALE_FAILSAFE'));
      assert.doesNotThrow(() => HealthStatus.parse('TAMPERED'));
    });

    it('rejects invalid values', () => {
      assert.throws(() => HealthStatus.parse('healthy'));
      assert.throws(() => HealthStatus.parse('warning'));
      assert.throws(() => HealthStatus.parse('OK'));
      assert.throws(() => HealthStatus.parse('FAILED'));
    });
  });
});

// =============================================================================
// DomainSchema Tests
// =============================================================================

describe('DomainSchema', () => {
  it('accepts valid domains', () => {
    const valid = [
      'google.com',
      'sub.domain.co.uk',
      '*.example.com',
      'a-b.test.org',
      'test.io',
      'www.example.com',
      'api.v2.example.org',
    ];
    valid.forEach((d) => {
      assert.doesNotThrow(() => DomainSchema.parse(d), `Should accept: ${d}`);
    });
  });

  it('rejects invalid domains', () => {
    const invalid = [
      '',
      'a', // Too short
      'ab', // Too short
      'abc', // Too short (min 4)
      '-invalid.com', // Starts with hyphen
      'double..dots.com', // Consecutive dots
      '.startdot.com', // Starts with dot
    ];
    invalid.forEach((d) => {
      assert.throws(() => DomainSchema.parse(d), `Should reject: ${d}`);
    });
  });

  it('accepts wildcard domains', () => {
    assert.doesNotThrow(() => DomainSchema.parse('*.example.com'));
    assert.doesNotThrow(() => DomainSchema.parse('*.sub.domain.org'));
  });

  it('enforces max length (253 chars)', () => {
    const longDomain = 'a'.repeat(250) + '.com';
    assert.throws(() => DomainSchema.parse(longDomain));
  });

  it('enforces label max length (63 chars)', () => {
    const longLabel = 'a'.repeat(64) + '.com';
    assert.throws(() => DomainSchema.parse(longLabel));
  });

  it('accepts labels up to 63 chars', () => {
    const maxLabel = 'a'.repeat(63) + '.com';
    assert.doesNotThrow(() => DomainSchema.parse(maxLabel));
  });
});

// =============================================================================
// Entity Schema Tests
// =============================================================================

describe('Entity Schemas', () => {
  describe('DomainRequest', () => {
    it('validates complete request object', () => {
      const validRequest = {
        id: 'req-123',
        domain: 'example.com',
        reason: 'For testing',
        requesterEmail: 'test@example.com',
        groupId: 'group-1',
        priority: 'normal',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        resolvedAt: null,
        resolvedBy: null,
      };
      assert.doesNotThrow(() => DomainRequest.parse(validRequest));
    });

    it('allows optional resolutionNote', () => {
      const request = {
        id: 'req-123',
        domain: 'example.com',
        reason: 'For testing',
        requesterEmail: 'test@example.com',
        groupId: 'group-1',
        priority: 'normal',
        status: 'approved',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        resolvedAt: '2025-01-02T00:00:00Z',
        resolvedBy: 'admin-1',
        resolutionNote: 'Approved for educational purposes',
      };
      assert.doesNotThrow(() => DomainRequest.parse(request));
    });

    it('rejects invalid priority', () => {
      const invalidRequest = {
        id: 'req-123',
        domain: 'example.com',
        reason: 'For testing',
        requesterEmail: 'test@example.com',
        groupId: 'group-1',
        priority: 'invalid',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        resolvedAt: null,
        resolvedBy: null,
      };
      assert.throws(() => DomainRequest.parse(invalidRequest));
    });
  });

  describe('User', () => {
    it('validates complete user object', () => {
      const validUser = {
        id: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        passwordHash: 'hashed_password',
        isActive: true,
        emailVerified: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      assert.doesNotThrow(() => User.parse(validUser));
    });

    it('validates user without optional fields', () => {
      const minimalUser = {
        id: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      assert.doesNotThrow(() => User.parse(minimalUser));
    });

    it('rejects invalid email', () => {
      const invalidUser = {
        id: 'user-123',
        email: 'invalid-email',
        name: 'Test User',
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      assert.throws(() => User.parse(invalidUser));
    });
  });

  describe('SafeUser', () => {
    it('omits passwordHash from User', () => {
      const safeUser = {
        id: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      const parsed = SafeUser.parse(safeUser);
      assert.strictEqual('passwordHash' in parsed, false);
    });
  });

  describe('RoleInfo', () => {
    it('validates role info', () => {
      const roleInfo = {
        role: 'teacher',
        groupIds: ['group-1', 'group-2'],
      };
      assert.doesNotThrow(() => RoleInfo.parse(roleInfo));
    });

    it('allows empty groupIds', () => {
      const roleInfo = {
        role: 'admin',
        groupIds: [],
      };
      assert.doesNotThrow(() => RoleInfo.parse(roleInfo));
    });
  });

  describe('Role', () => {
    it('validates complete role object', () => {
      const role = {
        id: 'role-123',
        userId: 'user-123',
        role: 'teacher',
        groupIds: ['group-1'],
        createdAt: '2025-01-01T00:00:00Z',
        expiresAt: '2025-12-31T23:59:59Z',
      };
      assert.doesNotThrow(() => Role.parse(role));
    });

    it('allows null expiresAt', () => {
      const role = {
        id: 'role-123',
        userId: 'user-123',
        role: 'admin',
        groupIds: [],
        createdAt: '2025-01-01T00:00:00Z',
        expiresAt: null,
      };
      assert.doesNotThrow(() => Role.parse(role));
    });
  });

  describe('Classroom', () => {
    it('validates complete classroom object', () => {
      const classroom = {
        id: 'classroom-123',
        name: 'room-a',
        displayName: 'Room A',
        defaultGroupId: 'group-default',
        activeGroupId: 'group-active',
        currentGroupId: 'group-current',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      assert.doesNotThrow(() => Classroom.parse(classroom));
    });

    it('allows null group IDs', () => {
      const classroom = {
        id: 'classroom-123',
        name: 'room-b',
        displayName: 'Room B',
        defaultGroupId: null,
        activeGroupId: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      assert.doesNotThrow(() => Classroom.parse(classroom));
    });

    it('allows optional machine count', () => {
      const classroom = {
        id: 'classroom-123',
        name: 'room-c',
        displayName: 'Room C',
        defaultGroupId: null,
        activeGroupId: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        machineCount: 25,
      };
      assert.doesNotThrow(() => Classroom.parse(classroom));
    });
  });

  describe('Machine', () => {
    it('validates complete machine object', () => {
      const machine = {
        id: 'machine-123',
        hostname: 'pc-01',
        classroomId: 'classroom-123',
        version: '4.1.0',
        lastSeen: '2025-01-01T12:00:00Z',
        status: 'online',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T12:00:00Z',
      };
      assert.doesNotThrow(() => Machine.parse(machine));
    });

    it('allows null classroomId and lastSeen', () => {
      const machine = {
        id: 'machine-123',
        hostname: 'pc-02',
        classroomId: null,
        lastSeen: null,
        status: 'unknown',
      };
      assert.doesNotThrow(() => Machine.parse(machine));
    });
  });

  describe('Schedule', () => {
    it('validates complete schedule object', () => {
      const schedule = {
        id: 'schedule-123',
        classroomId: 'classroom-123',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:30',
        groupId: 'group-1',
        teacherId: 'teacher-1',
        recurrence: 'weekly',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      assert.doesNotThrow(() => Schedule.parse(schedule));
    });

    it('validates dayOfWeek range (1-5)', () => {
      const validDays = [1, 2, 3, 4, 5];
      validDays.forEach((day) => {
        const schedule = {
          id: 'schedule-123',
          classroomId: 'classroom-123',
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '10:30',
          groupId: 'group-1',
          teacherId: 'teacher-1',
          createdAt: '2025-01-01T00:00:00Z',
        };
        assert.doesNotThrow(
          () => Schedule.parse(schedule),
          `Should accept dayOfWeek: ${String(day)}`
        );
      });
    });

    it('rejects invalid dayOfWeek', () => {
      const invalidDays = [0, 6, 7, -1, 100];
      invalidDays.forEach((day) => {
        const schedule = {
          id: 'schedule-123',
          classroomId: 'classroom-123',
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '10:30',
          groupId: 'group-1',
          teacherId: 'teacher-1',
          createdAt: '2025-01-01T00:00:00Z',
        };
        assert.throws(() => Schedule.parse(schedule), `Should reject dayOfWeek: ${String(day)}`);
      });
    });
  });

  describe('HealthReport', () => {
    it('validates complete health report', () => {
      const report = {
        id: 'report-123',
        hostname: 'pc-01',
        status: 'HEALTHY',
        dnsmasqRunning: 1,
        dnsResolving: 1,
        failCount: 0,
        actions: null,
        version: '4.1.0',
        reportedAt: '2025-01-01T12:00:00Z',
      };
      assert.doesNotThrow(() => HealthReport.parse(report));
    });

    it('allows minimal health report', () => {
      const report = {
        id: 'report-123',
        hostname: 'pc-01',
        status: 'DEGRADED',
        reportedAt: '2025-01-01T12:00:00Z',
      };
      assert.doesNotThrow(() => HealthReport.parse(report));
    });
  });

  describe('PushSubscription', () => {
    it('validates complete push subscription', () => {
      const subscription = {
        id: 'sub-123',
        userId: 'user-123',
        groupIds: ['group-1', 'group-2'],
        endpoint: 'https://push.example.com/endpoint',
        p256dh: 'base64encodedkey',
        auth: 'base64encodedauth',
        userAgent: 'Mozilla/5.0',
        createdAt: '2025-01-01T00:00:00Z',
      };
      assert.doesNotThrow(() => PushSubscription.parse(subscription));
    });

    it('allows null userAgent', () => {
      const subscription = {
        id: 'sub-123',
        userId: 'user-123',
        groupIds: [],
        endpoint: 'https://push.example.com/endpoint',
        p256dh: 'base64encodedkey',
        auth: 'base64encodedauth',
        userAgent: null,
        createdAt: '2025-01-01T00:00:00Z',
      };
      assert.doesNotThrow(() => PushSubscription.parse(subscription));
    });
  });
});

// =============================================================================
// DTO Schema Tests
// =============================================================================

describe('DTO Schemas', () => {
  describe('CreateRequestDTO', () => {
    it('accepts minimal valid input', () => {
      assert.doesNotThrow(() => CreateRequestDTO.parse({ domain: 'example.com' }));
    });

    it('accepts full valid input', () => {
      const full = {
        domain: 'example.com',
        reason: 'Need for research',
        requesterEmail: 'user@school.edu',
        groupId: 'class-a',
        priority: 'high',
      };
      assert.doesNotThrow(() => CreateRequestDTO.parse(full));
    });

    it('rejects invalid email', () => {
      assert.throws(() =>
        CreateRequestDTO.parse({
          domain: 'example.com',
          requesterEmail: 'not-an-email',
        })
      );
    });

    it('rejects invalid domain', () => {
      assert.throws(() =>
        CreateRequestDTO.parse({
          domain: 'bad',
        })
      );
    });

    it('validates priority when provided', () => {
      assert.throws(() =>
        CreateRequestDTO.parse({
          domain: 'example.com',
          priority: 'invalid',
        })
      );
    });
  });

  describe('UpdateRequestStatusDTO', () => {
    it('accepts approved status', () => {
      assert.doesNotThrow(() =>
        UpdateRequestStatusDTO.parse({
          status: 'approved',
        })
      );
    });

    it('accepts rejected status with note', () => {
      const dto = {
        status: 'rejected',
        note: 'Domain not appropriate for educational use',
      };
      assert.doesNotThrow(() => UpdateRequestStatusDTO.parse(dto));
    });

    it('rejects pending status', () => {
      assert.throws(() =>
        UpdateRequestStatusDTO.parse({
          status: 'pending',
        })
      );
    });
  });

  describe('CreateUserDTO', () => {
    it('validates password minimum length (8 chars)', () => {
      assert.throws(() =>
        CreateUserDTO.parse({
          email: 'test@example.com',
          name: 'Test User',
          password: 'short',
        })
      );
    });

    it('validates password maximum length (128 chars)', () => {
      assert.throws(() =>
        CreateUserDTO.parse({
          email: 'test@example.com',
          name: 'Test User',
          password: 'a'.repeat(129),
        })
      );
    });

    it('accepts valid user creation data', () => {
      const dto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Securepassword123',
      };
      assert.doesNotThrow(() => CreateUserDTO.parse(dto));
    });

    it('requires non-empty name', () => {
      assert.throws(() =>
        CreateUserDTO.parse({
          email: 'test@example.com',
          name: '',
          password: 'Securepassword123',
        })
      );
    });

    it('rejects invalid email', () => {
      assert.throws(() =>
        CreateUserDTO.parse({
          email: 'invalid',
          name: 'Test User',
          password: 'Securepassword123',
        })
      );
    });
  });

  describe('LoginDTO', () => {
    it('requires valid email and password', () => {
      assert.doesNotThrow(() =>
        LoginDTO.parse({
          email: 'user@example.com',
          password: 'password123',
        })
      );
    });

    it('rejects short password', () => {
      assert.throws(() =>
        LoginDTO.parse({
          email: 'user@example.com',
          password: 'short',
        })
      );
    });

    it('rejects invalid email', () => {
      assert.throws(() =>
        LoginDTO.parse({
          email: 'not-email',
          password: 'password123',
        })
      );
    });
  });

  describe('CreateClassroomDTO', () => {
    it('accepts minimal classroom data', () => {
      assert.doesNotThrow(() =>
        CreateClassroomDTO.parse({
          name: 'room-a',
        })
      );
    });

    it('accepts full classroom data', () => {
      assert.doesNotThrow(() =>
        CreateClassroomDTO.parse({
          name: 'room-a',
          displayName: 'Room A - Computer Lab',
        })
      );
    });

    it('requires non-empty name', () => {
      assert.throws(() =>
        CreateClassroomDTO.parse({
          name: '',
        })
      );
    });
  });

  describe('CreateScheduleDTO', () => {
    it('accepts valid schedule data', () => {
      const dto = {
        classroomId: 'classroom-123',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '10:30',
        groupId: 'group-1',
        teacherId: 'teacher-1',
      };
      assert.doesNotThrow(() => CreateScheduleDTO.parse(dto));
    });

    it('accepts optional recurrence', () => {
      const dto = {
        classroomId: 'classroom-123',
        dayOfWeek: 3,
        startTime: '14:00',
        endTime: '15:30',
        groupId: 'group-2',
        teacherId: 'teacher-2',
        recurrence: 'biweekly',
      };
      assert.doesNotThrow(() => CreateScheduleDTO.parse(dto));
    });

    it('validates dayOfWeek range', () => {
      assert.throws(() =>
        CreateScheduleDTO.parse({
          classroomId: 'classroom-123',
          dayOfWeek: 0,
          startTime: '09:00',
          endTime: '10:30',
          groupId: 'group-1',
          teacherId: 'teacher-1',
        })
      );
      assert.throws(() =>
        CreateScheduleDTO.parse({
          classroomId: 'classroom-123',
          dayOfWeek: 6,
          startTime: '09:00',
          endTime: '10:30',
          groupId: 'group-1',
          teacherId: 'teacher-1',
        })
      );
    });
  });

  describe('CreatePushSubscriptionDTO', () => {
    it('accepts valid push subscription data', () => {
      const dto = {
        endpoint: 'https://push.example.com/endpoint/abc123',
        keys: {
          p256dh:
            'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-T1asjH1QQiLmsIFlmTMD',
          auth: 'tBHItJI5svbpez7KI4CCXg',
        },
      };
      assert.doesNotThrow(() => CreatePushSubscriptionDTO.parse(dto));
    });

    it('accepts optional userAgent', () => {
      const dto = {
        endpoint: 'https://push.example.com/endpoint/abc123',
        keys: {
          p256dh:
            'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-T1asjH1QQiLmsIFlmTMD',
          auth: 'tBHItJI5svbpez7KI4CCXg',
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/115.0',
      };
      assert.doesNotThrow(() => CreatePushSubscriptionDTO.parse(dto));
    });

    it('requires keys object', () => {
      assert.throws(() =>
        CreatePushSubscriptionDTO.parse({
          endpoint: 'https://push.example.com/endpoint/abc123',
        })
      );
    });

    it('requires p256dh and auth in keys', () => {
      assert.throws(() =>
        CreatePushSubscriptionDTO.parse({
          endpoint: 'https://push.example.com/endpoint/abc123',
          keys: {
            p256dh:
              'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-T1asjH1QQiLmsIFlmTMD',
          },
        })
      );
      assert.throws(() =>
        CreatePushSubscriptionDTO.parse({
          endpoint: 'https://push.example.com/endpoint/abc123',
          keys: {
            auth: 'tBHItJI5svbpez7KI4CCXg',
          },
        })
      );
    });
  });
});
