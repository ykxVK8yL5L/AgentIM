import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MemoryStore } from './memory-store.js';
import { createId, createInitialState, normalizeState, nowIso, sqlString } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.resolve(__dirname, '../../data');
const defaultSqlitePath = path.join(defaultDataDir, 'agentim.sqlite');

export class SQLiteStore extends MemoryStore {
  constructor(sqlitePath = process.env.AGENTIM_DB_PATH ?? defaultSqlitePath) {
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
    ensureSchema(sqlitePath);
    const state = readState(sqlitePath) ?? createInitialState();
    super(normalizeState(state));
    this.kind = 'sqlite';
    this.sqlitePath = sqlitePath;
    migrateRows(sqlitePath, this.state);
    this.state.messages = [];
    this.state.agentRuns = [];
    this.state.scheduledTasks = [];
    this.state.projects = [];
    this.state.projectTasks = [];
    this.state.skillInvocations = [];
    this.state.skillApprovals = [];
    this.state.artifacts = [];
    this.persist();
  }

  async info() {
    return { kind: this.kind, database: this.sqlitePath };
  }

  async bootstrap() {
    return {
      ...this.snapshot(),
      agentRuns: await this.listAgentRuns(),
      scheduledTasks: await this.listScheduledTasks(null, { limit: 100 }),
      projects: await this.listProjects(),
      projectTasks: await this.listProjectTasks(null),
      skillInvocations: await this.listSkillInvocations(null, { limit: 50 }),
      skillApprovals: await this.listSkillApprovals(null, { limit: 50 }),
      artifacts: await this.listArtifacts(null, { limit: 50 })
    };
  }

  async deleteRoom(id) {
    await super.deleteRoom(id);
    execSql(this.sqlitePath, `
      delete from messages where room_id = ${sqlString(id)} or conversation_id = ${sqlString(id)};
      delete from agent_runs where room_id = ${sqlString(id)};
      delete from scheduled_tasks where room_id = ${sqlString(id)};
      update projects set status = 'archived', archived_at = ${sqlString(nowIso())}, updated_at = ${sqlString(nowIso())}
        where room_id = ${sqlString(id)} and status != 'archived';
      update project_tasks set status = 'cancelled', updated_at = ${sqlString(nowIso())}
        where room_id = ${sqlString(id)} and status in ('queued', 'running', 'blocked');
      delete from skill_invocations where room_id = ${sqlString(id)};
      delete from artifacts where room_id = ${sqlString(id)};
    `);
  }

  async listMessages(roomId, options = {}) {
    const limit = Number(options.limit);
    const hasLimit = Number.isFinite(limit) && limit > 0;
    const beforeCreatedAt = String(options.beforeCreatedAt ?? '').trim();
    const beforeId = String(options.beforeId ?? '').trim();
    const cursorSql = beforeCreatedAt
      ? `and (
          created_at < ${sqlString(beforeCreatedAt)}
          or (
            created_at = ${sqlString(beforeCreatedAt)}
            and id < ${sqlString(beforeId)}
          )
        )`
      : '';
    if (hasLimit) {
      const rows = execJson(this.sqlitePath, `
        select * from (
          select * from messages
          where (room_id = ${sqlString(roomId)} or conversation_id = ${sqlString(roomId)})
          ${cursorSql}
          order by created_at desc, id desc
          limit ${Math.round(limit)}
        )
        order by created_at asc, id asc;
      `);
      return rows.map(rowToMessage);
    }

    const rows = execJson(this.sqlitePath, `
      select * from messages
      where room_id = ${sqlString(roomId)} or conversation_id = ${sqlString(roomId)}
      order by created_at asc, id asc;
    `);
    return rows.map(rowToMessage);
  }

  async createMessage(input) {
    const message = {
      id: input.id ?? createId(),
      roomId: input.roomId,
      conversationId: input.conversationId ?? input.roomId,
      senderType: input.senderType ?? 'user',
      senderName: input.senderName ?? 'You',
      content: input.content ?? '',
      status: input.status,
      pending: input.pending,
      runId: input.runId,
      replyTo: input.replyTo,
      createdAt: input.createdAt ?? nowIso(),
      updatedAt: input.updatedAt
    };
    insertMessage(this.sqlitePath, message);
    return message;
  }

  async updateMessageContent(id, content) {
    return this.updateMessage(id, { content });
  }

  async updateMessage(id, input) {
    const current = await this.getMessage(id);
    if (!current) return null;
    const next = {
      ...current,
      ...input,
      id: current.id,
      updatedAt: nowIso()
    };
    updateMessageRow(this.sqlitePath, id, input, next.updatedAt);
    return next;
  }

  async getMessage(id) {
    const rows = execJson(this.sqlitePath, `
      select * from messages where id = ${sqlString(id)} limit 1;
    `);
    return rows[0] ? rowToMessage(rows[0]) : null;
  }

  async listAgentRuns(roomId) {
    const where = roomId ? `where room_id = ${sqlString(roomId)}` : '';
    const rows = execJson(this.sqlitePath, `
      select * from agent_runs
      ${where}
      order by created_at asc, id asc;
    `);
    return rows.map(rowToAgentRun);
  }

  async getAgentRun(id) {
    const rows = execJson(this.sqlitePath, `
      select * from agent_runs where id = ${sqlString(id)} limit 1;
    `);
    return rows[0] ? rowToAgentRun(rows[0]) : null;
  }

  async createAgentRun(input) {
    const run = {
      id: input.id ?? createId(),
      roomId: input.roomId,
      agentId: input.agentId,
      messageId: input.messageId,
      status: input.status ?? 'queued',
      attempts: input.attempts ?? 0,
      turn: input.turn ?? 1,
      maxTurns: input.maxTurns ?? 6,
      error: input.error,
      createdAt: input.createdAt ?? nowIso(),
      updatedAt: input.updatedAt,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      stoppedAt: input.stoppedAt,
      recoveredAt: input.recoveredAt,
      retriedAt: input.retriedAt,
      lastAttemptAt: input.lastAttemptAt
    };
    insertAgentRun(this.sqlitePath, run);
    return run;
  }

  async updateAgentRun(id, input) {
    const current = await this.getAgentRun(id);
    if (!current) return null;
    const next = {
      ...current,
      ...input,
      id: current.id,
      updatedAt: nowIso()
    };
    updateAgentRunRow(this.sqlitePath, id, input, next.updatedAt);
    return next;
  }

  async listScheduledTasks(roomId, options = {}) {
    const whereParts = [];
    if (roomId) whereParts.push(`room_id = ${sqlString(roomId)}`);
    if (Array.isArray(options.statuses) && options.statuses.length > 0) {
      whereParts.push(`status in (${options.statuses.map(sqlString).join(', ')})`);
    }
    if (options.dueBefore) {
      whereParts.push(`schedule_at <= ${sqlString(options.dueBefore)}`);
    }
    const where = whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : '';
    const limit = Number(options.limit);
    const limitSql = Number.isFinite(limit) && limit > 0 ? `limit ${Math.round(limit)}` : '';
    const rows = execJson(this.sqlitePath, `
      select * from scheduled_tasks
      ${where}
      order by schedule_at asc, created_at asc, id asc
      ${limitSql};
    `);
    return rows.map(rowToScheduledTask);
  }

  async getScheduledTask(id) {
    const rows = execJson(this.sqlitePath, `
      select * from scheduled_tasks where id = ${sqlString(id)} limit 1;
    `);
    return rows[0] ? rowToScheduledTask(rows[0]) : null;
  }

  async createScheduledTask(input) {
    const dependsOnTaskIds = normalizeDependencyIds(input);
    const task = {
      id: input.id ?? createId(),
      roomId: input.roomId,
      agentId: input.agentId,
      title: input.title,
      instructions: input.instructions,
      scheduleAt: input.scheduleAt,
      status: input.status ?? 'scheduled',
      runId: input.runId,
      messageId: input.messageId,
      error: input.error,
      createdBy: input.createdBy ?? 'user',
      repeatInterval: input.repeatInterval,
      parentTaskId: input.parentTaskId,
      dependsOnTaskId: dependsOnTaskIds[0],
      dependsOnTaskIds,
      createdAt: input.createdAt ?? nowIso(),
      updatedAt: input.updatedAt,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      cancelledAt: input.cancelledAt
    };
    insertScheduledTask(this.sqlitePath, task);
    return task;
  }

  async updateScheduledTask(id, input) {
    const current = await this.getScheduledTask(id);
    if (!current) return null;
    const next = {
      ...current,
      ...input,
      id: current.id,
      updatedAt: nowIso()
    };
    updateScheduledTaskRow(this.sqlitePath, id, input, next.updatedAt);
    return next;
  }

  async deleteScheduledTask(id) {
    const task = await this.getScheduledTask(id);
    if (!task) return null;
    execSql(this.sqlitePath, `delete from scheduled_tasks where id = ${sqlString(id)};`);
    return task;
  }

  async listProjects(roomId) {
    const where = roomId ? `where room_id = ${sqlString(roomId)}` : '';
    const rows = execJson(this.sqlitePath, `
      select * from projects
      ${where}
      order by created_at asc, id asc;
    `);
    return rows.map(rowToProject);
  }

  async getProject(id) {
    const rows = execJson(this.sqlitePath, `
      select * from projects where id = ${sqlString(id)} limit 1;
    `);
    return rows[0] ? rowToProject(rows[0]) : null;
  }

  async createProject(input) {
    const project = {
      id: input.id ?? createId(),
      roomId: input.roomId,
      name: input.name,
      slug: input.slug,
      type: input.type,
      templateId: input.templateId ?? input.type,
      rootPath: input.rootPath,
      entryPath: input.entryPath,
      brief: input.brief ?? '',
      status: input.status ?? 'planning',
      currentPhase: input.currentPhase,
      error: input.error,
      createdAt: input.createdAt ?? nowIso(),
      updatedAt: input.updatedAt,
      archivedAt: input.archivedAt
    };
    insertProject(this.sqlitePath, project);
    return project;
  }

  async updateProject(id, input) {
    const current = await this.getProject(id);
    if (!current) return null;
    const next = {
      ...current,
      ...input,
      id: current.id,
      updatedAt: nowIso()
    };
    updateProjectRow(this.sqlitePath, id, input, next.updatedAt);
    return next;
  }

  async deleteProject(id) {
    const project = await this.getProject(id);
    if (!project) return null;
    execSql(this.sqlitePath, `
      delete from project_tasks where project_id = ${sqlString(id)};
      delete from projects where id = ${sqlString(id)};
    `);
    return project;
  }

  async listProjectTasks(projectIdOrRoomId, options = {}) {
    const whereParts = [];
    if (options.byRoom && projectIdOrRoomId) whereParts.push(`room_id = ${sqlString(projectIdOrRoomId)}`);
    else if (projectIdOrRoomId) whereParts.push(`project_id = ${sqlString(projectIdOrRoomId)}`);
    if (Array.isArray(options.statuses) && options.statuses.length > 0) {
      whereParts.push(`status in (${options.statuses.map(sqlString).join(', ')})`);
    }
    const where = whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : '';
    const rows = execJson(this.sqlitePath, `
      select * from project_tasks
      ${where}
      order by created_at asc, id asc;
    `);
    return rows.map(rowToProjectTask);
  }

  async getProjectTask(id) {
    const rows = execJson(this.sqlitePath, `
      select * from project_tasks where id = ${sqlString(id)} limit 1;
    `);
    return rows[0] ? rowToProjectTask(rows[0]) : null;
  }

  async getProjectTaskByRunId(runId) {
    const rows = execJson(this.sqlitePath, `
      select * from project_tasks where run_id = ${sqlString(runId)} limit 1;
    `);
    return rows[0] ? rowToProjectTask(rows[0]) : null;
  }

  async createProjectTask(input) {
    const dependsOnTaskIds = normalizeDependencyIds(input);
    const task = {
      id: input.id ?? createId(),
      projectId: input.projectId,
      roomId: input.roomId,
      agentId: input.agentId,
      roleId: input.roleId ?? 'general',
      phase: input.phase,
      title: input.title,
      instructions: input.instructions,
      status: input.status ?? 'queued',
      dependsOnTaskId: dependsOnTaskIds[0],
      dependsOnTaskIds,
      runId: input.runId,
      messageId: input.messageId,
      resultSummary: input.resultSummary,
      error: input.error,
      createdAt: input.createdAt ?? nowIso(),
      updatedAt: input.updatedAt,
      startedAt: input.startedAt,
      completedAt: input.completedAt
    };
    insertProjectTask(this.sqlitePath, task);
    return task;
  }

  async updateProjectTask(id, input) {
    const current = await this.getProjectTask(id);
    if (!current) return null;
    const next = {
      ...current,
      ...input,
      id: current.id,
      updatedAt: nowIso()
    };
    updateProjectTaskRow(this.sqlitePath, id, input, next.updatedAt);
    return next;
  }

  async deleteProjectTasks(projectId) {
    const tasks = await this.listProjectTasks(projectId);
    execSql(this.sqlitePath, `delete from project_tasks where project_id = ${sqlString(projectId)};`);
    return tasks;
  }

  async listSkillInvocations(roomId, options = {}) {
    const limit = Number(options.limit);
    const where = roomId ? `where room_id = ${sqlString(roomId)}` : '';
    const limitSql = Number.isFinite(limit) && limit > 0 ? `limit ${Math.round(limit)}` : '';
    const rows = execJson(this.sqlitePath, `
      select * from (
        select * from skill_invocations
        ${where}
        order by created_at desc, id desc
        ${limitSql}
      )
      order by created_at asc, id asc;
    `);
    return rows.map(rowToSkillInvocation);
  }

  async getSkillInvocation(id) {
    const rows = execJson(this.sqlitePath, `
      select * from skill_invocations where id = ${sqlString(id)} limit 1;
    `);
    return rows[0] ? rowToSkillInvocation(rows[0]) : null;
  }

  async createSkillInvocation(input) {
    const invocation = {
      id: input.id ?? createId(),
      skillId: input.skillId,
      roomId: input.roomId,
      runId: input.runId,
      messageId: input.messageId,
      agentId: input.agentId,
      actorType: input.actorType ?? 'agent',
      status: input.status ?? 'queued',
      input: input.input ?? {},
      output: input.output ?? {},
      error: input.error,
      createdAt: input.createdAt ?? nowIso(),
      updatedAt: input.updatedAt,
      startedAt: input.startedAt,
      completedAt: input.completedAt
    };
    insertSkillInvocation(this.sqlitePath, invocation);
    return invocation;
  }

  async updateSkillInvocation(id, input) {
    const current = await this.getSkillInvocation(id);
    if (!current) return null;
    const next = {
      ...current,
      ...input,
      id: current.id,
      updatedAt: nowIso()
    };
    updateSkillInvocationRow(this.sqlitePath, id, input, next.updatedAt);
    return next;
  }

  async listSkillApprovals(roomId, options = {}) {
    const whereParts = [];
    if (roomId) whereParts.push(`room_id = ${sqlString(roomId)}`);
    if (Array.isArray(options.statuses) && options.statuses.length > 0) {
      whereParts.push(`status in (${options.statuses.map(sqlString).join(', ')})`);
    }
    const where = whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : '';
    const limit = Number(options.limit);
    const limitSql = Number.isFinite(limit) && limit > 0 ? `limit ${Math.round(limit)}` : '';
    const rows = execJson(this.sqlitePath, `
      select * from (
        select * from skill_approvals
        ${where}
        order by created_at desc, id desc
        ${limitSql}
      )
      order by created_at asc, id asc;
    `);
    return rows.map(rowToSkillApproval);
  }

  async getSkillApproval(id) {
    const rows = execJson(this.sqlitePath, `
      select * from skill_approvals where id = ${sqlString(id)} limit 1;
    `);
    return rows[0] ? rowToSkillApproval(rows[0]) : null;
  }

  async createSkillApproval(input) {
    const approval = {
      id: input.id ?? createId(),
      roomId: input.roomId,
      invocationId: input.invocationId,
      skillId: input.skillId,
      status: input.status ?? 'pending',
      title: input.title ?? 'Approval required',
      reason: input.reason ?? '',
      input: input.input ?? {},
      requestedBy: input.requestedBy ?? 'system',
      createdAt: input.createdAt ?? nowIso(),
      updatedAt: input.updatedAt,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt
    };
    insertSkillApproval(this.sqlitePath, approval);
    return approval;
  }

  async updateSkillApproval(id, input) {
    const current = await this.getSkillApproval(id);
    if (!current) return null;
    const next = {
      ...current,
      ...input,
      id: current.id,
      updatedAt: nowIso()
    };
    updateSkillApprovalRow(this.sqlitePath, id, input, next.updatedAt);
    return next;
  }

  async clearRoomActivity(roomId) {
    const removedInvocations = Number(execSql(this.sqlitePath, `select count(*) from skill_invocations where room_id = ${sqlString(roomId)};`).trim() || 0);
    const removedArtifacts = Number(execSql(this.sqlitePath, `select count(*) from artifacts where room_id = ${sqlString(roomId)};`).trim() || 0);
    execSql(this.sqlitePath, `
      delete from skill_invocations where room_id = ${sqlString(roomId)};
      delete from artifacts where room_id = ${sqlString(roomId)};
    `);
    return { removedInvocations, removedArtifacts };
  }

  async listArtifacts(roomId, options = {}) {
    const limit = Number(options.limit);
    const where = roomId ? `where room_id = ${sqlString(roomId)}` : '';
    const limitSql = Number.isFinite(limit) && limit > 0 ? `limit ${Math.round(limit)}` : '';
    const rows = execJson(this.sqlitePath, `
      select * from (
        select * from artifacts
        ${where}
        order by created_at desc, id desc
        ${limitSql}
      )
      order by created_at asc, id asc;
    `);
    return rows.map(rowToArtifact);
  }

  async getArtifact(id) {
    const rows = execJson(this.sqlitePath, `
      select * from artifacts where id = ${sqlString(id)} limit 1;
    `);
    return rows[0] ? rowToArtifact(rows[0]) : null;
  }

  async createArtifact(input) {
    const artifact = {
      id: input.id ?? createId(),
      roomId: input.roomId,
      invocationId: input.invocationId,
      runId: input.runId,
      messageId: input.messageId,
      agentId: input.agentId,
      kind: input.kind,
      title: input.title ?? input.path ?? input.kind,
      path: input.path,
      mimeType: input.mimeType,
      metadata: input.metadata ?? {},
      createdAt: input.createdAt ?? nowIso(),
      updatedAt: input.updatedAt
    };
    insertArtifact(this.sqlitePath, artifact);
    return artifact;
  }

  async persist() {
    writeState(this.sqlitePath, stateForJson(this.state));
  }
}

function ensureSchema(sqlitePath) {
  execSql(sqlitePath, `
    create table if not exists app_state (
      key text primary key,
      value text not null,
      updated_at text not null default current_timestamp
    );

    create table if not exists messages (
      id text primary key,
      room_id text not null,
      conversation_id text not null,
      sender_type text not null,
      sender_name text not null,
      content text not null,
      status text,
      pending integer,
      run_id text,
      reply_to_json text,
      created_at text not null,
      updated_at text
    );

    create index if not exists idx_messages_room_created
      on messages(room_id, created_at, id);

    create table if not exists agent_runs (
      id text primary key,
      room_id text not null,
      agent_id text not null,
      message_id text,
      status text not null,
      attempts integer not null default 0,
      turn integer not null default 1,
      max_turns integer not null default 6,
      error text,
      created_at text not null,
      updated_at text,
      started_at text,
      completed_at text,
      stopped_at text,
      recovered_at text,
      retried_at text,
      last_attempt_at text
    );

    create index if not exists idx_agent_runs_room_status
      on agent_runs(room_id, status, created_at);

    create table if not exists scheduled_tasks (
      id text primary key,
      room_id text not null,
      agent_id text not null,
      title text not null,
      instructions text not null,
      schedule_at text not null,
      status text not null,
      run_id text,
      message_id text,
      error text,
      created_by text not null,
      repeat_interval text,
      parent_task_id text,
      depends_on_task_id text,
      depends_on_task_ids text,
      created_at text not null,
      updated_at text,
      started_at text,
      completed_at text,
      cancelled_at text
    );

    create index if not exists idx_scheduled_tasks_status_due
      on scheduled_tasks(status, schedule_at, id);

    create index if not exists idx_scheduled_tasks_room_due
      on scheduled_tasks(room_id, schedule_at, id);

    create table if not exists projects (
      id text primary key,
      room_id text not null,
      name text not null,
      slug text not null,
      type text not null,
      template_id text not null,
      root_path text not null,
      entry_path text,
      brief text not null,
      status text not null,
      current_phase text,
      error text,
      created_at text not null,
      updated_at text,
      archived_at text
    );

    create index if not exists idx_projects_room_status
      on projects(room_id, status, created_at);

    create table if not exists project_tasks (
      id text primary key,
      project_id text not null,
      room_id text not null,
      agent_id text,
      role_id text not null,
      phase text not null,
      title text not null,
      instructions text not null,
      status text not null,
      depends_on_task_id text,
      depends_on_task_ids text,
      run_id text,
      message_id text,
      result_summary text,
      error text,
      created_at text not null,
      updated_at text,
      started_at text,
      completed_at text
    );

    create index if not exists idx_project_tasks_project_status
      on project_tasks(project_id, status, created_at);

    create index if not exists idx_project_tasks_run
      on project_tasks(run_id);

    create table if not exists skill_invocations (
      id text primary key,
      skill_id text not null,
      room_id text not null,
      run_id text,
      message_id text,
      agent_id text,
      actor_type text not null,
      status text not null,
      input_json text not null,
      output_json text,
      error text,
      created_at text not null,
      updated_at text,
      started_at text,
      completed_at text
    );

    create index if not exists idx_skill_invocations_room_created
      on skill_invocations(room_id, created_at, id);

    create index if not exists idx_skill_invocations_run
      on skill_invocations(run_id, created_at);

    create table if not exists skill_approvals (
      id text primary key,
      room_id text not null,
      invocation_id text,
      skill_id text not null,
      status text not null,
      title text not null,
      reason text,
      input_json text not null,
      requested_by text not null,
      decided_by text,
      created_at text not null,
      updated_at text,
      decided_at text
    );

    create index if not exists idx_skill_approvals_room_status
      on skill_approvals(room_id, status, created_at);

    create table if not exists artifacts (
      id text primary key,
      room_id text not null,
      invocation_id text,
      run_id text,
      message_id text,
      agent_id text,
      kind text not null,
      title text not null,
      path text,
      mime_type text,
      metadata_json text not null,
      created_at text not null,
      updated_at text
    );

    create index if not exists idx_artifacts_room_created
      on artifacts(room_id, created_at, id);

    create index if not exists idx_artifacts_invocation
      on artifacts(invocation_id);
  `);
  ensureColumn(sqlitePath, 'scheduled_tasks', 'repeat_interval', 'text');
  ensureColumn(sqlitePath, 'scheduled_tasks', 'parent_task_id', 'text');
  ensureColumn(sqlitePath, 'scheduled_tasks', 'depends_on_task_id', 'text');
  ensureColumn(sqlitePath, 'scheduled_tasks', 'depends_on_task_ids', 'text');
  ensureColumn(sqlitePath, 'project_tasks', 'depends_on_task_ids', 'text');
}

function migrateRows(sqlitePath, state) {
  const messageCount = Number(execSql(sqlitePath, `select count(*) from messages;`).trim() || 0);
  if (messageCount === 0 && Array.isArray(state.messages)) {
    for (const message of state.messages) {
      insertMessage(sqlitePath, message);
    }
  }

  const runCount = Number(execSql(sqlitePath, `select count(*) from agent_runs;`).trim() || 0);
  if (runCount === 0 && Array.isArray(state.agentRuns)) {
    for (const run of state.agentRuns) {
      insertAgentRun(sqlitePath, run);
    }
  }

  const taskCount = Number(execSql(sqlitePath, `select count(*) from scheduled_tasks;`).trim() || 0);
  if (taskCount === 0 && Array.isArray(state.scheduledTasks)) {
    for (const task of state.scheduledTasks) {
      insertScheduledTask(sqlitePath, task);
    }
  }

  const projectCount = Number(execSql(sqlitePath, `select count(*) from projects;`).trim() || 0);
  if (projectCount === 0 && Array.isArray(state.projects)) {
    for (const project of state.projects) {
      insertProject(sqlitePath, project);
    }
  }

  const projectTaskCount = Number(execSql(sqlitePath, `select count(*) from project_tasks;`).trim() || 0);
  if (projectTaskCount === 0 && Array.isArray(state.projectTasks)) {
    for (const task of state.projectTasks) {
      insertProjectTask(sqlitePath, task);
    }
  }

  const invocationCount = Number(execSql(sqlitePath, `select count(*) from skill_invocations;`).trim() || 0);
  if (invocationCount === 0 && Array.isArray(state.skillInvocations)) {
    for (const invocation of state.skillInvocations) {
      insertSkillInvocation(sqlitePath, invocation);
    }
  }

  const artifactCount = Number(execSql(sqlitePath, `select count(*) from artifacts;`).trim() || 0);
  if (artifactCount === 0 && Array.isArray(state.artifacts)) {
    for (const artifact of state.artifacts) {
      insertArtifact(sqlitePath, artifact);
    }
  }
}

function readState(sqlitePath) {
  const raw = execSql(sqlitePath, `select value from app_state where key = 'state';`).trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function writeState(sqlitePath, state) {
  const value = JSON.stringify(state);
  execSql(sqlitePath, `
    insert into app_state (key, value, updated_at)
    values ('state', ${sqlString(value)}, current_timestamp)
    on conflict(key) do update set
      value = excluded.value,
      updated_at = excluded.updated_at;
  `);
}

function stateForJson(state) {
  return {
    ...state,
    messages: [],
    agentRuns: [],
    scheduledTasks: [],
    projects: [],
    projectTasks: [],
    skillInvocations: [],
    artifacts: []
  };
}

function insertMessage(sqlitePath, message) {
  execSql(sqlitePath, `
    insert into messages (
      id, room_id, conversation_id, sender_type, sender_name, content,
      status, pending, run_id, reply_to_json, created_at, updated_at
    ) values (
      ${sqlString(message.id)},
      ${sqlString(message.roomId ?? message.conversationId)},
      ${sqlString(message.conversationId ?? message.roomId)},
      ${sqlString(message.senderType ?? 'user')},
      ${sqlString(message.senderName ?? 'You')},
      ${sqlString(message.content ?? '')},
      ${sqlValue(message.status)},
      ${message.pending === undefined ? 'null' : Number(Boolean(message.pending))},
      ${sqlValue(message.runId)},
      ${message.replyTo ? sqlString(JSON.stringify(message.replyTo)) : 'null'},
      ${sqlString(message.createdAt ?? nowIso())},
      ${sqlValue(message.updatedAt)}
    )
    on conflict(id) do update set
      room_id = excluded.room_id,
      conversation_id = excluded.conversation_id,
      sender_type = excluded.sender_type,
      sender_name = excluded.sender_name,
      content = excluded.content,
      status = excluded.status,
      pending = excluded.pending,
      run_id = excluded.run_id,
      reply_to_json = excluded.reply_to_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;
  `);
}

function updateMessageRow(sqlitePath, id, input, updatedAt) {
  const fields = [];
  addInputField(fields, input, 'roomId', 'room_id');
  addInputField(fields, input, 'conversationId', 'conversation_id');
  addInputField(fields, input, 'senderType', 'sender_type');
  addInputField(fields, input, 'senderName', 'sender_name');
  addInputField(fields, input, 'content', 'content');
  addInputField(fields, input, 'status', 'status');
  if (Object.hasOwn(input, 'pending')) fields.push(`pending = ${input.pending === undefined ? 'null' : Number(Boolean(input.pending))}`);
  addInputField(fields, input, 'runId', 'run_id');
  if (Object.hasOwn(input, 'replyTo')) fields.push(`reply_to_json = ${input.replyTo ? sqlString(JSON.stringify(input.replyTo)) : 'null'}`);
  fields.push(`updated_at = ${sqlString(updatedAt)}`);
  execSql(sqlitePath, `
    update messages set ${fields.join(', ')}
    where id = ${sqlString(id)};
  `);
}

function insertAgentRun(sqlitePath, run) {
  execSql(sqlitePath, `
    insert into agent_runs (
      id, room_id, agent_id, message_id, status, attempts, turn, max_turns,
      error, created_at, updated_at, started_at, completed_at, stopped_at,
      recovered_at, retried_at, last_attempt_at
    ) values (
      ${sqlString(run.id)},
      ${sqlString(run.roomId)},
      ${sqlString(run.agentId)},
      ${sqlValue(run.messageId)},
      ${sqlString(run.status ?? 'queued')},
      ${Number(run.attempts ?? 0)},
      ${Number(run.turn ?? 1)},
      ${Number(run.maxTurns ?? 6)},
      ${sqlValue(run.error)},
      ${sqlString(run.createdAt ?? nowIso())},
      ${sqlValue(run.updatedAt)},
      ${sqlValue(run.startedAt)},
      ${sqlValue(run.completedAt)},
      ${sqlValue(run.stoppedAt)},
      ${sqlValue(run.recoveredAt)},
      ${sqlValue(run.retriedAt)},
      ${sqlValue(run.lastAttemptAt)}
    )
    on conflict(id) do update set
      room_id = excluded.room_id,
      agent_id = excluded.agent_id,
      message_id = excluded.message_id,
      status = excluded.status,
      attempts = excluded.attempts,
      turn = excluded.turn,
      max_turns = excluded.max_turns,
      error = excluded.error,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      stopped_at = excluded.stopped_at,
      recovered_at = excluded.recovered_at,
      retried_at = excluded.retried_at,
      last_attempt_at = excluded.last_attempt_at;
  `);
}

function updateAgentRunRow(sqlitePath, id, input, updatedAt) {
  const fields = [];
  addInputField(fields, input, 'roomId', 'room_id');
  addInputField(fields, input, 'agentId', 'agent_id');
  addInputField(fields, input, 'messageId', 'message_id');
  addInputField(fields, input, 'status', 'status');
  addInputField(fields, input, 'attempts', 'attempts', 'number');
  addInputField(fields, input, 'turn', 'turn', 'number');
  addInputField(fields, input, 'maxTurns', 'max_turns', 'number');
  addInputField(fields, input, 'error', 'error');
  addInputField(fields, input, 'startedAt', 'started_at');
  addInputField(fields, input, 'completedAt', 'completed_at');
  addInputField(fields, input, 'stoppedAt', 'stopped_at');
  addInputField(fields, input, 'recoveredAt', 'recovered_at');
  addInputField(fields, input, 'retriedAt', 'retried_at');
  addInputField(fields, input, 'lastAttemptAt', 'last_attempt_at');
  fields.push(`updated_at = ${sqlString(updatedAt)}`);
  execSql(sqlitePath, `
    update agent_runs set ${fields.join(', ')}
    where id = ${sqlString(id)};
  `);
}

function insertScheduledTask(sqlitePath, task) {
  execSql(sqlitePath, `
    insert into scheduled_tasks (
      id, room_id, agent_id, title, instructions, schedule_at, status,
      run_id, message_id, error, created_by, repeat_interval, parent_task_id, depends_on_task_id, depends_on_task_ids, created_at, updated_at,
      started_at, completed_at, cancelled_at
    ) values (
      ${sqlString(task.id)},
      ${sqlString(task.roomId)},
      ${sqlString(task.agentId)},
      ${sqlString(task.title ?? 'Scheduled Task')},
      ${sqlString(task.instructions ?? '')},
      ${sqlString(task.scheduleAt)},
      ${sqlString(task.status ?? 'scheduled')},
      ${sqlValue(task.runId)},
      ${sqlValue(task.messageId)},
      ${sqlValue(task.error)},
      ${sqlString(task.createdBy ?? 'user')},
      ${sqlValue(task.repeatInterval)},
      ${sqlValue(task.parentTaskId)},
      ${sqlValue(task.dependsOnTaskId)},
      ${sqlValue(JSON.stringify(task.dependsOnTaskIds ?? []))},
      ${sqlString(task.createdAt ?? nowIso())},
      ${sqlValue(task.updatedAt)},
      ${sqlValue(task.startedAt)},
      ${sqlValue(task.completedAt)},
      ${sqlValue(task.cancelledAt)}
    )
    on conflict(id) do update set
      room_id = excluded.room_id,
      agent_id = excluded.agent_id,
      title = excluded.title,
      instructions = excluded.instructions,
      schedule_at = excluded.schedule_at,
      status = excluded.status,
      run_id = excluded.run_id,
      message_id = excluded.message_id,
      error = excluded.error,
      created_by = excluded.created_by,
      repeat_interval = excluded.repeat_interval,
      parent_task_id = excluded.parent_task_id,
      depends_on_task_id = excluded.depends_on_task_id,
      depends_on_task_ids = excluded.depends_on_task_ids,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      cancelled_at = excluded.cancelled_at;
  `);
}

function updateScheduledTaskRow(sqlitePath, id, input, updatedAt) {
  const fields = [];
  addInputField(fields, input, 'roomId', 'room_id');
  addInputField(fields, input, 'agentId', 'agent_id');
  addInputField(fields, input, 'title', 'title');
  addInputField(fields, input, 'instructions', 'instructions');
  addInputField(fields, input, 'scheduleAt', 'schedule_at');
  addInputField(fields, input, 'status', 'status');
  addInputField(fields, input, 'runId', 'run_id');
  addInputField(fields, input, 'messageId', 'message_id');
  addInputField(fields, input, 'error', 'error');
  addInputField(fields, input, 'createdBy', 'created_by');
  addInputField(fields, input, 'repeatInterval', 'repeat_interval');
  addInputField(fields, input, 'parentTaskId', 'parent_task_id');
  if (Object.hasOwn(input, 'dependsOnTaskIds') || Object.hasOwn(input, 'dependsOnTaskId')) {
    const dependsOnTaskIds = normalizeDependencyIds(input);
    fields.push(`depends_on_task_id = ${sqlValue(dependsOnTaskIds[0])}`);
    fields.push(`depends_on_task_ids = ${sqlValue(JSON.stringify(dependsOnTaskIds))}`);
  }
  addInputField(fields, input, 'startedAt', 'started_at');
  addInputField(fields, input, 'completedAt', 'completed_at');
  addInputField(fields, input, 'cancelledAt', 'cancelled_at');
  fields.push(`updated_at = ${sqlString(updatedAt)}`);
  execSql(sqlitePath, `
    update scheduled_tasks set ${fields.join(', ')}
    where id = ${sqlString(id)};
  `);
}

function insertProject(sqlitePath, project) {
  execSql(sqlitePath, `
    insert into projects (
      id, room_id, name, slug, type, template_id, root_path, entry_path,
      brief, status, current_phase, error, created_at, updated_at, archived_at
    ) values (
      ${sqlString(project.id)},
      ${sqlString(project.roomId)},
      ${sqlString(project.name ?? 'Untitled Project')},
      ${sqlString(project.slug ?? project.id)},
      ${sqlString(project.type ?? 'static-web')},
      ${sqlString(project.templateId ?? project.type ?? 'static-web')},
      ${sqlString(project.rootPath ?? `projects/${project.slug ?? project.id}`)},
      ${sqlValue(project.entryPath)},
      ${sqlString(project.brief ?? '')},
      ${sqlString(project.status ?? 'planning')},
      ${sqlValue(project.currentPhase)},
      ${sqlValue(project.error)},
      ${sqlString(project.createdAt ?? nowIso())},
      ${sqlValue(project.updatedAt)},
      ${sqlValue(project.archivedAt)}
    )
    on conflict(id) do update set
      room_id = excluded.room_id,
      name = excluded.name,
      slug = excluded.slug,
      type = excluded.type,
      template_id = excluded.template_id,
      root_path = excluded.root_path,
      entry_path = excluded.entry_path,
      brief = excluded.brief,
      status = excluded.status,
      current_phase = excluded.current_phase,
      error = excluded.error,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      archived_at = excluded.archived_at;
  `);
}

function updateProjectRow(sqlitePath, id, input, updatedAt) {
  const fields = [];
  addInputField(fields, input, 'roomId', 'room_id');
  addInputField(fields, input, 'name', 'name');
  addInputField(fields, input, 'slug', 'slug');
  addInputField(fields, input, 'type', 'type');
  addInputField(fields, input, 'templateId', 'template_id');
  addInputField(fields, input, 'rootPath', 'root_path');
  addInputField(fields, input, 'entryPath', 'entry_path');
  addInputField(fields, input, 'brief', 'brief');
  addInputField(fields, input, 'status', 'status');
  addInputField(fields, input, 'currentPhase', 'current_phase');
  addInputField(fields, input, 'error', 'error');
  addInputField(fields, input, 'archivedAt', 'archived_at');
  fields.push(`updated_at = ${sqlString(updatedAt)}`);
  execSql(sqlitePath, `
    update projects set ${fields.join(', ')}
    where id = ${sqlString(id)};
  `);
}

function insertProjectTask(sqlitePath, task) {
  execSql(sqlitePath, `
    insert into project_tasks (
      id, project_id, room_id, agent_id, role_id, phase, title, instructions,
      status, depends_on_task_id, depends_on_task_ids, run_id, message_id, result_summary, error,
      created_at, updated_at, started_at, completed_at
    ) values (
      ${sqlString(task.id)},
      ${sqlString(task.projectId)},
      ${sqlString(task.roomId)},
      ${sqlValue(task.agentId)},
      ${sqlString(task.roleId ?? 'general')},
      ${sqlString(task.phase ?? 'development')},
      ${sqlString(task.title ?? 'Project Task')},
      ${sqlString(task.instructions ?? '')},
      ${sqlString(task.status ?? 'queued')},
      ${sqlValue(task.dependsOnTaskId)},
      ${sqlValue(JSON.stringify(normalizeDependencyIds(task)))},
      ${sqlValue(task.runId)},
      ${sqlValue(task.messageId)},
      ${sqlValue(task.resultSummary)},
      ${sqlValue(task.error)},
      ${sqlString(task.createdAt ?? nowIso())},
      ${sqlValue(task.updatedAt)},
      ${sqlValue(task.startedAt)},
      ${sqlValue(task.completedAt)}
    )
    on conflict(id) do update set
      project_id = excluded.project_id,
      room_id = excluded.room_id,
      agent_id = excluded.agent_id,
      role_id = excluded.role_id,
      phase = excluded.phase,
      title = excluded.title,
      instructions = excluded.instructions,
      status = excluded.status,
      depends_on_task_id = excluded.depends_on_task_id,
      depends_on_task_ids = excluded.depends_on_task_ids,
      run_id = excluded.run_id,
      message_id = excluded.message_id,
      result_summary = excluded.result_summary,
      error = excluded.error,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at;
  `);
}

function updateProjectTaskRow(sqlitePath, id, input, updatedAt) {
  const fields = [];
  addInputField(fields, input, 'projectId', 'project_id');
  addInputField(fields, input, 'roomId', 'room_id');
  addInputField(fields, input, 'agentId', 'agent_id');
  addInputField(fields, input, 'roleId', 'role_id');
  addInputField(fields, input, 'phase', 'phase');
  addInputField(fields, input, 'title', 'title');
  addInputField(fields, input, 'instructions', 'instructions');
  addInputField(fields, input, 'status', 'status');
  if (Object.hasOwn(input, 'dependsOnTaskIds') || Object.hasOwn(input, 'dependsOnTaskId')) {
    const dependsOnTaskIds = normalizeDependencyIds(input);
    fields.push(`depends_on_task_id = ${sqlValue(dependsOnTaskIds[0])}`);
    fields.push(`depends_on_task_ids = ${sqlValue(JSON.stringify(dependsOnTaskIds))}`);
  }
  addInputField(fields, input, 'runId', 'run_id');
  addInputField(fields, input, 'messageId', 'message_id');
  addInputField(fields, input, 'resultSummary', 'result_summary');
  addInputField(fields, input, 'error', 'error');
  addInputField(fields, input, 'startedAt', 'started_at');
  addInputField(fields, input, 'completedAt', 'completed_at');
  fields.push(`updated_at = ${sqlString(updatedAt)}`);
  execSql(sqlitePath, `
    update project_tasks set ${fields.join(', ')}
    where id = ${sqlString(id)};
  `);
}

function insertSkillInvocation(sqlitePath, invocation) {
  execSql(sqlitePath, `
    insert into skill_invocations (
      id, skill_id, room_id, run_id, message_id, agent_id, actor_type,
      status, input_json, output_json, error, created_at, updated_at,
      started_at, completed_at
    ) values (
      ${sqlString(invocation.id)},
      ${sqlString(invocation.skillId)},
      ${sqlString(invocation.roomId)},
      ${sqlValue(invocation.runId)},
      ${sqlValue(invocation.messageId)},
      ${sqlValue(invocation.agentId)},
      ${sqlString(invocation.actorType ?? 'agent')},
      ${sqlString(invocation.status ?? 'queued')},
      ${sqlString(JSON.stringify(invocation.input ?? {}))},
      ${invocation.output === undefined ? 'null' : sqlString(JSON.stringify(invocation.output ?? {}))},
      ${sqlValue(invocation.error)},
      ${sqlString(invocation.createdAt ?? nowIso())},
      ${sqlValue(invocation.updatedAt)},
      ${sqlValue(invocation.startedAt)},
      ${sqlValue(invocation.completedAt)}
    )
    on conflict(id) do update set
      skill_id = excluded.skill_id,
      room_id = excluded.room_id,
      run_id = excluded.run_id,
      message_id = excluded.message_id,
      agent_id = excluded.agent_id,
      actor_type = excluded.actor_type,
      status = excluded.status,
      input_json = excluded.input_json,
      output_json = excluded.output_json,
      error = excluded.error,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at;
  `);
}

function updateSkillInvocationRow(sqlitePath, id, input, updatedAt) {
  const fields = [];
  addInputField(fields, input, 'skillId', 'skill_id');
  addInputField(fields, input, 'roomId', 'room_id');
  addInputField(fields, input, 'runId', 'run_id');
  addInputField(fields, input, 'messageId', 'message_id');
  addInputField(fields, input, 'agentId', 'agent_id');
  addInputField(fields, input, 'actorType', 'actor_type');
  addInputField(fields, input, 'status', 'status');
  if (Object.hasOwn(input, 'input')) fields.push(`input_json = ${sqlString(JSON.stringify(input.input ?? {}))}`);
  if (Object.hasOwn(input, 'output')) fields.push(`output_json = ${input.output === undefined ? 'null' : sqlString(JSON.stringify(input.output ?? {}))}`);
  addInputField(fields, input, 'error', 'error');
  addInputField(fields, input, 'startedAt', 'started_at');
  addInputField(fields, input, 'completedAt', 'completed_at');
  fields.push(`updated_at = ${sqlString(updatedAt)}`);
  execSql(sqlitePath, `
    update skill_invocations set ${fields.join(', ')}
    where id = ${sqlString(id)};
  `);
}

function insertSkillApproval(sqlitePath, approval) {
  execSql(sqlitePath, `
    insert into skill_approvals (
      id, room_id, invocation_id, skill_id, status, title, reason,
      input_json, requested_by, decided_by, created_at, updated_at, decided_at
    ) values (
      ${sqlString(approval.id)},
      ${sqlString(approval.roomId)},
      ${sqlValue(approval.invocationId)},
      ${sqlString(approval.skillId)},
      ${sqlString(approval.status ?? 'pending')},
      ${sqlString(approval.title ?? 'Approval required')},
      ${sqlValue(approval.reason)},
      ${sqlString(JSON.stringify(approval.input ?? {}))},
      ${sqlString(approval.requestedBy ?? 'system')},
      ${sqlValue(approval.decidedBy)},
      ${sqlString(approval.createdAt ?? nowIso())},
      ${sqlValue(approval.updatedAt)},
      ${sqlValue(approval.decidedAt)}
    )
    on conflict(id) do update set
      room_id = excluded.room_id,
      invocation_id = excluded.invocation_id,
      skill_id = excluded.skill_id,
      status = excluded.status,
      title = excluded.title,
      reason = excluded.reason,
      input_json = excluded.input_json,
      requested_by = excluded.requested_by,
      decided_by = excluded.decided_by,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      decided_at = excluded.decided_at;
  `);
}

function updateSkillApprovalRow(sqlitePath, id, input, updatedAt) {
  const fields = [];
  addInputField(fields, input, 'roomId', 'room_id');
  addInputField(fields, input, 'invocationId', 'invocation_id');
  addInputField(fields, input, 'skillId', 'skill_id');
  addInputField(fields, input, 'status', 'status');
  addInputField(fields, input, 'title', 'title');
  addInputField(fields, input, 'reason', 'reason');
  if (Object.hasOwn(input, 'input')) fields.push(`input_json = ${sqlString(JSON.stringify(input.input ?? {}))}`);
  addInputField(fields, input, 'requestedBy', 'requested_by');
  addInputField(fields, input, 'decidedBy', 'decided_by');
  addInputField(fields, input, 'decidedAt', 'decided_at');
  fields.push(`updated_at = ${sqlString(updatedAt)}`);
  execSql(sqlitePath, `
    update skill_approvals set ${fields.join(', ')}
    where id = ${sqlString(id)};
  `);
}

function insertArtifact(sqlitePath, artifact) {
  execSql(sqlitePath, `
    insert into artifacts (
      id, room_id, invocation_id, run_id, message_id, agent_id, kind,
      title, path, mime_type, metadata_json, created_at, updated_at
    ) values (
      ${sqlString(artifact.id)},
      ${sqlString(artifact.roomId)},
      ${sqlValue(artifact.invocationId)},
      ${sqlValue(artifact.runId)},
      ${sqlValue(artifact.messageId)},
      ${sqlValue(artifact.agentId)},
      ${sqlString(artifact.kind)},
      ${sqlString(artifact.title ?? artifact.path ?? artifact.kind)},
      ${sqlValue(artifact.path)},
      ${sqlValue(artifact.mimeType)},
      ${sqlString(JSON.stringify(artifact.metadata ?? {}))},
      ${sqlString(artifact.createdAt ?? nowIso())},
      ${sqlValue(artifact.updatedAt)}
    )
    on conflict(id) do update set
      room_id = excluded.room_id,
      invocation_id = excluded.invocation_id,
      run_id = excluded.run_id,
      message_id = excluded.message_id,
      agent_id = excluded.agent_id,
      kind = excluded.kind,
      title = excluded.title,
      path = excluded.path,
      mime_type = excluded.mime_type,
      metadata_json = excluded.metadata_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;
  `);
}

function addInputField(fields, input, prop, column, type = 'text') {
  if (!Object.hasOwn(input, prop)) {
    return;
  }
  const value = input[prop];
  if (value === undefined || value === null) {
    fields.push(`${column} = null`);
  } else if (type === 'number') {
    fields.push(`${column} = ${Number(value)}`);
  } else {
    fields.push(`${column} = ${sqlString(value)}`);
  }
}

function rowToMessage(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    senderName: row.sender_name,
    content: row.content,
    status: row.status ?? undefined,
    pending: row.pending === null || row.pending === undefined ? undefined : Boolean(row.pending),
    runId: row.run_id ?? undefined,
    replyTo: row.reply_to_json ? JSON.parse(row.reply_to_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined
  };
}

function rowToAgentRun(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    agentId: row.agent_id,
    messageId: row.message_id ?? undefined,
    status: row.status,
    attempts: Number(row.attempts ?? 0),
    turn: Number(row.turn ?? 1),
    maxTurns: Number(row.max_turns ?? 6),
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    stoppedAt: row.stopped_at ?? undefined,
    recoveredAt: row.recovered_at ?? undefined,
    retriedAt: row.retried_at ?? undefined,
    lastAttemptAt: row.last_attempt_at ?? undefined
  };
}

function rowToScheduledTask(row) {
  const dependsOnTaskIds = normalizeDependencyIds({
    dependsOnTaskIds: parseJsonArray(row.depends_on_task_ids),
    dependsOnTaskId: row.depends_on_task_id
  });
  return {
    id: row.id,
    roomId: row.room_id,
    agentId: row.agent_id,
    title: row.title,
    instructions: row.instructions,
    scheduleAt: row.schedule_at,
    status: row.status,
    runId: row.run_id ?? undefined,
    messageId: row.message_id ?? undefined,
    error: row.error ?? undefined,
    createdBy: row.created_by,
    repeatInterval: row.repeat_interval ?? undefined,
    parentTaskId: row.parent_task_id ?? undefined,
    dependsOnTaskId: dependsOnTaskIds[0],
    dependsOnTaskIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined
  };
}

function rowToProject(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    templateId: row.template_id,
    rootPath: row.root_path,
    entryPath: row.entry_path ?? undefined,
    brief: row.brief,
    status: row.status,
    currentPhase: row.current_phase ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    archivedAt: row.archived_at ?? undefined
  };
}

function rowToProjectTask(row) {
  const dependsOnTaskIds = normalizeDependencyIds({
    dependsOnTaskIds: parseJsonArray(row.depends_on_task_ids),
    dependsOnTaskId: row.depends_on_task_id
  });
  return {
    id: row.id,
    projectId: row.project_id,
    roomId: row.room_id,
    agentId: row.agent_id ?? undefined,
    roleId: row.role_id,
    phase: row.phase,
    title: row.title,
    instructions: row.instructions,
    status: row.status,
    dependsOnTaskId: dependsOnTaskIds[0],
    dependsOnTaskIds,
    runId: row.run_id ?? undefined,
    messageId: row.message_id ?? undefined,
    resultSummary: row.result_summary ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined
  };
}

function rowToSkillInvocation(row) {
  return {
    id: row.id,
    skillId: row.skill_id,
    roomId: row.room_id,
    runId: row.run_id ?? undefined,
    messageId: row.message_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    actorType: row.actor_type,
    status: row.status,
    input: row.input_json ? JSON.parse(row.input_json) : {},
    output: row.output_json ? JSON.parse(row.output_json) : {},
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined
  };
}

function rowToSkillApproval(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    invocationId: row.invocation_id ?? undefined,
    skillId: row.skill_id,
    status: row.status,
    title: row.title,
    reason: row.reason ?? undefined,
    input: row.input_json ? JSON.parse(row.input_json) : {},
    requestedBy: row.requested_by,
    decidedBy: row.decided_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    decidedAt: row.decided_at ?? undefined
  };
}

function rowToArtifact(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    invocationId: row.invocation_id ?? undefined,
    runId: row.run_id ?? undefined,
    messageId: row.message_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    kind: row.kind,
    title: row.title,
    path: row.path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined
  };
}

function normalizeDependencyIds(input) {
  const ids = [];
  if (Array.isArray(input?.dependsOnTaskIds)) ids.push(...input.dependsOnTaskIds);
  if (input?.dependsOnTaskId) ids.push(input.dependsOnTaskId);
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ensureColumn(sqlitePath, table, column, definition) {
  const columns = execJson(sqlitePath, `pragma table_info(${table});`);
  if (columns.some((item) => item.name === column)) return;
  execSql(sqlitePath, `alter table ${table} add column ${column} ${definition};`);
}

function sqlValue(value) {
  return value === undefined || value === null ? 'null' : sqlString(value);
}

function execJson(sqlitePath, sql) {
  const raw = execFileSync('sqlite3', ['-json', sqlitePath, sql], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  }).trim();
  return raw ? JSON.parse(raw) : [];
}

function execSql(sqlitePath, sql) {
  return execFileSync('sqlite3', [sqlitePath, sql], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
}
