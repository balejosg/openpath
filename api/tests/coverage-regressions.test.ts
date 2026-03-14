import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import * as classroomStorage from '../src/lib/classroom-storage.js';
import * as groupsStorage from '../src/lib/groups-storage.js';
import * as roleStorage from '../src/lib/role-storage.js';
import * as scheduleStorage from '../src/lib/schedule-storage.js';
import * as settingsStorage from '../src/lib/settings-storage.js';
import * as storage from '../src/lib/storage.js';
import * as userStorage from '../src/lib/user-storage.js';
import {
  bearerAuth,
  bootstrapAdminSession,
  ensureTestSchema,
  getAvailablePort,
  parseTRPC,
  resetDb,
  trpcMutate,
  uniqueDomain,
  uniqueEmail,
} from './test-utils.js';

let server: Server | undefined;
let baseUrl = '';

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'coverage-regressions-secret';

  await ensureTestSchema();

  const port = await getAvailablePort();
  baseUrl = `http://localhost:${String(port)}`;

  const { app } = await import('../src/server.js');
  await new Promise<void>((resolve) => {
    server = app.listen(port, () => resolve());
  });
});

after(async () => {
  if (server !== undefined) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

beforeEach(async () => {
  await resetDb();
});

await describe('coverage regressions', async () => {
  await it('covers storage CRUD helpers touched by the merge repair', async () => {
    const classroom = await classroomStorage.createClassroom({ name: 'Coverage Room A' });
    assert.ok(classroomStorage.buildMachineKey(classroom.id, 'Lab Host 01').includes('--'));
    assert.strictEqual(
      classroomStorage.machineHostnameMatches(
        { hostname: 'coverage-room-a-01', reportedHostname: 'Coverage-Room-A-01' },
        'coverage-room-a-01'
      ),
      true
    );
    assert.ok((await classroomStorage.getAllClassrooms()).length >= 1);
    assert.strictEqual((await classroomStorage.getClassroomById(classroom.id))?.id, classroom.id);
    assert.strictEqual(
      (await classroomStorage.getClassroomByName(classroom.name))?.displayName,
      classroom.displayName
    );
    assert.strictEqual(
      (
        await classroomStorage.updateClassroom(classroom.id, {
          displayName: 'Coverage Room A Updated',
          defaultGroupId: 'default',
        })
      )?.displayName,
      'Coverage Room A Updated'
    );
    assert.strictEqual(await classroomStorage.getCurrentGroupId(classroom.id), 'default');
    const machinesRemovedBefore = await classroomStorage.removeMachinesByClassroom(classroom.id);
    assert.strictEqual(machinesRemovedBefore, 0);

    const machine = await classroomStorage.registerMachine({
      hostname: 'coverage-room-a-01',
      classroomId: classroom.id,
      version: '1.0.0',
    });
    assert.strictEqual(machine.hostname, 'coverage-room-a-01');
    assert.ok((await classroomStorage.getAllMachines()).length >= 1);
    assert.strictEqual((await classroomStorage.getAllMachines(classroom.id)).length, 1);
    assert.strictEqual((await classroomStorage.getMachineById(machine.id))?.id, machine.id);
    assert.strictEqual(
      (await classroomStorage.getMachinesByClassroom(classroom.id)).some(
        (entry) => entry.id === machine.id
      ),
      true
    );
    assert.strictEqual(
      (await classroomStorage.getMachineOnlyByHostname('coverage-room-a-01'))?.id,
      machine.id
    );
    assert.strictEqual(
      (await classroomStorage.updateMachineLastSeen('coverage-room-a-01'))?.id,
      machine.id
    );
    assert.strictEqual(
      (await classroomStorage.resolveMachineGroupContext('coverage-room-a-01'))?.groupId,
      'default'
    );
    assert.strictEqual(
      (await classroomStorage.resolveMachineEnforcementContext('coverage-room-a-01'))?.groupId,
      'default'
    );
    assert.strictEqual(
      (await classroomStorage.resolveClassroomGroupContext(classroom.id))?.groupId,
      'default'
    );
    await classroomStorage.setMachineDownloadTokenHash(machine.id, 'coverage-download-token-hash');
    assert.strictEqual(
      (await classroomStorage.getMachineByDownloadTokenHash('coverage-download-token-hash'))?.id,
      machine.id
    );
    assert.strictEqual((await classroomStorage.getMachineTokenStatus(machine.id))?.hasToken, true);
    assert.strictEqual(
      (await classroomStorage.getWhitelistUrlForMachine('coverage-room-a-01'))?.groupId,
      'default'
    );
    assert.ok((await classroomStorage.getStats()).classrooms >= 1);
    assert.strictEqual(await classroomStorage.deleteMachine('coverage-room-a-01'), true);

    const machineRoom = await classroomStorage.createClassroom({ name: 'Coverage Room B' });
    await classroomStorage.registerMachine({
      hostname: 'coverage-room-b-01',
      classroomId: machineRoom.id,
      version: '1.0.0',
    });
    await classroomStorage.registerMachine({
      hostname: 'coverage-room-b-02',
      classroomId: machineRoom.id,
      version: '1.0.0',
    });
    assert.strictEqual(await classroomStorage.removeMachinesByClassroom(machineRoom.id), 2);
    assert.strictEqual(await classroomStorage.deleteClassroom(machineRoom.id), true);

    const groupId = await groupsStorage.createGroup('coverage-group', 'Coverage Group');
    assert.ok((await groupsStorage.getAllGroups()).some((group) => group.id === groupId));
    const groupById = await groupsStorage.getGroupById(groupId);
    assert.strictEqual(groupById?.name, 'coverage-group');
    const groupByName = await groupsStorage.getGroupByName('coverage-group');
    assert.strictEqual(groupByName?.id, groupId);
    await groupsStorage.updateGroup(groupId, 'Coverage Group Updated', true, 'private');
    assert.strictEqual(
      (await groupsStorage.getGroupById(groupId))?.displayName,
      'Coverage Group Updated'
    );

    const createdRule = await groupsStorage.createRule(groupId, 'whitelist', 'example.com');
    assert.strictEqual(createdRule.success, true);
    assert.ok(createdRule.id);
    assert.strictEqual(
      (await groupsStorage.getRuleById(createdRule.id as string))?.value,
      'example.com'
    );
    assert.strictEqual(await groupsStorage.deleteRule(createdRule.id as string), true);

    await groupsStorage.bulkCreateRules(groupId, 'whitelist', ['a.example.com', 'b.example.com']);
    const rules = await groupsStorage.getRulesByGroup(groupId, 'whitelist');
    assert.strictEqual(rules.length, 2);
    assert.strictEqual((await groupsStorage.getRulesByIds(rules.map((rule) => rule.id))).length, 2);
    assert.strictEqual(
      (await groupsStorage.getRulesByGroupPaginated({ groupId, limit: 10, offset: 0 })).rules
        .length,
      2
    );
    assert.strictEqual(
      (await groupsStorage.getRulesByGroupGrouped({ groupId, limit: 10, offset: 0 })).groups.length,
      1
    );
    assert.strictEqual(
      (await groupsStorage.updateRule({ id: rules[0]?.id ?? '', value: 'updated.example.com' }))
        ?.value,
      'updated.example.com'
    );
    assert.ok((await groupsStorage.getStats()).groupCount >= 1);
    assert.ok((await groupsStorage.getSystemStatus()).totalGroups >= 1);
    assert.strictEqual((await groupsStorage.toggleSystemStatus(false)).enabled, false);
    assert.strictEqual(await groupsStorage.bulkDeleteRules(rules.map((rule) => rule.id)), 2);
    assert.strictEqual(await groupsStorage.deleteGroup(groupId), true);

    const request = await storage.createRequest({
      domain: uniqueDomain('coverage-storage'),
      requesterEmail: uniqueEmail('coverage-storage'),
      groupId: 'default',
    });
    assert.ok((await storage.getRequestById(request.id)) !== null);
    assert.strictEqual((await storage.getAllRequests()).length > 0, true);
    assert.strictEqual((await storage.getRequestsByGroup('default')).length > 0, true);
    assert.strictEqual(await storage.deleteRequest(request.id), true);

    await settingsStorage.setSetting('coverage-flag', 'enabled');
    assert.strictEqual(await settingsStorage.getSetting('coverage-flag'), 'enabled');
    assert.deepStrictEqual(await settingsStorage.getSettings(['coverage-flag']), {
      'coverage-flag': 'enabled',
    });
    assert.strictEqual((await settingsStorage.getBackupInfo()).lastBackupAt, null);
    assert.strictEqual(await settingsStorage.recordBackup('success', 1234), true);
    assert.strictEqual((await settingsStorage.getBackupInfo()).lastBackupStatus, 'success');
    assert.strictEqual(await settingsStorage.deleteSetting('coverage-flag'), true);

    const firstUser = await userStorage.createUser({
      email: uniqueEmail('role-user-1'),
      name: 'Role User One',
      password: 'Password123!',
    });
    const secondUser = await userStorage.createUser({
      email: uniqueEmail('role-user-2'),
      name: 'Role User Two',
      password: 'Password123!',
    });

    const firstRole = await roleStorage.assignRole({
      userId: firstUser.id,
      role: 'teacher',
      groupIds: [groupId],
      createdBy: 'legacy_admin',
    });
    assert.strictEqual((await roleStorage.getUserRoles(firstUser.id)).length, 1);
    assert.ok((await roleStorage.getUsersByRole('teacher')).length >= 1);
    assert.ok((await roleStorage.getAllTeachers()).length >= 1);
    assert.strictEqual(await roleStorage.hasAnyAdmins(), false);
    assert.strictEqual(await roleStorage.hasRole(firstUser.id, 'teacher'), true);
    assert.strictEqual(await roleStorage.isAdmin(firstUser.id), false);
    assert.strictEqual(await roleStorage.canApproveForGroup(firstUser.id, groupId), true);
    assert.deepStrictEqual(await roleStorage.getApprovalGroups(firstUser.id), [groupId]);
    const expandedRole = await roleStorage.addGroupsToRole(firstRole.id, ['group-b']);
    assert.deepStrictEqual(expandedRole?.groupIds.sort(), [groupId, 'group-b']);
    const trimmedRole = await roleStorage.removeGroupsFromRole(firstRole.id, [groupId]);
    assert.deepStrictEqual(trimmedRole?.groupIds, ['group-b']);
    assert.strictEqual((await roleStorage.getRolesByUser(firstUser.id)).length, 1);
    assert.strictEqual((await roleStorage.getRoleById(firstRole.id))?.id, firstRole.id);
    assert.deepStrictEqual(
      (await roleStorage.updateRole(firstRole.id, { groupIds: ['group-c'], role: 'teacher' }))
        ?.groupIds,
      ['group-c']
    );
    assert.strictEqual(await roleStorage.removeGroupFromAllRoles('group-c'), 1);
    assert.ok((await roleStorage.getStats()).total >= 1);
    assert.strictEqual(await roleStorage.revokeRole(firstRole.id), true);

    await roleStorage.assignRole({
      userId: secondUser.id,
      role: 'admin',
      groupIds: ['group-z'],
      createdBy: 'legacy_admin',
    });
    assert.strictEqual((await roleStorage.getAllAdmins()).length, 1);
    assert.strictEqual(await roleStorage.hasAnyAdmins(), true);
    assert.strictEqual(await roleStorage.isAdmin(secondUser.id), true);
    assert.strictEqual(await roleStorage.canApproveForGroup(secondUser.id, 'any-group'), true);
    assert.strictEqual(await roleStorage.getApprovalGroups(secondUser.id), 'all');
    assert.deepStrictEqual(await roleStorage.getUsersWithRole('admin'), [secondUser.id]);
    assert.strictEqual(await roleStorage.revokeAllUserRoles(secondUser.id), 1);
  });

  await it('covers legacy request fallback queries and delete helper paths', async () => {
    const dbModule = await import('../src/db/index.js');
    const originalExecute = dbModule.db.execute.bind(dbModule.db);

    const legacyRow = {
      id: 'req_legacy_1',
      domain: 'legacy.example.com',
      reason: 'Legacy reason',
      requester_email: 'legacy@example.com',
      group_id: 'default',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null,
      resolution_note: '',
    };

    let executeIndex = 0;
    dbModule.db.execute = (async () => {
      executeIndex += 1;
      if (executeIndex === 1) {
        return { rows: [{ has_source: false }] } as never;
      }
      if (executeIndex <= 4) {
        return { rows: [legacyRow] } as never;
      }
      return {
        rows: [{ ...legacyRow, id: 'req_legacy_2', domain: 'created.example.com' }],
      } as never;
    }) as typeof dbModule.db.execute;

    try {
      const tag = `legacy-storage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const rawStorage = await import(`../src/lib/storage.ts?${tag}`);

      assert.strictEqual((await rawStorage.getAllRequests()).length, 1);
      assert.strictEqual((await rawStorage.getRequestsByGroup('default')).length, 1);
      assert.strictEqual((await rawStorage.getRequestById('req_legacy_1'))?.id, 'req_legacy_1');

      const created = await rawStorage.createRequest({
        domain: 'created.example.com',
        requesterEmail: 'created@example.com',
        groupId: 'default',
      });
      assert.strictEqual(created.domain, 'created.example.com');
    } finally {
      dbModule.db.execute = originalExecute;
    }
  });

  await it('covers the changed router validation branches', async () => {
    const { accessToken } = await bootstrapAdminSession(baseUrl, {
      email: uniqueEmail('coverage-admin'),
      password: 'AdminPassword123!',
      name: 'Coverage Admin',
    });

    const invalidRuleResponse = await trpcMutate(
      baseUrl,
      'groups.createRule',
      {
        groupId: 'group-1',
        type: 'blocked_path',
        value: 'not-a-valid-blocked-path',
      },
      bearerAuth(accessToken)
    );
    assert.strictEqual(invalidRuleResponse.status, 400);
    const invalidRulePayload = await parseTRPC(invalidRuleResponse);
    assert.match(invalidRulePayload.error ?? '', /slash|path/i);

    const invalidBulkResponse = await trpcMutate(
      baseUrl,
      'groups.bulkCreateRules',
      {
        groupId: 'group-1',
        type: 'blocked_path',
        values: ['still-not-a-valid-blocked-path'],
      },
      bearerAuth(accessToken)
    );
    assert.strictEqual(invalidBulkResponse.status, 400);

    const invalidExemptionResponse = await trpcMutate(
      baseUrl,
      'classrooms.createExemption',
      {
        machineId: 'machine-1',
        classroomId: 'classroom-1',
        scheduleId: 'not-a-uuid',
      },
      bearerAuth(accessToken)
    );
    assert.strictEqual(invalidExemptionResponse.status, 400);

    const classroom = await classroomStorage.createClassroom({
      name: 'Coverage Router Classroom',
      defaultGroupId: 'default',
    });
    const machine = await classroomStorage.registerMachine({
      hostname: 'coverage-router-machine',
      classroomId: classroom.id,
      version: '1.0.0',
    });
    const startAt = new Date();
    startAt.setMinutes(Math.floor(startAt.getMinutes() / 15) * 15, 0, 0);
    const endAt = new Date(startAt.getTime() + 15 * 60_000);
    const schedule = await scheduleStorage.createOneOffSchedule({
      classroomId: classroom.id,
      teacherId: 'legacy_admin',
      groupId: 'default',
      startAt,
      endAt,
    });

    const createExemptionResponse = await trpcMutate(
      baseUrl,
      'classrooms.createExemption',
      {
        machineId: machine.id,
        classroomId: classroom.id,
        scheduleId: schedule.id,
      },
      bearerAuth(accessToken)
    );
    assert.strictEqual(createExemptionResponse.status, 200);
    const createdExemption = (await parseTRPC(createExemptionResponse)).data as { id: string };

    const listExemptionsResponse = await fetch(
      `${baseUrl}/trpc/classrooms.listExemptions?input=${encodeURIComponent(JSON.stringify({ classroomId: classroom.id }))}`,
      { headers: bearerAuth(accessToken) }
    );
    assert.strictEqual(listExemptionsResponse.status, 200);

    const deleteExemptionResponse = await trpcMutate(
      baseUrl,
      'classrooms.deleteExemption',
      { id: createdExemption.id },
      bearerAuth(accessToken)
    );
    assert.strictEqual(deleteExemptionResponse.status, 200);
  });
});
