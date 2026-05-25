import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export function createId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export const DEFAULT_SKILLS = [
  {
    id: 'workspace.read',
    name: 'Workspace Read',
    version: '1.0.0',
    category: 'workspace',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.workspace' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'read', network: false, destructive: false },
    ui: { card: 'workspace-file-list' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'List and read files inside the current room workspace.'
  },
  {
    id: 'workspace.write',
    name: 'Workspace Write',
    version: '1.0.0',
    category: 'workspace',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.workspace' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'write', network: false, destructive: false },
    ui: { card: 'workspace-artifact' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Create directories and write files inside the current room workspace.'
  },
  {
    id: 'workspace.preview',
    name: 'Workspace Preview',
    version: '1.0.0',
    category: 'workspace',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.preview' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'read', network: false, destructive: false },
    ui: { card: 'preview-link' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Create and open previewable artifacts such as HTML, SVG, and text files.'
  },
  {
    id: 'workspace.export',
    name: 'Workspace Export',
    version: '1.0.0',
    category: 'workspace',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.export' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'read', network: false, destructive: false },
    ui: { card: 'download' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Package workspace files into downloadable artifacts.'
  },
  {
    id: 'web.read',
    name: 'Web Read',
    version: '1.0.0',
    category: 'research',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.web' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: true, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Read public web pages and public GitHub repositories for research and code analysis.'
  },
  {
    id: 'artifact.card',
    name: 'Artifact Cards',
    version: '1.0.0',
    category: 'artifact',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'ui', adapter: 'agentim.artifact-card' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'artifact' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Return structured artifacts that the Web UI can render as cards.'
  },
  {
    id: 'agent.message',
    name: 'Agent Messaging',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.room' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Mention or hand off work to other Agents in the room.'
  },
  {
    id: 'user.notify',
    name: 'User Notify',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.user-notify' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'mention' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Mention @user for decisions, confirmations, or feedback.'
  },
  {
    id: 'role.read',
    name: 'Role Read',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.role' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Read available system and custom Agent roles for room planning.'
  },
  {
    id: 'role.create',
    name: 'Role Create',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.role' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Create custom Agent roles for specialized room planning.'
  },
  {
    id: 'role.update',
    name: 'Role Update',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.role' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Update custom Agent roles.'
  },
  {
    id: 'role.delete',
    name: 'Role Delete',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.role' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Delete custom Agent roles.'
  },
  {
    id: 'agent.read',
    name: 'Agent Read',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.agent' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Read available Agents for planning and delegation.'
  },
  {
    id: 'agent.create',
    name: 'Agent Create',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.agent' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Create hosted Agents using existing providers and roles.'
  },
  {
    id: 'agent.update',
    name: 'Agent Update',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.agent' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Update existing Agents.'
  },
  {
    id: 'agent.test',
    name: 'Agent Test',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.agent' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: 'provider-only', destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Run a provider health check for an Agent.'
  },
  {
    id: 'room.read',
    name: 'Room Read',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.room' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Read available rooms and room membership.'
  },
  {
    id: 'room.update',
    name: 'Room Update',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.room' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Update rooms the Agent can manage.'
  },
  {
    id: 'skill.read',
    name: 'Skill Read',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.skill' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Read installed and enabled platform skills.'
  },
  {
    id: 'room.create',
    name: 'Room Create',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.room' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Create a new room and optionally attach Agents to it.'
  },
  {
    id: 'room.assign',
    name: 'Room Assign',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.room' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Attach existing Agents to a room the Agent can access.'
  },
  {
    id: 'task.schedule',
    name: 'Task Schedule',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.task' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'task-plan' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Propose schedulable task plans for Agents.'
  },
  {
    id: 'task.run',
    name: 'Task Run',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.task' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'task-plan' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Run scheduled tasks immediately.'
  },
  {
    id: 'task.cancel',
    name: 'Task Cancel',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.task' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false },
    ui: { card: 'task-plan' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Cancel scheduled tasks.'
  },
  {
    id: 'project.read',
    name: 'Project Read',
    version: '1.0.0',
    category: 'project',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.project' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'read', network: false, destructive: false },
    ui: { card: 'artifact' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Read projects and project task status.'
  },
  {
    id: 'project.create',
    name: 'Project Create',
    version: '1.0.0',
    category: 'project',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.project' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'write', network: false, destructive: false },
    ui: { card: 'artifact' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Create coordinated room projects.'
  },
  {
    id: 'artifact.read',
    name: 'Artifact Read',
    version: '1.0.0',
    category: 'artifact',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.artifact' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'read', network: false, destructive: false },
    ui: { card: 'artifact' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Read artifacts created in rooms.'
  },
  {
    id: 'activity.read',
    name: 'Activity Read',
    version: '1.0.0',
    category: 'collaboration',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.activity' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'read', network: false, destructive: false },
    ui: { card: 'message' },
    riskLevel: 'low',
    requiresApproval: false,
    description: 'Read room activity, skill invocations, and pending approvals.'
  },
  {
    id: 'settings.update',
    name: 'Settings Update',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.settings' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Update system settings such as network, timeout, chat, and approval policy.'
  },
  {
    id: 'provider.create',
    name: 'Provider Create',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.provider' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: 'provider-only', destructive: false, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Create model providers.'
  },
  {
    id: 'provider.update',
    name: 'Provider Update',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.provider' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: 'provider-only', destructive: false, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Update model providers.'
  },
  {
    id: 'provider.delete',
    name: 'Provider Delete',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.provider' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: true, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Delete model providers and dependent Agents.'
  },
  {
    id: 'provider.probe',
    name: 'Provider Probe',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.provider' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: 'provider-only', destructive: false, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Probe model providers and list provider models.'
  },
  {
    id: 'skill.install',
    name: 'Skill Install',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.skill' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Install custom skills.'
  },
  {
    id: 'skill.update',
    name: 'Skill Update',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.skill' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: false, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Update skill manifests and enablement.'
  },
  {
    id: 'skill.delete',
    name: 'Skill Delete',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.skill' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: true, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Delete custom skills.'
  },
  {
    id: 'workspace.delete',
    name: 'Workspace Delete',
    version: '1.0.0',
    category: 'workspace',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.workspace' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'write', network: false, destructive: true },
    ui: { card: 'approval' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Delete files or directories inside the current room workspace.'
  },
  {
    id: 'agent.delete',
    name: 'Agent Delete',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.agent' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: true, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Delete Agents.'
  },
  {
    id: 'room.delete',
    name: 'Room Delete',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.room' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: true, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Delete rooms and their messages.'
  },
  {
    id: 'project.delete',
    name: 'Project Delete',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.project' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'write', network: false, destructive: true, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Delete projects and optionally project files.'
  },
  {
    id: 'activity.clear',
    name: 'Activity Clear',
    version: '1.0.0',
    category: 'admin',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'agentim.activity' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: false, destructive: true, admin: true },
    ui: { card: 'message' },
    riskLevel: 'high',
    requiresApproval: true,
    description: 'Clear room activity history.'
  },
  {
    id: 'provider.chat',
    name: 'Provider Chat',
    version: '1.0.0',
    category: 'model',
    common: true,
    installed: true,
    enabled: true,
    source: 'system',
    runtime: { kind: 'server', adapter: 'openai-compatible' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    policy: { workspace: 'none', network: 'provider-only', destructive: false },
    ui: { card: 'message' },
    riskLevel: 'medium',
    requiresApproval: false,
    description: 'Call the configured OpenAI-compatible model provider.'
  }
];

export const COMMON_SKILL_IDS = DEFAULT_SKILLS.filter((skill) => skill.common).map((skill) => skill.id);
export const STANDARD_ROLE_SKILL_IDS = [
  'provider.chat',
  'workspace.read',
  'workspace.write',
  'workspace.preview',
  'workspace.export',
  'web.read',
  'artifact.card',
  'agent.message',
  'role.read',
  'role.create',
  'role.update',
  'agent.read',
  'agent.create',
  'agent.update',
  'agent.test',
  'room.read',
  'room.create',
  'room.assign',
  'room.update',
  'skill.read',
  'task.run',
  'task.cancel',
  'project.read',
  'project.create',
  'artifact.read',
  'activity.read',
  'user.notify'
];
export const DEFAULT_ROLES = [
  {
    id: 'general',
    name: 'General',
    description: 'General-purpose Agent role for mixed product, design, and development work.',
    systemPrompt: 'You are a capable AgentIM assistant. Be concise, useful, collaborative, and product-minded.',
    skillIds: STANDARD_ROLE_SKILL_IDS,
    system: true
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    description: 'Turns user intent into plans, acceptance criteria, and coordinated room work.',
    systemPrompt: 'You are a product manager Agent. Clarify goals, break work into practical plans, define acceptance criteria, and coordinate other Agents when useful.',
    skillIds: ['provider.chat', 'workspace.read', 'web.read', 'artifact.card', 'agent.message', 'role.read', 'role.create', 'role.update', 'agent.read', 'agent.create', 'agent.update', 'agent.test', 'room.read', 'room.create', 'room.assign', 'room.update', 'skill.read', 'task.run', 'task.cancel', 'project.read', 'project.create', 'artifact.read', 'activity.read', 'user.notify'],
    system: true
  },
  {
    id: 'designer',
    name: 'Designer',
    description: 'Creates and critiques UI concepts, visual artifacts, and previewable design widgets.',
    systemPrompt: 'You are a designer Agent. Create thoughtful UI, interaction, visual direction, and previewable artifacts that fit the product context.',
    skillIds: ['provider.chat', 'workspace.read', 'web.read', 'workspace.write', 'workspace.preview', 'artifact.card', 'user.notify'],
    system: true
  },
  {
    id: 'full-stack-developer',
    name: 'Full-stack Developer',
    description: 'Builds and modifies application code, workspace files, and downloadable artifacts.',
    systemPrompt: 'You are a full-stack developer Agent. Build, debug, and improve working software while keeping changes scoped and verifiable.',
    skillIds: ['provider.chat', 'workspace.read', 'web.read', 'workspace.write', 'workspace.preview', 'workspace.export', 'artifact.card', 'agent.message', 'user.notify'],
    system: true
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews work for correctness, risk, missing tests, and product fit.',
    systemPrompt: 'You are a reviewer Agent. Prioritize bugs, risks, regressions, missing tests, and concrete improvement recommendations.',
    skillIds: ['provider.chat', 'workspace.read', 'web.read', 'workspace.preview', 'artifact.card', 'agent.message', 'user.notify'],
    system: true
  }
];
export const DEFAULT_AGENT_ROLE_ID = 'general';

export function createInitialState() {
  const room = {
    id: createId(),
    type: 'group',
    name: 'AgentIM Launch Room',
    description: 'Default room for the local MVP.',
    createdAt: nowIso()
  };

  return {
    settings: createDefaultSettings(),
    modelProviders: [],
    agents: [],
    rooms: [room],
    roomAgents: [],
    skills: DEFAULT_SKILLS,
    roles: DEFAULT_ROLES,
    projects: [],
    projectTasks: [],
    agentRuns: [],
    scheduledTasks: [],
    skillInvocations: [],
    skillApprovals: [],
    artifacts: [],
    workspaces: [],
    roomWorkspaces: [],
    messages: [
      {
        id: createId(),
        roomId: room.id,
        conversationId: room.id,
        senderType: 'system',
        senderName: 'AgentIM',
        content: 'Welcome. Add an OpenAI-compatible provider, create an Agent, attach it to this room, then send a message.',
        createdAt: nowIso()
      }
    ]
  };
}

export function normalizeState(raw) {
  const fallback = createInitialState();
  const rooms = Array.isArray(raw?.rooms)
    ? raw.rooms
    : Array.isArray(raw?.conversations)
      ? raw.conversations.map((item) => ({ description: '', ...item }))
      : fallback.rooms;

  const messages = Array.isArray(raw?.messages)
    ? raw.messages.map((message) => ({
      ...message,
      roomId: message.roomId ?? message.conversationId,
      status: normalizeMessageStatus(message.status),
      pending: message.pending === undefined ? undefined : Boolean(message.pending),
      runId: message.runId ? String(message.runId) : undefined,
      replyTo: normalizeReplyTo(message.replyTo)
    }))
    : fallback.messages;

  return {
    settings: normalizeSettings(raw?.settings),
    modelProviders: Array.isArray(raw?.modelProviders) ? raw.modelProviders : [],
    agents: Array.isArray(raw?.agents) ? raw.agents.map(normalizeAgent) : [],
    rooms,
    roomAgents: Array.isArray(raw?.roomAgents) ? raw.roomAgents : [],
    skills: normalizeSkills(raw?.skills),
    roles: normalizeRoles(raw?.roles),
    projects: Array.isArray(raw?.projects)
      ? raw.projects.map(normalizeProject).filter(Boolean)
      : [],
    projectTasks: Array.isArray(raw?.projectTasks)
      ? raw.projectTasks.map(normalizeProjectTask).filter(Boolean)
      : [],
    agentRuns: Array.isArray(raw?.agentRuns)
      ? raw.agentRuns.map(normalizeAgentRun).filter(Boolean)
      : [],
    scheduledTasks: Array.isArray(raw?.scheduledTasks)
      ? raw.scheduledTasks.map(normalizeScheduledTask).filter(Boolean)
      : [],
    skillInvocations: Array.isArray(raw?.skillInvocations)
      ? raw.skillInvocations.map(normalizeSkillInvocation).filter(Boolean)
      : [],
    skillApprovals: Array.isArray(raw?.skillApprovals)
      ? raw.skillApprovals.map(normalizeSkillApproval).filter(Boolean)
      : [],
    artifacts: Array.isArray(raw?.artifacts)
      ? raw.artifacts.map(normalizeArtifact).filter(Boolean)
      : [],
    workspaces: Array.isArray(raw?.workspaces)
      ? raw.workspaces.map(normalizeWorkspace).filter(Boolean)
      : [],
    roomWorkspaces: Array.isArray(raw?.roomWorkspaces)
      ? raw.roomWorkspaces.map(normalizeRoomWorkspace).filter(Boolean)
      : [],
    messages
  };
}

function normalizeSkills(rawSkills) {
  const customSkills = Array.isArray(rawSkills) ? rawSkills : [];
  const byId = new Map(DEFAULT_SKILLS.map((skill) => [skill.id, normalizeSkill(skill, skill)]));
  for (const skill of customSkills) {
    if (!skill?.id) continue;
    const existing = byId.get(String(skill.id));
    byId.set(String(skill.id), normalizeSkill(skill, existing));
  }
  return Array.from(byId.values());
}

export function normalizeSkill(skill, existing) {
  const isSystem = Boolean(existing?.common || skill?.common);
  const id = String(skill?.id ?? existing?.id ?? '').trim();
  return {
    id,
    name: String(skill?.name ?? existing?.name ?? id),
    version: String(skill?.version ?? existing?.version ?? '1.0.0'),
    category: String(skill?.category ?? existing?.category ?? 'custom'),
    description: String(skill?.description ?? existing?.description ?? ''),
    common: isSystem,
    installed: true,
    enabled: isSystem ? true : skill?.enabled === undefined ? existing?.enabled !== false : Boolean(skill.enabled),
    source: isSystem ? 'system' : String(skill?.source ?? existing?.source ?? 'manual'),
    runtime: normalizeJsonObject(skill?.runtime ?? existing?.runtime, { kind: 'external', adapter: 'manual' }),
    inputSchema: normalizeJsonObject(skill?.inputSchema ?? existing?.inputSchema, { type: 'object' }),
    outputSchema: normalizeJsonObject(skill?.outputSchema ?? existing?.outputSchema, { type: 'object' }),
    policy: normalizeJsonObject(skill?.policy ?? existing?.policy, {
      workspace: 'none',
      network: false,
      destructive: false
    }),
    ui: normalizeJsonObject(skill?.ui ?? existing?.ui, { card: 'skill-result' }),
    riskLevel: normalizeRiskLevel(skill?.riskLevel ?? existing?.riskLevel),
    requiresApproval: skill?.requiresApproval === undefined
      ? Boolean(existing?.requiresApproval)
      : Boolean(skill.requiresApproval),
    createdAt: skill?.createdAt ?? existing?.createdAt,
    updatedAt: skill?.updatedAt ?? existing?.updatedAt
  };
}

function normalizeRiskLevel(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
}

function normalizeJsonObject(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normalizeRoles(rawRoles) {
  const customRoles = Array.isArray(rawRoles) ? rawRoles : [];
  const byId = new Map(DEFAULT_ROLES.map((role) => [role.id, role]));
  for (const role of customRoles) {
    if (!role?.id) continue;
    const defaultRole = byId.get(String(role.id));
    byId.set(String(role.id), {
      id: String(role.id),
      name: String(role.name ?? defaultRole?.name ?? role.id),
      description: String(role.description ?? defaultRole?.description ?? ''),
      systemPrompt: String(role.systemPrompt ?? defaultRole?.systemPrompt ?? ''),
      system: Boolean(role.system ?? defaultRole?.system),
      skillIds: Boolean(role.system ?? defaultRole?.system)
        ? normalizeRoleSkillIds([...(role.skillIds ?? []), ...(defaultRole?.skillIds ?? [])])
        : role.skillIds === undefined
          ? normalizeRoleSkillIds(defaultRole?.skillIds)
          : normalizeRoleSkillIds(role.skillIds)
    });
  }
  return Array.from(byId.values());
}

function normalizeRoleSkillIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function normalizeAgent(agent) {
  const roleId = String(agent?.roleId ?? DEFAULT_AGENT_ROLE_ID);
  const { skillIds, extraSkillIds, disabledSkillIds, ...rest } = agent ?? {};
  return {
    ...rest,
    roleId
  };
}

function normalizeWorkspace(workspace) {
  if (!workspace?.id) return null;
  return {
    ...workspace,
    id: String(workspace.id),
    kind: String(workspace.kind ?? 'local'),
    name: String(workspace.name ?? 'Workspace')
  };
}

function normalizeRoomWorkspace(link) {
  if (!link?.roomId || !link?.workspaceId) return null;
  return {
    ...link,
    roomId: String(link.roomId),
    workspaceId: String(link.workspaceId)
  };
}

function normalizeAgentRun(run) {
  if (!run?.id || !run?.roomId || !run?.agentId) return null;
  return {
    ...run,
    id: String(run.id),
    roomId: String(run.roomId),
    agentId: String(run.agentId),
    messageId: run.messageId ? String(run.messageId) : undefined,
    status: normalizeRunStatus(run.status),
    attempts: Number.isFinite(Number(run.attempts)) ? Number(run.attempts) : 0,
    turn: Number.isFinite(Number(run.turn)) ? Number(run.turn) : 1,
    maxTurns: Number.isFinite(Number(run.maxTurns)) ? Number(run.maxTurns) : 6,
    error: run.error ? String(run.error) : undefined
  };
}

function normalizeProject(project) {
  if (!project?.id || !project?.roomId) return null;
  return {
    ...project,
    id: String(project.id),
    roomId: String(project.roomId),
    name: String(project.name ?? 'Untitled Project'),
    slug: String(project.slug ?? project.id),
    type: String(project.type ?? 'static-web'),
    templateId: String(project.templateId ?? project.type ?? 'static-web'),
    rootPath: String(project.rootPath ?? `projects/${project.slug ?? project.id}`),
    entryPath: project.entryPath ? String(project.entryPath) : undefined,
    brief: String(project.brief ?? ''),
    status: normalizeProjectStatus(project.status),
    currentPhase: project.currentPhase ? String(project.currentPhase) : undefined,
    error: project.error ? String(project.error) : undefined
  };
}

function normalizeProjectTask(task) {
  if (!task?.id || !task?.projectId || !task?.roomId) return null;
  const dependsOnTaskIds = normalizeProjectTaskDependencies(task);
  return {
    ...task,
    id: String(task.id),
    projectId: String(task.projectId),
    roomId: String(task.roomId),
    agentId: task.agentId ? String(task.agentId) : undefined,
    roleId: String(task.roleId ?? DEFAULT_AGENT_ROLE_ID),
    phase: String(task.phase ?? 'development'),
    title: String(task.title ?? 'Project Task'),
    instructions: String(task.instructions ?? ''),
    status: normalizeProjectTaskStatus(task.status),
    dependsOnTaskId: dependsOnTaskIds[0],
    dependsOnTaskIds,
    runId: task.runId ? String(task.runId) : undefined,
    messageId: task.messageId ? String(task.messageId) : undefined,
    resultSummary: task.resultSummary ? String(task.resultSummary) : undefined,
    error: task.error ? String(task.error) : undefined
  };
}

function normalizeProjectTaskDependencies(task) {
  const ids = [];
  if (Array.isArray(task.dependsOnTaskIds)) ids.push(...task.dependsOnTaskIds);
  if (task.dependsOnTaskId) ids.push(task.dependsOnTaskId);
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function normalizeProjectStatus(status) {
  return ['planning', 'designing', 'developing', 'reviewing', 'done', 'failed', 'archived'].includes(status)
    ? status
    : 'planning';
}

function normalizeProjectTaskStatus(status) {
  return ['queued', 'running', 'done', 'failed', 'blocked', 'cancelled'].includes(status)
    ? status
    : 'queued';
}

function normalizeScheduledTask(task) {
  if (!task?.id || !task?.roomId || !task?.agentId) return null;
  const dependsOnTaskIds = normalizeScheduledTaskDependencies(task);
  return {
    ...task,
    id: String(task.id),
    roomId: String(task.roomId),
    agentId: String(task.agentId),
    runId: task.runId ? String(task.runId) : undefined,
    messageId: task.messageId ? String(task.messageId) : undefined,
    title: String(task.title ?? 'Scheduled Task'),
    instructions: String(task.instructions ?? ''),
    scheduleAt: String(task.scheduleAt ?? task.createdAt ?? nowIso()),
    status: normalizeTaskStatus(task.status),
    error: task.error ? String(task.error) : undefined,
    repeatInterval: normalizeTaskRepeatInterval(task.repeatInterval),
    parentTaskId: task.parentTaskId ? String(task.parentTaskId) : undefined,
    dependsOnTaskId: dependsOnTaskIds[0],
    dependsOnTaskIds
  };
}

function normalizeScheduledTaskDependencies(task) {
  const ids = [];
  if (Array.isArray(task.dependsOnTaskIds)) ids.push(...task.dependsOnTaskIds);
  if (task.dependsOnTaskId) ids.push(task.dependsOnTaskId);
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function normalizeTaskStatus(status) {
  return ['scheduled', 'running', 'done', 'failed', 'cancelled'].includes(status) ? status : 'scheduled';
}

function normalizeTaskRepeatInterval(value) {
  const interval = String(value ?? '').trim().toLowerCase();
  return ['daily', 'weekly'].includes(interval) ? interval : undefined;
}

function normalizeSkillInvocation(invocation) {
  if (!invocation?.id || !invocation?.skillId || !invocation?.roomId) return null;
  return {
    ...invocation,
    id: String(invocation.id),
    skillId: String(invocation.skillId),
    roomId: String(invocation.roomId),
    runId: invocation.runId ? String(invocation.runId) : undefined,
    messageId: invocation.messageId ? String(invocation.messageId) : undefined,
    agentId: invocation.agentId ? String(invocation.agentId) : undefined,
    actorType: String(invocation.actorType ?? 'agent'),
    status: normalizeInvocationStatus(invocation.status),
    input: normalizeJsonObject(invocation.input, {}),
    output: normalizeJsonObject(invocation.output, {}),
    error: invocation.error ? String(invocation.error) : undefined
  };
}

function normalizeSkillApproval(approval) {
  if (!approval?.id || !approval?.roomId || !approval?.skillId) return null;
  return {
    ...approval,
    id: String(approval.id),
    roomId: String(approval.roomId),
    invocationId: approval.invocationId ? String(approval.invocationId) : undefined,
    skillId: String(approval.skillId),
    status: ['pending', 'approved', 'rejected', 'expired'].includes(approval.status) ? approval.status : 'pending',
    title: String(approval.title ?? 'Approval required'),
    reason: String(approval.reason ?? ''),
    input: approval.input && typeof approval.input === 'object' && !Array.isArray(approval.input) ? approval.input : {},
    requestedBy: String(approval.requestedBy ?? 'system'),
    decidedBy: approval.decidedBy ? String(approval.decidedBy) : undefined
  };
}

function normalizeArtifact(artifact) {
  if (!artifact?.id || !artifact?.roomId || !artifact?.kind) return null;
  return {
    ...artifact,
    id: String(artifact.id),
    roomId: String(artifact.roomId),
    invocationId: artifact.invocationId ? String(artifact.invocationId) : undefined,
    runId: artifact.runId ? String(artifact.runId) : undefined,
    messageId: artifact.messageId ? String(artifact.messageId) : undefined,
    agentId: artifact.agentId ? String(artifact.agentId) : undefined,
    kind: String(artifact.kind),
    title: String(artifact.title ?? artifact.path ?? artifact.kind),
    path: artifact.path ? String(artifact.path) : undefined,
    mimeType: artifact.mimeType ? String(artifact.mimeType) : undefined,
    metadata: normalizeJsonObject(artifact.metadata, {})
  };
}

function normalizeInvocationStatus(status) {
  return ['queued', 'running', 'done', 'failed', 'approval_required', 'rejected'].includes(status)
    ? status
    : 'queued';
}

function normalizeRunStatus(status) {
  return ['queued', 'running', 'done', 'failed', 'stopped'].includes(status) ? status : 'queued';
}

function normalizeMessageStatus(status) {
  return ['queued', 'running', 'done', 'failed', 'stopped'].includes(status) ? status : undefined;
}

function normalizeReplyTo(replyTo) {
  if (!replyTo?.id) return undefined;
  return {
    id: String(replyTo.id),
    senderName: String(replyTo.senderName ?? ''),
    content: String(replyTo.content ?? '').slice(0, 500)
  };
}

export function createDefaultSettings() {
  return {
    auth: {
      passwordSet: false,
      passwordSalt: '',
      passwordHash: '',
      passwordAlgorithm: '',
      passwordIterations: 0
    },
    network: {
      proxyEnabled: false,
      proxyUrl: '',
      providerTimeoutMs: 300000
    },
    chat: {
      messagePageSize: 20
    },
    approvals: {
      mode: 'auto'
    },
    circles: {
      roomTemplates: []
    }
  };
}

export function normalizeSettings(raw) {
  const fallback = createDefaultSettings();
  return {
    auth: {
      passwordSet: Boolean(raw?.auth?.passwordHash),
      passwordSalt: String(raw?.auth?.passwordSalt ?? fallback.auth.passwordSalt),
      passwordHash: String(raw?.auth?.passwordHash ?? fallback.auth.passwordHash),
      passwordAlgorithm: String(raw?.auth?.passwordAlgorithm ?? fallback.auth.passwordAlgorithm),
      passwordIterations: Number(raw?.auth?.passwordIterations ?? fallback.auth.passwordIterations)
    },
    network: {
      proxyEnabled: Boolean(raw?.network?.proxyEnabled),
      proxyUrl: String(raw?.network?.proxyUrl ?? fallback.network.proxyUrl).trim(),
      providerTimeoutMs: normalizeTimeoutMs(raw?.network?.providerTimeoutMs, fallback.network.providerTimeoutMs)
    },
    chat: {
      messagePageSize: normalizeMessagePageSize(raw?.chat?.messagePageSize, fallback.chat.messagePageSize)
    },
    approvals: {
      mode: normalizeApprovalMode(raw?.approvals?.mode, fallback.approvals.mode)
    },
    circles: {
      roomTemplates: normalizeCustomRoomTemplates(raw?.circles?.roomTemplates)
    }
  };
}

function normalizeCustomRoomTemplates(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((template) => {
      const id = String(template?.id ?? '').trim();
      const name = String(template?.name ?? '').trim();
      const agentTemplateIds = Array.isArray(template?.agentTemplateIds)
        ? template.agentTemplateIds.map((item) => String(item ?? '').trim()).filter(Boolean)
        : [];
      if (!id || !name || agentTemplateIds.length === 0) return null;
      return {
        id,
        name,
        category: String(template?.category ?? 'custom').trim() || 'custom',
        description: String(template?.description ?? '').trim(),
        roomName: String(template?.roomName ?? name).trim() || name,
        roomDescription: String(template?.roomDescription ?? template?.description ?? '').trim(),
        agentTemplateIds,
        custom: true,
        createdAt: template?.createdAt ? String(template.createdAt) : undefined,
        updatedAt: template?.updatedAt ? String(template.updatedAt) : undefined
      };
    })
    .filter(Boolean);
}

export function createPasswordSecret(password, salt = randomBytes(16).toString('hex')) {
  const normalizedPassword = String(password ?? '');
  const normalizedSalt = String(salt ?? '').trim() || randomBytes(16).toString('hex');
  const iterations = 210000;
  const passwordHash = pbkdf2Sync(normalizedPassword, normalizedSalt, iterations, 32, 'sha256').toString('hex');
  return {
    passwordSalt: normalizedSalt,
    passwordHash,
    passwordAlgorithm: 'pbkdf2-sha256',
    passwordIterations: iterations,
    passwordSet: Boolean(normalizedPassword)
  };
}

export function verifyPasswordSecret(password, auth = {}) {
  if (!auth?.passwordHash || !auth?.passwordSalt) return false;
  const algorithm = String(auth.passwordAlgorithm ?? '').trim();
  const iterations = Number(auth.passwordIterations);
  const expected = String(auth.passwordHash);
  const salt = String(auth.passwordSalt);
  const actual = algorithm === 'pbkdf2-sha256' && Number.isFinite(iterations) && iterations > 0
    ? pbkdf2Sync(String(password ?? ''), salt, Math.round(iterations), 32, 'sha256').toString('hex')
    : createHash('sha256').update(`${salt}:${String(password ?? '')}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function normalizeApprovalMode(value, fallback = 'auto') {
  const mode = String(value ?? '').trim().toLowerCase();
  return ['off', 'auto', 'balanced', 'strict'].includes(mode) ? mode : fallback;
}

function normalizeTimeoutMs(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(Math.round(number), 5000);
}

function normalizeMessagePageSize(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), 10), 100);
}

export function publicProvider(provider) {
  return {
    id: provider.id,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    models: provider.models,
    enabled: provider.enabled,
    createdAt: provider.createdAt
  };
}

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
