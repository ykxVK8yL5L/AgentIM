import { createId, createInitialState, normalizeSkill, normalizeState, nowIso } from './utils.js';

export class MemoryStore {
  constructor(initialState = createInitialState()) {
    this.state = normalizeState(initialState);
    this.kind = 'memory';
  }

  async info() {
    return { kind: this.kind };
  }

  async bootstrap() {
    return this.snapshot();
  }

  async getSettings() {
    return this.state.settings;
  }

  async updateSettings(input) {
    this.state.settings = {
      ...this.state.settings,
      ...input,
      auth: {
        ...this.state.settings.auth,
        ...input.auth
      },
      network: {
        ...this.state.settings.network,
        ...input.network
      },
      chat: {
        ...this.state.settings.chat,
        ...input.chat
      },
      approvals: {
        ...this.state.settings.approvals,
        ...input.approvals
      },
      circles: {
        ...this.state.settings.circles,
        ...input.circles
      },
      updatedAt: nowIso()
    };
    await this.persist();
    return this.state.settings;
  }

  async listProviders() {
    return this.state.modelProviders;
  }

  async getProvider(id) {
    return this.state.modelProviders.find((item) => item.id === id) ?? null;
  }

  async createProvider(input) {
    const provider = {
      id: createId(),
      protocol: 'openai_chat_completions',
      enabled: true,
      createdAt: nowIso(),
      ...input
    };
    this.state.modelProviders.push(provider);
    await this.persist();
    return provider;
  }

  async updateProvider(id, input) {
    const provider = await this.getProvider(id);
    if (!provider) return null;

    const next = {
      ...provider,
      ...input,
      id: provider.id,
      protocol: input.protocol ?? provider.protocol,
      apiKey: input.apiKey || provider.apiKey,
      updatedAt: nowIso()
    };
    Object.assign(provider, next);
    await this.persist();
    return provider;
  }

  async deleteProvider(id) {
    const dependentAgentIds = this.state.agents
      .filter((agent) => agent.providerId === id)
      .map((agent) => agent.id);
    this.state.modelProviders = this.state.modelProviders.filter((item) => item.id !== id);
    this.state.agents = this.state.agents.filter((item) => item.providerId !== id);
    this.state.roomAgents = this.state.roomAgents.filter((item) => !dependentAgentIds.includes(item.agentId));
    await this.persist();
  }

  async listAgents() {
    return this.state.agents;
  }

  async listSkills() {
    return this.state.skills;
  }

  async getSkill(id) {
    return this.state.skills.find((item) => item.id === id) ?? null;
  }

  async installSkill(input) {
    const current = await this.getSkill(input.id);
    const skill = normalizeSkill({
      ...input,
      common: current?.common ?? false,
      enabled: input.enabled ?? current?.enabled ?? true,
      source: input.source ?? current?.source ?? 'manual',
      createdAt: current?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    }, current);
    if (current) {
      Object.assign(current, skill, {
        id: current.id,
        common: current.common,
        source: current.common ? 'system' : skill.source
      });
    } else {
      this.state.skills.push(skill);
    }
    await this.persist();
    return current ?? skill;
  }

  async updateSkill(id, input) {
    const skill = await this.getSkill(id);
    if (!skill) return null;
    Object.assign(skill, normalizeSkill({
      ...skill,
      ...input,
      id: skill.id,
      common: skill.common,
      updatedAt: nowIso()
    }, skill), {
      id: skill.id,
      common: skill.common,
      source: skill.common ? 'system' : input.source ?? skill.source
    });
    await this.persist();
    return skill;
  }

  async deleteSkill(id) {
    const skill = await this.getSkill(id);
    if (!skill || skill.common) return false;
    this.state.skills = this.state.skills.filter((item) => item.id !== id);
    await this.persist();
    return true;
  }

  async listRoles() {
    return this.state.roles;
  }

  async getRole(id) {
    return this.state.roles.find((item) => item.id === id) ?? null;
  }

  async createRole(input) {
    const role = {
      id: createId(),
      name: input.name,
      description: input.description ?? '',
      systemPrompt: input.systemPrompt ?? '',
      skillIds: normalizeRoleSkillIds(input.skillIds),
      system: false,
      createdAt: nowIso()
    };
    this.state.roles.push(role);
    await this.persist();
    return role;
  }

  async updateRole(id, input) {
    const role = await this.getRole(id);
    if (!role) return null;
    Object.assign(role, {
      ...role,
      ...input,
      id: role.id,
      system: role.system,
      skillIds: input.skillIds === undefined ? role.skillIds ?? [] : normalizeRoleSkillIds(input.skillIds),
      updatedAt: nowIso()
    });
    await this.persist();
    return role;
  }

  async deleteRole(id) {
    const role = await this.getRole(id);
    if (!role || role.system) return false;
    this.state.roles = this.state.roles.filter((item) => item.id !== id);
    for (const agent of this.state.agents) {
      if (agent.roleId === id) agent.roleId = 'general';
    }
    await this.persist();
    return true;
  }

  async getAgent(id) {
    return this.state.agents.find((item) => item.id === id) ?? null;
  }

  async createAgent(input) {
    const agent = {
      id: createId(),
      bio: '',
      runtimeType: 'hosted_agent',
      status: 'online',
      createdAt: nowIso(),
      ...input
    };
    this.state.agents.push(agent);
    await this.persist();
    return agent;
  }

  async updateAgent(id, input) {
    const agent = await this.getAgent(id);
    if (!agent) return null;

    Object.assign(agent, {
      ...agent,
      ...input,
      id: agent.id,
      updatedAt: nowIso()
    });
    await this.persist();
    return agent;
  }

  async deleteAgent(id) {
    this.state.agents = this.state.agents.filter((item) => item.id !== id);
    this.state.roomAgents = this.state.roomAgents.filter((item) => item.agentId !== id);
    await this.persist();
  }

  async listRooms() {
    return this.state.rooms;
  }

  async getRoom(id) {
    return this.state.rooms.find((item) => item.id === id) ?? null;
  }

  async createRoom(input) {
    const room = {
      id: createId(),
      type: input.type === 'dm' ? 'dm' : 'group',
      name: input.name,
      description: input.description ?? '',
      dmAgentId: input.dmAgentId ? String(input.dmAgentId) : undefined,
      createdAt: nowIso()
    };
    this.state.rooms.push(room);
    await this.persist();
    return room;
  }

  async updateRoom(id, input) {
    const room = await this.getRoom(id);
    if (!room) return null;

    Object.assign(room, {
      ...room,
      ...input,
      id: room.id,
      type: input.type === 'dm' ? 'dm' : input.type === 'group' ? 'group' : room.type,
      dmAgentId: input.dmAgentId ? String(input.dmAgentId) : room.dmAgentId,
      updatedAt: nowIso()
    });
    await this.persist();
    return room;
  }

  async deleteRoom(id) {
    this.state.rooms = this.state.rooms.filter((item) => item.id !== id);
    this.state.roomAgents = this.state.roomAgents.filter((item) => item.roomId !== id);
    this.state.messages = this.state.messages.filter((item) => item.roomId !== id && item.conversationId !== id);
    this.state.agentRuns = this.state.agentRuns.filter((item) => item.roomId !== id);
    for (const project of this.state.projects) {
      if (project.roomId === id && project.status !== 'archived') {
        project.status = 'archived';
        project.archivedAt = nowIso();
      }
    }
    this.state.roomWorkspaces = this.state.roomWorkspaces.filter((item) => item.roomId !== id);
    await this.persist();
  }

  async listRoomAgents(roomId) {
    const joins = this.state.roomAgents.filter((item) => item.roomId === roomId && item.enabled !== false);
    return joins
      .map((join) => {
        const agent = this.state.agents.find((item) => item.id === join.agentId);
        return agent ? { ...agent, roomAgent: join } : null;
      })
      .filter(Boolean);
  }

  async attachAgentToRoom(roomId, agentId, input = {}) {
    const existing = this.state.roomAgents.find((item) => item.roomId === roomId && item.agentId === agentId);
    if (existing) {
      existing.enabled = true;
      existing.triggerMode = input.triggerMode ?? existing.triggerMode ?? 'manual';
      await this.persist();
      return existing;
    }
    const join = {
      id: createId(),
      roomId,
      agentId,
      role: input.role ?? 'assistant',
      triggerMode: input.triggerMode ?? 'manual',
      enabled: true,
      joinedAt: nowIso()
    };
    this.state.roomAgents.push(join);
    await this.persist();
    return join;
  }

  async detachAgentFromRoom(roomId, agentId) {
    const existing = this.state.roomAgents.find((item) => item.roomId === roomId && item.agentId === agentId);
    if (existing) existing.enabled = false;
    await this.persist();
  }

  async listMessages(roomId, options = {}) {
    const messages = this.state.messages
      .filter((item) => item.roomId === roomId || item.conversationId === roomId)
      .sort(compareMessagesAsc);
    const beforeCreatedAt = options.beforeCreatedAt;
    const beforeId = options.beforeId;
    const filtered = beforeCreatedAt
      ? messages.filter((item) => isBeforeMessageCursor(item, beforeCreatedAt, beforeId))
      : messages;
    if (!options.limit) return filtered;
    return filtered.slice(-options.limit);
  }

  async createMessage(input) {
    const message = {
      id: createId(),
      roomId: input.roomId,
      conversationId: input.roomId,
      senderType: input.senderType ?? 'user',
      senderName: input.senderName ?? 'You',
      content: input.content,
      status: input.status,
      pending: input.pending,
      runId: input.runId,
      replyTo: input.replyTo,
      createdAt: nowIso()
    };
    this.state.messages.push(message);
    await this.persist();
    return message;
  }

  async updateMessageContent(id, content) {
    const message = this.state.messages.find((item) => item.id === id);
    if (message) message.content = content;
    await this.persist();
    return message ?? null;
  }

  async updateMessage(id, input) {
    const message = this.state.messages.find((item) => item.id === id);
    if (!message) return null;

    Object.assign(message, {
      ...message,
      ...input,
      id: message.id,
      updatedAt: nowIso()
    });
    await this.persist();
    return message;
  }

  async listAgentRuns(roomId) {
    if (!roomId) return this.state.agentRuns;
    return this.state.agentRuns.filter((item) => item.roomId === roomId);
  }

  async getAgentRun(id) {
    return this.state.agentRuns.find((item) => item.id === id) ?? null;
  }

  async createAgentRun(input) {
    const run = {
      id: createId(),
      roomId: input.roomId,
      agentId: input.agentId,
      messageId: input.messageId,
      status: input.status ?? 'queued',
      attempts: input.attempts ?? 0,
      turn: input.turn ?? 1,
      maxTurns: input.maxTurns ?? 6,
      createdAt: nowIso()
    };
    this.state.agentRuns.push(run);
    await this.persist();
    return run;
  }

  async updateAgentRun(id, input) {
    const run = await this.getAgentRun(id);
    if (!run) return null;

    Object.assign(run, {
      ...run,
      ...input,
      id: run.id,
      updatedAt: nowIso()
    });
    await this.persist();
    return run;
  }

  async listProjects(roomId) {
    return this.state.projects
      .filter((item) => !roomId || item.roomId === roomId)
      .sort(compareMessagesAsc);
  }

  async getProject(id) {
    return this.state.projects.find((item) => item.id === id) ?? null;
  }

  async createProject(input) {
    const project = {
      id: createId(),
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
      createdAt: nowIso()
    };
    this.state.projects.push(project);
    await this.persist();
    return project;
  }

  async updateProject(id, input) {
    const project = await this.getProject(id);
    if (!project) return null;
    Object.assign(project, {
      ...project,
      ...input,
      id: project.id,
      updatedAt: nowIso()
    });
    await this.persist();
    return project;
  }

  async deleteProject(id) {
    const project = await this.getProject(id);
    if (!project) return null;
    this.state.projects = this.state.projects.filter((item) => item.id !== id);
    this.state.projectTasks = this.state.projectTasks.filter((item) => item.projectId !== id);
    await this.persist();
    return project;
  }

  async listProjectTasks(projectIdOrRoomId, options = {}) {
    let tasks = this.state.projectTasks;
    if (options.byRoom) tasks = tasks.filter((item) => item.roomId === projectIdOrRoomId);
    else if (projectIdOrRoomId) tasks = tasks.filter((item) => item.projectId === projectIdOrRoomId);
    if (Array.isArray(options.statuses) && options.statuses.length > 0) {
      tasks = tasks.filter((item) => options.statuses.includes(item.status));
    }
    return tasks.sort(compareMessagesAsc);
  }

  async getProjectTask(id) {
    return this.state.projectTasks.find((item) => item.id === id) ?? null;
  }

  async getProjectTaskByRunId(runId) {
    return this.state.projectTasks.find((item) => item.runId === runId) ?? null;
  }

  async createProjectTask(input) {
    const dependsOnTaskIds = normalizeDependencyIds(input);
    const task = {
      id: createId(),
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
      createdAt: nowIso()
    };
    this.state.projectTasks.push(task);
    await this.persist();
    return task;
  }

  async updateProjectTask(id, input) {
    const task = await this.getProjectTask(id);
    if (!task) return null;
    Object.assign(task, {
      ...task,
      ...input,
      id: task.id,
      updatedAt: nowIso()
    });
    await this.persist();
    return task;
  }

  async deleteProjectTasks(projectId) {
    const tasks = this.state.projectTasks.filter((item) => item.projectId === projectId);
    this.state.projectTasks = this.state.projectTasks.filter((item) => item.projectId !== projectId);
    await this.persist();
    return tasks;
  }

  async listScheduledTasks(roomId, options = {}) {
    let tasks = this.state.scheduledTasks.filter((item) => !roomId || item.roomId === roomId);
    if (Array.isArray(options.statuses) && options.statuses.length > 0) {
      tasks = tasks.filter((item) => options.statuses.includes(item.status));
    }
    if (options.dueBefore) {
      const dueBefore = String(options.dueBefore);
      tasks = tasks.filter((item) => String(item.scheduleAt) <= dueBefore);
    }
    tasks = tasks.sort(compareMessagesAsc);
    const limit = Number(options.limit);
    return Number.isFinite(limit) && limit > 0 ? tasks.slice(0, limit) : tasks;
  }

  async getScheduledTask(id) {
    return this.state.scheduledTasks.find((item) => item.id === id) ?? null;
  }

  async createScheduledTask(input) {
    const dependsOnTaskIds = normalizeDependencyIds(input);
    const task = {
      id: createId(),
      roomId: input.roomId,
      agentId: input.agentId,
      title: input.title,
      instructions: input.instructions,
      scheduleAt: input.scheduleAt,
      status: input.status ?? 'scheduled',
      runId: input.runId,
      messageId: input.messageId,
      repeatInterval: input.repeatInterval,
      parentTaskId: input.parentTaskId,
      dependsOnTaskId: dependsOnTaskIds[0],
      dependsOnTaskIds,
      createdBy: input.createdBy ?? 'user',
      createdAt: nowIso()
    };
    this.state.scheduledTasks.push(task);
    await this.persist();
    return task;
  }

  async updateScheduledTask(id, input) {
    const task = await this.getScheduledTask(id);
    if (!task) return null;
    Object.assign(task, {
      ...task,
      ...input,
      id: task.id,
      updatedAt: nowIso()
    });
    await this.persist();
    return task;
  }

  async deleteScheduledTask(id) {
    const task = await this.getScheduledTask(id);
    if (!task) return null;
    this.state.scheduledTasks = this.state.scheduledTasks.filter((item) => item.id !== id);
    await this.persist();
    return task;
  }

  async listSkillInvocations(roomId, options = {}) {
    const limit = Number(options.limit);
    const invocations = this.state.skillInvocations
      .filter((item) => !roomId || item.roomId === roomId)
      .sort(compareMessagesAsc);
    return Number.isFinite(limit) && limit > 0 ? invocations.slice(-limit) : invocations;
  }

  async getSkillInvocation(id) {
    return this.state.skillInvocations.find((item) => item.id === id) ?? null;
  }

  async createSkillInvocation(input) {
    const invocation = {
      id: createId(),
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
      createdAt: nowIso()
    };
    this.state.skillInvocations.push(invocation);
    await this.persist();
    return invocation;
  }

  async updateSkillInvocation(id, input) {
    const invocation = await this.getSkillInvocation(id);
    if (!invocation) return null;

    Object.assign(invocation, {
      ...invocation,
      ...input,
      id: invocation.id,
      updatedAt: nowIso()
    });
    await this.persist();
    return invocation;
  }

  async listSkillApprovals(roomId, options = {}) {
    const limit = Number(options.limit);
    let approvals = this.state.skillApprovals.filter((item) => !roomId || item.roomId === roomId);
    if (Array.isArray(options.statuses) && options.statuses.length > 0) {
      approvals = approvals.filter((item) => options.statuses.includes(item.status));
    }
    approvals = approvals.sort(compareMessagesAsc);
    return Number.isFinite(limit) && limit > 0 ? approvals.slice(-limit) : approvals;
  }

  async getSkillApproval(id) {
    return this.state.skillApprovals.find((item) => item.id === id) ?? null;
  }

  async createSkillApproval(input) {
    const approval = {
      id: createId(),
      roomId: input.roomId,
      invocationId: input.invocationId,
      skillId: input.skillId,
      status: input.status ?? 'pending',
      title: input.title ?? 'Approval required',
      reason: input.reason ?? '',
      input: input.input ?? {},
      requestedBy: input.requestedBy ?? 'system',
      createdAt: nowIso()
    };
    this.state.skillApprovals.push(approval);
    await this.persist();
    return approval;
  }

  async updateSkillApproval(id, input) {
    const approval = await this.getSkillApproval(id);
    if (!approval) return null;
    Object.assign(approval, {
      ...approval,
      ...input,
      id: approval.id,
      updatedAt: nowIso()
    });
    await this.persist();
    return approval;
  }

  async clearRoomActivity(roomId) {
    const removedInvocations = this.state.skillInvocations.filter((item) => item.roomId === roomId).length;
    const removedArtifacts = this.state.artifacts.filter((item) => item.roomId === roomId).length;
    this.state.skillInvocations = this.state.skillInvocations.filter((item) => item.roomId !== roomId);
    this.state.artifacts = this.state.artifacts.filter((item) => item.roomId !== roomId);
    await this.persist();
    return { removedInvocations, removedArtifacts };
  }

  async listArtifacts(roomId, options = {}) {
    const limit = Number(options.limit);
    const artifacts = this.state.artifacts
      .filter((item) => !roomId || item.roomId === roomId)
      .sort(compareMessagesAsc);
    return Number.isFinite(limit) && limit > 0 ? artifacts.slice(-limit) : artifacts;
  }

  async getArtifact(id) {
    return this.state.artifacts.find((item) => item.id === id) ?? null;
  }

  async createArtifact(input) {
    const artifact = {
      id: createId(),
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
      createdAt: nowIso()
    };
    this.state.artifacts.push(artifact);
    await this.persist();
    return artifact;
  }

  async getWorkspace(id) {
    return this.state.workspaces.find((item) => item.id === id) ?? null;
  }

  async getRoomWorkspace(roomId) {
    const link = this.state.roomWorkspaces.find((item) => item.roomId === roomId);
    if (!link) return null;
    const workspace = await this.getWorkspace(link.workspaceId);
    return workspace ? { ...workspace, roomId } : null;
  }

  async getOrCreateRoomWorkspace(roomId, input = {}) {
    const existing = await this.getRoomWorkspace(roomId);
    if (existing) return existing;

    const workspace = {
      id: createId(),
      kind: input.kind ?? 'local',
      name: input.name ?? 'Room Workspace',
      createdAt: nowIso()
    };
    this.state.workspaces.push(workspace);
    this.state.roomWorkspaces.push({
      id: createId(),
      roomId,
      workspaceId: workspace.id,
      createdAt: nowIso()
    });
    await this.persist();
    return { ...workspace, roomId };
  }

  async persist() {}

  snapshot() {
    return {
      settings: this.state.settings,
      providers: this.state.modelProviders,
      agents: this.state.agents,
      rooms: this.state.rooms,
      conversations: this.state.rooms,
      roomAgents: this.state.roomAgents,
      skills: this.state.skills,
      roles: this.state.roles,
      projects: this.state.projects,
      projectTasks: this.state.projectTasks,
      agentRuns: this.state.agentRuns,
      scheduledTasks: this.state.scheduledTasks,
      skillInvocations: this.state.skillInvocations,
      artifacts: this.state.artifacts,
      workspaces: this.state.workspaces,
      roomWorkspaces: this.state.roomWorkspaces
    };
  }
}

function normalizeRoleSkillIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function normalizeDependencyIds(input) {
  const ids = [];
  if (Array.isArray(input.dependsOnTaskIds)) ids.push(...input.dependsOnTaskIds);
  if (input.dependsOnTaskId) ids.push(input.dependsOnTaskId);
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function compareMessagesAsc(a, b) {
  const byCreatedAt = String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  if (byCreatedAt !== 0) return byCreatedAt;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

function isBeforeMessageCursor(message, beforeCreatedAt, beforeId) {
  const createdAt = String(message.createdAt ?? '');
  const cursorCreatedAt = String(beforeCreatedAt ?? '');
  if (createdAt < cursorCreatedAt) return true;
  if (createdAt > cursorCreatedAt) return false;
  return beforeId ? String(message.id ?? '') < String(beforeId) : false;
}
