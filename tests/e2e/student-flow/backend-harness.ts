#!/usr/bin/env npx tsx

import { randomUUID } from 'node:crypto';

export interface HarnessCredentials {
  email: string;
  password: string;
}

export interface HarnessSession {
  email: string;
  accessToken: string;
  userId?: string;
}

export interface HarnessGroup {
  id: string;
  name: string;
  displayName: string;
}

export interface HarnessClassroom {
  id: string;
  name: string;
  displayName: string;
  defaultGroupId: string;
}

export interface HarnessSchedule {
  id: string;
  classroomId: string;
  groupId: string;
  startAt: string;
  endAt: string;
}

export interface HarnessMachine {
  id: string;
  classroomId: string;
  machineHostname: string;
  reportedHostname: string;
  machineToken: string;
  whitelistUrl: string;
}

export interface StudentFixtureHosts {
  portal: string;
  cdnPortal: string;
  site: string;
  apiSite: string;
}

export interface StudentScenario {
  scenarioName: string;
  apiUrl: string;
  auth: {
    admin: HarnessSession;
    teacher: HarnessSession;
  };
  groups: {
    restricted: HarnessGroup;
    alternate: HarnessGroup;
  };
  classroom: HarnessClassroom;
  schedules: {
    activeRestriction: HarnessSchedule;
    futureAlternate: HarnessSchedule;
  };
  machine: HarnessMachine;
  fixtures: StudentFixtureHosts;
}

export interface BootstrapStudentScenarioOptions {
  apiUrl: string;
  scenarioName?: string;
  machineHostname?: string;
  version?: string;
  admin?: Partial<HarnessCredentials>;
  teacher?: Partial<HarnessCredentials>;
  activeScheduleDurationMinutes?: number;
  futureScheduleLeadMinutes?: number;
  futureScheduleDurationMinutes?: number;
}

export interface PublicRequestSubmission {
  success: boolean;
  id?: string;
  status?: string;
  approved?: boolean;
  autoApproved?: boolean;
  duplicate?: boolean;
  domain?: string;
  source?: string;
  error?: string;
}

export interface RequestStatusResult {
  id: string;
  domain: string;
  status: string;
}

export interface RequestMutationResult {
  id: string;
  status?: string;
  domain?: string;
}

export interface RuleMutationResult {
  id: string;
  groupId?: string;
  type?: 'whitelist' | 'blocked_subdomain' | 'blocked_path';
  value?: string;
}

export interface ExemptionResult {
  id: string;
  machineId: string;
  classroomId: string;
  scheduleId: string;
  expiresAt: string;
}

export interface ActiveGroupResult {
  currentGroupId: string | null;
}

interface TrpcSuccess<T> {
  result?: {
    data?: T;
  };
}

interface TrpcFailure {
  error?: {
    message?: string;
    code?: string | number;
    data?: {
      code?: string;
    };
  };
}

type TrpcEnvelope<T> = TrpcSuccess<T> & TrpcFailure;

const DEFAULT_ADMIN: HarnessCredentials = {
  email: 'admin@openpath.local',
  password: 'AdminPassword123!',
};

const DEFAULT_TEACHER: HarnessCredentials = {
  email: 'teacher@openpath.local',
  password: 'TeacherPassword123!',
};

const DEFAULT_ACTIVE_SCHEDULE_DURATION_MINUTES = 180;
const DEFAULT_FUTURE_SCHEDULE_LEAD_MINUTES = 240;
const DEFAULT_FUTURE_SCHEDULE_DURATION_MINUTES = 30;

interface CommandArgs {
  command: string;
  options: Map<string, string>;
}

interface JsonRequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
}

interface ClassroomDetailsResponse {
  id: string;
  name: string;
  displayName: string;
  currentGroupId: string | null;
  machines?: {
    id: string;
    hostname: string;
  }[];
}

interface EnrollmentTicketResponse {
  success: boolean;
  enrollmentToken: string;
  classroomId: string;
  classroomName: string;
}

interface MachineRegistrationResponse {
  success: boolean;
  machineHostname: string;
  reportedHostname: string;
  whitelistUrl: string;
  classroomId: string;
  classroomName: string;
}

interface LoginResult {
  accessToken: string;
  user?: {
    id?: string;
  };
}

interface CreateGroupResult {
  id: string;
  name: string;
  displayName: string;
}

interface CreateClassroomResult {
  id: string;
  name: string;
  displayName: string;
  defaultGroupId: string | null;
}

interface CreateScheduleResult {
  id: string;
  classroomId: string;
  groupId: string;
  startAt: string;
  endAt: string;
}

function mergeCredentials(
  defaults: HarnessCredentials,
  overrides?: Partial<HarnessCredentials>
): HarnessCredentials {
  return {
    email: overrides?.email ?? defaults.email,
    password: overrides?.password ?? defaults.password,
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function uniqueScenarioSlug(prefix = 'student-policy'): string {
  return `${prefix}-${slugify(randomUUID().slice(0, 8))}`;
}

function addMinutes(base: Date, minutes: number): string {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

function floorToQuarterHour(base: Date): Date {
  const aligned = new Date(base);
  aligned.setUTCSeconds(0, 0);
  aligned.setUTCMinutes(Math.floor(aligned.getUTCMinutes() / 15) * 15);
  return aligned;
}

function assertQuarterHourDuration(minutes: number, label: string): void {
  if (minutes <= 0 || minutes % 15 !== 0) {
    throw new Error(`${label} must be a positive multiple of 15 minutes`);
  }
}

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '');
}

function getStudentHostSuffix(): string {
  return (process.env.OPENPATH_STUDENT_HOST_SUFFIX ?? '127.0.0.1.sslip.io')
    .trim()
    .replace(/^\.+|\.+$/g, '');
}

function buildFixtureHosts(): StudentFixtureHosts {
  const suffix = getStudentHostSuffix();
  return {
    portal: `portal.${suffix}`,
    cdnPortal: `cdn.portal.${suffix}`,
    site: `site.${suffix}`,
    apiSite: `api.site.${suffix}`,
  };
}

function extractMachineToken(whitelistUrl: string): string {
  const match = /\/w\/([^/]+)\/whitelist\.txt$/.exec(whitelistUrl);
  if (match?.[1] === undefined || match[1] === '') {
    throw new Error(`Unable to extract machine token from whitelist URL: ${whitelistUrl}`);
  }
  return match[1];
}

function parseArgs(argv: string[]): CommandArgs {
  const [command = '', ...rest] = argv;
  const options = new Map<string, string>();

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? '';
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options.set(key, 'true');
      continue;
    }

    options.set(key, next);
    index += 1;
  }

  return { command, options };
}

function requireOption(options: Map<string, string>, key: string): string {
  const value = options.get(key);
  if (value === undefined || value === '') {
    throw new Error(`Missing required option --${key}`);
  }
  return value;
}

function getOption(options: Map<string, string>, key: string): string | undefined {
  return options.get(key);
}

function optionalProp<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function parseBoolean(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Expected boolean 'true' or 'false', received: ${value}`);
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function requestJson<T>(url: string, init: JsonRequestOptions = {}): Promise<T> {
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : null,
  });

  if (!response.ok) {
    const body = await readResponseBody(response);
    throw new Error(`Request failed (${response.status}) for ${url}: ${body}`);
  }

  return (await response.json()) as T;
}

async function parseTrpcResponse<T>(response: Response, procedure: string): Promise<T> {
  const payload = (await response.json()) as TrpcEnvelope<T>;

  if (response.ok && payload.result?.data !== undefined) {
    return payload.result.data;
  }

  const code = payload.error?.data?.code ?? payload.error?.code ?? response.status;
  const message = payload.error?.message ?? `tRPC call failed for ${procedure}`;
  throw new Error(`[${String(code)}] ${message}`);
}

async function trpcMutate<T>(params: {
  apiUrl: string;
  procedure: string;
  input: unknown;
  accessToken?: string;
}): Promise<T> {
  const response = await fetch(`${normalizeApiUrl(params.apiUrl)}/trpc/${params.procedure}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {}),
    },
    body: JSON.stringify(params.input),
  });

  return parseTrpcResponse<T>(response, params.procedure);
}

async function trpcQuery<T>(params: {
  apiUrl: string;
  procedure: string;
  input?: unknown;
  accessToken?: string;
}): Promise<T> {
  const apiUrl = normalizeApiUrl(params.apiUrl);
  const query =
    params.input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(params.input))}`;

  const response = await fetch(`${apiUrl}/trpc/${params.procedure}${query}`, {
    headers: params.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {},
  });

  return parseTrpcResponse<T>(response, params.procedure);
}

export async function login(params: {
  apiUrl: string;
  credentials: HarnessCredentials;
}): Promise<HarnessSession> {
  const result = await trpcMutate<LoginResult>({
    apiUrl: params.apiUrl,
    procedure: 'auth.login',
    input: params.credentials,
  });

  if (result.accessToken === '' || result.accessToken === 'cookie-session') {
    throw new Error(`auth.login for ${params.credentials.email} did not return a bearer token`);
  }

  return {
    email: params.credentials.email,
    accessToken: result.accessToken,
    ...optionalProp('userId', result.user?.id),
  };
}

export async function createGroup(params: {
  apiUrl: string;
  accessToken: string;
  name: string;
  displayName: string;
}): Promise<HarnessGroup> {
  return trpcMutate<CreateGroupResult>({
    apiUrl: params.apiUrl,
    procedure: 'groups.create',
    input: {
      name: params.name,
      displayName: params.displayName,
    },
    accessToken: params.accessToken,
  });
}

export async function createClassroom(params: {
  apiUrl: string;
  accessToken: string;
  name: string;
  displayName: string;
  defaultGroupId: string;
}): Promise<HarnessClassroom> {
  const classroom = await trpcMutate<CreateClassroomResult>({
    apiUrl: params.apiUrl,
    procedure: 'classrooms.create',
    input: {
      name: params.name,
      displayName: params.displayName,
      defaultGroupId: params.defaultGroupId,
    },
    accessToken: params.accessToken,
  });

  return {
    id: classroom.id,
    name: classroom.name,
    displayName: classroom.displayName,
    defaultGroupId: classroom.defaultGroupId ?? params.defaultGroupId,
  };
}

export async function createOneOffSchedule(params: {
  apiUrl: string;
  accessToken: string;
  classroomId: string;
  groupId: string;
  startAt: string;
  endAt: string;
}): Promise<HarnessSchedule> {
  return trpcMutate<CreateScheduleResult>({
    apiUrl: params.apiUrl,
    procedure: 'schedules.createOneOff',
    input: {
      classroomId: params.classroomId,
      groupId: params.groupId,
      startAt: params.startAt,
      endAt: params.endAt,
    },
    accessToken: params.accessToken,
  });
}

export async function createEnrollmentTicket(params: {
  apiUrl: string;
  accessToken: string;
  classroomId: string;
}): Promise<EnrollmentTicketResponse> {
  return requestJson<EnrollmentTicketResponse>(
    `${normalizeApiUrl(params.apiUrl)}/api/enroll/${params.classroomId}/ticket`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.accessToken}` },
    }
  );
}

export async function registerMachine(params: {
  apiUrl: string;
  enrollmentToken: string;
  hostname: string;
  classroomId: string;
  version?: string;
}): Promise<MachineRegistrationResponse> {
  return requestJson<MachineRegistrationResponse>(
    `${normalizeApiUrl(params.apiUrl)}/api/machines/register`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.enrollmentToken}` },
      body: {
        hostname: params.hostname,
        classroomId: params.classroomId,
        ...(params.version ? { version: params.version } : {}),
      },
    }
  );
}

export async function getClassroomDetails(params: {
  apiUrl: string;
  accessToken: string;
  classroomId: string;
}): Promise<ClassroomDetailsResponse> {
  return trpcQuery<ClassroomDetailsResponse>({
    apiUrl: params.apiUrl,
    procedure: 'classrooms.get',
    input: { id: params.classroomId },
    accessToken: params.accessToken,
  });
}

export async function submitManualRequest(params: {
  apiUrl: string;
  domain: string;
  hostname: string;
  token: string;
  reason?: string;
  originPage?: string;
}): Promise<PublicRequestSubmission> {
  return requestJson<PublicRequestSubmission>(
    `${normalizeApiUrl(params.apiUrl)}/api/requests/submit`,
    {
      method: 'POST',
      body: {
        domain: params.domain,
        hostname: params.hostname,
        token: params.token,
        ...(params.reason ? { reason: params.reason } : {}),
        ...(params.originPage ? { origin_page: params.originPage } : {}),
      },
    }
  );
}

export async function submitAutoRequest(params: {
  apiUrl: string;
  domain: string;
  hostname: string;
  token: string;
  reason?: string;
  originPage?: string;
}): Promise<PublicRequestSubmission> {
  return requestJson<PublicRequestSubmission>(
    `${normalizeApiUrl(params.apiUrl)}/api/requests/auto`,
    {
      method: 'POST',
      body: {
        domain: params.domain,
        hostname: params.hostname,
        token: params.token,
        ...(params.reason ? { reason: params.reason } : {}),
        ...(params.originPage ? { origin_page: params.originPage } : {}),
      },
    }
  );
}

export async function getRequestStatus(params: {
  apiUrl: string;
  requestId: string;
}): Promise<RequestStatusResult> {
  return trpcQuery<RequestStatusResult>({
    apiUrl: params.apiUrl,
    procedure: 'requests.getStatus',
    input: { id: params.requestId },
  });
}

export async function approveRequest(params: {
  apiUrl: string;
  accessToken: string;
  requestId: string;
  groupId?: string;
}): Promise<RequestMutationResult> {
  return trpcMutate<RequestMutationResult>({
    apiUrl: params.apiUrl,
    procedure: 'requests.approve',
    input: {
      id: params.requestId,
      ...(params.groupId ? { groupId: params.groupId } : {}),
    },
    accessToken: params.accessToken,
  });
}

export async function rejectRequest(params: {
  apiUrl: string;
  accessToken: string;
  requestId: string;
  reason?: string;
}): Promise<RequestMutationResult> {
  return trpcMutate<RequestMutationResult>({
    apiUrl: params.apiUrl,
    procedure: 'requests.reject',
    input: {
      id: params.requestId,
      ...(params.reason ? { reason: params.reason } : {}),
    },
    accessToken: params.accessToken,
  });
}

export async function createGroupRule(params: {
  apiUrl: string;
  accessToken: string;
  groupId: string;
  type: 'whitelist' | 'blocked_subdomain' | 'blocked_path';
  value: string;
  comment?: string;
}): Promise<RuleMutationResult> {
  return trpcMutate<RuleMutationResult>({
    apiUrl: params.apiUrl,
    procedure: 'groups.createRule',
    input: {
      groupId: params.groupId,
      type: params.type,
      value: params.value,
      ...(params.comment ? { comment: params.comment } : {}),
    },
    accessToken: params.accessToken,
  });
}

export async function deleteGroupRule(params: {
  apiUrl: string;
  accessToken: string;
  ruleId: string;
  groupId?: string;
}): Promise<{ deleted: boolean }> {
  return trpcMutate<{ deleted: boolean }>({
    apiUrl: params.apiUrl,
    procedure: 'groups.deleteRule',
    input: {
      id: params.ruleId,
      ...(params.groupId ? { groupId: params.groupId } : {}),
    },
    accessToken: params.accessToken,
  });
}

export async function createTemporaryExemption(params: {
  apiUrl: string;
  accessToken: string;
  machineId: string;
  classroomId: string;
  scheduleId: string;
}): Promise<ExemptionResult> {
  return trpcMutate<ExemptionResult>({
    apiUrl: params.apiUrl,
    procedure: 'classrooms.createExemption',
    input: {
      machineId: params.machineId,
      classroomId: params.classroomId,
      scheduleId: params.scheduleId,
    },
    accessToken: params.accessToken,
  });
}

export async function deleteTemporaryExemption(params: {
  apiUrl: string;
  accessToken: string;
  exemptionId: string;
}): Promise<{ success: boolean }> {
  return trpcMutate<{ success: boolean }>({
    apiUrl: params.apiUrl,
    procedure: 'classrooms.deleteExemption',
    input: { id: params.exemptionId },
    accessToken: params.accessToken,
  });
}

export async function setActiveGroup(params: {
  apiUrl: string;
  accessToken: string;
  classroomId: string;
  groupId: string | null;
}): Promise<ActiveGroupResult> {
  const result = await trpcMutate<{
    currentGroupId: string | null;
  }>({
    apiUrl: params.apiUrl,
    procedure: 'classrooms.setActiveGroup',
    input: {
      id: params.classroomId,
      groupId: params.groupId,
    },
    accessToken: params.accessToken,
  });

  return { currentGroupId: result.currentGroupId };
}

export async function setAutoApprove(enabled: boolean): Promise<{ enabled: boolean }> {
  const { config } = await import('../../../api/src/config.js');

  Object.defineProperty(config, 'autoApproveMachineRequests', {
    value: enabled,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  return { enabled: config.autoApproveMachineRequests };
}

export async function tickBoundaries(atIsoTimestamp: string): Promise<{ at: string }> {
  const at = new Date(atIsoTimestamp);
  if (!Number.isFinite(at.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${atIsoTimestamp}`);
  }

  const { runScheduleBoundaryTickOnce } = await import('../../../api/src/lib/rule-events.js');
  await runScheduleBoundaryTickOnce(at);
  return { at: at.toISOString() };
}

export async function bootstrapStudentScenario(
  options: BootstrapStudentScenarioOptions
): Promise<StudentScenario> {
  const apiUrl = normalizeApiUrl(options.apiUrl);
  const adminCredentials = mergeCredentials(DEFAULT_ADMIN, options.admin);
  const teacherCredentials = mergeCredentials(DEFAULT_TEACHER, options.teacher);
  const scenarioSlug =
    slugify(options.scenarioName ?? uniqueScenarioSlug()) || uniqueScenarioSlug();
  const scenarioName = options.scenarioName ?? scenarioSlug;

  const admin = await login({ apiUrl, credentials: adminCredentials });
  const initialTeacher = await login({ apiUrl, credentials: teacherCredentials });

  const restrictedGroupName = `${scenarioSlug}-restricted`;
  const alternateGroupName = `${scenarioSlug}-alternate`;
  const classroomName = `${scenarioSlug}-room`;

  const restrictedGroup = await createGroup({
    apiUrl,
    accessToken: initialTeacher.accessToken,
    name: restrictedGroupName,
    displayName: `${scenarioName} Restricted`,
  });

  const alternateGroup = await createGroup({
    apiUrl,
    accessToken: initialTeacher.accessToken,
    name: alternateGroupName,
    displayName: `${scenarioName} Alternate`,
  });

  const teacher = await login({ apiUrl, credentials: teacherCredentials });

  const classroom = await createClassroom({
    apiUrl,
    accessToken: admin.accessToken,
    name: classroomName,
    displayName: `${scenarioName} Classroom`,
    defaultGroupId: restrictedGroup.id,
  });

  const now = new Date();
  const activeDurationMinutes =
    options.activeScheduleDurationMinutes ?? DEFAULT_ACTIVE_SCHEDULE_DURATION_MINUTES;
  const futureLeadMinutes =
    options.futureScheduleLeadMinutes ?? DEFAULT_FUTURE_SCHEDULE_LEAD_MINUTES;
  const futureDurationMinutes =
    options.futureScheduleDurationMinutes ?? DEFAULT_FUTURE_SCHEDULE_DURATION_MINUTES;

  assertQuarterHourDuration(activeDurationMinutes, 'activeScheduleDurationMinutes');
  assertQuarterHourDuration(futureLeadMinutes, 'futureScheduleLeadMinutes');
  assertQuarterHourDuration(futureDurationMinutes, 'futureScheduleDurationMinutes');

  const quarterNow = floorToQuarterHour(now);
  const activeStart = addMinutes(quarterNow, -15);
  const activeEnd = addMinutes(new Date(activeStart), activeDurationMinutes);
  const futureStart = addMinutes(quarterNow, futureLeadMinutes);
  const futureEnd = addMinutes(new Date(futureStart), futureDurationMinutes);

  const activeSchedule = await createOneOffSchedule({
    apiUrl,
    accessToken: teacher.accessToken,
    classroomId: classroom.id,
    groupId: restrictedGroup.id,
    startAt: activeStart,
    endAt: activeEnd,
  });

  const futureAlternateSchedule = await createOneOffSchedule({
    apiUrl,
    accessToken: teacher.accessToken,
    classroomId: classroom.id,
    groupId: alternateGroup.id,
    startAt: futureStart,
    endAt: futureEnd,
  });

  const ticket = await createEnrollmentTicket({
    apiUrl,
    accessToken: teacher.accessToken,
    classroomId: classroom.id,
  });

  const reportedHostname = options.machineHostname ?? `${scenarioSlug}-student`;
  const registration = await registerMachine({
    apiUrl,
    enrollmentToken: ticket.enrollmentToken,
    hostname: reportedHostname,
    classroomId: classroom.id,
    ...optionalProp('version', options.version),
  });

  const classroomDetails = await getClassroomDetails({
    apiUrl,
    accessToken: teacher.accessToken,
    classroomId: classroom.id,
  });

  const machineRecord = classroomDetails.machines?.find(
    (machine) => machine.hostname === registration.machineHostname
  );
  if (!machineRecord) {
    throw new Error(`Could not resolve machine ID for ${registration.machineHostname}`);
  }

  return {
    scenarioName,
    apiUrl,
    auth: {
      admin,
      teacher,
    },
    groups: {
      restricted: restrictedGroup,
      alternate: alternateGroup,
    },
    classroom,
    schedules: {
      activeRestriction: activeSchedule,
      futureAlternate: futureAlternateSchedule,
    },
    machine: {
      id: machineRecord.id,
      classroomId: classroom.id,
      machineHostname: registration.machineHostname,
      reportedHostname: registration.reportedHostname,
      machineToken: extractMachineToken(registration.whitelistUrl),
      whitelistUrl: registration.whitelistUrl,
    },
    fixtures: buildFixtureHosts(),
  };
}

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function runCli(argv: string[]): Promise<void> {
  const { command, options } = parseArgs(argv);

  switch (command) {
    case 'bootstrap': {
      const result = await bootstrapStudentScenario({
        apiUrl: requireOption(options, 'api-url'),
        ...optionalProp('scenarioName', getOption(options, 'scenario-name')),
        ...optionalProp('machineHostname', getOption(options, 'machine-hostname')),
        ...optionalProp('version', getOption(options, 'version')),
        admin: {
          ...optionalProp('email', getOption(options, 'admin-email')),
          ...optionalProp('password', getOption(options, 'admin-password')),
        },
        teacher: {
          ...optionalProp('email', getOption(options, 'teacher-email')),
          ...optionalProp('password', getOption(options, 'teacher-password')),
        },
      });
      printJson(result);
      return;
    }

    case 'submit-request': {
      const result = await submitManualRequest({
        apiUrl: requireOption(options, 'api-url'),
        domain: requireOption(options, 'domain'),
        hostname: requireOption(options, 'hostname'),
        token: requireOption(options, 'machine-token'),
        ...optionalProp('reason', getOption(options, 'reason')),
        ...optionalProp('originPage', getOption(options, 'origin-page')),
      });
      printJson(result);
      return;
    }

    case 'submit-auto-request': {
      const result = await submitAutoRequest({
        apiUrl: requireOption(options, 'api-url'),
        domain: requireOption(options, 'domain'),
        hostname: requireOption(options, 'hostname'),
        token: requireOption(options, 'machine-token'),
        ...optionalProp('reason', getOption(options, 'reason')),
        ...optionalProp('originPage', getOption(options, 'origin-page')),
      });
      printJson(result);
      return;
    }

    case 'request-status': {
      const result = await getRequestStatus({
        apiUrl: requireOption(options, 'api-url'),
        requestId: requireOption(options, 'request-id'),
      });
      printJson(result);
      return;
    }

    case 'approve-request': {
      const result = await approveRequest({
        apiUrl: requireOption(options, 'api-url'),
        accessToken: requireOption(options, 'access-token'),
        requestId: requireOption(options, 'request-id'),
        ...optionalProp('groupId', getOption(options, 'group-id')),
      });
      printJson(result);
      return;
    }

    case 'reject-request': {
      const result = await rejectRequest({
        apiUrl: requireOption(options, 'api-url'),
        accessToken: requireOption(options, 'access-token'),
        requestId: requireOption(options, 'request-id'),
        ...optionalProp('reason', getOption(options, 'reason')),
      });
      printJson(result);
      return;
    }

    case 'create-rule': {
      const type = requireOption(options, 'type');
      if (type !== 'whitelist' && type !== 'blocked_subdomain' && type !== 'blocked_path') {
        throw new Error(`Unsupported rule type: ${type}`);
      }

      const result = await createGroupRule({
        apiUrl: requireOption(options, 'api-url'),
        accessToken: requireOption(options, 'access-token'),
        groupId: requireOption(options, 'group-id'),
        type,
        value: requireOption(options, 'value'),
        ...optionalProp('comment', getOption(options, 'comment')),
      });
      printJson(result);
      return;
    }

    case 'delete-rule': {
      const result = await deleteGroupRule({
        apiUrl: requireOption(options, 'api-url'),
        accessToken: requireOption(options, 'access-token'),
        ruleId: requireOption(options, 'rule-id'),
        ...optionalProp('groupId', getOption(options, 'group-id')),
      });
      printJson(result);
      return;
    }

    case 'create-exemption': {
      const result = await createTemporaryExemption({
        apiUrl: requireOption(options, 'api-url'),
        accessToken: requireOption(options, 'access-token'),
        machineId: requireOption(options, 'machine-id'),
        classroomId: requireOption(options, 'classroom-id'),
        scheduleId: requireOption(options, 'schedule-id'),
      });
      printJson(result);
      return;
    }

    case 'delete-exemption': {
      const result = await deleteTemporaryExemption({
        apiUrl: requireOption(options, 'api-url'),
        accessToken: requireOption(options, 'access-token'),
        exemptionId: requireOption(options, 'exemption-id'),
      });
      printJson(result);
      return;
    }

    case 'set-active-group': {
      const rawGroupId = requireOption(options, 'group-id');
      const result = await setActiveGroup({
        apiUrl: requireOption(options, 'api-url'),
        accessToken: requireOption(options, 'access-token'),
        classroomId: requireOption(options, 'classroom-id'),
        groupId: rawGroupId === 'null' ? null : rawGroupId,
      });
      printJson(result);
      return;
    }

    case 'set-auto-approve': {
      const result = await setAutoApprove(parseBoolean(requireOption(options, 'enabled')));
      printJson(result);
      return;
    }

    case 'tick-boundaries': {
      const result = await tickBoundaries(requireOption(options, 'at'));
      printJson(result);
      return;
    }

    case '':
      throw new Error(
        'Missing command. Expected one of: bootstrap, submit-request, submit-auto-request, request-status, approve-request, reject-request, create-rule, delete-rule, create-exemption, delete-exemption, set-active-group, set-auto-approve, tick-boundaries'
      );

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;

if (isMainModule) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
