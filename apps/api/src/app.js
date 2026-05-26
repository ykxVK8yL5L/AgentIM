import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createOpenAICompatibleChat,
  listOpenAICompatibleModels,
  normalizeBaseUrl,
  probeOpenAICompatibleProvider,
  streamOpenAICompatibleChat
} from '../../../packages/provider-sdk/src/openai-compatible.js';
import { createStore } from './store/factory.js';
import { DEFAULT_AGENT_ROLE_ID, DEFAULT_ROLES, STANDARD_ROLE_SKILL_IDS, publicProvider } from './store/utils.js';
import { createProviderDeps } from './provider-fetch.js';
import { createWorkspaceStorage } from './workspace/factory.js';
import { AGENCY_AGENTS_PACK, AGENCY_AGENT_TEMPLATES } from './agent-templates/agency-agents.js';
import { ROOM_TEMPLATES } from './agent-templates/room-templates.js';
import { createPasswordSecret, verifyPasswordSecret } from './store/utils.js';

export const app = new Hono();

const MAX_AGENT_TURNS = 6;
const MAX_CONCURRENT_AGENT_RUNS = 2;
const AGENT_RUN_ABORT_STOP = 'user_stop';
const AGENT_RUN_ABORT_TIMEOUT = 'provider_timeout';
const runningAgentRuns = new Map();
const queuedAgentRunIds = new Set();
const recoveredStores = new WeakSet();
const taskSchedulerStores = new WeakSet();
let activeAgentRunCount = 0;
let queueDraining = false;
const DEFAULT_ROLE_LOOKUP = new Map(DEFAULT_ROLES.map((role) => [role.id, role]));
const AUTH_COOKIE = 'agentim_session';
const AUTH_SESSION_VALUE = 'authenticated';
const AUTH_SECRET = process.env.AGENTIM_AUTH_SECRET ?? randomBytes(32).toString('hex');
const WEB_READ_TIMEOUT_MS = 20000;
const WEB_READ_MAX_BYTES = 512000;
const WEB_READ_MAX_TEXT_CHARS = 60000;
const GITHUB_READ_MAX_FILES = 14;
const GITHUB_READ_MAX_FILE_CHARS = 12000;
const CONTINUATION_PLATFORM_ACTIONS = new Set([
  'agent.read',
  'room.read',
  'skill.read',
  'project.read',
  'artifact.read',
  'activity.read',
  'provider.probe'
]);

async function requiresAuth(c, store) {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/health') return false;

  const settings = await store.getSettings();
  if (!settings.auth?.passwordSet) {
    return !(path === '/api/auth/status' || path === '/api/auth/password');
  }
  if (path.startsWith('/api/auth/')) return false;
  return !isAuthenticated(c, settings);
}

function publicAuthStatus(c, settings, forceAuthenticated = false) {
  return {
    ok: true,
    auth: publicAuth(settings.auth, forceAuthenticated || isAuthenticated(c, settings))
  };
}

function publicAuth(auth, authenticated = false) {
  return {
    passwordSet: Boolean(auth?.passwordSet || auth?.passwordHash),
    authenticated: Boolean(auth?.passwordSet || auth?.passwordHash) ? Boolean(authenticated) : true
  };
}

function publicSettings(settings, c) {
  return {
    ...settings,
    auth: publicAuth(settings?.auth, c ? isAuthenticated(c, settings) : false)
  };
}

function setAuthCookie(c, settings) {
  setCookie(c, AUTH_COOKIE, signSession(AUTH_SESSION_VALUE, settings), {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 30
  });
}

function isAuthenticated(c, settings) {
  const cookie = getCookie(c, AUTH_COOKIE);
  if (!cookie) return false;
  const [value, signature] = cookie.split('.');
  if (!value || !signature) return false;
  const expected = signValue(value, settings);
  try {
    return value === AUTH_SESSION_VALUE && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function signSession(value, settings) {
  return `${value}.${signValue(value, settings)}`;
}

function signValue(value, settings) {
  return createHmac('sha256', authSigningSecret(settings)).update(String(value)).digest('hex');
}

function authSigningSecret(settings) {
  return String(settings?.auth?.passwordHash || AUTH_SECRET);
}

async function listRoomTemplates(store) {
  const settings = await store.getSettings();
  const customTemplates = Array.isArray(settings.circles?.roomTemplates) ? settings.circles.roomTemplates : [];
  return [
    ...ROOM_TEMPLATES.map((template) => ({ ...template, custom: false })),
    ...customTemplates.map((template) => ({ ...template, custom: true }))
  ];
}

function uniqueRoomTemplateId(baseId, templates) {
  const base = baseId || `circle-${Date.now()}`;
  const existing = new Set(templates.map((template) => template.id));
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function slugify(value) {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `circle-${Date.now()}`;
}

function normalizeCircleSlots(template) {
  return Array.isArray(template?.slots)
    ? template.slots
      .map((slot) => ({
        id: String(slot.id ?? '').trim(),
        label: String(slot.label ?? slot.id ?? '').trim(),
        roleId: String(slot.roleId ?? '').trim(),
        agentTemplateId: String(slot.agentTemplateId ?? '').trim(),
        description: String(slot.description ?? '').trim(),
        required: Boolean(slot.required)
      }))
      .filter((slot) => slot.id && slot.agentTemplateId)
    : [];
}

function resolveCircleSelectedAgents(template, requestedAgents, defaults) {
  const selected = [];
  const byTemplateId = new Map();
  for (const agent of requestedAgents) {
    if (!agent.templateId || byTemplateId.has(agent.templateId)) continue;
    const slot = normalizeCircleSlots(template).find((item) => item.agentTemplateId === agent.templateId);
    const next = {
      ...agent,
      slotId: slot?.id,
      slotLabel: slot?.label,
      roleId: slot?.roleId,
      required: Boolean(slot?.required),
      autoAdded: false
    };
    byTemplateId.set(agent.templateId, next);
    selected.push(next);
  }
  if (template.autoCreateRequiredAgents !== false) {
    for (const slot of normalizeCircleSlots(template).filter((item) => item.required)) {
      if (byTemplateId.has(slot.agentTemplateId)) continue;
      const next = {
        templateId: slot.agentTemplateId,
        providerId: defaults.defaultProviderId,
        model: defaults.defaultModel,
        slotId: slot.id,
        slotLabel: slot.label,
        roleId: slot.roleId,
        required: true,
        autoAdded: true
      };
      byTemplateId.set(slot.agentTemplateId, next);
      selected.push(next);
    }
  }
  return selected;
}

function buildCircleRoomDescription(template, overrideDescription) {
  const description = String(overrideDescription ?? template.roomDescription ?? template.description ?? '').trim();
  const slots = normalizeCircleSlots(template);
  const slotLines = slots.length > 0
    ? [
      '',
      'Team slots:',
      ...slots.map((slot) => `- ${slot.required ? 'Required' : 'Optional'} ${slot.label}: ${slot.description || slot.roleId}`)
    ]
    : [];
  const workflow = template.workflow?.steps?.length
    ? [
      '',
      'Workflow:',
      ...template.workflow.steps.map((step, index) => `${index + 1}. ${step.title}${step.dependsOn?.length ? ` (after ${step.dependsOn.join(', ')})` : ''}`)
    ]
    : [];
  const rules = [
    template.collaborationMode ? `Collaboration mode: ${template.collaborationMode}` : '',
    template.outcome ? `Expected outcome: ${template.outcome}` : '',
    template.workflow?.allowUserFeedbackInterrupts ? 'User feedback can interrupt, supersede, or revise active work.' : '',
    template.workflow?.requirePmApprovalBeforeDevelopment ? 'Development should wait for PM approval of design direction unless @user explicitly overrides.' : '',
    template.workflow?.maxRevisionRounds ? `Suggested max revision rounds: ${template.workflow.maxRevisionRounds}.` : ''
  ].filter(Boolean);
  return [
    description,
    rules.length > 0 ? ['', 'Circle rules:', ...rules.map((rule) => `- ${rule}`)].join('\n') : '',
    slotLines.join('\n'),
    workflow.join('\n')
  ].filter(Boolean).join('\n');
}

app.use('/api/*', async (c, next) => {
  const store = await createStore(c);
  c.set('store', store);
  await ensureAgentRunRecovery(store);
  ensureTaskScheduler(store);
  if (await requiresAuth(c, store)) {
    return c.json({ ok: false, error: 'auth_required' }, 401);
  }
  await next();
});

app.get('/api/health', async (c) => {
  return c.json({ ok: true, service: 'agentim-api' });
});

app.get('/api/bootstrap', async (c) => {
  const store = c.get('store');
  const boot = await store.bootstrap();
  return c.json({
    ...boot,
    settings: publicSettings(boot.settings, c),
    providers: boot.providers.map(publicProvider)
  });
});

app.get('/api/auth/status', async (c) => {
  const store = c.get('store');
  const settings = await store.getSettings();
  return c.json(publicAuthStatus(c, settings));
});

app.post('/api/auth/login', async (c) => {
  const store = c.get('store');
  const settings = await store.getSettings();
  if (!settings.auth?.passwordSet) {
    return c.json({ ok: false, error: 'password_not_set' }, 400);
  }
  const input = await c.req.json();
  if (!verifyPasswordSecret(input.password, settings.auth)) {
    return c.json({ ok: false, error: 'invalid_password' }, 401);
  }
  setAuthCookie(c, settings);
  return c.json({ ok: true, ...publicAuthStatus(c, settings, true) });
});

app.post('/api/auth/logout', async (c) => {
  deleteCookie(c, AUTH_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.post('/api/auth/password', async (c) => {
  const store = c.get('store');
  const settings = await store.getSettings();
  const input = await c.req.json();
  const password = String(input.password ?? '');
  if (password.length < 6) {
    return c.json({ ok: false, error: 'password_min_length_6' }, 400);
  }
  if (settings.auth?.passwordSet) {
    const currentPassword = String(input.currentPassword ?? '');
    if (!currentPassword) {
      return c.json({ ok: false, error: 'current_password_required' }, 400);
    }
    if (!verifyPasswordSecret(currentPassword, settings.auth)) {
      return c.json({ ok: false, error: 'invalid_current_password' }, 401);
    }
  }
  const auth = createPasswordSecret(password);
  const next = await store.updateSettings({ auth });
  setAuthCookie(c, next);
  return c.json({ ok: true, auth: publicAuth(next.auth, true) });
});

app.get('/api/settings', async (c) => {
  const store = c.get('store');
  return c.json(publicSettings(await store.getSettings(), c));
});

app.patch('/api/settings', async (c) => {
  const store = c.get('store');
  const current = await store.getSettings();
  const input = await c.req.json();
  const proxyEnabled = input.network?.proxyEnabled === undefined
    ? Boolean(current.network?.proxyEnabled)
    : Boolean(input.network?.proxyEnabled);
  const proxyUrl = String(input.network?.proxyUrl ?? current.network?.proxyUrl ?? '').trim();
  const providerTimeoutMs = normalizeProviderTimeoutInput(input.network?.providerTimeoutMs ?? current.network?.providerTimeoutMs);
  const messagePageSize = normalizeMessagePageSizeInput(input.chat?.messagePageSize ?? current.chat?.messagePageSize);
  const approvalMode = normalizeApprovalModeInput(input.approvals?.mode ?? current.approvals?.mode);

  if (proxyEnabled && proxyUrl) {
    try {
      const parsed = new URL(proxyUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return c.json({ ok: false, error: 'proxy_url_must_be_http_or_https' }, 400);
      }
    } catch {
      return c.json({ ok: false, error: 'invalid_proxy_url' }, 400);
    }
  }

  return c.json(publicSettings(await store.updateSettings({
    network: {
      proxyEnabled,
      proxyUrl,
      providerTimeoutMs
    },
    chat: {
      messagePageSize
    },
    approvals: {
      mode: approvalMode
    }
  }), c));
});

app.post('/api/model-providers/probe', async (c) => {
  const store = c.get('store');
  const input = await c.req.json();
  const result = await probeOpenAICompatibleProvider({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey
  }, await createProviderDeps(store));
  return c.json(result, result.ok ? 200 : 400);
});

app.get('/api/model-providers', async (c) => {
  const store = c.get('store');
  const providers = await store.listProviders();
  return c.json(providers.map(publicProvider));
});

app.get('/api/model-providers/:id/models', async (c) => {
  const store = c.get('store');
  const provider = await store.getProvider(c.req.param('id'));
  if (!provider) return c.json({ ok: false, error: 'provider_not_found' }, 404);

  if (provider.baseUrl === 'mock://provider') {
    const models = normalizeProviderModels(provider);
    return c.json({ ok: true, providerId: provider.id, models, source: 'mock' });
  }

  const result = await listOpenAICompatibleModels({
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey
  }, await createProviderDeps(store));

  if (!result.ok) {
    const fallbackModels = normalizeProviderModels(provider);
    return c.json({
      ...result,
      ok: false,
      providerId: provider.id,
      models: fallbackModels,
      source: fallbackModels.length > 0 ? 'cached' : 'live'
    }, 400);
  }

  await store.updateProvider(provider.id, {
    models: result.models,
    defaultModel: result.models.some((model) => model.id === provider.defaultModel)
      ? provider.defaultModel
      : result.models[0].id
  });

  return c.json({
    ok: true,
    providerId: provider.id,
    models: result.models,
    source: 'live'
  });
});

app.post('/api/model-providers', async (c) => {
  const store = c.get('store');
  const input = await c.req.json();
  const name = String(input.name ?? '').trim();
  const apiKey = String(input.apiKey ?? '').trim();
  const defaultModel = String(input.defaultModel ?? '').trim();

  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);
  if (!apiKey) return c.json({ ok: false, error: 'api_key_required' }, 400);
  if (!defaultModel) return c.json({ ok: false, error: 'default_model_required' }, 400);

  let baseUrl;
  try {
    baseUrl = input.baseUrl === 'mock://provider'
      ? 'mock://provider'
      : normalizeBaseUrl(input.baseUrl);
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : 'invalid_base_url' }, 400);
  }

  const models = Array.isArray(input.models) && input.models.length > 0
    ? input.models
    : [{ id: defaultModel, name: defaultModel }];

  const provider = await store.createProvider({
    name,
    protocol: 'openai_chat_completions',
    baseUrl,
    apiKey,
    defaultModel,
    models,
    enabled: true
  });

  return c.json(publicProvider(provider), 201);
});

app.patch('/api/model-providers/:id', async (c) => {
  const store = c.get('store');
  const current = await store.getProvider(c.req.param('id'));
  if (!current) return c.json({ ok: false, error: 'provider_not_found' }, 404);

  const input = await c.req.json();
  const name = String(input.name ?? current.name ?? '').trim();
  const defaultModel = String(input.defaultModel ?? current.defaultModel ?? '').trim();
  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);
  if (!defaultModel) return c.json({ ok: false, error: 'default_model_required' }, 400);

  let baseUrl = current.baseUrl;
  if (input.baseUrl !== undefined) {
    try {
      baseUrl = input.baseUrl === 'mock://provider'
        ? 'mock://provider'
        : normalizeBaseUrl(input.baseUrl);
    } catch (error) {
      return c.json({ ok: false, error: error instanceof Error ? error.message : 'invalid_base_url' }, 400);
    }
  }

  const patch = {
    name,
    baseUrl,
    defaultModel,
    models: Array.isArray(input.models) && input.models.length > 0
      ? input.models
      : [{ id: defaultModel, name: defaultModel }],
    enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled)
  };
  const apiKey = String(input.apiKey ?? '').trim();
  if (apiKey) patch.apiKey = apiKey;

  const provider = await store.updateProvider(current.id, patch);
  return c.json(publicProvider(provider));
});

app.delete('/api/model-providers/:id', async (c) => {
  const store = c.get('store');
  const provider = await store.getProvider(c.req.param('id'));
  if (!provider) return c.json({ ok: false, error: 'provider_not_found' }, 404);
  await store.deleteProvider(provider.id);
  return c.json({ ok: true });
});

app.get('/api/agents', async (c) => {
  const store = c.get('store');
  return c.json(await store.listAgents());
});

app.get('/api/agent-template-packs', async (c) => {
  return c.json([{
    ...AGENCY_AGENTS_PACK,
    templateCount: AGENCY_AGENT_TEMPLATES.length,
    enabled: true
  }]);
});

app.get('/api/agent-templates', async (c) => {
  const packId = String(c.req.query('packId') ?? '').trim();
  const templates = packId
    ? AGENCY_AGENT_TEMPLATES.filter((template) => template.packId === packId)
    : AGENCY_AGENT_TEMPLATES;
  return c.json(templates);
});

app.get('/api/room-templates', async (c) => {
  const store = c.get('store');
  const templates = await listRoomTemplates(store);
  return c.json(templates.map((template) => ({
    ...template,
    agents: template.agentTemplateIds
      .map((id) => AGENCY_AGENT_TEMPLATES.find((agentTemplate) => agentTemplate.id === id))
      .filter(Boolean)
      .map((agentTemplate) => ({
        id: agentTemplate.id,
        name: agentTemplate.name,
        category: agentTemplate.category,
        description: agentTemplate.description
      })),
    slots: normalizeCircleSlots(template),
    workflow: template.workflow ?? null,
    collaborationMode: template.collaborationMode,
    outcome: template.outcome,
    autoCreateRequiredAgents: template.autoCreateRequiredAgents !== false
  })));
});

app.post('/api/room-templates', async (c) => {
  const store = c.get('store');
  const settings = await store.getSettings();
  const input = await c.req.json();
  const name = String(input.name ?? '').trim();
  const category = String(input.category ?? 'custom').trim() || 'custom';
  const description = String(input.description ?? '').trim();
  const roomName = String(input.roomName ?? name).trim();
  const roomDescription = String(input.roomDescription ?? description).trim();
  const agentTemplateIds = Array.isArray(input.agentTemplateIds)
    ? input.agentTemplateIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);
  if (!roomName) return c.json({ ok: false, error: 'room_name_required' }, 400);
  if (agentTemplateIds.length === 0) return c.json({ ok: false, error: 'agent_templates_required' }, 400);

  const knownAgentTemplateIds = new Set(AGENCY_AGENT_TEMPLATES.map((template) => template.id));
  const invalidAgentId = agentTemplateIds.find((id) => !knownAgentTemplateIds.has(id));
  if (invalidAgentId) return c.json({ ok: false, error: 'agent_template_not_found', templateId: invalidAgentId }, 404);

  const existingTemplates = await listRoomTemplates(store);
  const id = uniqueRoomTemplateId(slugify(input.id ?? name), existingTemplates);
  const now = new Date().toISOString();
  const template = {
    id,
    name,
    category,
    description,
    roomName,
    roomDescription,
    agentTemplateIds: [...new Set(agentTemplateIds)],
    custom: true,
    createdAt: now,
    updatedAt: now
  };
  const current = Array.isArray(settings.circles?.roomTemplates) ? settings.circles.roomTemplates : [];
  await store.updateSettings({
    circles: {
      roomTemplates: [...current, template]
    }
  });
  return c.json({ template }, 201);
});

app.delete('/api/room-templates/:id', async (c) => {
  const store = c.get('store');
  const id = String(c.req.param('id') ?? '').trim();
  const settings = await store.getSettings();
  const current = Array.isArray(settings.circles?.roomTemplates) ? settings.circles.roomTemplates : [];
  const template = current.find((item) => item.id === id);
  if (!template) {
    if (ROOM_TEMPLATES.some((item) => item.id === id)) return c.json({ ok: false, error: 'system_circle_cannot_be_deleted' }, 400);
    return c.json({ ok: false, error: 'room_template_not_found' }, 404);
  }
  await store.updateSettings({
    circles: {
      roomTemplates: current.filter((item) => item.id !== id)
    }
  });
  return c.json({ ok: true });
});

app.post('/api/agent-templates/:id/create-agent', async (c) => {
  const store = c.get('store');
  const template = AGENCY_AGENT_TEMPLATES.find((item) => item.id === c.req.param('id'));
  if (!template) return c.json({ ok: false, error: 'agent_template_not_found' }, 404);

  const input = await c.req.json();
  const providerId = String(input.providerId ?? '').trim();
  const model = String(input.model ?? '').trim();
  const name = String(input.name ?? template.name).trim();
  if (!providerId) return c.json({ ok: false, error: 'provider_required' }, 400);
  if (!model) return c.json({ ok: false, error: 'model_required' }, 400);
  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);

  const provider = await store.getProvider(providerId);
  if (!provider) return c.json({ ok: false, error: 'provider_not_found' }, 404);

  const role = await store.createRole({
    name: `Agency: ${template.name}`,
    description: `${template.description} Source: ${template.attribution}`,
    systemPrompt: buildTemplateRolePrompt(template),
    skillIds: template.suggestedSkillIds ?? []
  });
  const agent = await store.createAgent({
    name,
    bio: `${template.description} (${template.attribution})`,
    runtimeType: 'hosted_agent',
    roleId: role.id,
    providerId,
    model,
    status: 'online',
    templateId: template.id,
    templatePackId: template.packId
  });

  if (input.roomId) {
    await store.attachAgentToRoom(String(input.roomId), agent.id, { triggerMode: 'manual' });
  }

  return c.json({ agent, role, template }, 201);
});

app.post('/api/room-templates/:id/create-room', async (c) => {
  const store = c.get('store');
  const template = (await listRoomTemplates(store)).find((item) => item.id === c.req.param('id'));
  if (!template) return c.json({ ok: false, error: 'room_template_not_found' }, 404);

  const input = await c.req.json();
  const defaultProviderId = String(input.defaultProviderId ?? input.providerId ?? '').trim();
  const defaultModel = String(input.defaultModel ?? input.model ?? '').trim();
  const name = String(input.name ?? template.roomName).trim();
  if (!defaultProviderId) return c.json({ ok: false, error: 'provider_required' }, 400);
  if (!defaultModel) return c.json({ ok: false, error: 'model_required' }, 400);
  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);

  const defaultProvider = await store.getProvider(defaultProviderId);
  if (!defaultProvider) return c.json({ ok: false, error: 'provider_not_found' }, 404);
  const requestedAgents = Array.isArray(input.agents)
    ? input.agents
      .map((agent) => ({
        templateId: String(agent?.templateId ?? '').trim(),
        providerId: String(agent?.providerId ?? defaultProviderId).trim(),
        model: String(agent?.model ?? defaultModel).trim()
      }))
      .filter((agent) => agent.templateId)
    : [];
  const requestedTemplateIds = Array.isArray(input.agentTemplateIds)
    ? input.agentTemplateIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];
  const allowedTemplateIds = new Set(template.agentTemplateIds);
  const requestedSelectedAgents = requestedAgents.length > 0
    ? requestedAgents.filter((agent) => allowedTemplateIds.has(agent.templateId))
    : (requestedTemplateIds.length > 0 ? requestedTemplateIds : template.agentTemplateIds)
      .filter((id) => allowedTemplateIds.has(id))
      .map((templateId) => ({
        templateId,
        providerId: defaultProviderId,
        model: defaultModel
      }));
  const selectedAgents = resolveCircleSelectedAgents(template, requestedSelectedAgents, {
    defaultProviderId,
    defaultModel
  });
  if (selectedAgents.length === 0) return c.json({ ok: false, error: 'agent_templates_required' }, 400);

  const providerCache = new Map([[defaultProvider.id, defaultProvider]]);
  for (const selectedAgent of selectedAgents) {
    const agentProvider = providerCache.get(selectedAgent.providerId) ?? await store.getProvider(selectedAgent.providerId);
    if (!agentProvider) return c.json({ ok: false, error: 'provider_not_found', templateId: selectedAgent.templateId }, 404);
    providerCache.set(agentProvider.id, agentProvider);
    if (!selectedAgent.model) return c.json({ ok: false, error: 'model_required', templateId: selectedAgent.templateId }, 400);
  }

  const roomName = await uniqueRoomName(store, name, 'group');
  const room = await store.createRoom({
    name: roomName,
    type: 'group',
    description: buildCircleRoomDescription(template, input.description)
  });
  const agents = [];
  const roles = [];
  const slotAssignments = [];
  for (const selectedAgent of selectedAgents) {
    const agentTemplate = AGENCY_AGENT_TEMPLATES.find((item) => item.id === selectedAgent.templateId);
    if (!agentTemplate) continue;
    const role = await store.createRole({
      name: `Agency: ${agentTemplate.name}`,
      description: `${agentTemplate.description} Source: ${agentTemplate.attribution}`,
      systemPrompt: buildTemplateRolePrompt(agentTemplate),
      skillIds: agentTemplate.suggestedSkillIds ?? []
    });
    const agent = await store.createAgent({
      name: agentTemplate.name,
      bio: `${agentTemplate.description} (${agentTemplate.attribution})`,
      runtimeType: 'hosted_agent',
      roleId: role.id,
      providerId: selectedAgent.providerId,
      model: selectedAgent.model,
      status: 'online',
      templateId: agentTemplate.id,
      templatePackId: agentTemplate.packId,
      roomTemplateId: template.id
    });
    await store.attachAgentToRoom(room.id, agent.id, { triggerMode: 'manual' });
    if (selectedAgent.slotId) {
      slotAssignments.push({
        slotId: selectedAgent.slotId,
        label: selectedAgent.slotLabel,
        required: Boolean(selectedAgent.required),
        roleId: selectedAgent.roleId,
        agentId: agent.id,
        agentName: agent.name,
        templateId: agentTemplate.id
      });
    }
    roles.push(role);
    agents.push(agent);
  }

  await store.getOrCreateRoomWorkspace(room.id, {
    name: `${room.name} Workspace`
  });

  return c.json({
    room,
    agents,
    roles,
    template,
    circle: {
      id: template.id,
      collaborationMode: template.collaborationMode,
      workflow: template.workflow ?? null,
      slots: normalizeCircleSlots(template),
      slotAssignments
    }
  }, 201);
});

app.get('/api/skills', async (c) => {
  const store = c.get('store');
  return c.json(await store.listSkills());
});

app.post('/api/skills/install', async (c) => {
  const store = c.get('store');
  const input = await c.req.json();
  const manifest = normalizeSkillManifestInput(input.manifest ?? input);
  if (!manifest.ok) return c.json({ ok: false, error: manifest.error }, 400);
  const skill = await store.installSkill(manifest.skill);
  return c.json(skill, 201);
});

app.patch('/api/skills/:id', async (c) => {
  const store = c.get('store');
  const current = await store.getSkill(c.req.param('id'));
  if (!current) return c.json({ ok: false, error: 'skill_not_found' }, 404);
  const input = await c.req.json();
  if (current.common && input.enabled === false) {
    return c.json({ ok: false, error: 'common_skill_cannot_be_disabled' }, 400);
  }
  const manifest = normalizeSkillManifestInput({
    ...current,
    ...input,
    id: current.id,
    common: current.common
  });
  if (!manifest.ok) return c.json({ ok: false, error: manifest.error }, 400);
  const skill = await store.updateSkill(current.id, manifest.skill);
  return c.json(skill);
});

app.post('/api/skills/:id/enable', async (c) => {
  const store = c.get('store');
  const skill = await store.updateSkill(c.req.param('id'), { enabled: true });
  if (!skill) return c.json({ ok: false, error: 'skill_not_found' }, 404);
  return c.json(skill);
});

app.post('/api/skills/:id/disable', async (c) => {
  const store = c.get('store');
  const current = await store.getSkill(c.req.param('id'));
  if (!current) return c.json({ ok: false, error: 'skill_not_found' }, 404);
  if (current.common) return c.json({ ok: false, error: 'common_skill_cannot_be_disabled' }, 400);
  const skill = await store.updateSkill(current.id, { enabled: false });
  return c.json(skill);
});

app.delete('/api/skills/:id', async (c) => {
  const store = c.get('store');
  const skill = await store.getSkill(c.req.param('id'));
  if (!skill) return c.json({ ok: false, error: 'skill_not_found' }, 404);
  if (skill.common) return c.json({ ok: false, error: 'common_skill_cannot_be_deleted' }, 400);
  await store.deleteSkill(skill.id);
  return c.json({ ok: true });
});

app.get('/api/roles', async (c) => {
  const store = c.get('store');
  return c.json(await store.listRoles());
});

app.get('/api/rooms/:roomId/skill-invocations', async (c) => {
  const store = c.get('store');
  const room = await store.getRoom(c.req.param('roomId'));
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  const limit = normalizeInvocationLimitInput(c.req.query('limit'));
  return c.json(await store.listSkillInvocations(room.id, { limit }));
});

app.get('/api/rooms/:roomId/skill-approvals', async (c) => {
  const store = c.get('store');
  const room = await store.getRoom(c.req.param('roomId'));
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  const limit = normalizeInvocationLimitInput(c.req.query('limit'));
  return c.json(await store.listSkillApprovals(room.id, { limit }));
});

app.post('/api/skill-approvals/:id/approve', async (c) => {
  const store = c.get('store');
  const approval = await store.getSkillApproval(c.req.param('id'));
  if (!approval) return c.json({ ok: false, error: 'skill_approval_not_found' }, 404);
  if (approval.status !== 'pending') return c.json({ ok: false, error: 'skill_approval_already_decided' }, 409);

  try {
    const result = await approveSkillApproval(store, approval, 'user');
    return c.json({ ok: true, ...result });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.post('/api/skill-approvals/:id/reject', async (c) => {
  const store = c.get('store');
  const approval = await store.getSkillApproval(c.req.param('id'));
  if (!approval) return c.json({ ok: false, error: 'skill_approval_not_found' }, 404);
  if (approval.status !== 'pending') return c.json({ ok: false, error: 'skill_approval_already_decided' }, 409);

  const decidedAt = new Date().toISOString();
  const updatedApproval = await store.updateSkillApproval(approval.id, {
    status: 'rejected',
    decidedBy: 'user',
    decidedAt
  });
  const invocation = approval.invocationId
    ? await store.updateSkillInvocation(approval.invocationId, {
      status: 'rejected',
      error: 'approval_rejected',
      completedAt: decidedAt
    })
    : null;
  await store.createMessage({
    roomId: approval.roomId,
    senderType: 'system',
    senderName: 'AgentIM',
    content: `Rejected ${approval.skillId}: ${approval.input?.path ?? approval.title}`,
    status: 'done',
    pending: false
  });
  return c.json({ ok: true, approval: updatedApproval, invocation });
});

app.get('/api/rooms/:roomId/artifacts', async (c) => {
  const store = c.get('store');
  const room = await store.getRoom(c.req.param('roomId'));
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  const limit = normalizeInvocationLimitInput(c.req.query('limit'));
  return c.json(await store.listArtifacts(room.id, { limit }));
});

app.delete('/api/rooms/:roomId/activity', async (c) => {
  const store = c.get('store');
  const room = await store.getRoom(c.req.param('roomId'));
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  return c.json({ ok: true, ...(await store.clearRoomActivity(room.id)) });
});

app.get('/api/artifacts/:id', async (c) => {
  const store = c.get('store');
  const artifact = await store.getArtifact(c.req.param('id'));
  if (!artifact) return c.json({ ok: false, error: 'artifact_not_found' }, 404);
  return c.json(artifact);
});

app.get('/api/skill-invocations/:id', async (c) => {
  const store = c.get('store');
  const invocation = await store.getSkillInvocation(c.req.param('id'));
  if (!invocation) return c.json({ ok: false, error: 'skill_invocation_not_found' }, 404);
  return c.json(invocation);
});

app.post('/api/roles', async (c) => {
  const store = c.get('store');
  const input = await c.req.json();
  const name = String(input.name ?? '').trim();
  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);
  const role = await store.createRole({
    name,
    description: String(input.description ?? '').trim(),
    systemPrompt: String(input.systemPrompt ?? '').trim(),
    skillIds: normalizeSkillIdsInput(input.skillIds)
  });
  return c.json(role, 201);
});

app.patch('/api/roles/:id', async (c) => {
  const store = c.get('store');
  const current = await store.getRole(c.req.param('id'));
  if (!current) return c.json({ ok: false, error: 'role_not_found' }, 404);
  const input = await c.req.json();
  const name = String(input.name ?? current.name ?? '').trim();
  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);
  const role = await store.updateRole(current.id, {
    name,
    description: String(input.description ?? current.description ?? '').trim(),
    systemPrompt: String(input.systemPrompt ?? current.systemPrompt ?? '').trim(),
    skillIds: input.skillIds === undefined ? current.skillIds ?? [] : normalizeSkillIdsInput(input.skillIds)
  });
  return c.json(role);
});

app.delete('/api/roles/:id', async (c) => {
  const store = c.get('store');
  const role = await store.getRole(c.req.param('id'));
  if (!role) return c.json({ ok: false, error: 'role_not_found' }, 404);
  if (role.system) return c.json({ ok: false, error: 'system_role_cannot_be_deleted' }, 400);
  await store.deleteRole(role.id);
  return c.json({ ok: true });
});

app.post('/api/agents', async (c) => {
  const store = c.get('store');
  const input = await c.req.json();
  const name = String(input.name ?? '').trim();
  const providerId = String(input.providerId ?? '').trim();
  const model = String(input.model ?? '').trim();

  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);
  if (!providerId) return c.json({ ok: false, error: 'provider_required' }, 400);
  if (!model) return c.json({ ok: false, error: 'model_required' }, 400);

  const provider = await store.getProvider(providerId);
  if (!provider) return c.json({ ok: false, error: 'provider_not_found' }, 404);
  const roleId = await normalizeAgentRoleId(store, input.roleId);

  const agent = await store.createAgent({
    name,
    bio: String(input.bio ?? '').trim(),
    runtimeType: 'hosted_agent',
    roleId,
    providerId,
    model,
    status: 'online'
  });

  if (input.roomId) {
    await store.attachAgentToRoom(input.roomId, agent.id, { triggerMode: 'manual' });
  }

  return c.json(agent, 201);
});

app.patch('/api/agents/:id', async (c) => {
  const store = c.get('store');
  const current = await store.getAgent(c.req.param('id'));
  if (!current) return c.json({ ok: false, error: 'agent_not_found' }, 404);

  const input = await c.req.json();
  const name = String(input.name ?? current.name ?? '').trim();
  const providerId = String(input.providerId ?? current.providerId ?? '').trim();
  const model = String(input.model ?? current.model ?? '').trim();
  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);
  if (!providerId) return c.json({ ok: false, error: 'provider_required' }, 400);
  if (!model) return c.json({ ok: false, error: 'model_required' }, 400);

  const provider = await store.getProvider(providerId);
  if (!provider) return c.json({ ok: false, error: 'provider_not_found' }, 404);
  const roleId = await normalizeAgentRoleId(store, input.roleId ?? current.roleId);

  const agent = await store.updateAgent(current.id, {
    name,
    bio: String(input.bio ?? current.bio ?? '').trim(),
    roleId,
    providerId,
    model,
    status: input.status ?? current.status ?? 'online'
  });
  return c.json(agent);
});

app.post('/api/agents/:id/test', async (c) => {
  const store = c.get('store');
  const agent = await store.getAgent(c.req.param('id'));
  if (!agent) return c.json({ ok: false, error: 'agent_not_found' }, 404);

  try {
    return c.json(await testAgentProvider(store, agent));
  } catch (error) {
    return c.json({
      ok: false,
      agentId: agent.id,
      providerId: agent.providerId,
      model: agent.model,
      error: error instanceof Error ? error.message : String(error)
    }, 502);
  }
});

app.delete('/api/agents/:id', async (c) => {
  const store = c.get('store');
  const agent = await store.getAgent(c.req.param('id'));
  if (!agent) return c.json({ ok: false, error: 'agent_not_found' }, 404);
  await store.deleteAgent(agent.id);
  return c.json({ ok: true });
});

async function testAgentProvider(store, agent) {
  const provider = await store.getProvider(agent.providerId);
  if (!provider) throw new Error('provider_not_found');

  const startedAt = Date.now();
  if (provider.baseUrl === 'mock://provider') {
    return {
      ok: true,
      agentId: agent.id,
      providerId: provider.id,
      model: agent.model,
      latencyMs: Date.now() - startedAt,
      content: 'Mock agent test passed.'
    };
  }

  const result = await createOpenAICompatibleChat({
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: agent.model,
    maxTokens: 60,
    messages: [
      {
        role: 'system',
        content: 'You are performing a health check. Reply with one short sentence only.'
      },
      {
        role: 'user',
        content: 'Health check: can you respond?'
      }
    ]
  }, await createProviderDeps(store));

  return {
    ok: true,
    agentId: agent.id,
    providerId: provider.id,
    model: result.model,
    latencyMs: Date.now() - startedAt,
    content: result.content
  };
}

app.get('/api/rooms', async (c) => {
  const store = c.get('store');
  return c.json(await store.listRooms());
});

app.post('/api/rooms', async (c) => {
  const store = c.get('store');
  const input = await c.req.json();
  const name = String(input.name ?? 'New Room').trim();
  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);
  const existing = await findRoomByName(store, name, input.type);
  if (existing) return c.json({ ok: false, error: 'room_name_exists', room: existing }, 409);
  return c.json(await store.createRoom({
    name,
    type: input.type,
    description: String(input.description ?? ''),
    dmAgentId: input.dmAgentId ? String(input.dmAgentId) : undefined
  }), 201);
});

app.patch('/api/rooms/:id', async (c) => {
  const store = c.get('store');
  const current = await store.getRoom(c.req.param('id'));
  if (!current) return c.json({ ok: false, error: 'room_not_found' }, 404);

  const input = await c.req.json();
  const name = String(input.name ?? current.name ?? '').trim();
  if (!name) return c.json({ ok: false, error: 'name_required' }, 400);
  const duplicate = await findRoomByName(store, name, input.type ?? current.type);
  if (duplicate && duplicate.id !== current.id) return c.json({ ok: false, error: 'room_name_exists', room: duplicate }, 409);

  return c.json(await store.updateRoom(current.id, {
    name,
    type: input.type ?? current.type,
    description: String(input.description ?? current.description ?? ''),
    dmAgentId: input.dmAgentId ? String(input.dmAgentId) : current.dmAgentId
  }));
});

app.delete('/api/rooms/:id', async (c) => {
  const store = c.get('store');
  const room = await store.getRoom(c.req.param('id'));
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  await store.deleteRoom(room.id);
  return c.json({ ok: true });
});

app.get('/api/conversations', async (c) => {
  const store = c.get('store');
  return c.json(await store.listRooms());
});

app.post('/api/conversations', async (c) => {
  const store = c.get('store');
  const input = await c.req.json();
  const name = String(input.name ?? 'New Conversation').trim();
  const existing = await findRoomByName(store, name, input.type);
  if (existing) return c.json({ ok: false, error: 'room_name_exists', room: existing }, 409);
  return c.json(await store.createRoom({
    name,
    type: input.type,
    description: String(input.description ?? ''),
    dmAgentId: input.dmAgentId ? String(input.dmAgentId) : undefined
  }), 201);
});

app.get('/api/rooms/:roomId/agents', async (c) => {
  const store = c.get('store');
  return c.json(await store.listRoomAgents(c.req.param('roomId')));
});

app.get('/api/rooms/:roomId/workspace', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const room = await store.getRoom(roomId);
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);

  const workspace = await store.getOrCreateRoomWorkspace(roomId, {
    name: `${room.name} Workspace`
  });
  const storage = createWorkspaceStorage();
  return c.json({
    ok: true,
    workspace,
    storage: await storage.info(workspace.id)
  });
});

app.get('/api/rooms/:roomId/files', async (c) => {
  const store = c.get('store');
  const result = await withRoomWorkspace(store, c.req.param('roomId'));
  if (!result.ok) return c.json(result, result.status);

  try {
    const path = c.req.query('path') ?? '';
    const storage = createWorkspaceStorage();
    return c.json({
      ok: true,
      workspace: result.workspace,
      path,
      files: await storage.listFiles(result.workspace.id, path)
    });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.get('/api/rooms/:roomId/files/read', async (c) => {
  const store = c.get('store');
  const result = await withRoomWorkspace(store, c.req.param('roomId'));
  if (!result.ok) return c.json(result, result.status);

  try {
    const path = String(c.req.query('path') ?? '');
    if (!path) return c.json({ ok: false, error: 'path_required' }, 400);
    const storage = createWorkspaceStorage();
    const content = await storage.readFile(result.workspace.id, path);
    return c.json({ ok: true, workspace: result.workspace, path, content });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.get('/api/rooms/:roomId/preview/*', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const result = await withRoomWorkspace(store, roomId);
  if (!result.ok) return c.json(result, result.status);

  try {
    const path = previewPathFromRequest(c, roomId);
    if (!path) return c.json({ ok: false, error: 'path_required' }, 400);
    const storage = createWorkspaceStorage();
    const content = await storage.readFile(result.workspace.id, path);
    return new Response(content, {
      headers: {
        'content-type': previewContentType(path),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.put('/api/rooms/:roomId/files/write', async (c) => {
  const store = c.get('store');
  const result = await withRoomWorkspace(store, c.req.param('roomId'));
  if (!result.ok) return c.json(result, result.status);

  try {
    const input = await c.req.json();
    const path = String(input.path ?? '').trim();
    if (!path) return c.json({ ok: false, error: 'path_required' }, 400);
    const content = String(input.content ?? '');
    const storage = createWorkspaceStorage();
    await storage.writeFile(result.workspace.id, path, content);
    return c.json({ ok: true, workspace: result.workspace, path });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.delete('/api/rooms/:roomId/files', async (c) => {
  const store = c.get('store');
  const result = await withRoomWorkspace(store, c.req.param('roomId'));
  if (!result.ok) return c.json(result, result.status);

  try {
    const path = String(c.req.query('path') ?? '').trim();
    if (!path) return c.json({ ok: false, error: 'path_required' }, 400);
    const skills = await store.listSkills();
    const deleteSkill = skills.find((skill) => skill.id === 'workspace.delete') ?? {
      id: 'workspace.delete',
      riskLevel: 'high',
      requiresApproval: true,
      policy: { destructive: true }
    };
    const settings = await store.getSettings();
    if (shouldRequireApprovalForSkill(deleteSkill, settings)) {
      const invocation = await store.createSkillInvocation({
        skillId: 'workspace.delete',
        roomId: result.room.id,
        actorType: 'user',
        status: 'approval_required',
        input: {
          action: 'delete_file',
          path,
          workspaceId: result.workspace.id
        },
        startedAt: new Date().toISOString()
      });
      const approval = await store.createSkillApproval({
        roomId: result.room.id,
        invocationId: invocation.id,
        skillId: 'workspace.delete',
        status: 'pending',
        title: `Delete ${path}`,
        reason: 'Deleting workspace files is destructive and requires confirmation.',
        input: {
          action: 'delete_file',
          path,
          workspaceId: result.workspace.id
        },
        requestedBy: 'user'
      });
      return c.json({
        ok: true,
        approvalRequired: true,
        approval,
        invocation,
        workspace: result.workspace,
        path
      }, 202);
    }
    const storage = createWorkspaceStorage();
    await storage.deleteFile(result.workspace.id, path);
    return c.json({ ok: true, workspace: result.workspace, path });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.post('/api/rooms/:roomId/files/mkdir', async (c) => {
  const store = c.get('store');
  const result = await withRoomWorkspace(store, c.req.param('roomId'));
  if (!result.ok) return c.json(result, result.status);

  try {
    const input = await c.req.json();
    const path = String(input.path ?? '').trim();
    if (!path) return c.json({ ok: false, error: 'path_required' }, 400);
    const storage = createWorkspaceStorage();
    await storage.makeDirectory(result.workspace.id, path);
    return c.json({ ok: true, workspace: result.workspace, path });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.get('/api/rooms/:roomId/export.zip', async (c) => {
  const store = c.get('store');
  const result = await withRoomWorkspace(store, c.req.param('roomId'));
  if (!result.ok) return c.json(result, result.status);

  try {
    const storage = createWorkspaceStorage();
    const bytes = await storage.exportZip(result.workspace.id);
    return new Response(bytes, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${result.workspace.id}.zip"`
      }
    });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.get('/api/rooms/:roomId/files/download', async (c) => {
  const store = c.get('store');
  const result = await withRoomWorkspace(store, c.req.param('roomId'));
  if (!result.ok) return c.json(result, result.status);

  try {
    const requestedPath = String(c.req.query('path') ?? '').trim();
    if (!requestedPath) return c.json({ ok: false, error: 'path_required' }, 400);
    const storage = createWorkspaceStorage();
    const content = await storage.readFile(result.workspace.id, requestedPath);
    return new Response(content, {
      headers: {
        'content-type': contentTypeForWorkspacePath(requestedPath),
        'content-disposition': `attachment; filename="${downloadFilenameForPath(requestedPath)}"`
      }
    });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.post('/api/rooms/:roomId/agents', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const input = await c.req.json();
  const room = await store.getRoom(roomId);
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  const agent = await store.getAgent(input.agentId);
  if (!agent) return c.json({ ok: false, error: 'agent_not_found' }, 404);
  return c.json(await store.attachAgentToRoom(roomId, agent.id, input), 201);
});

app.delete('/api/rooms/:roomId/agents/:agentId', async (c) => {
  const store = c.get('store');
  await store.detachAgentFromRoom(c.req.param('roomId'), c.req.param('agentId'));
  return c.json({ ok: true });
});

app.post('/api/rooms/:roomId/dispatch', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const room = await store.getRoom(roomId);
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);

  const input = await c.req.json();
  const content = String(input.content ?? '').trim();
  if (!content) return c.json({ ok: false, error: 'content_required' }, 400);

  const roomAgents = await store.listRoomAgents(roomId);
  const directTarget = room.type === 'dm'
    ? roomAgents.find((agent) => agent.id === room.dmAgentId)
      ?? roomAgents[0]
      ?? (room.dmAgentId ? await store.getAgent(room.dmAgentId) : null)
    : null;
  const targets = room.type === 'dm'
    ? directTarget ? [directTarget] : []
    : resolveMentionTargets(content, roomAgents);
  if (targets.length === 0) {
    if (room.type === 'dm' && directTarget) {
      return c.json({
        ok: true,
        message: await store.createMessage({
          roomId,
          senderType: 'user',
          senderName: String(input.senderName ?? 'You'),
          content,
          replyTo: await resolveReplyTo(store, roomId, input.replyToMessageId)
        }),
        targets: [directTarget].map((agent) => ({
          id: agent.id,
          name: agent.name,
          model: agent.model
        }))
      }, 201);
    }
    return c.json({
      ok: false,
      error: 'target_required',
      message: 'Mention an Agent with @name, or use @all.'
    }, 400);
  }

  const replyTo = await resolveReplyTo(store, roomId, input.replyToMessageId);
  const message = await store.createMessage({
    roomId,
    senderType: 'user',
    senderName: String(input.senderName ?? 'You'),
    content,
    replyTo
  });

  return c.json({
    ok: true,
    message,
    targets: targets.map((agent) => ({
      id: agent.id,
      name: agent.name,
      model: agent.model
    }))
  }, 201);
});

app.post('/api/rooms/:roomId/mentions', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const room = await store.getRoom(roomId);
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);

  const input = await c.req.json();
  const content = String(input.content ?? '').trim();
  if (!content) return c.json({ ok: true, targets: [] });

  const excludeAgentId = String(input.excludeAgentId ?? '').trim();
  const roomAgents = (await store.listRoomAgents(roomId))
    .filter((agent) => agent.id !== excludeAgentId);
  const targets = resolveMentionTargets(content, roomAgents);

  return c.json({
    ok: true,
    targets: targets.map((agent) => ({
      id: agent.id,
      name: agent.name,
      model: agent.model
    }))
  });
});

app.get('/api/rooms/:roomId/agent-runs', async (c) => {
  const store = c.get('store');
  return c.json(await store.listAgentRuns(c.req.param('roomId')));
});

app.get('/api/rooms/:roomId/tasks', async (c) => {
  const store = c.get('store');
  const room = await store.getRoom(c.req.param('roomId'));
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  return c.json(await store.listScheduledTasks(room.id, { limit: normalizeTaskLimitInput(c.req.query('limit')) }));
});

app.post('/api/rooms/:roomId/tasks', async (c) => {
  const store = c.get('store');
  const room = await store.getRoom(c.req.param('roomId'));
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  const input = await c.req.json();
  const agentId = String(input.agentId ?? '').trim();
  const title = String(input.title ?? '').trim();
  const instructions = String(input.instructions ?? '').trim();
  const scheduleAt = normalizeScheduleAtInput(input.scheduleAt);
  const repeatInterval = normalizeRepeatIntervalInput(input.repeatInterval);
  const dependsOnTaskIds = normalizeScheduledTaskDependencyInput(input.dependsOnTaskIds ?? input.dependsOnTaskId);
  if (!agentId) return c.json({ ok: false, error: 'agent_required' }, 400);
  if (!title) return c.json({ ok: false, error: 'title_required' }, 400);
  if (!instructions) return c.json({ ok: false, error: 'instructions_required' }, 400);
  if (!scheduleAt) return c.json({ ok: false, error: 'invalid_schedule_at' }, 400);

  const agent = await store.getAgent(agentId);
  if (!agent) return c.json({ ok: false, error: 'agent_not_found' }, 404);

  const task = await store.createScheduledTask({
    roomId: room.id,
    agentId,
    title,
    instructions,
    scheduleAt,
    status: 'scheduled',
    repeatInterval,
    dependsOnTaskIds,
    createdBy: String(input.createdBy ?? 'user')
  });
  await dispatchDueScheduledTasks(store);
  return c.json(task, 201);
});

app.post('/api/tasks/:id/cancel', async (c) => {
  const store = c.get('store');
  const task = await store.getScheduledTask(c.req.param('id'));
  if (!task) return c.json({ ok: false, error: 'task_not_found' }, 404);
  if (task.status !== 'scheduled') return c.json({ ok: false, error: 'task_not_cancellable' }, 409);
  return c.json(await store.updateScheduledTask(task.id, {
    status: 'cancelled',
    cancelledAt: new Date().toISOString()
  }));
});

app.post('/api/tasks/:id/run-now', async (c) => {
  const store = c.get('store');
  const task = await store.getScheduledTask(c.req.param('id'));
  if (!task) return c.json({ ok: false, error: 'task_not_found' }, 404);
  if (task.status !== 'scheduled') return c.json({ ok: false, error: 'task_not_runnable' }, 409);
  await store.updateScheduledTask(task.id, { scheduleAt: new Date().toISOString() });
  await dispatchDueScheduledTasks(store);
  return c.json(await store.getScheduledTask(task.id), 202);
});

app.post('/api/tasks/:id/review', async (c) => {
  const store = c.get('store');
  const task = await store.getScheduledTask(c.req.param('id'));
  if (!task) return c.json({ ok: false, error: 'task_not_found' }, 404);
  const input = await c.req.json();
  const decision = normalizeReviewDecision(input.decision ?? input.status);
  if (!decision) return c.json({ ok: false, error: 'invalid_review_decision' }, 400);
  const reviewed = await store.updateScheduledTask(task.id, {
    reviewDecision: decision,
    reviewNotes: String(input.notes ?? '').trim(),
    status: decision === 'approved' ? 'approved' : 'changes_requested',
    completedAt: new Date().toISOString()
  });
  let revision = null;
  if (decision === 'changes_requested' && input.revision !== false) {
    revision = await createRevisionScheduledTask(store, { roomId: task.roomId }, task, input, String(input.notes ?? '').trim());
    await store.updateScheduledTask(task.id, { supersededByTaskId: revision.id });
    await dispatchDueScheduledTasks(store);
  }
  return c.json({ ok: true, task: await store.getScheduledTask(task.id) ?? reviewed, revision });
});

app.post('/api/tasks/:id/interrupt', async (c) => {
  const store = c.get('store');
  const task = await store.getScheduledTask(c.req.param('id'));
  if (!task) return c.json({ ok: false, error: 'task_not_found' }, 404);
  const input = await c.req.json();
  const result = await interruptScheduledTask(store, { roomId: task.roomId }, {
    ...input,
    taskId: task.id
  });
  return c.json({ ok: true, ...result });
});

app.delete('/api/tasks/:id', async (c) => {
  const store = c.get('store');
  const task = await store.getScheduledTask(c.req.param('id'));
  if (!task) return c.json({ ok: false, error: 'task_not_found' }, 404);
  if (task.status === 'running') return c.json({ ok: false, error: 'task_running_stop_first' }, 409);
  await store.deleteScheduledTask(task.id);
  return c.json({ ok: true, task });
});

app.delete('/api/tasks/:id/series', async (c) => {
  const store = c.get('store');
  const task = await store.getScheduledTask(c.req.param('id'));
  if (!task) return c.json({ ok: false, error: 'task_not_found' }, 404);
  if (!task.repeatInterval && !task.parentTaskId) return c.json({ ok: false, error: 'task_not_recurring' }, 409);
  const seriesId = task.parentTaskId ?? task.id;
  const tasks = await store.listScheduledTasks(null, { limit: 1000 });
  const candidates = tasks.filter((item) => (
    item.id === seriesId || item.parentTaskId === seriesId
  ) && item.status === 'scheduled');
  const deleted = [];
  for (const candidate of candidates) {
    const removed = await store.deleteScheduledTask(candidate.id);
    if (removed) deleted.push(removed);
  }
  return c.json({ ok: true, seriesId, deleted });
});

app.get('/api/rooms/:roomId/projects', async (c) => {
  const store = c.get('store');
  const room = await store.getRoom(c.req.param('roomId'));
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  const projects = await store.listProjects(room.id);
  const tasks = await store.listProjectTasks(room.id, { byRoom: true });
  return c.json({ projects, tasks });
});

app.get('/api/projects/:id/outputs', async (c) => {
  const store = c.get('store');
  const project = await store.getProject(c.req.param('id'));
  if (!project) return c.json({ ok: false, error: 'project_not_found' }, 404);
  return c.json(await buildProjectOutputSummary(store, project));
});

app.get('/api/projects/:id/delivery', async (c) => {
  const store = c.get('store');
  const project = await store.getProject(c.req.param('id'));
  if (!project) return c.json({ ok: false, error: 'project_not_found' }, 404);
  return c.json(await buildProjectDeliverySummary(store, project));
});

app.post('/api/projects/:id/delivery-file', async (c) => {
  const store = c.get('store');
  const project = await store.getProject(c.req.param('id'));
  if (!project) return c.json({ ok: false, error: 'project_not_found' }, 404);

  try {
    return c.json(await materializeProjectDeliveryFile(store, project), 201);
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.get('/api/projects/:id/export.zip', async (c) => {
  const store = c.get('store');
  const project = await store.getProject(c.req.param('id'));
  if (!project) return c.json({ ok: false, error: 'project_not_found' }, 404);

  const result = await withRoomWorkspace(store, project.roomId);
  if (!result.ok) return c.json(result, result.status);

  try {
    const storage = createWorkspaceStorage();
    const bytes = await storage.exportZip(result.workspace.id, project.rootPath);
    return new Response(bytes, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${downloadFilenameForPath(`${project.slug || project.id}.zip`)}"`
      }
    });
  } catch (error) {
    return workspaceError(c, error);
  }
});

app.get('/api/rooms/:roomId/project-distribution', async (c) => {
  const store = c.get('store');
  const room = await store.getRoom(c.req.param('roomId'));
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);
  const type = normalizeProjectType(c.req.query('type'));
  const fallbackAgentId = String(c.req.query('fallbackAgentId') ?? '').trim();
  const template = projectTemplateForType(type);
  return c.json(await buildProjectDistribution(store, room.id, template, fallbackAgentId));
});

app.post('/api/rooms/:roomId/projects', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const room = await store.getRoom(roomId);
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);

  const input = await c.req.json();
  const agentId = String(input.agentId ?? '').trim();
  const name = String(input.name ?? '').trim();
  const type = normalizeProjectType(input.type);
  const instructions = String(input.instructions ?? '').trim();
  if (!agentId) return c.json({ ok: false, error: 'agent_required' }, 400);
  if (!name) return c.json({ ok: false, error: 'project_name_required' }, 400);
  if (!instructions) return c.json({ ok: false, error: 'project_instructions_required' }, 400);

  try {
    return c.json(await createRoomProject(store, roomId, {
      agentId,
      name,
      type,
      instructions
    }), 202);
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.post('/api/projects/:id/archive', async (c) => {
  const store = c.get('store');
  const project = await store.getProject(c.req.param('id'));
  if (!project) return c.json({ ok: false, error: 'project_not_found' }, 404);
  const tasks = await store.listProjectTasks(project.id);
  for (const task of tasks.filter((item) => item.status === 'running' || item.status === 'queued' || item.status === 'blocked')) {
    if (task.runId) {
      const run = await store.getAgentRun(task.runId);
      if (run?.status === 'queued' || run?.status === 'running') {
        queuedAgentRunIds.delete(run.id);
        stopRunningAgentRun(run.id);
        await store.updateAgentRun(run.id, {
          status: 'stopped',
          stoppedAt: new Date().toISOString()
        });
      }
    }
    await store.updateProjectTask(task.id, {
      status: 'cancelled',
      completedAt: new Date().toISOString()
    });
  }
  const archived = await store.updateProject(project.id, {
    status: 'archived',
    archivedAt: new Date().toISOString()
  });
  return c.json({ ok: true, project: archived, tasks: await store.listProjectTasks(project.id) });
});

app.delete('/api/projects/:id', async (c) => {
  const store = c.get('store');
  const project = await store.getProject(c.req.param('id'));
  if (!project) return c.json({ ok: false, error: 'project_not_found' }, 404);
  const activeTasks = (await store.listProjectTasks(project.id))
    .filter((task) => task.status === 'running' || task.status === 'queued' || task.status === 'blocked');
  if (activeTasks.length > 0) return c.json({ ok: false, error: 'project_has_active_tasks' }, 409);
  const deleteFiles = c.req.query('deleteFiles') === '1';
  if (deleteFiles) {
    const { workspace } = await withRoomWorkspace(store, project.roomId);
    const storage = createWorkspaceStorage();
    await storage.deleteFile(workspace.id, project.rootPath);
  }
  const deleted = await store.deleteProject(project.id);
  return c.json({ ok: true, project: deleted, deletedFiles: deleteFiles });
});

app.post('/api/project-tasks/:id/retry', async (c) => {
  const store = c.get('store');
  const task = await store.getProjectTask(c.req.param('id'));
  if (!task) return c.json({ ok: false, error: 'project_task_not_found' }, 404);
  if (task.status === 'running') return c.json({ ok: false, error: 'project_task_running' }, 409);
  await resetProjectTaskAndDependents(store, task);
  const project = await store.getProject(task.projectId);
  if (project) {
    await store.updateProject(project.id, {
      status: projectStatusForPhase(task.phase),
      currentPhase: task.phase,
      error: undefined
    });
    await startReadyProjectTasks(store, project.id);
  }
  return c.json({ ok: true, project: project ? await store.getProject(project.id) : null, tasks: await store.listProjectTasks(task.projectId) }, 202);
});

app.patch('/api/project-tasks/:id', async (c) => {
  const store = c.get('store');
  const task = await store.getProjectTask(c.req.param('id'));
  if (!task) return c.json({ ok: false, error: 'project_task_not_found' }, 404);
  if (task.status === 'running') return c.json({ ok: false, error: 'project_task_running' }, 409);
  const input = await c.req.json();
  const agentId = String(input.agentId ?? '').trim();
  if (!agentId) return c.json({ ok: false, error: 'agent_required' }, 400);
  const roomAgents = await store.listRoomAgents(task.roomId);
  const agent = roomAgents.find((item) => item.id === agentId) ?? await store.getAgent(agentId);
  if (!agent) return c.json({ ok: false, error: 'agent_not_found' }, 404);
  const updated = await store.updateProjectTask(task.id, { agentId: agent.id });
  return c.json({ ok: true, task: updated });
});

async function createRoomProject(store, roomId, input) {
  const fallbackAgent = await store.getAgent(String(input.agentId ?? '').trim());
  if (!fallbackAgent) throw new Error('agent_not_found');

  const name = String(input.name ?? '').trim();
  const instructions = String(input.instructions ?? '').trim();
  if (!name) throw new Error('project_name_required');
  if (!instructions) throw new Error('project_instructions_required');

  const type = normalizeProjectType(input.type);
  const slug = await uniqueProjectSlug(store, roomId, name);
  const template = projectTemplateForType(type);
  const distribution = await buildProjectDistribution(store, roomId, template, fallbackAgent.id);
  const project = await store.createProject({
    roomId,
    name,
    slug,
    type,
    templateId: template.id,
    rootPath: `projects/${slug}`,
    entryPath: `projects/${slug}/index.html`,
    brief: instructions,
    status: template.initialStatus,
    currentPhase: template.phases[0]?.phase
  });

  const storage = createWorkspaceStorage();
  const { workspace } = await withRoomWorkspace(store, roomId);
  await storage.makeDirectory(workspace.id, project.rootPath);

  const tasks = await createProjectTasksFromTemplate(store, project, template, distribution);
  await store.createMessage({
    roomId,
    senderType: 'system',
    senderName: 'AgentIM',
    content: buildProjectCreatedMessage(project, tasks, distribution),
    status: 'done',
    pending: false
  });
  await startReadyProjectTasks(store, project.id);
  return {
    ok: true,
    project: await store.getProject(project.id),
    tasks: await store.listProjectTasks(project.id),
    distribution
  };
}

app.post('/api/rooms/:roomId/agent-runs', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const input = await c.req.json();
  const result = await createAndStartAgentRun(store, roomId, String(input.agentId ?? ''), {
    turn: Number(input.turn) || 1,
    maxTurns: Number(input.maxTurns) || MAX_AGENT_TURNS
  });
  if (!result.ok) return c.json(result, result.status);
  return c.json(result, 202);
});

app.post('/api/agent-runs/:id/stop', async (c) => {
  const store = c.get('store');
  const run = await store.getAgentRun(c.req.param('id'));
  if (!run) return c.json({ ok: false, error: 'agent_run_not_found' }, 404);
  if (run.status !== 'queued' && run.status !== 'running') {
    return c.json({ ok: false, error: 'agent_run_not_active' }, 409);
  }

  queuedAgentRunIds.delete(run.id);
  stopRunningAgentRun(run.id);
  const stoppedRun = await store.updateAgentRun(run.id, {
    status: 'stopped',
    stoppedAt: new Date().toISOString()
  });
  await completeScheduledTaskForRun(store, run.id, 'failed', 'agent_run_stopped');
  await completeProjectTaskForRun(store, run, 'failed', 'agent_run_stopped');
  if (run.messageId) {
    const messages = await store.listMessages(run.roomId);
    const message = messages.find((item) => item.id === run.messageId);
    await store.updateMessage(run.messageId, {
      status: 'stopped',
      pending: false,
      content: message?.content && message.content !== 'Thinking...'
        ? `${message.content}\n\n[Stopped by user]`
        : 'Stopped by user.'
    });
  }
  return c.json({ ok: true, run: stoppedRun });
});

app.post('/api/agent-runs/:id/retry', async (c) => {
  const store = c.get('store');
  const run = await store.getAgentRun(c.req.param('id'));
  if (!run) return c.json({ ok: false, error: 'agent_run_not_found' }, 404);
  if (run.status === 'queued' || run.status === 'running') {
    return c.json({ ok: false, error: 'agent_run_already_active' }, 409);
  }
  if (run.status !== 'failed' && run.status !== 'stopped') {
    return c.json({ ok: false, error: 'agent_run_not_retryable' }, 409);
  }

  const agent = await store.getAgent(run.agentId);
  if (!agent) return c.json({ ok: false, error: 'agent_not_found' }, 404);

  const retriedRun = await store.updateAgentRun(run.id, {
    status: 'queued',
    error: undefined,
    retriedAt: new Date().toISOString(),
    stoppedAt: undefined,
    completedAt: undefined
  });
  const message = run.messageId
    ? await store.updateMessage(run.messageId, {
      senderName: agent.name,
      content: 'Thinking...',
      status: 'queued',
      pending: true
    })
    : null;

  enqueueAgentRun(store, run.id);
  return c.json({ ok: true, run: retriedRun, message }, 202);
});

app.post('/api/rooms/:roomId/agent-runs/stop', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const runs = (await store.listAgentRuns(roomId)).filter((run) => run.status === 'queued' || run.status === 'running');
  for (const run of runs) {
    queuedAgentRunIds.delete(run.id);
    stopRunningAgentRun(run.id);
    await store.updateAgentRun(run.id, {
      status: 'stopped',
      stoppedAt: new Date().toISOString()
    });
    await completeScheduledTaskForRun(store, run.id, 'failed', 'agent_run_stopped');
    await completeProjectTaskForRun(store, run, 'failed', 'agent_run_stopped');
    if (run.messageId) {
      const messages = await store.listMessages(roomId);
      const message = messages.find((item) => item.id === run.messageId);
      await store.updateMessage(run.messageId, {
        status: 'stopped',
        pending: false,
        content: message?.content && message.content !== 'Thinking...'
          ? `${message.content}\n\n[Stopped by user]`
          : 'Stopped by user.'
      });
    }
  }
  return c.json({ ok: true, stopped: runs.length });
});

app.get('/api/conversations/:roomId/messages', async (c) => {
  const store = c.get('store');
  return c.json(await listMessagePage(c, store, c.req.param('roomId')));
});

app.post('/api/conversations/:roomId/messages', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const room = await store.getRoom(roomId);
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);

  const input = await c.req.json();
  const content = String(input.content ?? '').trim();
  if (!content) return c.json({ ok: false, error: 'content_required' }, 400);

  return c.json(await store.createMessage({
    roomId,
    senderType: input.senderType === 'agent' ? 'agent' : 'user',
    senderName: String(input.senderName ?? 'You'),
    content
  }), 201);
});

app.get('/api/rooms/:roomId/messages', async (c) => {
  const store = c.get('store');
  return c.json(await listMessagePage(c, store, c.req.param('roomId')));
});

app.post('/api/rooms/:roomId/messages', async (c) => {
  const store = c.get('store');
  const roomId = c.req.param('roomId');
  const room = await store.getRoom(roomId);
  if (!room) return c.json({ ok: false, error: 'room_not_found' }, 404);

  const input = await c.req.json();
  const content = String(input.content ?? '').trim();
  if (!content) return c.json({ ok: false, error: 'content_required' }, 400);

  return c.json(await store.createMessage({
    roomId,
    senderType: input.senderType === 'agent' ? 'agent' : 'user',
    senderName: String(input.senderName ?? 'You'),
    content
  }), 201);
});

app.get('/api/conversations/:roomId/stream', async (c) => {
  return streamAgentReply(c, c.req.param('roomId'), c.req.query('agentId'));
});

app.get('/api/rooms/:roomId/stream', async (c) => {
  return streamAgentReply(c, c.req.param('roomId'), c.req.query('agentId'));
});

async function ensureAgentRunRecovery(store) {
  if (recoveredStores.has(store)) return;
  recoveredStores.add(store);

  const providerDeps = await createProviderDeps(store);
  const timeoutMs = normalizeProviderTimeoutInput(providerDeps.timeoutMs);
  const now = Date.now();
  const activeRuns = (await store.listAgentRuns())
    .filter((run) => run.status === 'queued' || run.status === 'running');

  for (const run of activeRuns) {
    if (runningAgentRuns.has(run.id)) continue;
    if (run.status === 'running' && runStartedTooLongAgo(run, now, timeoutMs)) {
      await failAgentRun(store, run, `provider_timeout_after_${timeoutMs}ms`);
      continue;
    }
    if (run.messageId) {
      await reconcileRecoveredRunMessage(store, run);
    }
    if (run.status === 'running') {
      await store.updateAgentRun(run.id, {
        status: 'queued',
        recoveredAt: new Date().toISOString()
      });
    } else {
      await store.updateAgentRun(run.id, {
        recoveredAt: new Date().toISOString()
      });
    }
    enqueueAgentRun(store, run.id);
  }
  await reconcileBackgroundWorkRecovery(store);
}

async function reconcileRecoveredRunMessage(store, run) {
  const message = await store.getMessage(run.messageId);
  if (!message) return;
  await store.updateMessage(run.messageId, {
    runId: run.id,
    status: 'queued',
    pending: true,
    content: String(message.content ?? '').trim() || 'Thinking...'
  });
}

async function reconcileBackgroundWorkRecovery(store) {
  const runs = await store.listAgentRuns();
  const runById = new Map(runs.map((run) => [run.id, run]));
  const now = new Date().toISOString();

  const runningScheduledTasks = await store.listScheduledTasks(null, { statuses: ['running'], limit: 1000 });
  for (const task of runningScheduledTasks) {
    const run = task.runId ? runById.get(task.runId) : null;
    if (!run) {
      await store.updateScheduledTask(task.id, {
        status: 'scheduled',
        scheduleAt: now,
        error: 'recovered_without_agent_run'
      });
      continue;
    }
    if (run.status === 'queued' || run.status === 'running') {
      enqueueAgentRun(store, run.id);
      continue;
    }
    await completeScheduledTaskForRun(
      store,
      run.id,
      run.status === 'done' ? 'done' : 'failed',
      run.error || (run.status === 'stopped' ? 'agent_run_stopped' : undefined)
    );
  }

  const activeProjectTasks = await store.listProjectTasks(null, { statuses: ['running', 'queued'] });
  const projectIds = new Set();
  for (const task of activeProjectTasks) {
    projectIds.add(task.projectId);
    if (task.status !== 'running') continue;
    const run = task.runId ? runById.get(task.runId) : null;
    if (!run) {
      await store.updateProjectTask(task.id, {
        status: 'queued',
        runId: undefined,
        messageId: undefined,
        error: 'recovered_without_agent_run',
        startedAt: undefined
      });
      continue;
    }
    if (run.status === 'queued' || run.status === 'running') {
      enqueueAgentRun(store, run.id);
      continue;
    }
    const message = run.messageId ? await store.getMessage(run.messageId) : null;
    await completeProjectTaskForRun(
      store,
      run,
      run.status === 'done' ? 'done' : 'failed',
      run.error || (run.status === 'stopped' ? 'agent_run_stopped' : undefined),
      message?.content ?? ''
    );
  }

  for (const projectId of projectIds) {
    await startReadyProjectTasks(store, projectId);
  }
}

function runStartedTooLongAgo(run, now, timeoutMs) {
  const started = new Date(run.lastAttemptAt ?? run.startedAt ?? run.updatedAt ?? run.createdAt).getTime();
  return Number.isFinite(started) && now - started > timeoutMs + 1000;
}

function ensureTaskScheduler(store) {
  if (taskSchedulerStores.has(store)) return;
  taskSchedulerStores.add(store);
  dispatchDueScheduledTasks(store).catch((error) => console.error('Scheduled task dispatch failed.', error));
  if (typeof setInterval === 'function') {
    setInterval(() => {
      dispatchDueScheduledTasks(store).catch((error) => console.error('Scheduled task dispatch failed.', error));
    }, 5000).unref?.();
  }
}

async function dispatchDueScheduledTasks(store) {
  const dueTasks = await store.listScheduledTasks(null, {
    statuses: ['scheduled'],
    dueBefore: new Date().toISOString(),
    limit: 20
  });
  for (const task of dueTasks) {
    const current = await store.getScheduledTask(task.id);
    if (!current || current.status !== 'scheduled') continue;
    const dependencyState = await scheduledTaskDependencyState(store, current);
    if (dependencyState === 'waiting') continue;
    if (dependencyState === 'failed') {
      await store.updateScheduledTask(current.id, {
        status: 'failed',
        error: 'dependency_failed',
        completedAt: new Date().toISOString()
      });
      continue;
    }
    await runScheduledTask(store, current);
  }
}

async function scheduledTaskDependencyState(store, task) {
  const dependencyIds = scheduledTaskDependencyIds(task);
  if (dependencyIds.length === 0) return 'ready';
  const dependencies = [];
  for (const id of dependencyIds) {
    const dependency = await store.getScheduledTask(id);
    dependencies.push(dependency);
  }
  if (dependencies.some((dependency) => !dependency || dependency.status === 'failed' || dependency.status === 'cancelled')) return 'failed';
  if (dependencies.every((dependency) => taskDependencySatisfied(dependency))) return 'ready';
  return 'waiting';
}

function taskDependencySatisfied(task) {
  return task && ['done', 'approved'].includes(task.status);
}

async function runScheduledTask(store, task) {
  const room = await store.getRoom(task.roomId);
  const agent = await store.getAgent(task.agentId);
  if (!room || !agent) {
    await store.updateScheduledTask(task.id, {
      status: 'failed',
      error: !room ? 'room_not_found' : 'agent_not_found',
      completedAt: new Date().toISOString()
    });
    return;
  }

  const contextMessage = await store.createMessage({
    roomId: task.roomId,
    senderType: 'user',
    senderName: 'Scheduled Task',
    content: `Scheduled task: ${task.title}\n\n${task.instructions}`,
    status: 'done',
    pending: false
  });

  const started = await store.updateScheduledTask(task.id, {
    status: 'running',
    messageId: contextMessage.id,
    startedAt: new Date().toISOString()
  });
  const result = await createAndStartAgentRun(store, task.roomId, task.agentId, {
    scheduledTaskId: task.id
  });
  if (!result.ok) {
    await store.updateScheduledTask(task.id, {
      status: 'failed',
      error: result.error,
      completedAt: new Date().toISOString()
    });
    return;
  }
  await store.updateScheduledTask(started.id, {
    runId: result.run.id
  });
}

async function startReadyProjectTasks(store, projectId) {
  const project = await store.getProject(projectId);
  if (!project || project.status === 'done' || project.status === 'failed' || project.status === 'archived') return;
  const tasks = await store.listProjectTasks(projectId);
  const doneIds = new Set(tasks.filter((task) => task.status === 'done').map((task) => task.id));
  const readyTasks = tasks.filter((task) => {
    if (task.status !== 'queued') return false;
    const dependencyIds = projectTaskDependencyIds(task);
    return dependencyIds.every((id) => doneIds.has(id));
  });
  if (readyTasks.length === 0) {
    if (tasks.length > 0 && tasks.every((task) => task.status === 'done')) {
      const doneProject = await store.updateProject(project.id, {
        status: 'done',
        currentPhase: undefined
      });
      if (doneProject) await createProjectStatusMessage(store, doneProject, tasks, 'done');
    }
    return;
  }
  for (const task of readyTasks) {
    const current = await store.getProjectTask(task.id);
    if (current?.status === 'queued') await startProjectTask(store, project, current);
  }
  await updateProjectProgress(store, project.id);
}

async function startProjectTask(store, project, task) {
  const agentId = await resolveProjectTaskAgentId(store, task.roomId, task.roleId, task.agentId);
  if (!agentId) {
    await store.updateProjectTask(task.id, {
      status: 'failed',
      error: 'agent_not_found',
      completedAt: new Date().toISOString()
    });
    await store.updateProject(project.id, {
      status: 'failed',
      error: `No Agent found for ${task.roleId}`
    });
    return;
  }
  const context = await buildProjectTaskContext(store, project, task);
  const message = await store.createMessage({
    roomId: task.roomId,
    senderType: 'user',
    senderName: 'Project Orchestrator',
    content: context,
    status: 'done',
    pending: false
  });
  const started = await store.updateProjectTask(task.id, {
    agentId,
    messageId: message.id,
    status: 'running',
    startedAt: new Date().toISOString()
  });
  await store.updateProject(project.id, {
    status: projectStatusForPhase(task.phase),
    currentPhase: task.phase
  });
  const result = await createAndStartAgentRun(store, task.roomId, agentId, {
    maxTurns: MAX_AGENT_TURNS,
    projectTaskId: task.id
  });
  if (!result.ok) {
    await store.updateProjectTask(task.id, {
      status: 'failed',
      error: result.error,
      completedAt: new Date().toISOString()
    });
    await store.updateProject(project.id, {
      status: 'failed',
      error: result.error
    });
    return;
  }
  await store.updateProjectTask(started.id, {
    runId: result.run.id
  });
}

async function completeProjectTaskForRun(store, run, status, error, content = '') {
  const task = await store.getProjectTaskByRunId(run.id);
  if (!task) return;
  const project = await store.getProject(task.projectId);
  await store.updateProjectTask(task.id, {
    status,
    error: error || undefined,
    resultSummary: summarizeProjectTaskResult(content),
    completedAt: new Date().toISOString()
  });
  if (!project) return;
  if (project.status === 'archived') return;
  if (status !== 'done') {
    const failedProject = await store.updateProject(project.id, {
      status: 'failed',
      error: error || 'project_task_failed'
    });
    if (failedProject) await createProjectStatusMessage(store, failedProject, await store.listProjectTasks(project.id), 'failed', error || 'project_task_failed');
    return;
  }
  await startReadyProjectTasks(store, project.id);
}

async function createProjectStatusMessage(store, project, tasks, status, error = '') {
  const done = tasks.filter((task) => task.status === 'done').length;
  const total = tasks.length;
  const failed = tasks.filter((task) => task.status === 'failed').length;
  const running = tasks.filter((task) => task.status === 'running').length;
  const delivery = status === 'done'
    ? await materializeProjectDeliveryFile(store, project).catch(() => null)
    : null;
  const content = [
    `Project ${status}: ${project.name}`,
    `Progress: ${done}/${total} done${running ? `, ${running} running` : ''}${failed ? `, ${failed} failed` : ''}`,
    `Project ID: ${project.id}`,
    project.rootPath ? `Root: ${project.rootPath}` : '',
    project.entryPath ? `Preview: ${project.entryPath}` : '',
    delivery?.path ? `Delivery: ${delivery.path}` : '',
    status === 'done' ? `Download: /api/projects/${encodeURIComponent(project.id)}/export.zip` : '',
    error ? `Error: ${error}` : ''
  ].filter(Boolean).join('\n');
  await store.createMessage({
    roomId: project.roomId,
    senderType: 'system',
    senderName: 'AgentIM',
    content,
    status: 'done',
    pending: false
  });
}

async function resetProjectTaskAndDependents(store, rootTask) {
  const tasks = await store.listProjectTasks(rootTask.projectId);
  const resetIds = new Set([rootTask.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (projectTaskDependencyIds(task).some((id) => resetIds.has(id)) && !resetIds.has(task.id)) {
        resetIds.add(task.id);
        changed = true;
      }
    }
  }
  for (const task of tasks.filter((item) => resetIds.has(item.id))) {
    if (task.runId) {
      const run = await store.getAgentRun(task.runId);
      if (run?.status === 'queued' || run?.status === 'running') {
        queuedAgentRunIds.delete(run.id);
        stopRunningAgentRun(run.id);
        await store.updateAgentRun(run.id, {
          status: 'stopped',
          stoppedAt: new Date().toISOString()
        });
      }
    }
    await store.updateProjectTask(task.id, {
      status: 'queued',
      runId: undefined,
      messageId: undefined,
      error: undefined,
      resultSummary: undefined,
      startedAt: undefined,
      completedAt: undefined
    });
  }
}

async function updateProjectProgress(store, projectId) {
  const project = await store.getProject(projectId);
  if (!project || project.status === 'archived' || project.status === 'failed' || project.status === 'done') return;
  const tasks = await store.listProjectTasks(projectId);
  const running = tasks.filter((task) => task.status === 'running');
  if (running.length === 0) return;
  const phases = [...new Set(running.map((task) => task.phase).filter(Boolean))];
  await store.updateProject(project.id, {
    status: projectStatusForPhase(phases[0]),
    currentPhase: phases.join(', ')
  });
}

function projectTaskDependencyIds(task) {
  const ids = [];
  if (Array.isArray(task.dependsOnTaskIds)) ids.push(...task.dependsOnTaskIds);
  if (task.dependsOnTaskId) ids.push(task.dependsOnTaskId);
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function enqueueAgentRun(store, runId) {
  if (!runId || runningAgentRuns.has(runId)) return;
  queuedAgentRunIds.add(runId);
  queueMicrotask(() => drainAgentRunQueue(store));
}

async function drainAgentRunQueue(store) {
  if (queueDraining) return;
  queueDraining = true;
  try {
    while (activeAgentRunCount < MAX_CONCURRENT_AGENT_RUNS && queuedAgentRunIds.size > 0) {
      const runId = queuedAgentRunIds.values().next().value;
      queuedAgentRunIds.delete(runId);

      const run = await store.getAgentRun(runId);
      if (!run || run.status !== 'queued') continue;

      const controller = new AbortController();
      const running = { controller, abortReason: null };
      runningAgentRuns.set(run.id, running);
      activeAgentRunCount += 1;

      runBackgroundAgentRunWithWatchdog(store, run.id, running)
        .catch((error) => console.error('Agent run failed.', error))
        .finally(() => {
          runningAgentRuns.delete(run.id);
          activeAgentRunCount = Math.max(0, activeAgentRunCount - 1);
          queueMicrotask(() => drainAgentRunQueue(store));
        });
    }
  } finally {
    queueDraining = false;
  }
}

async function runBackgroundAgentRunWithWatchdog(store, runId, running) {
  const providerDeps = await createProviderDeps(store);
  const timeoutMs = normalizeProviderTimeoutInput(providerDeps.timeoutMs);
  let timeoutId;
  let timedOut = false;
  const runPromise = runBackgroundAgentRun(store, runId, running.controller.signal, running)
    .catch((error) => {
      if (timedOut) return 'timed_out';
      throw error;
    });
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(async () => {
      timedOut = true;
      abortAgentRun(running, AGENT_RUN_ABORT_TIMEOUT);
      const run = await store.getAgentRun(runId);
      if (run && (run.status === 'queued' || run.status === 'running')) {
        await failAgentRun(store, run, `provider_timeout_after_${timeoutMs}ms`);
      }
      resolve('timed_out');
    }, timeoutMs + 1000);
  });
  try {
    const result = await Promise.race([runPromise, timeoutPromise]);
    if (result === 'timed_out') return;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createAndStartAgentRun(store, roomId, agentId, options = {}) {
  const room = await store.getRoom(roomId);
  if (!room) return { ok: false, error: 'room_not_found', status: 404 };

  const roomAgents = await store.listRoomAgents(roomId);
  const agents = await store.listAgents();
  const agent = roomAgents.find((item) => item.id === agentId)
    ?? agents.find((item) => item.id === agentId);
  if (!agent) return { ok: false, error: 'agent_not_found', status: 404 };

  const provider = await store.getProvider(agent.providerId);
  if (!provider) return { ok: false, error: 'provider_not_found', status: 404 };

  const message = await store.createMessage({
    roomId,
    senderType: 'agent',
    senderName: agent.name,
    content: 'Thinking...',
    status: 'queued',
    pending: true
  });
  const run = await store.createAgentRun({
    roomId,
    agentId: agent.id,
    messageId: message.id,
    status: 'queued',
    turn: options.turn ?? 1,
    maxTurns: options.maxTurns ?? MAX_AGENT_TURNS
  });
  const linkedMessage = await store.updateMessage(message.id, {
    runId: run.id,
    status: 'queued',
    pending: true
  });

  enqueueAgentRun(store, run.id);

  return { ok: true, run, message: linkedMessage };
}

async function runBackgroundAgentRun(store, runId, signal, running) {
  const run = await store.getAgentRun(runId);
  if (!run || run.status === 'stopped') return;

  await store.updateAgentRun(run.id, {
    status: 'running',
    attempts: Number(run.attempts ?? 0) + 1,
    lastAttemptAt: new Date().toISOString(),
    startedAt: new Date().toISOString()
  });
  await store.updateMessage(run.messageId, {
    status: 'running',
    pending: true,
    content: 'Thinking...'
  });

  const agent = await store.getAgent(run.agentId);
  if (!agent) {
    await failAgentRun(store, run, 'agent_not_found');
    return;
  }

  const provider = await store.getProvider(agent.providerId);
  if (!provider) {
    await failAgentRun(store, run, 'provider_not_found');
    return;
  }

  const room = await store.getRoom(run.roomId);
  if (!room) {
    await failAgentRun(store, run, 'room_not_found');
    return;
  }

  const roomAgents = await store.listRoomAgents(run.roomId);
  let content = '';
  let providerInvocation = null;
  const providerDiagnostics = {
    providerId: provider.id,
    providerName: provider.name,
    model: agent.model,
    mode: 'mock',
    fallbackUsed: false,
    finishReason: '',
    usage: null,
    choiceCount: undefined,
    streamCompleted: false,
    streamError: '',
    response: null
  };

  try {
    let providerMessages = [];
    const recentMessages = (await store.listMessages(run.roomId))
      .filter((message) => message.id !== run.messageId)
      .slice(-12)
      .filter((message) => !isInternalProviderErrorMessage(message));
    const recent = recentMessages.map((message) => ({
        role: message.senderType === 'agent' ? 'assistant' : 'user',
        content: formatMessageForContext(message, { room, roomAgents })
      }));
    const workspaceScope = await resolveRunWorkspaceScope(store, run, agent, recentMessages);

    if (provider.baseUrl === 'mock://provider') {
      for await (const event of mockAgentStream(agent, recent, signal)) {
        if (signal.aborted) throw new Error('agent_run_stopped');
        if (event.type === 'text_delta') {
          content += event.text;
          await store.updateMessage(run.messageId, {
            content,
            status: 'running',
            pending: true
          });
        }
      }
    } else {
      const workspaceContext = await buildWorkspaceContext(store, workspaceScope.roomId, workspaceScope);
      const role = await store.getRole(agent.roleId);
      const skills = await store.listSkills();
      providerMessages = [
        { role: 'system', content: buildAgentSystemPrompt(agent, roomAgents, workspaceContext, role, skills, workspaceScope) },
        ...recent
      ];
      await clearStaleProviderInvocations(store, run);
      providerInvocation = await store.createSkillInvocation({
        skillId: 'provider.chat',
        roomId: run.roomId,
        runId: run.id,
        messageId: run.messageId,
        agentId: agent.id,
        actorType: 'agent',
        status: 'running',
        input: {
          providerId: provider.id,
          model: agent.model,
          messageCount: providerMessages.length,
          streaming: true
        },
        startedAt: new Date().toISOString()
      });
      const providerDeps = await createProviderDeps(store);
      if (!providerDeps.proxyStreamingSupported) {
        providerDiagnostics.mode = 'non_streaming';
        const fallback = await createOpenAICompatibleChat({
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: agent.model,
          messages: providerMessages,
          maxTokens: 800,
          signal
        }, providerDeps);
        content = fallback.content;
        Object.assign(providerDiagnostics, {
          model: fallback.model ?? agent.model,
          finishReason: fallback.finishReason ?? '',
          usage: fallback.usage ?? null,
          choiceCount: fallback.choiceCount,
          response: fallback.response ?? null
        });
        await store.updateMessage(run.messageId, {
          content: content || formatEmptyProviderResponse(providerDiagnostics),
          status: 'running',
          pending: true
        });
      } else {
        providerDiagnostics.mode = 'streaming';
        try {
          for await (const event of streamOpenAICompatibleChat({
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            model: agent.model,
            messages: providerMessages,
            signal
          }, providerDeps)) {
            if (signal.aborted) throw new Error('agent_run_stopped');
            if (event.type === 'text_delta') {
              content += event.text;
              await store.updateMessage(run.messageId, {
                content,
                status: 'running',
                pending: true
              });
            }
            if (event.type === 'finish') {
              providerDiagnostics.finishReason = event.reason ?? '';
            }
            if (event.type === 'usage') {
              providerDiagnostics.usage = {
                prompt_tokens: event.inputTokens ?? 0,
                completion_tokens: event.outputTokens ?? 0
              };
            }
            if (event.type === 'response') {
              providerDiagnostics.response = event.http ?? null;
            }
            if (event.type === 'done') {
              providerDiagnostics.streamCompleted = true;
            }
          }
        } catch (error) {
          if (signal.aborted) throw error;
          providerDiagnostics.fallbackUsed = true;
          providerDiagnostics.streamError = error instanceof Error ? error.message : String(error);
          const fallback = await createOpenAICompatibleChat({
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            model: agent.model,
            messages: providerMessages,
            maxTokens: 800,
            signal
          }, providerDeps);
          content = fallback.content;
          Object.assign(providerDiagnostics, {
            mode: 'streaming_fallback',
            model: fallback.model ?? agent.model,
            finishReason: fallback.finishReason ?? providerDiagnostics.finishReason,
            usage: fallback.usage ?? providerDiagnostics.usage,
            choiceCount: fallback.choiceCount,
            response: fallback.response ?? providerDiagnostics.response
          });
          await store.updateMessage(run.messageId, {
            content: content || formatEmptyProviderResponse(providerDiagnostics),
            status: 'running',
            pending: true
          });
        }
      }
      if (providerInvocation) {
        await store.updateSkillInvocation(providerInvocation.id, {
          status: 'done',
          output: {
            model: agent.model,
            contentLength: content.length,
            diagnostics: providerDiagnostics
          },
          completedAt: new Date().toISOString()
        });
      }
    }

    if (signal.aborted || await isAgentRunStopped(store, run.id)) return;

    content = content || formatEmptyProviderResponse(providerDiagnostics);
    const webReads = await applyWebReadActions(store, run, content, signal);
    if (webReads.length > 0) {
      const webReadText = formatWebReadResults(webReads);
      content = `${content}\n\n${webReadText}`;
      await store.updateMessage(run.messageId, {
        content,
        status: 'running',
        pending: true
      });
      if (provider.baseUrl !== 'mock://provider') {
        content = await continueAgentAfterToolResults(store, run, {
          agent,
          provider,
          messages: providerMessages,
          previousContent: content,
          toolResultText: webReadText,
          providerDiagnostics,
          signal
        });
      }
    }
    const workspaceReads = await applyWorkspaceReadActions(store, run, content, workspaceScope);
    if (workspaceReads.length > 0) {
      content = `${content}\n\n${formatWorkspaceReadResults(workspaceReads)}`;
      await store.updateMessage(run.messageId, {
        content,
        status: 'running',
        pending: true
      });
      if (provider.baseUrl !== 'mock://provider') {
        content = await continueAgentAfterToolResults(store, run, {
          agent,
          provider,
          messages: providerMessages,
          previousContent: content,
          toolResultText: formatWorkspaceReadResults(workspaceReads),
          providerDiagnostics,
          signal
        });
      }
    }
    const workspaceActions = await applyWorkspaceActions(store, run, content, workspaceScope);
    if (workspaceActions.length > 0) {
      await store.createMessage({
        roomId: run.roomId,
        senderType: 'system',
        senderName: 'AgentIM',
        content: `Workspace updated${workspaceScope.roomId !== run.roomId ? ` in ${workspaceScope.room.name}` : ''}: ${workspaceActions.map((action) => action.path).join(', ')}`,
        status: 'done',
        pending: false
      });
    }

    const roomMessages = await applyRoomMessageActions(store, run, content, workspaceScope);
    if (roomMessages.length > 0) {
      await store.createMessage({
        roomId: run.roomId,
        senderType: 'system',
        senderName: 'AgentIM',
        content: `Message sent to ${roomMessages.map((action) => action.roomName).join(', ')}.`,
        status: 'done',
        pending: false
      });
    }
    const roleActions = await applyRoleManagementActions(store, run, content);
    if (roleActions.created.length > 0) {
      await store.createMessage({
        roomId: run.roomId,
        senderType: 'system',
        senderName: 'AgentIM',
        content: `Roles created: ${roleActions.created.map((action) => action.roleName).join(', ')}.`,
        status: 'done',
        pending: false
      });
    }
    const platformActions = await applyPlatformActions(store, run, content, workspaceScope);
    if (platformActions.length > 0) {
      await store.createMessage({
        roomId: run.roomId,
        senderType: 'system',
        senderName: 'AgentIM',
        content: `Platform actions completed: ${platformActions.map((action) => action.summary).join('; ')}.`,
        status: 'done',
        pending: false
      });
      if (provider.baseUrl !== 'mock://provider' && platformActionsShouldContinue(platformActions)) {
        content = await continueAgentAfterToolResults(store, run, {
          agent,
          provider,
          messages: providerMessages,
          previousContent: content,
          toolResultText: formatPlatformActionResults(platformActions),
          providerDiagnostics,
          signal
        });
        const followupRoomMessages = await applyRoomMessageActions(store, run, content, workspaceScope);
        if (followupRoomMessages.length > 0) {
          await store.createMessage({
            roomId: run.roomId,
            senderType: 'system',
            senderName: 'AgentIM',
            content: `Message sent to ${followupRoomMessages.map((action) => action.roomName).join(', ')}.`,
            status: 'done',
            pending: false
          });
        }
        const followupRoleActions = await applyRoleManagementActions(store, run, content);
        if (followupRoleActions.created.length > 0) {
          await store.createMessage({
            roomId: run.roomId,
            senderType: 'system',
            senderName: 'AgentIM',
            content: `Roles created: ${followupRoleActions.created.map((action) => action.roleName).join(', ')}.`,
            status: 'done',
            pending: false
          });
        }
        const followupPlatformActions = await applyPlatformActions(store, run, content, workspaceScope);
        if (followupPlatformActions.length > 0) {
          await store.createMessage({
            roomId: run.roomId,
            senderType: 'system',
            senderName: 'AgentIM',
            content: `Platform actions completed: ${followupPlatformActions.map((action) => action.summary).join('; ')}.`,
            status: 'done',
            pending: false
          });
        }
      }
    }
    const taskPlanActions = await applyTaskPlanActions(store, run, content);
    if (taskPlanActions.created.length > 0) {
      await store.createMessage({
        roomId: run.roomId,
        senderType: 'system',
        senderName: 'AgentIM',
        content: `Tasks scheduled: ${taskPlanActions.created.map((task) => task.title).join('; ')}.`,
        status: 'done',
        pending: false
      });
    }
    const roomManagementActions = await applyRoomManagementActions(store, run, content, workspaceScope);
    if (roomManagementActions.created.length > 0 || roomManagementActions.assigned.length > 0) {
      const created = roomManagementActions.created.map((action) => action.roomName).join(', ');
      const assigned = roomManagementActions.assigned.map((action) => `${action.agentName} -> ${action.roomName}`).join(', ');
      await store.createMessage({
        roomId: run.roomId,
        senderType: 'system',
        senderName: 'AgentIM',
        content: [
          created ? `Rooms created: ${created}` : '',
          assigned ? `Agents assigned: ${assigned}` : ''
        ].filter(Boolean).join('\n'),
        status: 'done',
        pending: false
      });
    }

    await store.updateMessage(run.messageId, {
      content,
      status: 'done',
      pending: false
    });
    await store.updateAgentRun(run.id, {
      status: 'done',
      completedAt: new Date().toISOString()
    });
    await completeScheduledTaskForRun(store, run.id, 'done');
    await completeProjectTaskForRun(store, run, 'done', undefined, content);
    await startMentionedAgentRuns(store, run, content);
  } catch (error) {
    if ((signal.aborted && running?.abortReason === AGENT_RUN_ABORT_STOP) || error?.message === 'agent_run_stopped') {
      await store.updateAgentRun(run.id, {
        status: 'stopped',
        stoppedAt: new Date().toISOString()
      });
      await store.updateMessage(run.messageId, {
        content: content || 'Stopped by user.',
        status: 'stopped',
        pending: false
      });
      await completeScheduledTaskForRun(store, run.id, 'failed', 'agent_run_stopped');
      await completeProjectTaskForRun(store, run, 'failed', 'agent_run_stopped', content);
      return;
    }
    if (signal.aborted && running?.abortReason === AGENT_RUN_ABORT_TIMEOUT) {
      if (providerInvocation) {
        await store.updateSkillInvocation(providerInvocation.id, {
          status: 'failed',
          error: `provider_timeout_after_${normalizeProviderTimeoutInput((await createProviderDeps(store)).timeoutMs)}ms`,
          completedAt: new Date().toISOString()
        });
      }
      return;
    }
    if (providerInvocation) {
      await store.updateSkillInvocation(providerInvocation.id, {
        status: signal.aborted || error?.message === 'agent_run_stopped' ? 'rejected' : 'failed',
        error: error instanceof Error ? error.message : String(error),
        output: {
          diagnostics: {
            ...providerDiagnostics,
            response: error?.response ?? providerDiagnostics.response
          }
        },
        completedAt: new Date().toISOString()
      });
    }
    await failAgentRun(store, run, error instanceof Error ? error.message : String(error), content);
  }
}

async function clearStaleProviderInvocations(store, run) {
  const invocations = await store.listSkillInvocations(run.roomId, { limit: 200 });
  const stale = invocations.filter((invocation) =>
    invocation.runId === run.id &&
    invocation.skillId === 'provider.chat' &&
    invocation.status === 'running'
  );
  for (const invocation of stale) {
    await store.updateSkillInvocation(invocation.id, {
      status: 'failed',
      error: 'provider_invocation_recovered',
      completedAt: new Date().toISOString()
    });
  }
}

async function continueAgentAfterToolResults(store, run, options) {
  const {
    agent,
    provider,
    messages,
    previousContent,
    toolResultText,
    providerDiagnostics,
    signal
  } = options;
  if (!Array.isArray(messages) || messages.length === 0) return previousContent;
  const continuationMessages = [
    ...messages,
    { role: 'assistant', content: previousContent },
    {
      role: 'user',
      content: [
        'The platform executed the requested action and returned these results:',
        truncateToolResultText(toolResultText),
        '',
        'Continue the original user request now. Use the results above to produce the final answer or emit the next controlled action block if one is required. Do not stop after merely reading data.'
      ].join('\n')
    }
  ];
  const invocation = await store.createSkillInvocation({
    skillId: 'provider.chat',
    roomId: run.roomId,
    runId: run.id,
    messageId: run.messageId,
    agentId: agent.id,
    actorType: 'agent',
    status: 'running',
    input: {
      providerId: provider.id,
      model: agent.model,
      messageCount: continuationMessages.length,
      streaming: false,
      continuation: true
    },
    startedAt: new Date().toISOString()
  });
  try {
    const result = await createOpenAICompatibleChat({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: agent.model,
      messages: continuationMessages,
      maxTokens: 1000,
      signal
    }, await createProviderDeps(store));
    const nextContent = result.content || previousContent;
    Object.assign(providerDiagnostics, {
      continuationUsed: true,
      continuationFinishReason: result.finishReason ?? '',
      continuationUsage: result.usage ?? null,
      continuationResponse: result.response ?? null
    });
    await store.updateSkillInvocation(invocation.id, {
      status: 'done',
      output: {
        model: result.model ?? agent.model,
        contentLength: nextContent.length,
        diagnostics: {
          finishReason: result.finishReason ?? '',
          usage: result.usage ?? null,
          response: result.response ?? null
        }
      },
      completedAt: new Date().toISOString()
    });
    await store.updateMessage(run.messageId, {
      content: nextContent,
      status: 'running',
      pending: true
    });
    return nextContent;
  } catch (error) {
    await store.updateSkillInvocation(invocation.id, {
      status: signal.aborted || error?.message === 'agent_run_stopped' ? 'rejected' : 'failed',
      error: error instanceof Error ? error.message : String(error),
      output: {
        diagnostics: {
          response: error?.response ?? null
        }
      },
      completedAt: new Date().toISOString()
    });
    throw error;
  }
}

function platformActionsShouldContinue(actions) {
  return actions.some((action) => CONTINUATION_PLATFORM_ACTIONS.has(action.action));
}

function formatPlatformActionResults(actions) {
  return actions.map((action) => [
    `Platform action result: ${action.action}`,
    `Summary: ${action.summary}`,
    'Output:',
    '```json',
    safeStringifyForPrompt(action.output),
    '```'
  ].join('\n')).join('\n\n');
}

function truncateToolResultText(value) {
  const text = String(value ?? '');
  const maxChars = 24000;
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated]` : text;
}

function safeStringifyForPrompt(value) {
  return truncateToolResultText(JSON.stringify(value, jsonPromptReplacer, 2));
}

function jsonPromptReplacer(key, value) {
  if (key === 'apiKey' || key === 'passwordHash' || key === 'passwordSalt' || key === 'passwordSecret') return '[redacted]';
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}...[truncated]`;
  return value;
}

async function startMentionedAgentRuns(store, run, content) {
  if (run.turn >= run.maxTurns) {
    const targets = resolveMentionTargets(content, await store.listRoomAgents(run.roomId));
    if (targets.length > 0) {
      await store.createMessage({
        roomId: run.roomId,
        senderType: 'system',
        senderName: 'AgentIM',
        content: `Agent handoff stopped after ${run.maxTurns} turns to avoid an endless loop.`,
        status: 'done',
        pending: false
      });
    }
    return;
  }

  const roomAgents = (await store.listRoomAgents(run.roomId))
    .filter((agent) => agent.id !== run.agentId);
  const targets = resolveMentionTargets(content, roomAgents);
  for (const target of targets) {
    await createAndStartAgentRun(store, run.roomId, target.id, {
      turn: run.turn + 1,
      maxTurns: run.maxTurns
    });
  }
}

async function failAgentRun(store, run, error, partialContent = '') {
  await store.updateAgentRun(run.id, {
    status: 'failed',
    error,
    completedAt: new Date().toISOString()
  });
  await store.updateMessage(run.messageId, {
    content: partialContent
      ? `${partialContent}\n\n[Provider error: ${error}]`
      : `Provider error: ${error}`,
    status: 'failed',
    pending: false
  });
  await completeScheduledTaskForRun(store, run.id, 'failed', error);
  await completeProjectTaskForRun(store, run, 'failed', error, partialContent);
}

function formatEmptyProviderResponse(diagnostics = {}) {
  const usage = diagnostics.usage ?? {};
  const usageText = usage.prompt_tokens !== undefined || usage.completion_tokens !== undefined
    ? `${usage.prompt_tokens ?? 0}/${usage.completion_tokens ?? 0}`
    : '';
  const details = [
    diagnostics.providerName ? `Provider: ${diagnostics.providerName}` : '',
    diagnostics.model ? `Model: ${diagnostics.model}` : '',
    diagnostics.mode ? `Mode: ${diagnostics.mode}` : '',
    diagnostics.finishReason ? `Finish reason: ${diagnostics.finishReason}` : '',
    diagnostics.choiceCount !== undefined ? `Choices: ${diagnostics.choiceCount}` : '',
    usageText ? `Tokens prompt/completion: ${usageText}` : '',
    diagnostics.response?.status !== undefined ? `HTTP: ${diagnostics.response.status} ${diagnostics.response.statusText ?? ''}`.trim() : '',
    diagnostics.response?.contentType ? `Content-Type: ${diagnostics.response.contentType}` : '',
    diagnostics.response?.requestId ? `Request ID: ${diagnostics.response.requestId}` : '',
    diagnostics.response?.bodyPreview ? `Response preview: ${diagnostics.response.bodyPreview}` : '',
    diagnostics.streamError ? `Streaming error before fallback: ${diagnostics.streamError}` : '',
    diagnostics.fallbackUsed ? 'Fallback: non-streaming retry was used' : ''
  ].filter(Boolean);
  return [
    'Agent returned an empty response.',
    '',
    '[Provider diagnostics]',
    ...details.map((detail) => `- ${detail}`),
    details.length === 0 ? '- Provider returned no content and no additional metadata.' : ''
  ].filter(Boolean).join('\n');
}

async function completeScheduledTaskForRun(store, runId, status, error) {
  const tasks = await store.listScheduledTasks(null, { statuses: ['running'], limit: 200 });
  const task = tasks.find((item) => item.runId === runId);
  if (!task) return;
  await store.updateScheduledTask(task.id, {
    status,
    error: error || undefined,
    completedAt: new Date().toISOString()
  });
  if (status === 'done') {
    await scheduleNextRecurringTask(store, task);
    await dispatchDueScheduledTasks(store);
  }
}

async function scheduleNextRecurringTask(store, task) {
  const repeatInterval = normalizeRepeatIntervalInput(task.repeatInterval);
  if (!repeatInterval) return null;
  const nextScheduleAt = nextRepeatScheduleAt(task.scheduleAt, repeatInterval);
  if (!nextScheduleAt) return null;
  return store.createScheduledTask({
    roomId: task.roomId,
    agentId: task.agentId,
    title: task.title,
    instructions: task.instructions,
    scheduleAt: nextScheduleAt,
    status: 'scheduled',
    repeatInterval,
    parentTaskId: task.parentTaskId ?? task.id,
    dependsOnTaskIds: scheduledTaskDependencyIds(task),
    createdBy: task.createdBy ?? 'user'
  });
}

function scheduledTaskDependencyIds(task) {
  const ids = [];
  if (Array.isArray(task?.dependsOnTaskIds)) ids.push(...task.dependsOnTaskIds);
  if (task?.dependsOnTaskId) ids.push(task.dependsOnTaskId);
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

async function isAgentRunStopped(store, runId) {
  const current = await store.getAgentRun(runId);
  return current?.status === 'stopped';
}

function stopRunningAgentRun(runId) {
  const running = runningAgentRuns.get(runId);
  if (running) abortAgentRun(running, AGENT_RUN_ABORT_STOP);
}

function abortAgentRun(running, reason) {
  running.abortReason = reason;
  running.controller.abort();
}

async function applyWebReadActions(store, run, content, signal) {
  const requests = parseWebReadBlocks(content);
  if (requests.length === 0) return [];

  const agent = await store.getAgent(run.agentId);
  const skills = await store.listSkills();
  if (!await agentHasSkill(store, agent, 'web.read', skills)) {
    throw new Error('agent_missing_web_read_skill');
  }

  const results = [];
  for (const request of requests) {
    const invocation = await store.createSkillInvocation({
      skillId: 'web.read',
      roomId: run.roomId,
      runId: run.id,
      messageId: run.messageId,
      agentId: run.agentId,
      actorType: 'agent',
      status: 'running',
      input: request,
      startedAt: new Date().toISOString()
    });
    try {
      const result = await readWebUrl(request.url, {
        maxFiles: request.maxFiles,
        signal
      });
      results.push(result);
      await store.updateSkillInvocation(invocation.id, {
        status: 'done',
        output: webReadInvocationOutput(result),
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      await store.updateSkillInvocation(invocation.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }
  return results;
}

async function readWebUrl(rawUrl, options = {}) {
  const url = normalizeWebReadUrl(rawUrl);
  const githubRepo = parseGitHubRepoUrl(url);
  if (githubRepo) return readGitHubRepository(githubRepo, options);
  return readGenericWebPage(url, options);
}

async function readGenericWebPage(url, options = {}) {
  const response = await fetchWithTimeout(url.href, {
    signal: options.signal,
    headers: {
      accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5',
      'user-agent': 'AgentIM web.read'
    }
  });
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await readResponseTextLimited(response, WEB_READ_MAX_BYTES);
  return {
    type: 'web_page',
    url: url.href,
    status: response.status,
    statusText: response.statusText,
    contentType,
    title: extractHtmlTitle(raw),
    text: truncateWebText(contentType.includes('html') ? htmlToText(raw) : raw),
    truncated: raw.length >= WEB_READ_MAX_BYTES
  };
}

async function readGitHubRepository(repo, options = {}) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'AgentIM web.read'
  };
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
  const repoResponse = await fetchJsonWithTimeout(apiBase, { headers, signal: options.signal });
  const branch = repo.ref || repoResponse.default_branch || 'main';
  const treeResponse = await fetchJsonWithTimeout(`${apiBase}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
    headers,
    signal: options.signal
  });
  const tree = Array.isArray(treeResponse.tree) ? treeResponse.tree : [];
  const files = tree
    .filter((item) => item.type === 'blob' && isUsefulRepositoryFile(item.path, item.size))
    .sort(compareRepositoryFiles);
  const selectedFiles = selectRepositoryFiles(files, options.maxFiles);
  const fileContents = [];
  for (const file of selectedFiles) {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/${encodeURIComponent(branch)}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetchWithTimeout(rawUrl, {
        signal: options.signal,
        headers: { 'user-agent': 'AgentIM web.read' }
      });
      const raw = await readResponseTextLimited(response, GITHUB_READ_MAX_FILE_CHARS * 2);
      fileContents.push({
        path: file.path,
        size: file.size ?? raw.length,
        content: truncateGitHubFile(raw),
        truncated: raw.length > GITHUB_READ_MAX_FILE_CHARS
      });
    } catch (error) {
      fileContents.push({
        path: file.path,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return {
    type: 'github_repository',
    url: repo.url.href,
    owner: repo.owner,
    name: repo.name,
    branch,
    description: repoResponse.description ?? '',
    language: repoResponse.language ?? '',
    stars: repoResponse.stargazers_count ?? 0,
    defaultBranch: repoResponse.default_branch ?? branch,
    fileCount: files.length,
    files: fileContents
  };
}

function webReadInvocationOutput(result) {
  if (result.type === 'github_repository') {
    return {
      type: result.type,
      url: result.url,
      repo: `${result.owner}/${result.name}`,
      branch: result.branch,
      fileCount: result.fileCount,
      returnedFiles: result.files.map((file) => ({
        path: file.path,
        size: file.size,
        truncated: file.truncated,
        error: file.error
      }))
    };
  }
  return {
    type: result.type,
    url: result.url,
    status: result.status,
    contentType: result.contentType,
    title: result.title,
    textLength: result.text.length,
    truncated: result.truncated
  };
}

function normalizeWebReadUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl ?? '').trim());
  } catch {
    throw new Error('invalid_web_url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('web_read_url_must_be_http_or_https');
  }
  if (isLocalWebHost(parsed.hostname)) {
    throw new Error('web_read_localhost_not_allowed');
  }
  parsed.hash = '';
  return parsed;
}

function isLocalWebHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host === '::1'
    || host.endsWith('.local');
}

function parseGitHubRepoUrl(url) {
  if (url.hostname.toLowerCase() !== 'github.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  if (['blob', 'tree', 'issues', 'pulls', 'commit', 'releases'].includes(parts[2])) {
    return {
      url,
      owner: parts[0],
      name: stripGitSuffix(parts[1]),
      ref: parts[3] || ''
    };
  }
  return {
    url,
    owner: parts[0],
    name: stripGitSuffix(parts[1]),
    ref: ''
  };
}

function stripGitSuffix(value) {
  return String(value ?? '').replace(/\.git$/i, '');
}

async function fetchJsonWithTimeout(url, init = {}) {
  const response = await fetchWithTimeout(url, init);
  if (!response.ok) throw new Error(`web_read_http_${response.status}`);
  return response.json();
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_READ_TIMEOUT_MS);
  const signal = mergeAbortSignals(init.signal, controller.signal);
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'follow',
      signal
    });
    if (!response.ok) throw new Error(`web_read_http_${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeAbortSignals(...signals) {
  const activeSignals = signals.filter(Boolean);
  if (activeSignals.length === 0) return undefined;
  if (activeSignals.length === 1) return activeSignals[0];
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

async function readResponseTextLimited(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let bytes = 0;
  while (bytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const next = value.slice(0, Math.max(maxBytes - bytes, 0));
    chunks.push(next);
    bytes += next.byteLength;
    if (value.byteLength > next.byteLength) break;
  }
  return Buffer.concat(chunks).toString('utf8');
}

function extractHtmlTitle(html) {
  return decodeHtmlEntities(String(html ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
}

function htmlToText(html) {
  return decodeHtmlEntities(String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|header|footer|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n'))
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function truncateWebText(value) {
  const text = String(value ?? '').trim();
  return text.length > WEB_READ_MAX_TEXT_CHARS ? `${text.slice(0, WEB_READ_MAX_TEXT_CHARS)}\n...[truncated]` : text;
}

function isUsefulRepositoryFile(path, size = 0) {
  const normalized = String(path ?? '');
  if (!normalized || normalized.includes('/.git/') || normalized.includes('/node_modules/') || normalized.includes('/dist/') || normalized.includes('/build/')) return false;
  if (Number(size) > 200000) return false;
  const lower = normalized.toLowerCase();
  if (lower.includes('package-lock.json') || lower.includes('pnpm-lock.yaml') || lower.includes('yarn.lock')) return false;
  if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|mp4|mov|woff2?|ttf|otf)$/i.test(lower)) return false;
  return isPriorityRepositoryFile(normalized) || /\.(md|txt|json|js|jsx|ts|tsx|css|scss|html|py|go|rs|java|kt|swift|rb|php|cs|yml|yaml|toml|xml|sql)$/i.test(lower);
}

function isPriorityRepositoryFile(path) {
  return /(^|\/)(readme|package|vite\.config|next\.config|tailwind\.config|tsconfig|src\/index|src\/app|src\/main|src\/App|app\/page|pages\/index|components\/)/i.test(path);
}

function compareRepositoryFiles(a, b) {
  const score = (file) => {
    const path = String(file.path ?? '');
    if (/readme/i.test(path)) return 0;
    if (/package\.json$/i.test(path)) return 1;
    if (/src\/(app|main|index|App)\./.test(path)) return 2;
    if (/app\/page\./.test(path) || /pages\/index\./.test(path)) return 3;
    if (/components\//.test(path)) return 4;
    return 10 + path.split('/').length;
  };
  return score(a) - score(b) || String(a.path).localeCompare(String(b.path));
}

function selectRepositoryFiles(files, maxFiles) {
  const limit = Math.min(Math.max(Number(maxFiles) || GITHUB_READ_MAX_FILES, 1), 24);
  return files.slice(0, limit);
}

function truncateGitHubFile(value) {
  const text = String(value ?? '');
  return text.length > GITHUB_READ_MAX_FILE_CHARS ? `${text.slice(0, GITHUB_READ_MAX_FILE_CHARS)}\n...[truncated]` : text;
}

async function applyWorkspaceReadActions(store, run, content, workspaceScope) {
  const requests = parseWorkspaceReadBlocks(content);
  if (requests.length === 0) return [];

  const agent = await store.getAgent(run.agentId);
  const skills = await store.listSkills();
  if (!await agentHasSkill(store, agent, 'workspace.read', skills)) {
    throw new Error('agent_missing_workspace_read_skill');
  }

  const targetRoomId = workspaceScope?.roomId ?? run.roomId;
  const { workspace } = await withRoomWorkspace(store, targetRoomId);
  const storage = createWorkspaceStorage();
  const results = [];
  for (const request of requests) {
    const invocation = await store.createSkillInvocation({
      skillId: 'workspace.read',
      roomId: targetRoomId,
      runId: run.id,
      messageId: run.messageId,
      agentId: run.agentId,
      actorType: 'agent',
      status: 'running',
      input: {
        action: request.type === 'directory' ? 'list_dir' : 'read_file',
        path: request.path
      },
      startedAt: new Date().toISOString()
    });
    try {
      if (request.type === 'directory') {
        const files = await storage.listFiles(workspace.id, request.path);
        const result = {
          type: 'directory',
          path: request.path,
          files: files.slice(0, 80).map((file) => ({
            type: file.type,
            path: file.path,
            name: file.name,
            size: file.size
          }))
        };
        results.push(result);
        await store.updateSkillInvocation(invocation.id, {
          status: 'done',
          output: result,
          completedAt: new Date().toISOString()
        });
      } else {
        const raw = await storage.readFile(workspace.id, request.path);
        const contentText = truncateWorkspaceReadContent(raw);
        const result = {
          type: 'file',
          path: request.path,
          content: contentText,
          truncated: contentText.length < String(raw ?? '').length
        };
        results.push(result);
        await store.updateSkillInvocation(invocation.id, {
          status: 'done',
          output: {
            path: result.path,
            bytes: Buffer.byteLength(String(raw ?? ''), 'utf8'),
            returnedBytes: Buffer.byteLength(result.content, 'utf8'),
            truncated: result.truncated
          },
          completedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      await store.updateSkillInvocation(invocation.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }
  return results;
}

async function resolveRunWorkspaceScope(store, run, agent, recentMessages = []) {
  const sourceRoom = await store.getRoom(run.roomId);
  const latestUserMessage = [...recentMessages]
    .reverse()
    .find((message) => message.senderType === 'user');
  const requestedRoom = await resolveMentionedAccessibleRoom(store, agent.id, latestUserMessage?.content, run.roomId);
  const room = requestedRoom ?? sourceRoom;
  return {
    roomId: room?.id ?? run.roomId,
    room: room ?? { id: run.roomId, name: 'Current Room', type: 'group' },
    sourceRoom,
    isExternal: Boolean(requestedRoom && requestedRoom.id !== run.roomId)
  };
}

async function resolveMentionedAccessibleRoom(store, agentId, content, fallbackRoomId) {
  const text = String(content ?? '').trim();
  if (!text) return null;
  const rooms = await store.listRooms();
  const candidates = rooms
    .filter((room) => room.id !== fallbackRoomId && room.type !== 'dm')
    .sort((a, b) => String(b.name ?? '').length - String(a.name ?? '').length);
  for (const room of candidates) {
    if (!roomNameMentioned(text, room.name)) continue;
    const roomAgents = await store.listRoomAgents(room.id);
    if (roomAgents.some((member) => member.id === agentId)) return room;
  }
  return null;
}

function roomNameMentioned(content, roomName) {
  const name = String(roomName ?? '').trim();
  if (!name) return false;
  const normalizedContent = content.toLowerCase();
  const normalizedName = name.toLowerCase();
  if (normalizedContent.includes(normalizedName)) return true;
  const compactContent = normalizedContent.replaceAll(/\s+/g, '');
  const compactName = normalizedName.replaceAll(/\s+/g, '');
  return compactName.length > 0 && compactContent.includes(compactName);
}

async function applyWorkspaceActions(store, run, content, workspaceScope) {
  const requests = parseWorkspaceActionBlocks(content);
  if (requests.length === 0) return [];

  const agent = await store.getAgent(run.agentId);
  const skills = await store.listSkills();
  if (!await agentHasSkill(store, agent, 'workspace.write', skills)) {
    throw new Error('agent_missing_workspace_write_skill');
  }

  const targetRoomId = workspaceScope?.roomId ?? run.roomId;
  const { workspace } = await withRoomWorkspace(store, targetRoomId);
  const storage = createWorkspaceStorage();
  const actions = [];
  for (const request of requests) {
    const invocation = await store.createSkillInvocation({
      skillId: 'workspace.write',
      roomId: targetRoomId,
      runId: run.id,
      messageId: run.messageId,
      agentId: run.agentId,
      actorType: 'agent',
      status: 'running',
      input: {
        action: request.type === 'directory' ? 'mkdir' : 'write_file',
        path: request.path,
        bytes: request.type === 'file' ? Buffer.byteLength(request.content ?? '', 'utf8') : undefined
      },
      startedAt: new Date().toISOString()
    });
    try {
      if (request.type === 'directory') {
        await storage.makeDirectory(workspace.id, request.path);
      } else {
        await storage.writeFile(workspace.id, request.path, request.content);
      }
      const action = { ...request, invocationId: invocation.id };
      actions.push(action);
      await store.createArtifact({
        roomId: targetRoomId,
        invocationId: invocation.id,
        runId: run.id,
        messageId: run.messageId,
        agentId: run.agentId,
        kind: request.type === 'directory' ? 'workspace.directory' : 'workspace.file',
        title: request.path,
        path: request.path,
        mimeType: request.type === 'file' ? mimeTypeForWorkspacePath(request.path) : undefined,
        metadata: {
          sourceRoomId: run.roomId,
          previewable: request.type === 'file' && isPreviewableWorkspacePath(request.path),
          bytes: request.type === 'file' ? Buffer.byteLength(request.content ?? '', 'utf8') : undefined
        }
      });
      await store.updateSkillInvocation(invocation.id, {
        status: 'done',
        output: {
          path: request.path,
          type: request.type,
          previewable: request.type === 'file' && isPreviewableWorkspacePath(request.path)
        },
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      await store.updateSkillInvocation(invocation.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }
  return actions;
}

async function applyRoomMessageActions(store, run, content, workspaceScope) {
  const requests = parseRoomMessageBlocks(content);
  if (requests.length === 0) return [];

  const agent = await store.getAgent(run.agentId);
  const sourceRoom = await store.getRoom(run.roomId);
  const sourceRoomName = sourceRoom?.name ?? workspaceScope?.sourceRoom?.name ?? 'Unknown room';
  const skills = await store.listSkills();
  if (!await agentHasSkill(store, agent, 'agent.message', skills)) {
    await createRoomMessageInvocation(store, run, {
      sourceRoomName,
      agentName: agent?.name ?? 'Agent',
      status: 'failed',
      error: 'agent_missing_agent_message_skill',
      requestCount: requests.length
    });
    await createRoomMessageFailureNotice(store, run, 'agent_missing_agent_message_skill');
    throw new Error('agent_missing_agent_message_skill');
  }

  const rooms = await store.listRooms();
  const actions = [];
  for (const request of requests) {
    const invocation = await createRoomMessageInvocation(store, run, {
      sourceRoomName,
      targetRoomName: request.room || workspaceScope?.room?.name || sourceRoomName,
      agentName: agent?.name ?? 'Agent',
      status: 'running',
      request
    });
    try {
      const targetRoom = await resolveRoomMessageTarget(store, run, request, workspaceScope, rooms);
      if (!targetRoom) throw new Error(`room_message_target_not_found:${request.room}`);
      const targetRoomAgents = await store.listRoomAgents(targetRoom.id);
      if (!targetRoomAgents.some((member) => member.id === run.agentId)) {
        throw new Error(`agent_not_member_of_room:${targetRoom.name}`);
      }

      const deliveredContent = buildCrossRoomMessageContent({
        agentName: agent?.name ?? 'Agent',
        sourceRoomName,
        targetRoomName: targetRoom.name,
        content: request.content
      });
      const message = await store.createMessage({
        roomId: targetRoom.id,
        senderType: 'agent',
        senderName: agent?.name ?? 'Agent',
        content: deliveredContent,
        status: 'done',
        pending: false,
        replyTo: {
          id: run.messageId,
          senderName: agent?.name ?? 'Agent',
          content: `Cross-room message from ${sourceRoomName}`
        }
      });
      await store.updateSkillInvocation(invocation.id, {
        status: 'done',
        output: {
          messageId: message.id,
          roomId: targetRoom.id,
          roomName: targetRoom.name,
          sourceRoomId: run.roomId,
          sourceRoomName
        },
        completedAt: new Date().toISOString()
      });
      actions.push({
        roomId: targetRoom.id,
        roomName: targetRoom.name,
        messageId: message.id
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await store.updateSkillInvocation(invocation.id, {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date().toISOString()
      });
      await createRoomMessageFailureNotice(store, run, errorMessage, request);
      throw error;
    }
  }
  return actions;
}

async function createRoomMessageFailureNotice(store, run, error, request) {
  const target = request?.room ? ` to ${request.room}` : '';
  await store.createMessage({
    roomId: run.roomId,
    senderType: 'system',
    senderName: 'AgentIM',
    content: `Room message failed${target}: ${error}`,
    status: 'done',
    pending: false
  });
}

async function createRoomMessageInvocation(store, run, input) {
  const now = new Date().toISOString();
  return store.createSkillInvocation({
    skillId: 'agent.message',
    roomId: run.roomId,
    runId: run.id,
    messageId: run.messageId,
    agentId: run.agentId,
    actorType: 'agent',
    status: input.status ?? 'running',
    input: {
      sourceRoomId: run.roomId,
      sourceRoomName: input.sourceRoomName ?? 'Unknown room',
      targetRoomName: input.targetRoomName,
      agentName: input.agentName ?? 'Agent',
      contentLength: input.request?.content?.length,
      requestCount: input.requestCount
    },
    error: input.error,
    startedAt: now,
    completedAt: input.status === 'failed' ? now : undefined
  });
}

async function applyRoleManagementActions(store, run, content) {
  const createRequests = parseRoleCreateBlocks(content);
  if (createRequests.length === 0) {
    return { created: [] };
  }

  const agent = await store.getAgent(run.agentId);
  const skills = await store.listSkills();
  if (!await agentHasSkill(store, agent, 'role.create', skills)) {
    throw new Error('agent_missing_role_create_skill');
  }

  const created = [];
  for (const request of createRequests) {
    const invocation = await createRoleManagementInvocation(store, run, 'role.create', {
      action: 'create_role',
      request
    });
    try {
      const role = await store.createRole({
        name: request.name,
        description: request.description,
        systemPrompt: request.systemPrompt,
        skillIds: filterAvailableSkillIds(request.skillIds, skills)
      });
      await store.updateSkillInvocation(invocation.id, {
        status: 'done',
        output: {
          roleId: role.id,
          roleName: role.name,
          skillIds: role.skillIds ?? []
        },
        completedAt: new Date().toISOString()
      });
      created.push({
        roleId: role.id,
        roleName: role.name,
        skillIds: role.skillIds ?? []
      });
    } catch (error) {
      await store.updateSkillInvocation(invocation.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  return { created };
}

async function createRoleManagementInvocation(store, run, skillId, input) {
  return store.createSkillInvocation({
    skillId,
    roomId: run.roomId,
    runId: run.id,
    messageId: run.messageId,
    agentId: run.agentId,
    actorType: 'agent',
    status: 'running',
    input,
    startedAt: new Date().toISOString()
  });
}

async function applyTaskPlanActions(store, run, content) {
  const plans = parseTaskPlanBlocks(content);
  if (plans.length === 0) return { created: [] };

  const agent = await store.getAgent(run.agentId);
  const skills = await store.listSkills();
  if (!await agentHasSkill(store, agent, 'task.schedule', skills)) {
    throw new Error('agent_missing_task_schedule_skill');
  }

  const room = await store.getRoom(run.roomId);
  if (!room) throw new Error('room_not_found');
  const roomAgents = await store.listRoomAgents(run.roomId);
  const created = [];
  for (const plan of plans) {
    const invocation = await createTaskPlanInvocation(store, run, {
      title: plan.title,
      itemCount: plan.items.length
    });
    try {
      const createdForPlan = [];
      const taskIdsByPlanItemId = new Map();
      for (const item of plan.items) {
        const targetAgent = resolveTaskPlanAgent(item, roomAgents, agent);
        if (!targetAgent) throw new Error(`task_plan_agent_not_found:${item.agent || item.role || item.title}`);
        const dependsOnTaskIds = item.dependsOn
          .map((dependency) => taskIdsByPlanItemId.get(dependency) ?? dependency)
          .filter(Boolean);
        const task = await store.createScheduledTask({
          roomId: run.roomId,
          agentId: targetAgent.id,
          title: item.title,
          instructions: buildScheduledTaskInstructions(plan, item, {
            creator: agent,
            targetAgent,
            room
          }),
          scheduleAt: item.scheduleAt ?? new Date().toISOString(),
          status: 'scheduled',
          repeatInterval: item.repeatInterval,
          dependsOnTaskIds,
          createdBy: agent?.name ?? 'agent'
        });
        createdForPlan.push(task);
        created.push(task);
        taskIdsByPlanItemId.set(item.id, task.id);
      }
      await store.updateSkillInvocation(invocation.id, {
        status: 'done',
        output: {
          title: plan.title,
          taskIds: createdForPlan.map((task) => task.id),
          tasks: createdForPlan.map((task) => ({
            id: task.id,
            title: task.title,
            agentId: task.agentId,
            dependsOnTaskIds: task.dependsOnTaskIds ?? []
          }))
        },
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      await store.updateSkillInvocation(invocation.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }
  if (created.length > 0) await dispatchDueScheduledTasks(store);
  return { created };
}

async function createTaskPlanInvocation(store, run, input) {
  return store.createSkillInvocation({
    skillId: 'task.schedule',
    roomId: run.roomId,
    runId: run.id,
    messageId: run.messageId,
    agentId: run.agentId,
    actorType: 'agent',
    status: 'running',
    input,
    startedAt: new Date().toISOString()
  });
}

function resolveTaskPlanAgent(item, roomAgents, fallbackAgent) {
  const requested = String(item.agent ?? '').trim();
  if (requested) {
    const exact = roomAgents.find((agent) => agent.id === requested)
      ?? roomAgents.find((agent) => roomNameMatches(agent.name, requested));
    if (exact) return exact;
  }
  const role = String(item.role ?? item.roleId ?? '').trim();
  if (role) {
    const byRole = roomAgents.find((agent) => agent.roleId === role)
      ?? roomAgents.find((agent) => roomNameMatches(agent.roleId, role));
    if (byRole) return byRole;
  }
  if (fallbackAgent && roomAgents.some((agent) => agent.id === fallbackAgent.id)) return fallbackAgent;
  return roomAgents[0] ?? null;
}

function buildScheduledTaskInstructions(plan, item, context) {
  return [
    `Task plan: ${plan.title}`,
    plan.summary ? `Plan summary: ${plan.summary}` : '',
    `Assigned by: ${context.creator?.name ?? 'Agent'}`,
    `Assigned to: ${context.targetAgent?.name ?? 'Agent'}`,
    `Room: ${context.room?.name ?? ''}`,
    '',
    item.instructions,
    '',
    item.acceptanceCriteria.length > 0 ? `Acceptance criteria:\n${item.acceptanceCriteria.map((line) => `- ${line}`).join('\n')}` : '',
    item.reviewWith ? `Review with: ${item.reviewWith}` : '',
    item.artifact ? `Expected artifact: ${item.artifact}` : '',
    '',
    'When finished, report what you did, any artifact or workspace paths, open questions, and whether the next dependent task can proceed.'
  ].filter(Boolean).join('\n');
}

async function reviewScheduledTask(store, run, input) {
  const task = await resolveScheduledTask(store, input.taskId ?? input.task ?? input.reviewOfTaskId);
  if (!task) throw new Error('task_not_found');
  if (task.roomId !== run.roomId) throw new Error('task_not_in_current_room');
  const decision = normalizeReviewDecision(input.decision ?? input.status);
  const notes = String(input.notes ?? input.reason ?? '').trim();
  if (!decision) throw new Error('invalid_review_decision');
  const update = {
    reviewDecision: decision,
    reviewNotes: notes,
    status: decision === 'approved' ? 'approved' : 'changes_requested',
    completedAt: new Date().toISOString()
  };
  const reviewed = await store.updateScheduledTask(task.id, update);
  let revision = null;
  if (decision === 'changes_requested' && input.revision !== false) {
    revision = await createRevisionScheduledTask(store, run, task, input, notes);
    await store.updateScheduledTask(task.id, {
      supersededByTaskId: revision.id
    });
  }
  await store.createMessage({
    roomId: run.roomId,
    senderType: 'system',
    senderName: 'AgentIM',
    content: [
      `Task review: ${reviewed.title}`,
      `Decision: ${decision}`,
      notes ? `Notes: ${notes}` : '',
      revision ? `Revision task: ${revision.title}` : ''
    ].filter(Boolean).join('\n'),
    status: 'done',
    pending: false
  });
  if (revision) await dispatchDueScheduledTasks(store);
  return { task: reviewed, decision, revision };
}

async function interruptScheduledTask(store, run, input) {
  const task = await resolveScheduledTask(store, input.taskId ?? input.task);
  if (!task) throw new Error('task_not_found');
  if (task.roomId !== run.roomId) throw new Error('task_not_in_current_room');
  const reason = String(input.reason ?? 'interrupted_by_agent').trim();
  if (task.runId) {
    const activeRun = await store.getAgentRun(task.runId);
    if (activeRun?.status === 'queued' || activeRun?.status === 'running') {
      queuedAgentRunIds.delete(activeRun.id);
      stopRunningAgentRun(activeRun.id);
      await store.updateAgentRun(activeRun.id, {
        status: 'stopped',
        error: reason,
        stoppedAt: new Date().toISOString()
      });
      await store.updateMessage(activeRun.messageId, {
        content: `Interrupted: ${reason}`,
        status: 'stopped',
        pending: false
      });
    }
  }
  const interrupted = await store.updateScheduledTask(task.id, {
    status: input.supersede === false ? 'interrupted' : 'superseded',
    error: reason,
    completedAt: new Date().toISOString()
  });
  let replacement = null;
  if (input.replacement) {
    replacement = await createReplacementScheduledTask(store, run, interrupted, input.replacement, reason);
    await store.updateScheduledTask(interrupted.id, {
      supersededByTaskId: replacement.id
    });
  }
  await store.createMessage({
    roomId: run.roomId,
    senderType: 'system',
    senderName: 'AgentIM',
    content: [
      `Task interrupted: ${interrupted.title}`,
      `Reason: ${reason}`,
      replacement ? `Replacement task: ${replacement.title}` : ''
    ].filter(Boolean).join('\n'),
    status: 'done',
    pending: false
  });
  if (replacement) await dispatchDueScheduledTasks(store);
  return { task: interrupted, replacement };
}

async function createRevisionScheduledTask(store, run, task, input, notes) {
  const revision = normalizeJsonObject(input.revision, {});
  const agent = resolveTaskPlanAgent({
    agent: revision.agent ?? input.agent,
    role: revision.role ?? input.role
  }, await store.listRoomAgents(run.roomId), await store.getAgent(task.agentId));
  if (!agent) throw new Error('revision_agent_not_found');
  return store.createScheduledTask({
    roomId: run.roomId,
    agentId: agent.id,
    title: String(revision.title ?? `Revise: ${task.title}`).trim(),
    instructions: [
      `Revise prior task: ${task.title}`,
      notes ? `Requested changes: ${notes}` : '',
      String(revision.instructions ?? input.instructions ?? task.instructions ?? '').trim()
    ].filter(Boolean).join('\n\n'),
    scheduleAt: normalizeScheduleAtInput(revision.scheduleAt) ?? new Date().toISOString(),
    status: 'scheduled',
    revisionOfTaskId: task.id,
    dependsOnTaskIds: [],
    createdBy: 'agent-review'
  });
}

async function createReplacementScheduledTask(store, run, task, replacementInput, reason) {
  const replacement = normalizeJsonObject(replacementInput, {});
  const agent = resolveTaskPlanAgent({
    agent: replacement.agent,
    role: replacement.role
  }, await store.listRoomAgents(run.roomId), await store.getAgent(task.agentId));
  if (!agent) throw new Error('replacement_agent_not_found');
  return store.createScheduledTask({
    roomId: run.roomId,
    agentId: agent.id,
    title: String(replacement.title ?? `Replacement: ${task.title}`).trim(),
    instructions: [
      `Replacement for interrupted task: ${task.title}`,
      `Reason: ${reason}`,
      String(replacement.instructions ?? task.instructions ?? '').trim()
    ].filter(Boolean).join('\n\n'),
    scheduleAt: normalizeScheduleAtInput(replacement.scheduleAt) ?? new Date().toISOString(),
    status: 'scheduled',
    revisionOfTaskId: task.id,
    createdBy: 'agent-interrupt'
  });
}

async function resolveScheduledTask(store, ref) {
  const requested = String(ref ?? '').trim();
  if (!requested) return null;
  const direct = await store.getScheduledTask(requested);
  if (direct) return direct;
  const tasks = await store.listScheduledTasks(null, { limit: 300 });
  return tasks.find((task) => roomNameMatches(task.title, requested)) ?? null;
}

function normalizeReviewDecision(value) {
  const decision = String(value ?? '').trim().toLowerCase();
  if (['approved', 'approve', 'accepted', 'accept'].includes(decision)) return 'approved';
  if (['changes_requested', 'request_changes', 'changes', 'revise', 'revision'].includes(decision)) return 'changes_requested';
  return '';
}

function filterAvailableSkillIds(skillIds, skills) {
  const enabled = new Set((skills ?? [])
    .filter((skill) => skill?.enabled !== false)
    .map((skill) => skill.id)
    .filter(Boolean));
  return normalizeSkillIdsInput(skillIds).filter((id) => enabled.has(id));
}

const PLATFORM_ACTION_SKILLS = {
  'agent.read': 'agent.read',
  'agent.create': 'agent.create',
  'agent.update': 'agent.update',
  'agent.test': 'agent.test',
  'agent.delete': 'agent.delete',
  'room.read': 'room.read',
  'room.update': 'room.update',
  'room.delete': 'room.delete',
  'role.update': 'role.update',
  'role.delete': 'role.delete',
  'skill.read': 'skill.read',
  'skill.install': 'skill.install',
  'skill.update': 'skill.update',
  'skill.delete': 'skill.delete',
  'project.create': 'project.create',
  'project.read': 'project.read',
  'project.delete': 'project.delete',
  'task.review': 'task.review',
  'task.interrupt': 'task.interrupt',
  'task.run': 'task.run',
  'task.cancel': 'task.cancel',
  'artifact.read': 'artifact.read',
  'activity.read': 'activity.read',
  'activity.clear': 'activity.clear',
  'settings.update': 'settings.update',
  'provider.create': 'provider.create',
  'provider.update': 'provider.update',
  'provider.delete': 'provider.delete',
  'provider.probe': 'provider.probe'
};

async function applyPlatformActions(store, run, content, workspaceScope) {
  const requests = parsePlatformActionBlocks(content);
  if (requests.length === 0) return [];

  const agent = await store.getAgent(run.agentId);
  const skills = await store.listSkills();
  const results = [];
  for (const request of requests) {
    const skillId = PLATFORM_ACTION_SKILLS[request.action];
    if (!skillId) continue;
    if (!await agentHasSkill(store, agent, skillId, skills)) {
      throw new Error(`agent_missing_${skillId.replaceAll('.', '_')}_skill`);
    }
    const invocation = await createPlatformActionInvocation(store, run, skillId, request);
    try {
      const result = await executePlatformAction(store, run, request, workspaceScope, skills);
      await store.updateSkillInvocation(invocation.id, {
        status: 'done',
        output: result.output,
        completedAt: new Date().toISOString()
      });
      results.push({ action: request.action, summary: result.summary, output: result.output });
    } catch (error) {
      await store.updateSkillInvocation(invocation.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }
  return results;
}

async function createPlatformActionInvocation(store, run, skillId, request) {
  return store.createSkillInvocation({
    skillId,
    roomId: run.roomId,
    runId: run.id,
    messageId: run.messageId,
    agentId: run.agentId,
    actorType: 'agent',
    status: 'running',
    input: request,
    startedAt: new Date().toISOString()
  });
}

async function executePlatformAction(store, run, request, workspaceScope, skills) {
  const input = request.input ?? {};
  if (request.action === 'agent.read') {
    const agents = await store.listAgents();
    return platformResult(`read ${agents.length} agents`, { agents });
  }
  if (request.action === 'agent.create') {
    const provider = await resolvePlatformProvider(store, input.providerId);
    const name = String(input.name ?? '').trim();
    const model = String(input.model ?? provider?.defaultModel ?? provider?.models?.[0]?.id ?? '').trim();
    if (!name) throw new Error('name_required');
    if (!provider) throw new Error('provider_not_found');
    if (!model) throw new Error('model_required');
    const agent = await store.createAgent({
      name,
      bio: String(input.bio ?? '').trim(),
      runtimeType: 'hosted_agent',
      roleId: await normalizeAgentRoleId(store, input.roleId),
      providerId: provider.id,
      model,
      status: 'online'
    });
    const roomRef = String(input.roomId ?? input.room ?? '').trim();
    if (roomRef) {
      const room = await resolveRoomManagementRoom(store, roomRef, workspaceScope);
      if (!room) throw new Error(`room_not_found:${roomRef}`);
      await store.attachAgentToRoom(room.id, agent.id, { triggerMode: 'manual' });
    }
    return platformResult(`created agent ${agent.name}`, { agent });
  }
  if (request.action === 'agent.update') {
    const current = await resolvePlatformAgent(store, input.agentId ?? input.agent);
    if (!current) throw new Error('agent_not_found');
    const provider = input.providerId ? await resolvePlatformProvider(store, input.providerId) : await store.getProvider(current.providerId);
    if (!provider) throw new Error('provider_not_found');
    const agent = await store.updateAgent(current.id, {
      name: String(input.name ?? current.name ?? '').trim() || current.name,
      bio: String(input.bio ?? current.bio ?? '').trim(),
      roleId: await normalizeAgentRoleId(store, input.roleId ?? current.roleId),
      providerId: provider.id,
      model: String(input.model ?? current.model ?? provider.defaultModel ?? '').trim(),
      status: input.status ?? current.status ?? 'online'
    });
    return platformResult(`updated agent ${agent.name}`, { agent });
  }
  if (request.action === 'agent.test') {
    const agent = await resolvePlatformAgent(store, input.agentId ?? input.agent);
    if (!agent) throw new Error('agent_not_found');
    const output = await testAgentProvider(store, agent);
    return platformResult(`tested agent ${agent.name}`, output);
  }
  if (request.action === 'agent.delete') {
    const agent = await resolvePlatformAgent(store, input.agentId ?? input.agent);
    if (!agent) throw new Error('agent_not_found');
    await store.deleteAgent(agent.id);
    return platformResult(`deleted agent ${agent.name}`, { agent });
  }
  if (request.action === 'room.read') {
    const rooms = await store.listRooms();
    const roomAgents = await Promise.all(rooms.map(async (room) => ({
      room,
      agents: await store.listRoomAgents(room.id)
    })));
    return platformResult(`read ${rooms.length} rooms`, { rooms: roomAgents });
  }
  if (request.action === 'room.update') {
    const room = await resolveRoomManagementRoom(store, input.roomId ?? input.room, workspaceScope);
    if (!room) throw new Error('room_not_found');
    if (!await agentCanManageRoom(store, run.agentId, room.id)) throw new Error(`agent_not_member_of_room:${room.name}`);
    const updated = await store.updateRoom(room.id, {
      name: String(input.name ?? room.name ?? '').trim() || room.name,
      description: String(input.description ?? room.description ?? '').trim()
    });
    return platformResult(`updated room ${updated.name}`, { room: updated });
  }
  if (request.action === 'room.delete') {
    const room = await resolveRoomManagementRoom(store, input.roomId ?? input.room, workspaceScope);
    if (!room) throw new Error('room_not_found');
    if (!await agentCanManageRoom(store, run.agentId, room.id)) throw new Error(`agent_not_member_of_room:${room.name}`);
    await store.deleteRoom(room.id);
    return platformResult(`deleted room ${room.name}`, { room });
  }
  if (request.action === 'role.update') {
    const role = await resolvePlatformRole(store, input.roleId ?? input.role);
    if (!role) throw new Error('role_not_found');
    if (role.system) throw new Error('system_role_cannot_be_updated_by_agent');
    const updated = await store.updateRole(role.id, {
      name: String(input.name ?? role.name ?? '').trim() || role.name,
      description: String(input.description ?? role.description ?? '').trim(),
      systemPrompt: String(input.systemPrompt ?? role.systemPrompt ?? '').trim(),
      skillIds: input.skillIds === undefined ? role.skillIds ?? [] : filterAvailableSkillIds(input.skillIds, skills)
    });
    return platformResult(`updated role ${updated.name}`, { role: updated });
  }
  if (request.action === 'role.delete') {
    const role = await resolvePlatformRole(store, input.roleId ?? input.role);
    if (!role) throw new Error('role_not_found');
    if (role.system) throw new Error('system_role_cannot_be_deleted');
    await store.deleteRole(role.id);
    return platformResult(`deleted role ${role.name}`, { role });
  }
  if (request.action === 'skill.read') {
    const allSkills = await store.listSkills();
    return platformResult(`read ${allSkills.length} skills`, { skills: allSkills });
  }
  if (request.action === 'skill.install') {
    const manifest = normalizeSkillManifestInput(input.manifest ?? input);
    if (!manifest.ok) throw new Error(manifest.error);
    const skill = await store.installSkill(manifest.skill);
    return platformResult(`installed skill ${skill.id}`, { skill });
  }
  if (request.action === 'skill.update') {
    const current = await store.getSkill(String(input.skillId ?? input.id ?? '').trim());
    if (!current) throw new Error('skill_not_found');
    if (current.common && input.enabled === false) throw new Error('common_skill_cannot_be_disabled');
    const manifest = normalizeSkillManifestInput({
      ...current,
      ...input,
      id: current.id,
      common: current.common
    });
    if (!manifest.ok) throw new Error(manifest.error);
    const skill = await store.updateSkill(current.id, manifest.skill);
    return platformResult(`updated skill ${skill.id}`, { skill });
  }
  if (request.action === 'skill.delete') {
    const skill = await store.getSkill(String(input.skillId ?? input.id ?? '').trim());
    if (!skill) throw new Error('skill_not_found');
    if (skill.common) throw new Error('common_skill_cannot_be_deleted');
    await store.deleteSkill(skill.id);
    return platformResult(`deleted skill ${skill.id}`, { skill });
  }
  if (request.action === 'project.read') {
    const room = await resolveRoomManagementRoom(store, input.roomId ?? input.room, workspaceScope) ?? await store.getRoom(run.roomId);
    const projects = await store.listProjects(room.id);
    const tasks = await store.listProjectTasks(room.id, { byRoom: true });
    return platformResult(`read ${projects.length} projects`, { room, projects, tasks });
  }
  if (request.action === 'project.create') {
    const room = await resolveRoomManagementRoom(store, input.roomId ?? input.room, workspaceScope) ?? await store.getRoom(run.roomId);
    if (!room) throw new Error('room_not_found');
    const fallbackAgent = await resolvePlatformAgent(store, input.agentId ?? input.agent ?? run.agentId);
    if (!fallbackAgent) throw new Error('agent_not_found');
    const name = String(input.name ?? '').trim();
    const instructions = String(input.instructions ?? input.brief ?? '').trim();
    if (!name) throw new Error('project_name_required');
    if (!instructions) throw new Error('project_instructions_required');
    const result = await createRoomProject(store, room.id, {
      agentId: fallbackAgent.id,
      name,
      type: input.type,
      instructions
    });
    return platformResult(`created project ${result.project.name}`, result);
  }
  if (request.action === 'project.delete') {
    const project = await store.getProject(String(input.projectId ?? input.project ?? '').trim());
    if (!project) throw new Error('project_not_found');
    const activeTasks = (await store.listProjectTasks(project.id))
      .filter((task) => task.status === 'running' || task.status === 'queued' || task.status === 'blocked');
    if (activeTasks.length > 0) throw new Error('project_has_active_tasks');
    if (input.deleteFiles) {
      const { workspace } = await withRoomWorkspace(store, project.roomId);
      const storage = createWorkspaceStorage();
      await storage.deleteFile(workspace.id, project.rootPath);
    }
    const deleted = await store.deleteProject(project.id);
    return platformResult(`deleted project ${project.name}`, { project: deleted, deletedFiles: Boolean(input.deleteFiles) });
  }
  if (request.action === 'task.review') {
    const result = await reviewScheduledTask(store, run, input);
    return platformResult(`reviewed task ${result.task.title}: ${result.decision}`, result);
  }
  if (request.action === 'task.interrupt') {
    const result = await interruptScheduledTask(store, run, input);
    return platformResult(`interrupted task ${result.task.title}`, result);
  }
  if (request.action === 'task.run') {
    const task = await store.getScheduledTask(String(input.taskId ?? input.task ?? '').trim());
    if (!task) throw new Error('task_not_found');
    if (task.status !== 'scheduled') throw new Error('task_not_runnable');
    await store.updateScheduledTask(task.id, { scheduleAt: new Date().toISOString() });
    await dispatchDueScheduledTasks(store);
    return platformResult(`queued task ${task.title}`, { task: await store.getScheduledTask(task.id) });
  }
  if (request.action === 'task.cancel') {
    const task = await store.getScheduledTask(String(input.taskId ?? input.task ?? '').trim());
    if (!task) throw new Error('task_not_found');
    if (task.status !== 'scheduled') throw new Error('task_not_cancellable');
    const cancelled = await store.updateScheduledTask(task.id, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString()
    });
    return platformResult(`cancelled task ${cancelled.title}`, { task: cancelled });
  }
  if (request.action === 'artifact.read') {
    const room = await resolveRoomManagementRoom(store, input.roomId ?? input.room, workspaceScope) ?? await store.getRoom(run.roomId);
    const artifacts = await store.listArtifacts(room.id, { limit: normalizeInvocationLimitInput(input.limit) });
    return platformResult(`read ${artifacts.length} artifacts`, { room, artifacts });
  }
  if (request.action === 'activity.read') {
    const room = await resolveRoomManagementRoom(store, input.roomId ?? input.room, workspaceScope) ?? await store.getRoom(run.roomId);
    const limit = normalizeInvocationLimitInput(input.limit);
    return platformResult(`read room activity for ${room.name}`, {
      room,
      invocations: await store.listSkillInvocations(room.id, { limit }),
      approvals: await store.listSkillApprovals(room.id, { limit })
    });
  }
  if (request.action === 'activity.clear') {
    const room = await resolveRoomManagementRoom(store, input.roomId ?? input.room, workspaceScope) ?? await store.getRoom(run.roomId);
    if (!room) throw new Error('room_not_found');
    const result = await store.clearRoomActivity(room.id);
    return platformResult(`cleared activity for ${room.name}`, { room, ...result });
  }
  if (request.action === 'settings.update') {
    const settings = await updatePlatformSettings(store, input);
    return platformResult('updated system settings', { settings });
  }
  if (request.action === 'provider.create') {
    const provider = await createPlatformProvider(store, input);
    return platformResult(`created provider ${provider.name}`, { provider: publicProvider(provider) });
  }
  if (request.action === 'provider.update') {
    const provider = await updatePlatformProvider(store, input);
    return platformResult(`updated provider ${provider.name}`, { provider: publicProvider(provider) });
  }
  if (request.action === 'provider.delete') {
    const provider = await resolvePlatformProvider(store, input.providerId ?? input.provider);
    if (!provider) throw new Error('provider_not_found');
    await store.deleteProvider(provider.id);
    return platformResult(`deleted provider ${provider.name}`, { provider: publicProvider(provider) });
  }
  if (request.action === 'provider.probe') {
    const provider = input.providerId || input.provider
      ? await resolvePlatformProvider(store, input.providerId ?? input.provider)
      : null;
    const baseUrl = input.baseUrl ?? provider?.baseUrl;
    const apiKey = input.apiKey ?? provider?.apiKey;
    const result = input.listModels || input.models
      ? await listOpenAICompatibleModels({ baseUrl, apiKey }, await createProviderDeps(store))
      : await probeOpenAICompatibleProvider({ baseUrl, apiKey }, await createProviderDeps(store));
    return platformResult('probed provider', result);
  }
  throw new Error(`unsupported_platform_action:${request.action}`);
}

function platformResult(summary, output) {
  return { summary, output };
}

async function resolvePlatformAgent(store, ref) {
  const requested = String(ref ?? '').trim();
  if (!requested) return null;
  const agents = await store.listAgents();
  return agents.find((agent) => agent.id === requested)
    ?? agents.find((agent) => roomNameMatches(agent.name, requested))
    ?? null;
}

async function resolvePlatformProvider(store, ref) {
  const providers = await store.listProviders();
  const requested = String(ref ?? '').trim();
  if (requested) {
    return providers.find((provider) => provider.id === requested)
      ?? providers.find((provider) => roomNameMatches(provider.name, requested))
      ?? null;
  }
  return providers.find((provider) => provider.enabled !== false) ?? providers[0] ?? null;
}

async function resolvePlatformRole(store, ref) {
  const requested = String(ref ?? '').trim();
  if (!requested) return null;
  const roles = await store.listRoles();
  return roles.find((role) => role.id === requested)
    ?? roles.find((role) => roomNameMatches(role.name, requested))
    ?? null;
}

async function updatePlatformSettings(store, input) {
  const current = await store.getSettings();
  const proxyEnabled = input.network?.proxyEnabled === undefined
    ? Boolean(current.network?.proxyEnabled)
    : Boolean(input.network?.proxyEnabled);
  const proxyUrl = String(input.network?.proxyUrl ?? current.network?.proxyUrl ?? '').trim();
  const providerTimeoutMs = normalizeProviderTimeoutInput(input.network?.providerTimeoutMs ?? current.network?.providerTimeoutMs);
  const messagePageSize = normalizeMessagePageSizeInput(input.chat?.messagePageSize ?? current.chat?.messagePageSize);
  const approvalMode = normalizeApprovalModeInput(input.approvals?.mode ?? current.approvals?.mode);

  if (proxyEnabled && proxyUrl) {
    try {
      const parsed = new URL(proxyUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('proxy_url_must_be_http_or_https');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'proxy_url_must_be_http_or_https') throw error;
      throw new Error('invalid_proxy_url');
    }
  }

  return store.updateSettings({
    network: {
      proxyEnabled,
      proxyUrl,
      providerTimeoutMs
    },
    chat: {
      messagePageSize
    },
    approvals: {
      mode: approvalMode
    }
  });
}

async function createPlatformProvider(store, input) {
  const name = String(input.name ?? '').trim();
  const apiKey = String(input.apiKey ?? '').trim();
  const defaultModel = String(input.defaultModel ?? '').trim();
  if (!name) throw new Error('name_required');
  if (!apiKey) throw new Error('api_key_required');
  if (!defaultModel) throw new Error('default_model_required');
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl);
  return store.createProvider({
    name,
    protocol: 'openai_chat_completions',
    baseUrl,
    apiKey,
    defaultModel,
    models: normalizeProviderModelInput(input.models, defaultModel),
    enabled: true
  });
}

async function updatePlatformProvider(store, input) {
  const current = await resolvePlatformProvider(store, input.providerId ?? input.provider ?? input.id);
  if (!current) throw new Error('provider_not_found');
  const name = String(input.name ?? current.name ?? '').trim();
  const defaultModel = String(input.defaultModel ?? current.defaultModel ?? '').trim();
  if (!name) throw new Error('name_required');
  if (!defaultModel) throw new Error('default_model_required');
  const patch = {
    name,
    baseUrl: input.baseUrl === undefined ? current.baseUrl : normalizeProviderBaseUrl(input.baseUrl),
    defaultModel,
    models: input.models === undefined ? current.models : normalizeProviderModelInput(input.models, defaultModel),
    enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled)
  };
  const apiKey = String(input.apiKey ?? '').trim();
  if (apiKey) patch.apiKey = apiKey;
  return store.updateProvider(current.id, patch);
}

function normalizeProviderBaseUrl(value) {
  return value === 'mock://provider' ? 'mock://provider' : normalizeBaseUrl(value);
}

function normalizeProviderModelInput(models, defaultModel) {
  return Array.isArray(models) && models.length > 0
    ? models
    : [{ id: defaultModel, name: defaultModel }];
}

async function createRequestedRoomAgent(store, request, roomId) {
  const name = String(request.name ?? '').trim();
  if (!name) throw new Error('agent_name_required');
  const provider = await resolvePlatformProvider(store, request.providerId ?? request.provider);
  if (!provider) throw new Error('provider_not_found');
  const model = String(request.model ?? provider.defaultModel ?? provider.models?.[0]?.id ?? '').trim();
  if (!model) throw new Error('model_required');
  const existing = await resolvePlatformAgent(store, name);
  if (existing) {
    await store.attachAgentToRoom(roomId, existing.id, { triggerMode: 'manual' });
    return existing;
  }
  return store.createAgent({
    name,
    bio: String(request.bio ?? '').trim(),
    runtimeType: 'hosted_agent',
    roleId: await normalizeAgentRoleId(store, request.roleId ?? request.role),
    providerId: provider.id,
    model,
    status: 'online'
  });
}

async function applyRoomManagementActions(store, run, content, workspaceScope) {
  const createRequests = parseRoomCreateBlocks(content);
  const assignRequests = parseRoomAssignBlocks(content);
  if (createRequests.length === 0 && assignRequests.length === 0) {
    return { created: [], assigned: [] };
  }

  const agent = await store.getAgent(run.agentId);
  const skills = await store.listSkills();
  const created = [];
  const assigned = [];

  if (createRequests.length > 0 && !await agentHasSkill(store, agent, 'room.create', skills)) {
    throw new Error('agent_missing_room_create_skill');
  }
  if (createRequests.some((request) => request.agentRequests.length > 0) && !await agentHasSkill(store, agent, 'agent.create', skills)) {
    throw new Error('agent_missing_agent_create_skill');
  }
  if (assignRequests.length > 0 && !await agentHasSkill(store, agent, 'room.assign', skills)) {
    throw new Error('agent_missing_room_assign_skill');
  }

  for (const request of createRequests) {
    const invocation = await createRoomManagementInvocation(store, run, 'room.create', {
      action: 'create_room',
      request
    });
    try {
      const existingRoom = await findRoomByName(store, request.name, request.type || 'group');
      if (existingRoom) throw new Error(`room_name_exists:${existingRoom.name}`);
      const room = await store.createRoom({
        name: request.name,
        type: request.type || 'group',
        description: request.description
      });
      const agents = await resolveRoomManagementAgents(store, request.agents, request.roles);
      const requestedAgents = [];
      for (const agentRequest of request.agentRequests) {
        requestedAgents.push(await createRequestedRoomAgent(store, agentRequest, room.id));
      }
      const joins = [];
      for (const targetAgent of uniqueAgents([agent, ...agents, ...requestedAgents]).filter(Boolean)) {
        const join = await store.attachAgentToRoom(room.id, targetAgent.id, { triggerMode: 'manual' });
        joins.push({ agent: targetAgent, join });
      }
      await store.getOrCreateRoomWorkspace(room.id, {
        name: `${room.name} Workspace`
      });
      await store.updateSkillInvocation(invocation.id, {
        status: 'done',
        output: {
          roomId: room.id,
          roomName: room.name,
          agents: joins.map(({ agent }) => ({ id: agent.id, name: agent.name }))
        },
        completedAt: new Date().toISOString()
      });
      created.push({
        roomId: room.id,
        roomName: room.name,
        agentNames: joins.map(({ agent }) => agent.name)
      });
    } catch (error) {
      await store.updateSkillInvocation(invocation.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  for (const request of assignRequests) {
    const invocation = await createRoomManagementInvocation(store, run, 'room.assign', {
      action: 'assign_agent',
      request
    });
    try {
      const room = await resolveRoomManagementRoom(store, request.room, workspaceScope);
      if (!room) throw new Error(`room_assign_target_not_found:${request.room}`);
      if (!await agentCanManageRoom(store, run.agentId, room.id)) {
        throw new Error(`agent_not_member_of_room:${room.name}`);
      }
      const agents = await resolveRoomManagementAgents(store, request.agents);
      if (agents.length === 0) throw new Error('room_assign_agents_required');
      const joins = [];
      for (const targetAgent of agents) {
        const join = await store.attachAgentToRoom(room.id, targetAgent.id, { triggerMode: request.triggerMode || 'manual' });
        joins.push({ agent: targetAgent, join });
        assigned.push({
          roomId: room.id,
          roomName: room.name,
          agentId: targetAgent.id,
          agentName: targetAgent.name
        });
      }
      await store.updateSkillInvocation(invocation.id, {
        status: 'done',
        output: {
          roomId: room.id,
          roomName: room.name,
          agents: joins.map(({ agent }) => ({ id: agent.id, name: agent.name }))
        },
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      await store.updateSkillInvocation(invocation.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  return { created, assigned };
}

async function createRoomManagementInvocation(store, run, skillId, input) {
  return store.createSkillInvocation({
    skillId,
    roomId: run.roomId,
    runId: run.id,
    messageId: run.messageId,
    agentId: run.agentId,
    actorType: 'agent',
    status: 'running',
    input,
    startedAt: new Date().toISOString()
  });
}

async function resolveRoomManagementRoom(store, requestedRoom, workspaceScope) {
  const requested = String(requestedRoom ?? '').trim();
  if (!requested && workspaceScope?.isExternal) return workspaceScope.room;
  if (!requested) return null;
  const rooms = await store.listRooms();
  return rooms.find((room) => room.id === requested)
    ?? rooms.find((room) => roomNameMatches(room.name, requested))
    ?? null;
}

async function findRoomByName(store, name, type) {
  const requested = String(name ?? '').trim();
  if (!requested) return null;
  const normalizedType = type === 'dm' ? 'dm' : type === 'group' ? 'group' : '';
  const rooms = await store.listRooms();
  return rooms.find((room) => (
    roomNameMatches(room.name, requested) &&
    (!normalizedType || room.type === normalizedType)
  )) ?? null;
}

async function uniqueRoomName(store, name, type) {
  const base = String(name ?? '').trim() || 'New Room';
  if (!await findRoomByName(store, base, type)) return base;
  for (let index = 0; index < 12; index += 1) {
    const suffix = randomBytes(3).toString('hex');
    const candidate = `${base}-${suffix}`;
    if (!await findRoomByName(store, candidate, type)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function resolveRoomManagementAgents(store, agentRefs, roleRefs = []) {
  const refs = Array.isArray(agentRefs) ? agentRefs : [];
  const roleRequests = Array.isArray(roleRefs) ? roleRefs : [];
  if (refs.length === 0 && roleRequests.length === 0) return [];
  const agents = await store.listAgents();
  const roles = roleRequests.length > 0 ? await store.listRoles() : [];
  const directAgents = refs
    .map((ref) => {
      const requested = String(ref ?? '').trim();
      if (!requested) return null;
      return agents.find((agent) => agent.id === requested)
        ?? agents.find((agent) => roomNameMatches(agent.name, requested))
        ?? null;
    })
    .filter(Boolean);
  const roleAgents = roleRequests.flatMap((ref) => {
    const role = resolveRoomManagementRole(roles, ref);
    return role ? agents.filter((agent) => agent.roleId === role.id) : [];
  });
  return uniqueAgents([...directAgents, ...roleAgents]);
}

function resolveRoomManagementRole(roles, ref) {
  const requested = String(ref ?? '').trim();
  if (!requested) return null;
  return roles.find((role) => role.id === requested)
    ?? roles.find((role) => roomNameMatches(role.name, requested))
    ?? null;
}

async function agentCanManageRoom(store, agentId, roomId) {
  if (!agentId || !roomId) return false;
  const members = await store.listRoomAgents(roomId);
  return members.some((member) => member.id === agentId);
}

function buildCrossRoomMessageContent({ agentName, sourceRoomName, targetRoomName, content }) {
  return [
    `[agentim-room-message source="${escapeInlineAttribute(sourceRoomName)}" target="${escapeInlineAttribute(targetRoomName)}" agent="${escapeInlineAttribute(agentName)}"]`,
    String(content ?? '').trim()
  ].filter(Boolean).join('\n\n');
}

function escapeInlineAttribute(value) {
  return String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

async function resolveRoomMessageTarget(store, run, request, workspaceScope, rooms) {
  const requested = String(request.room ?? '').trim();
  if (requested) {
    return rooms.find((room) => room.id === requested)
      ?? rooms.find((room) => roomNameMatches(room.name, requested))
      ?? null;
  }
  if (workspaceScope?.isExternal) return workspaceScope.room;
  return await store.getRoom(run.roomId);
}

function roomNameMatches(roomName, candidate) {
  const left = String(roomName ?? '').trim().toLowerCase();
  const right = String(candidate ?? '').trim().toLowerCase();
  return left === right || left.replaceAll(/\s+/g, '') === right.replaceAll(/\s+/g, '');
}

function parseWorkspaceActionBlocks(content) {
  const blocks = [];
  const writePattern = /```agentim-write-file\s+path=(?:"([^"]+)"|'([^']+)'|([^\s`]+))\s*\n([\s\S]*?)```/g;
  for (const match of content.matchAll(writePattern)) {
    const path = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!path) continue;
    blocks.push({
      type: 'file',
      path,
      content: String(match[4] ?? '').replace(/\n$/, '')
    });
  }

  const mkdirPattern = /```agentim-mkdir\s+path=(?:"([^"]+)"|'([^']+)'|([^\s`]+))\s*```/g;
  for (const match of content.matchAll(mkdirPattern)) {
    const path = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!path) continue;
    blocks.push({
      type: 'directory',
      path
    });
  }
  return blocks.slice(0, 32);
}

function parseWebReadBlocks(content) {
  const blocks = [];
  const pattern = /```agentim-web-read\s*\n([\s\S]*?)```/g;
  for (const match of String(content ?? '').matchAll(pattern)) {
    const payload = parseJsonBlock(match[1]);
    if (!payload) continue;
    const url = String(payload.url ?? '').trim();
    if (!url) continue;
    blocks.push({
      url,
      maxFiles: Number(payload.maxFiles) || undefined
    });
  }

  const inlinePattern = /```agentim-web-read\s+url=(?:"([^"]+)"|'([^']+)'|([^\s`]+))(?:\s+maxFiles=(\d+))?\s*```/g;
  for (const match of String(content ?? '').matchAll(inlinePattern)) {
    const url = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!url) continue;
    blocks.push({
      url,
      maxFiles: Number(match[4]) || undefined
    });
  }
  return dedupeWebReadBlocks(blocks).slice(0, 4);
}

function dedupeWebReadBlocks(blocks) {
  const seen = new Set();
  return blocks.filter((block) => {
    const key = block.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseWorkspaceReadBlocks(content) {
  const blocks = [];
  const readPattern = /```agentim-read-file\s+path=(?:"([^"]+)"|'([^']+)'|([^\s`]+))\s*```/g;
  for (const match of content.matchAll(readPattern)) {
    const path = String(match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!path) continue;
    blocks.push({
      type: 'file',
      path
    });
  }

  const listPattern = /```agentim-list-dir(?:\s+path=(?:"([^"]*)"|'([^']*)'|([^\s`]+)))?\s*```/g;
  for (const match of content.matchAll(listPattern)) {
    blocks.push({
      type: 'directory',
      path: String(match[1] ?? match[2] ?? match[3] ?? '').trim()
    });
  }
  return blocks.slice(0, 16);
}

function formatWebReadResults(results) {
  return results.map((result) => {
    if (result.type === 'github_repository') {
      return [
        `Web read result for GitHub repository ${result.owner}/${result.name} (${result.branch}):`,
        result.description ? `Description: ${result.description}` : '',
        result.language ? `Primary language: ${result.language}` : '',
        `Repository files considered: ${result.fileCount}`,
        '',
        ...result.files.map((file) => [
          `File: ${file.path}${file.truncated ? ' (truncated)' : ''}`,
          file.error ? `Error: ${file.error}` : '```',
          file.error ? '' : file.content,
          file.error ? '' : '```'
        ].filter(Boolean).join('\n'))
      ].filter(Boolean).join('\n');
    }
    return [
      `Web read result for ${result.url}:`,
      result.title ? `Title: ${result.title}` : '',
      `HTTP: ${result.status} ${result.statusText ?? ''}`.trim(),
      result.contentType ? `Content-Type: ${result.contentType}` : '',
      '',
      result.text
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function truncateWorkspaceReadContent(content) {
  const text = String(content ?? '');
  const maxChars = 12000;
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function formatWorkspaceReadResults(results) {
  return results.map((result) => {
    if (result.type === 'directory') {
      const lines = result.files.length > 0
        ? result.files.map((file) => `- ${file.type === 'directory' ? '[dir]' : '[file]'} ${file.path}`).join('\n')
        : '(empty)';
      return `Workspace read result for ${result.path || '/'}:\n${lines}`;
    }
    return [
      `Workspace read result for ${result.path}${result.truncated ? ' (truncated)' : ''}:`,
      '```',
      result.content,
      '```'
    ].join('\n');
  }).join('\n\n');
}

function parseRoomMessageBlocks(content) {
  const blocks = [];
  const pattern = /```agentim-room-message([^\n`]*)(?:\n([\s\S]*?))?```/g;
  for (const match of content.matchAll(pattern)) {
    const header = String(match[1] ?? '').trim();
    const body = String(match[2] ?? '').replace(/\n$/, '').trim();
    const room = parseInlineAttribute(header, 'room');
    const message = body || stripParsedInlineAttributes(header, ['room']);
    if (!message) continue;
    blocks.push({
      type: 'message',
      room,
      content: message
    });
  }
  return blocks.slice(0, 16);
}

function parseRoleCreateBlocks(content) {
  const blocks = [];
  const pattern = /```agentim-role-create\s*\n([\s\S]*?)```/g;
  for (const match of String(content ?? '').matchAll(pattern)) {
    const payload = parseJsonBlock(match[1]);
    if (!payload) continue;
    const name = String(payload.name ?? '').trim();
    const systemPrompt = String(payload.systemPrompt ?? '').trim();
    if (!name || !systemPrompt) continue;
    blocks.push({
      name,
      description: String(payload.description ?? '').trim(),
      systemPrompt,
      skillIds: normalizeSkillIdsInput(payload.skillIds ?? payload.skills).slice(0, 32)
    });
  }
  return blocks.slice(0, 8);
}

function parsePlatformActionBlocks(content) {
  const blocks = [];
  const pattern = /```agentim-platform-action\s*\n([\s\S]*?)```/g;
  for (const match of String(content ?? '').matchAll(pattern)) {
    const payload = parseJsonBlock(match[1]);
    if (!payload) continue;
    const action = String(payload.action ?? '').trim();
    if (!action || !PLATFORM_ACTION_SKILLS[action]) continue;
    blocks.push({
      action,
      input: normalizeJsonObject(payload.input, {})
    });
  }
  return blocks.slice(0, 12);
}

function parseRoomCreateBlocks(content) {
  const blocks = [];
  const pattern = /```agentim-room-create\s*\n([\s\S]*?)```/g;
  for (const match of String(content ?? '').matchAll(pattern)) {
    const payload = parseJsonBlock(match[1]);
    if (!payload) continue;
    const name = String(payload.name ?? '').trim();
    if (!name) continue;
    blocks.push({
      name,
      description: String(payload.description ?? '').trim(),
      type: ['group', 'dm'].includes(payload.type) ? payload.type : 'group',
      agents: normalizeStringList(payload.agents ?? payload.agentIds ?? payload.agentNames).slice(0, 16),
      roles: normalizeStringList(payload.roles ?? payload.roleIds ?? payload.roleNames).slice(0, 16),
      agentRequests: normalizeAgentCreateRequests(payload.agentRequests ?? payload.createAgents).slice(0, 16)
    });
  }
  return blocks.slice(0, 8);
}

function parseRoomAssignBlocks(content) {
  const blocks = [];
  const pattern = /```agentim-room-assign\s*\n([\s\S]*?)```/g;
  for (const match of String(content ?? '').matchAll(pattern)) {
    const payload = parseJsonBlock(match[1]);
    if (!payload) continue;
    const room = String(payload.room ?? payload.roomId ?? payload.roomName ?? '').trim();
    const agents = normalizeStringList(payload.agents ?? payload.agentIds ?? payload.agentNames).slice(0, 16);
    if (!room || agents.length === 0) continue;
    blocks.push({
      room,
      agents,
      triggerMode: String(payload.triggerMode ?? 'manual').trim() || 'manual'
    });
  }
  return blocks.slice(0, 16);
}

function parseTaskPlanBlocks(content) {
  const blocks = [];
  const pattern = /```agentim-task-plan\s*\n([\s\S]*?)```/g;
  for (const match of String(content ?? '').matchAll(pattern)) {
    const payload = parseJsonBlock(match[1]);
    if (!payload) continue;
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const items = rawItems
      .map((item, index) => normalizeTaskPlanItem(item, index))
      .filter((item) => item.title && item.instructions);
    if (items.length === 0) continue;
    blocks.push({
      title: String(payload.title ?? 'Agent task plan').trim() || 'Agent task plan',
      summary: String(payload.summary ?? '').trim(),
      items: items.slice(0, 20)
    });
  }
  return blocks.slice(0, 4);
}

function normalizeTaskPlanItem(item, index) {
  const input = normalizeJsonObject(item, {});
  return {
    id: String(input.id ?? `task-${index + 1}`).trim() || `task-${index + 1}`,
    title: String(input.title ?? `Task ${index + 1}`).trim() || `Task ${index + 1}`,
    instructions: String(input.instructions ?? input.prompt ?? '').trim(),
    agent: String(input.agent ?? input.agentId ?? input.agentName ?? '').trim(),
    role: String(input.role ?? input.roleId ?? '').trim(),
    scheduleAt: normalizeScheduleAtInput(input.scheduleAt) ?? new Date().toISOString(),
    repeatInterval: normalizeRepeatIntervalInput(input.repeatInterval),
    dependsOn: normalizeScheduledTaskDependencyInput(input.dependsOn ?? input.dependsOnTaskIds ?? input.dependsOnTaskId),
    acceptanceCriteria: normalizeStringList(input.acceptanceCriteria ?? input.acceptance ?? []).slice(0, 12),
    reviewWith: String(input.reviewWith ?? input.reviewer ?? '').trim(),
    artifact: String(input.artifact ?? input.expectedArtifact ?? '').trim()
  };
}

function parseJsonBlock(value) {
  try {
    const parsed = JSON.parse(String(value ?? '').trim());
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseInlineAttribute(header, name) {
  const pattern = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)'|(\\S+))`);
  const match = String(header ?? '').match(pattern);
  return String(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function normalizeStringList(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return list.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function normalizeAgentCreateRequests(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeJsonObject(item, null))
    .filter(Boolean)
    .map((item) => ({
      name: String(item.name ?? '').trim(),
      bio: String(item.bio ?? '').trim(),
      roleId: String(item.roleId ?? item.role ?? '').trim(),
      providerId: String(item.providerId ?? item.provider ?? '').trim(),
      model: String(item.model ?? '').trim()
    }))
    .filter((item) => item.name);
}

function normalizeJsonObject(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function stripParsedInlineAttributes(header, names) {
  let output = String(header ?? '');
  for (const name of names) {
    output = output.replace(new RegExp(`(?:^|\\s)${name}=(?:"[^"]*"|'[^']*'|\\S+)`), ' ');
  }
  return output.trim();
}

function isPreviewableWorkspacePath(path) {
  return /\.(html?|svg|txt|md|json)$/i.test(String(path ?? ''));
}

async function buildWorkspaceContext(store, roomId, workspaceScope) {
  try {
    const { workspace, room } = await withRoomWorkspace(store, roomId);
    const storage = createWorkspaceStorage();
    const lines = await listWorkspaceTree(storage, workspace.id);
    const roomLabel = workspaceScope?.isExternal
      ? `Target workspace: ${room.name}.`
      : `Current workspace: ${room.name}.`;
    if (lines.length === 0) {
      return `${roomLabel}\nWorkspace is empty.`;
    }
    return `${roomLabel}\nWorkspace files:\n${lines.join('\n')}`;
  } catch {
    return 'Current workspace files are unavailable.';
  }
}

async function listWorkspaceTree(storage, workspaceId, dir = '', depth = 0, lines = []) {
  if (depth > 4 || lines.length >= 120) return lines;
  const files = await storage.listFiles(workspaceId, dir);
  for (const file of files) {
    if (lines.length >= 120) break;
    const prefix = '  '.repeat(depth);
    lines.push(`${prefix}${file.type === 'directory' ? '[dir]' : '[file]'} ${file.path}`);
    if (file.type === 'directory') {
      await listWorkspaceTree(storage, workspaceId, file.path, depth + 1, lines);
    }
  }
  return lines;
}

async function withRoomWorkspace(store, roomId) {
  const room = await store.getRoom(roomId);
  if (!room) return { ok: false, error: 'room_not_found', status: 404 };
  const workspace = await store.getOrCreateRoomWorkspace(roomId, {
    name: `${room.name} Workspace`
  });
  return { ok: true, room, workspace };
}

async function approveSkillApproval(store, approval, decidedBy = 'user') {
  if (approval.skillId !== 'workspace.delete') {
    const decidedAt = new Date().toISOString();
    const updatedApproval = await store.updateSkillApproval(approval.id, {
      status: 'approved',
      decidedBy,
      decidedAt
    });
    const invocation = approval.invocationId
      ? await store.updateSkillInvocation(approval.invocationId, {
        status: 'done',
        output: { approved: true },
        completedAt: decidedAt
      })
      : null;
    return { approval: updatedApproval, invocation };
  }

  const path = String(approval.input?.path ?? '').trim();
  if (!path) throw new Error('path_required');
  const result = await withRoomWorkspace(store, approval.roomId);
  if (!result.ok) throw new Error(result.error);

  const storage = createWorkspaceStorage();
  await storage.deleteFile(result.workspace.id, path);

  const decidedAt = new Date().toISOString();
  const updatedApproval = await store.updateSkillApproval(approval.id, {
    status: 'approved',
    decidedBy,
    decidedAt
  });
  const invocation = approval.invocationId
    ? await store.updateSkillInvocation(approval.invocationId, {
      status: 'done',
      output: {
        action: 'delete_file',
        path,
        workspaceId: result.workspace.id
      },
      completedAt: decidedAt
    })
    : null;
  await store.createMessage({
    roomId: approval.roomId,
    senderType: 'system',
    senderName: 'AgentIM',
    content: `Deleted workspace file: ${path}`,
    status: 'done',
    pending: false
  });
  return {
    approval: updatedApproval,
    invocation,
    workspace: result.workspace,
    path
  };
}

async function normalizeAgentRoleId(store, inputRoleId) {
  const roles = await store.listRoles();
  const requested = String(inputRoleId ?? DEFAULT_AGENT_ROLE_ID);
  return roles.some((role) => role.id === requested) ? requested : DEFAULT_AGENT_ROLE_ID;
}

async function agentHasSkill(store, agent, skillId, skills) {
  const role = agent?.roleId ? await store.getRole(agent.roleId) : null;
  return effectiveAgentSkillIds(agent, skills, role).includes(skillId);
}

function shouldRequireApprovalForSkill(skill, settings) {
  const mode = normalizeApprovalModeInput(settings?.approvals?.mode);
  if (mode === 'off') return false;
  const risk = String(skill?.riskLevel ?? 'medium').toLowerCase();
  if (mode === 'auto') return risk === 'high' || Boolean(skill?.policy?.destructive);
  if (mode === 'balanced') return ['medium', 'high'].includes(risk) || Boolean(skill?.requiresApproval);
  return Boolean(skill?.requiresApproval) || ['medium', 'high'].includes(risk) || Boolean(skill?.policy?.destructive);
}

function buildTemplateRolePrompt(template) {
  return [
    template.systemPrompt,
    '',
    `Template source: ${template.sourceUrl}`,
    `Template license: ${template.license}`,
    `Attribution: ${template.attribution}`,
    template.suggestedSkillIds?.length
      ? `Suggested AgentIM skills: ${template.suggestedSkillIds.join(', ')}`
      : ''
  ].filter(Boolean).join('\n');
}

function normalizeSkillIdsInput(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function normalizeSkillManifestInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'skill_manifest_required' };
  }

  const id = String(input.id ?? '').trim();
  const name = String(input.name ?? '').trim();
  if (!isValidSkillId(id)) return { ok: false, error: 'invalid_skill_id' };
  if (!name) return { ok: false, error: 'skill_name_required' };

  const runtime = input.runtime === undefined
    ? { kind: 'external', adapter: 'manual' }
    : input.runtime;
  const inputSchema = input.inputSchema === undefined
    ? { type: 'object' }
    : input.inputSchema;
  const outputSchema = input.outputSchema === undefined
    ? { type: 'object' }
    : input.outputSchema;
  const policy = input.policy === undefined
    ? { workspace: 'none', network: false, destructive: false }
    : input.policy;
  const ui = input.ui === undefined
    ? { card: 'skill-result' }
    : input.ui;

  for (const [key, value] of Object.entries({ runtime, inputSchema, outputSchema, policy, ui })) {
    if (!isPlainObject(value)) return { ok: false, error: `${key}_must_be_object` };
  }

  const riskLevel = String(input.riskLevel ?? 'medium');
  if (!['low', 'medium', 'high'].includes(riskLevel)) {
    return { ok: false, error: 'invalid_risk_level' };
  }

  return {
    ok: true,
    skill: {
      id,
      name,
      version: String(input.version ?? '1.0.0').trim() || '1.0.0',
      category: String(input.category ?? 'custom').trim() || 'custom',
      description: String(input.description ?? '').trim(),
      common: Boolean(input.common),
      enabled: input.enabled === undefined ? true : Boolean(input.enabled),
      source: String(input.source ?? 'manual').trim() || 'manual',
      runtime,
      inputSchema,
      outputSchema,
      policy,
      ui,
      riskLevel,
      requiresApproval: Boolean(input.requiresApproval)
    }
  };
}

function isValidSkillId(id) {
  return /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/.test(id);
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function workspaceError(c, error) {
  const message = error instanceof Error ? error.message : String(error);
  const badRequestErrors = new Set([
    'invalid_workspace_path',
    'absolute_paths_not_allowed',
    'parent_paths_not_allowed',
    'path_is_not_file'
  ]);
  return c.json({
    ok: false,
    error: badRequestErrors.has(message) ? message : 'workspace_error',
    message
  }, badRequestErrors.has(message) ? 400 : 500);
}

function previewPathFromRequest(c, roomId) {
  const pathname = new URL(c.req.url).pathname;
  const prefix = `/api/rooms/${encodeURIComponent(roomId)}/preview/`;
  const rawPath = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : c.req.param('*');
  const decoded = decodeURIComponent(rawPath ?? '');
  return decoded.endsWith('/') ? `${decoded}index.html` : decoded;
}

function previewContentType(path) {
  const extension = String(path).split('.').pop()?.toLowerCase();
  const types = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8'
  };
  return types[extension] ?? 'text/plain; charset=utf-8';
}

function mimeTypeForWorkspacePath(path) {
  return previewContentType(path).split(';')[0];
}

async function streamAgentReply(c, roomId, agentId) {
  const store = c.get('store');
  const room = await store.getRoom(roomId);
  if (!room) return sseError('room_not_found', 404);

  const agents = await store.listAgents();
  const roomAgents = await store.listRoomAgents(roomId);
  const agent = agents.find((item) => item.id === agentId)
    ?? roomAgents[0]
    ?? agents[0];
  if (!agent) return sseError('agent_not_found', 404);

  const provider = await store.getProvider(agent.providerId);
  if (!provider) return sseError('provider_not_found', 404);

  const recent = (await store.listMessages(roomId))
    .slice(-12)
    .filter((message) => !isInternalProviderErrorMessage(message))
    .map((message) => ({
      role: message.senderType === 'agent' ? 'assistant' : 'user',
      content: formatMessageForContext(message)
    }));

  const assistantMessage = await store.createMessage({
    roomId,
    senderType: 'agent',
    senderName: agent.name,
    content: ''
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const write = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      write('start', { message: assistantMessage });

      try {
        if (provider.baseUrl === 'mock://provider') {
          for await (const event of mockAgentStream(agent, recent)) {
            if (event.type === 'text_delta') {
              assistantMessage.content += event.text;
              write('delta', { text: event.text });
            }
          }
        } else {
          const role = await store.getRole(agent.roleId);
          const skills = await store.listSkills();
          const messages = [
            { role: 'system', content: buildAgentSystemPrompt(agent, roomAgents, '', role, skills) },
            ...recent
          ];
          const providerDeps = await createProviderDeps(store);
          if (!providerDeps.proxyStreamingSupported) {
            const fallback = await createOpenAICompatibleChat({
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey,
              model: agent.model,
              messages,
              maxTokens: 800
            }, providerDeps);
            if (fallback.content) {
              assistantMessage.content += fallback.content;
              write('delta', { text: fallback.content });
            }
          } else {
            try {
              for await (const event of streamOpenAICompatibleChat({
                baseUrl: provider.baseUrl,
                apiKey: provider.apiKey,
                model: agent.model,
                messages
              }, providerDeps)) {
                if (event.type === 'text_delta') {
                  assistantMessage.content += event.text;
                  write('delta', { text: event.text });
                } else if (event.type === 'usage') {
                  write('usage', event);
                }
              }
            } catch {
              const fallback = await createOpenAICompatibleChat({
                baseUrl: provider.baseUrl,
                apiKey: provider.apiKey,
                model: agent.model,
                messages,
                maxTokens: 800
              }, providerDeps);
              if (fallback.content) {
                assistantMessage.content += fallback.content;
                write('delta', { text: fallback.content });
              }
            }
          }
        }

        await store.updateMessageContent(assistantMessage.id, assistantMessage.content);
        write('done', { message: assistantMessage });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assistantMessage.content += `\n\n[Provider error: ${message}]`;
        await store.updateMessageContent(assistantMessage.id, assistantMessage.content);
        write('agent_error', { message, messageId: assistantMessage.id });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  });
}

async function* mockAgentStream(agent, recent, signal) {
  const last = recent.at(-1)?.content ?? '';
  const inlineRoomMessageTarget = last.match(/room message to ([^.。\n]+)/i)?.[1]
    ?.replace(/^.*?:\s*/, '')
    .trim() ?? 'Product Room';
  const baseText = last.toLowerCase().includes('workspace write block')
    ? `${agent.name}: mock workspace write requested.\n\n\`\`\`agentim-write-file path="hello-web/index.html"\nhello from mock\n\`\`\``
    : last.toLowerCase().includes('room create block')
      ? `${agent.name}: mock room create requested.\n\n\`\`\`agentim-room-create\n{"name":"Mock Managed Room","description":"Created by mock AgentIM room management flow","agents":["Helper Agent"]}\n\`\`\``
    : last.toLowerCase().includes('room assign block')
      ? `${agent.name}: mock room assign requested.\n\n\`\`\`agentim-room-assign\n{"room":"Product Room","agents":["Helper Agent"],"triggerMode":"manual"}\n\`\`\``
    : last.toLowerCase().includes('room message to')
      ? `${agent.name}: mock inline room message requested.\n\n\`\`\`agentim-room-message room="${inlineRoomMessageTarget}" @user inline cross-room smoke delivered\n\`\`\``
    : `${agent.name}: I received your message. The hosted Agent path is wired up, and this mock reply will switch to your OpenAI-compatible provider once the saved endpoint and key are valid.\n\nLast message: ${last}`;
  const repeat = Math.min(Math.max(Number(process.env.AGENTIM_MOCK_REPEAT ?? 1) || 1, 1), 100);
  const delayMs = Math.min(Math.max(Number(process.env.AGENTIM_MOCK_DELAY_MS ?? 40) || 40, 0), 2000);
  const text = Array.from({ length: repeat }, () => baseText).join('\n\n');
  for (let i = 0; i < text.length; i += 18) {
    if (signal?.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield { type: 'text_delta', text: text.slice(i, i + 18) };
  }
}

function sseError(message, status) {
  return new Response(`event: agent_error\ndata: ${JSON.stringify({ message })}\n\n`, {
    status,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache'
    }
  });
}

function normalizeProviderModels(provider) {
  if (Array.isArray(provider.models) && provider.models.length > 0) {
    return provider.models
      .filter((model) => model?.id)
      .map((model) => ({
        id: String(model.id),
        name: String(model.name ?? model.id)
      }));
  }
  return provider.defaultModel
    ? [{ id: provider.defaultModel, name: provider.defaultModel }]
    : [];
}

async function resolveReplyTo(store, roomId, replyToMessageId) {
  const id = String(replyToMessageId ?? '').trim();
  if (!id) return undefined;

  const message = (await store.listMessages(roomId)).find((item) => item.id === id);
  if (!message) return undefined;
  return {
    id: message.id,
    senderName: message.senderName,
    content: String(message.content ?? '').slice(0, 500)
  };
}

function formatMessageForContext(message, context = {}) {
  const replyContext = message.replyTo && !isInternalProviderErrorContent(message.replyTo.content)
    ? ` (replying to ${message.replyTo.senderName}: ${message.replyTo.content})`
    : '';
  return `${message.senderName}${replyContext}: ${formatMessageContentForContext(message, context)}`;
}

function formatMessageContentForContext(message, context = {}) {
  const content = String(message.content ?? '');
  if (context.room?.type !== 'dm' || message.senderType !== 'user') return content;
  return stripDirectRoomAddressing(content, context.roomAgents);
}

function stripDirectRoomAddressing(content, roomAgents = []) {
  let next = String(content ?? '').trim();
  for (const agent of roomAgents) {
    const name = String(agent?.name ?? '').trim();
    if (!name) continue;
    const escaped = escapeRegExp(name).replace(/\\ /g, '\\s+');
    next = next.replace(new RegExp(`^@${escaped}(?=$|[\\s，。！？、,.!?:;；：）)\\]}])`, 'i'), '').trimStart();
  }
  return next || content;
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isInternalProviderErrorMessage(message) {
  const content = String(message.content ?? '');
  const replyContent = String(message.replyTo?.content ?? '');
  return isInternalProviderErrorContent(content) || isInternalProviderErrorContent(replyContent);
}

function isInternalProviderErrorContent(content) {
  return (
    content.includes('[Provider error:') ||
    content.includes('Provider error: webidl.util.markAsUncloneable') ||
    content.includes('webidl.util.markAsUncloneable is not a function')
  );
}

function buildAgentSystemPrompt(agent, roomAgents, workspaceContext = '', role, registrySkills = [], workspaceScope) {
  const peerNames = roomAgents
    .filter((item) => item.id !== agent.id)
    .map((item) => `@${item.name}`);
  const collaboration = peerNames.length > 0
    ? `\n\nYou are in a multi-agent room. You may ask another Agent to continue by mentioning them exactly by name: ${peerNames.join(', ')}. Use @all only when every other Agent should respond. Do not mention an Agent unless their response is genuinely needed.`
    : '\n\nYou are in a room with the user.';
  const workspace = workspaceContext ? `\n\n${workspaceContext}` : '';
  const resolvedRole = role ?? resolveAgentRole(agent);
  const rolePrompt = resolvedRole?.systemPrompt ? `\n\nRole: ${resolvedRole.name}\n${resolvedRole.systemPrompt}` : '';
  const legacyAgentPrompt = agent.systemPrompt ? `${agent.systemPrompt}\n\n` : '';
  const skillIds = effectiveAgentSkillIds(agent, registrySkills, resolvedRole);
  const skillSet = new Set(skillIds);
  const skills = skillIds.length > 0
    ? `\n\nEnabled skills available to this Agent: ${skillIds.join(', ')}.`
    : '\n\nNo enabled skills are currently available to this Agent.';
  const roleDirectory = skillSet.has('role.read')
    ? `\n\nAvailable Agent roles for planning rooms: ${formatRoleDirectory()}. Use role ids when selecting by role.`
    : '\n\nYou do not have role.read enabled. Do not claim to inspect the Agent role directory.';
  const roleCreate = skillSet.has('role.create')
    ? `\n\nYou can create a custom Agent role by emitting this controlled JSON block:\n\`\`\`agentim-role-create\n{"name":"Role name","description":"What this role is for","systemPrompt":"Instructions for Agents assigned to this role.","skillIds":["provider.chat","workspace.read","agent.message"]}\n\`\`\`\nUse this when existing roles do not fit the user's requested specialization. Use only existing skill ids; unavailable skill ids will be ignored. Do not claim a role was created unless you emitted the block.`
    : '\n\nYou do not have role.create enabled. Do not claim to create roles.';
  const platformActions = buildPlatformActionPrompt(skillSet);
  const webRead = skillSet.has('web.read')
    ? `\n\nYou can read public web pages and public GitHub repositories by emitting a controlled block:\n\`\`\`agentim-web-read\n{"url":"https://example.com","maxFiles":12}\n\`\`\`\nUse web.read when the user gives you a URL, asks you to inspect external docs/code, or asks you to analyze a GitHub project before applying ideas to this workspace. For GitHub repository URLs, the platform returns repository metadata, file tree highlights, README/package files, and selected source files. After reading, continue the user's original task using the returned content.`
    : '\n\nYou do not have web.read enabled. Do not claim to open URLs, browse websites, or inspect GitHub links.';
  const workspaceRead = skillSet.has('workspace.read')
    ? `\n\nYou can inspect the ${workspaceScope?.isExternal ? `target room workspace (${workspaceScope.room.name})` : 'current room workspace'} by emitting controlled fenced blocks.\n\nList a directory:\n\`\`\`agentim-list-dir path=\"relative/dir\"\`\`\`\nUse an empty path to list the workspace root:\n\`\`\`agentim-list-dir path=\"\"\`\`\`\n\nRead a file:\n\`\`\`agentim-read-file path=\"relative/path.txt\"\`\`\`\n\nUse these read blocks when you need file contents before answering or editing.`
    : '\n\nYou do not have workspace.read enabled. Do not claim to read workspace files.';
  const workspaceWrite = skillSet.has('workspace.write')
    ? `\n\nYou can create or update a project in the ${workspaceScope?.isExternal ? `target room workspace (${workspaceScope.room.name})` : 'current room workspace'} by emitting controlled fenced blocks.\n\nCreate a directory:\n\`\`\`agentim-mkdir path="relative/dir"\`\`\`\n\nWrite a file:\n\`\`\`agentim-write-file path="relative/path.txt"\nfile contents here\n\`\`\`\n\nWhen asked to create a project, create a complete first runnable version instead of only describing the plan. For web projects, include index.html and any needed CSS/JS assets, use relative links, and make the entry file previewable. You may emit multiple write blocks in one response. Only use relative paths. Do not use absolute paths or parent directory paths. Do not put nested triple-backtick fences inside file contents; use indented code blocks or plain text in Markdown files. Keep a short natural-language summary before or after the blocks.`
    : '\n\nYou do not have workspace.write enabled. Do not emit workspace write protocol blocks.';
  const roomMessaging = skillSet.has('agent.message')
    ? `\n\nYou can send a message into a room where you are already a member by emitting a controlled fenced block. To send to the target room, use this exact multi-line format:\n\`\`\`agentim-room-message room="${workspaceScope?.isExternal ? workspaceScope.room.name : 'Room Name'}"\nmessage text here\n\`\`\`\nPut the message body on the line after the opening fence. If the user asks you in a DM to notify or update another room, use this block. Do not claim a message was sent unless you emitted the block.`
    : '\n\nYou do not have agent.message enabled. Do not claim to send messages to other rooms.';
  const roomCreate = skillSet.has('room.create')
    ? `\n\nYou can create a new group room by emitting this controlled JSON block:\n\`\`\`agentim-room-create\n{"name":"Room name","description":"Purpose of the room","agents":["Agent Name"],"roles":["designer","full-stack-developer"],"agentRequests":[{"name":"New Agent","roleId":"designer","bio":"Short purpose"}]}\n\`\`\`\nThe agents and roles arrays are optional; you will automatically be added to rooms you create. Use existing Agent names/ids or existing role ids/names. If you also have agent.create enabled, agentRequests can create missing Agents and attach them to the new room. Omit providerId/model to use the first enabled provider and its default model. Do not claim Agents were created unless you emitted agentRequests and have agent.create.`
    : '\n\nYou do not have room.create enabled. Do not claim to create rooms.';
  const roomAssign = skillSet.has('room.assign')
    ? `\n\nYou can attach existing Agents to an existing room by emitting this controlled JSON block:\n\`\`\`agentim-room-assign\n{"room":"Room name","agents":["Agent Name"],"triggerMode":"manual"}\n\`\`\`\nUse existing room and Agent names or ids only. Do not claim Agents were assigned unless you emitted the block.`
    : '\n\nYou do not have room.assign enabled. Do not claim to assign Agents to rooms.';
  const taskPlanning = skillSet.has('task.schedule')
    ? `\n\nYou can schedule autonomous work for room Agents by emitting a controlled task plan block. The platform will create scheduled tasks, start tasks with no pending dependencies, and automatically start dependent tasks after earlier tasks complete:\n\`\`\`agentim-task-plan\n{\n  "title": "Plan title",\n  "summary": "Why these tasks matter",\n  "items": [\n    {\n      "id": "short-step-id",\n      "title": "Task title",\n      "instructions": "Clear task instructions",\n      "agent": "Agent name or omit to assign yourself",\n      "role": "designer or full-stack-developer when choosing by role",\n      "scheduleAt": "ISO datetime or omit for now",\n      "repeatInterval": "daily, weekly, or omit",\n      "dependsOn": ["previous-step-id"],\n      "acceptanceCriteria": ["What done means"],\n      "artifact": "Expected artifact or preview path if useful",\n      "reviewWith": "Agent or role that should review the result"\n    }\n  ]\n}\n\`\`\`\nUse this for PM-style delegation, design-review-development flows, or any work that should continue without requiring @mentions. Prefer role when the exact Agent name is not important. Public preview artifacts should be submitted as soon as they exist; PM approval gates workflow progress, not artifact visibility.`
    : '\n\nYou do not have task.schedule enabled. Do not emit task scheduling protocol blocks.';
  const approvalGuidance = '\n\nApproval policy: execute ordinary low and medium risk work by default. Do not ask for approval before normal reading, writing project files, creating artifacts, routine Agent collaboration, or ordinary scheduled work. Ask only for genuinely high-risk, destructive, costly, external, ambiguous, or user-owned decisions.';
  const userApproval = skillSet.has('user.request_approval')
    ? `\n\nWhen you need an explicit user decision, emit a controlled approval request block:\n\`\`\`agentim-approval-request\n{\n  "title": "Decision title",\n  "reason": "Why approval is needed",\n  "approveLabel": "Approve",\n  "rejectLabel": "Reject",\n  "details": ["optional detail"]\n}\n\`\`\`\nUse this for risky, costly, ambiguous, or user-owned decisions.`
    : '\n\nYou do not have user.request_approval enabled. Mention @user in plain text for decisions instead.';
  return `${legacyAgentPrompt}${rolePrompt}${collaboration}\n\nThe human user is @user. Mention @user when you need confirmation, missing requirements, or a decision from the user. @user is not an automated Agent.${approvalGuidance}${skills}${roleDirectory}${roleCreate}${platformActions}${webRead}${workspace}${workspaceRead}${workspaceWrite}${roomMessaging}${roomCreate}${roomAssign}${taskPlanning}${userApproval}`;
}

function formatRoleDirectory() {
  return DEFAULT_ROLES
    .map((role) => `${role.id} (${role.name}: ${role.description})`)
    .join('; ');
}

function buildPlatformActionPrompt(skillSet) {
  const actions = Object.entries(PLATFORM_ACTION_SKILLS)
    .filter(([, skillId]) => skillSet.has(skillId))
    .map(([action]) => action);
  if (actions.length === 0) {
    return '\n\nYou do not have platform action skills enabled. Do not claim to operate platform APIs beyond explicit protocol blocks listed here.';
  }
  return `\n\nYou can operate selected platform APIs by emitting controlled JSON blocks:\n\`\`\`agentim-platform-action\n{"action":"agent.read","input":{}}\n\`\`\`\nAvailable platform actions for you: ${actions.join(', ')}. Use this for reading or changing Agents, Rooms, Roles, Skills, Projects, Tasks, Artifacts, and Activity when the matching action is listed. Do not claim a platform action completed unless you emitted the block.`;
}

function buildProjectRequestContent({ name, type, instructions }) {
  return [
    `Create project: ${name}`,
    '',
    `Project type: ${projectTypeLabel(type)}`,
    '',
    instructions,
    '',
    'Create the project directly in the room workspace.',
    'Use clear relative paths and create all essential files for a runnable first version.',
    'For web projects, include an entry HTML file that can be opened from Workspace Preview.',
    'Do not put nested triple-backtick fences inside file contents; use indented code blocks or plain text in Markdown files.',
    'Keep the response concise, but include the required workspace write blocks so AgentIM can save the files.'
  ].join('\n');
}

function projectTemplateForType(type) {
  const templates = {
    'static-web': {
      id: 'static-web',
      initialStatus: 'planning',
      phases: [
        { phase: 'product', roleId: 'product-manager', title: 'Define static web scope', instructions: 'Clarify the page goal, audience, required content, and concise acceptance criteria.' },
        { phase: 'design', roleId: 'designer', dependsOn: ['product'], title: 'Design static web experience', instructions: 'Create the UI structure, interaction notes, and visual direction. Mention exact sections/components the developer should build.' },
        { phase: 'development', roleId: 'full-stack-developer', dependsOn: ['product'], title: 'Build static web project', instructions: 'Create the runnable static web project under the project root. Include index.html and any CSS/JS assets. Use workspace write blocks.' },
        { phase: 'review', roleId: 'reviewer', dependsOn: ['design', 'development'], title: 'Review static web project', instructions: 'Review the created project against the brief. Check previewability, file structure, and obvious quality issues.' }
      ]
    },
    'web-app': {
      id: 'web-app',
      initialStatus: 'planning',
      phases: [
        { phase: 'product', roleId: 'product-manager', title: 'Define web app scope', instructions: 'Define core workflows, states, acceptance criteria, and the smallest useful app.' },
        { phase: 'design', roleId: 'designer', dependsOn: ['product'], title: 'Design web app screens', instructions: 'Define screens, layout, component behavior, and interaction details for the app.' },
        { phase: 'development', roleId: 'full-stack-developer', dependsOn: ['product'], title: 'Build web app project', instructions: 'Create a runnable front-end web app under the project root with previewable entry files. Use workspace write blocks.' },
        { phase: 'review', roleId: 'reviewer', dependsOn: ['design', 'development'], title: 'Review web app project', instructions: 'Review functionality, structure, preview path, and missing obvious states.' }
      ]
    },
    'document-site': {
      id: 'document-site',
      initialStatus: 'planning',
      phases: [
        { phase: 'product', roleId: 'product-manager', title: 'Define document site IA', instructions: 'Define information architecture, sections, audience, and acceptance criteria.' },
        { phase: 'design', roleId: 'designer', dependsOn: ['product'], title: 'Design document site structure', instructions: 'Define page structure, navigation, reading flow, and visual hierarchy for the document site.' },
        { phase: 'development', roleId: 'full-stack-developer', dependsOn: ['product'], title: 'Build document site', instructions: 'Create a readable previewable document site under the project root. Use workspace write blocks.' },
        { phase: 'review', roleId: 'reviewer', dependsOn: ['design', 'development'], title: 'Review document site', instructions: 'Review readability, navigation, links, and previewability.' }
      ]
    },
    prototype: {
      id: 'prototype',
      initialStatus: 'planning',
      phases: [
        { phase: 'product', roleId: 'product-manager', title: 'Define prototype goal', instructions: 'Define what the prototype must prove and how it will be judged.' },
        { phase: 'design', roleId: 'designer', dependsOn: ['product'], title: 'Create prototype artifact', instructions: 'Create a previewable prototype under the project root with focused interaction and visual details. Use workspace write blocks.' },
        { phase: 'review', roleId: 'reviewer', dependsOn: ['design'], title: 'Review prototype', instructions: 'Review whether the prototype communicates the intended product idea.' }
      ]
    }
  };
  return templates[type] ?? templates['static-web'];
}

async function createProjectTasksFromTemplate(store, project, template, distribution) {
  const created = [];
  const taskIdsByPhase = new Map();
  for (const phase of template.phases) {
    const assignment = distribution.assignments.find((item) => item.phase === phase.phase);
    const dependsOnTaskIds = (phase.dependsOn ?? [])
      .map((dependencyPhase) => taskIdsByPhase.get(dependencyPhase))
      .filter(Boolean);
    const task = await store.createProjectTask({
      projectId: project.id,
      roomId: project.roomId,
      roleId: phase.roleId,
      agentId: assignment?.agent?.id,
      phase: phase.phase,
      title: phase.title,
      instructions: phase.instructions,
      status: 'queued',
      dependsOnTaskId: dependsOnTaskIds[0],
      dependsOnTaskIds
    });
    created.push(task);
    taskIdsByPhase.set(phase.phase, task.id);
  }
  return created;
}

async function resolveProjectTaskAgentId(store, roomId, roleId, fallbackAgentId) {
  const roomAgents = await store.listRoomAgents(roomId);
  const exact = roomAgents.find((agent) => agent.roleId === roleId);
  const general = roomAgents.find((agent) => agent.roleId === DEFAULT_AGENT_ROLE_ID);
  return exact?.id ?? (fallbackAgentId && roomAgents.some((agent) => agent.id === fallbackAgentId) ? fallbackAgentId : undefined) ?? general?.id ?? roomAgents[0]?.id;
}

async function buildProjectDistribution(store, roomId, template, fallbackAgentId) {
  const roomAgents = await store.listRoomAgents(roomId);
  const roles = await store.listRoles();
  const fallbackAgent = fallbackAgentId
    ? roomAgents.find((agent) => agent.id === fallbackAgentId) ?? await store.getAgent(fallbackAgentId)
    : null;
  const fallbackInRoom = fallbackAgent && roomAgents.some((agent) => agent.id === fallbackAgent.id);
  const generalAgent = roomAgents.find((agent) => agent.roleId === DEFAULT_AGENT_ROLE_ID);
  const assignments = template.phases.map((phase) => {
    const exact = roomAgents.find((agent) => agent.roleId === phase.roleId);
    const agent = exact ?? (fallbackInRoom ? fallbackAgent : null) ?? generalAgent ?? roomAgents[0] ?? null;
    return {
      phase: phase.phase,
      title: phase.title,
      dependsOn: phase.dependsOn ?? [],
      roleId: phase.roleId,
      roleName: roles.find((role) => role.id === phase.roleId)?.name ?? phase.roleId,
      agent: agent ? {
        id: agent.id,
        name: agent.name,
        roleId: agent.roleId ?? DEFAULT_AGENT_ROLE_ID,
        model: agent.model
      } : null,
      exactMatch: Boolean(exact),
      fallbackUsed: Boolean(!exact && agent),
      missing: !exact
    };
  });
  const missingRoles = uniqueBy(assignments
    .filter((item) => item.missing)
    .map((item) => ({
      roleId: item.roleId,
      roleName: item.roleName
    })), (item) => item.roleId);
  return {
    templateId: template.id,
    phases: template.phases.map((phase) => ({
      phase: phase.phase,
      roleId: phase.roleId,
      title: phase.title,
      dependsOn: phase.dependsOn ?? []
    })),
    assignments,
    missingRoles,
    fallbackAgent: fallbackAgent ? {
      id: fallbackAgent.id,
      name: fallbackAgent.name,
      roleId: fallbackAgent.roleId ?? DEFAULT_AGENT_ROLE_ID,
      model: fallbackAgent.model
    } : null
  };
}

function buildProjectCreatedMessage(project, tasks, distribution) {
  const assignmentLines = distribution.assignments.map((item) => {
    const agentName = item.agent?.name ?? 'Unassigned';
    return `${item.phase}:${item.roleName} -> ${agentName}${item.exactMatch ? '' : ' (fallback)'}`;
  });
  const dependencyLines = tasks.map((task) => {
    const dependencyNames = projectTaskDependencyIds(task)
      .map((id) => tasks.find((item) => item.id === id)?.phase ?? id)
      .join(', ');
    return `${task.phase} depends on ${dependencyNames || 'start'}`;
  });
  const missing = distribution.missingRoles.length > 0
    ? `\nMissing role Agents: ${distribution.missingRoles.map((role) => role.roleName).join(', ')}`
    : '';
  const payload = {
    project: {
      id: project.id,
      name: project.name,
      type: project.type,
      rootPath: project.rootPath,
      entryPath: project.entryPath,
      status: project.status
    },
    assignments: distribution.assignments.map((item) => ({
      phase: item.phase,
      roleId: item.roleId,
      roleName: item.roleName,
      title: item.title,
      agent: item.agent ? {
        id: item.agent.id,
        name: item.agent.name,
        model: item.agent.model
      } : null,
      exactMatch: Boolean(item.exactMatch),
      fallbackUsed: Boolean(item.fallbackUsed),
      dependsOn: item.dependsOn ?? []
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      phase: task.phase,
      title: task.title,
      status: task.status,
      agentId: task.agentId,
      dependsOnTaskIds: projectTaskDependencyIds(task)
    })),
    missingRoles: distribution.missingRoles
  };
  return [
    `Project created: ${project.name}`,
    `Root: ${project.rootPath}`,
    `Tasks: ${tasks.map((task) => `${task.phase}:${task.title}`).join(', ')}`,
    `Assignments:\n${assignmentLines.join('\n')}`,
    `Dependencies:\n${dependencyLines.join('\n')}${missing}`,
    '',
    '```agentim-project-created',
    JSON.stringify(payload, null, 2),
    '```'
  ].join('\n');
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function buildProjectTaskContext(store, project, task) {
  const tasks = await store.listProjectTasks(project.id);
  const outputs = await buildProjectOutputSummary(store, project);
  const dependencyIds = projectTaskDependencyIds(task);
  const dependencyResults = tasks
    .filter((item) => dependencyIds.includes(item.id) && item.resultSummary)
    .map((item) => `${item.phase}: ${item.resultSummary}`)
    .join('\n');
  const previousResults = tasks
    .filter((item) => item.status === 'done' && item.resultSummary)
    .map((item) => `${item.phase}: ${item.resultSummary}`)
    .join('\n');
  return [
    `Project task: ${task.title}`,
    '',
    `Project: ${project.name}`,
    `Project type: ${projectTypeLabel(project.type)}`,
    `Project root: ${project.rootPath}`,
    project.entryPath ? `Preview entry: ${project.entryPath}` : '',
    '',
    `Brief:\n${project.brief}`,
    '',
    dependencyResults ? `Required dependency results:\n${dependencyResults}` : '',
    dependencyIds.length > 0 && !dependencyResults ? 'Dependencies are marked done, but no summaries were captured.' : '',
    '',
    previousResults ? `Previous task results:\n${previousResults}` : 'No previous task results yet.',
    '',
    `Your phase: ${task.phase}`,
    `Your role: ${task.roleId}`,
    '',
    task.phase === 'review' ? `Project outputs:\n${formatProjectOutputsForPrompt(outputs)}` : '',
    '',
    task.instructions,
    '',
    'Work inside the project root only. When creating or changing files, use the AgentIM workspace write protocol.'
  ].filter(Boolean).join('\n');
}

async function buildProjectOutputSummary(store, project) {
  const { workspace } = await withRoomWorkspace(store, project.roomId);
  const storage = createWorkspaceStorage();
  const files = await collectWorkspaceFiles(storage, workspace.id, project.rootPath);
  const artifacts = (await store.listArtifacts(project.roomId, { limit: 200 }))
    .filter((artifact) => artifact.path && pathBelongsToProject(artifact.path, project.rootPath))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  const previewableFiles = files.filter((file) => isPreviewableWorkspacePath(file.path));
  const discoveredEntryPath = discoverProjectEntryPath(project, previewableFiles);
  return {
    projectId: project.id,
    rootPath: project.rootPath,
    entryPath: project.entryPath,
    discoveredEntryPath,
    fileCount: files.length,
    previewableCount: previewableFiles.length,
    recentFiles: files
      .slice()
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
      .slice(0, 8),
    previewableFiles: previewableFiles.slice(0, 8),
    artifactCount: artifacts.length,
    recentArtifacts: artifacts.slice(0, 8)
  };
}

async function buildProjectDeliverySummary(store, project) {
  const [room, tasks, outputs] = await Promise.all([
    store.getRoom(project.roomId),
    store.listProjectTasks(project.id),
    buildProjectOutputSummary(store, project)
  ]);
  const counts = tasks.reduce((summary, task) => {
    const status = task.status ?? 'unknown';
    summary[status] = (summary[status] ?? 0) + 1;
    return summary;
  }, {});
  const orderedTasks = tasks.map((task) => ({
    id: task.id,
    phase: task.phase,
    title: task.title,
    status: task.status,
    agentId: task.agentId,
    roleId: task.roleId,
    resultSummary: task.resultSummary,
    error: task.error,
    startedAt: task.startedAt,
    completedAt: task.completedAt
  }));
  const review = tasks.find((task) => task.phase === 'review') ?? tasks.find((task) => task.status === 'failed');
  return {
    project: {
      id: project.id,
      roomId: project.roomId,
      roomName: room?.name ?? '',
      name: project.name,
      slug: project.slug,
      type: project.type,
      status: project.status,
      currentPhase: project.currentPhase,
      rootPath: project.rootPath,
      entryPath: project.entryPath,
      brief: project.brief,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    },
    delivery: {
      ready: project.status === 'done',
      status: project.status === 'done' ? 'ready' : project.status === 'failed' ? 'failed' : 'in_progress',
      entryPath: outputs.discoveredEntryPath ?? project.entryPath,
      downloadUrl: `/api/projects/${encodeURIComponent(project.id)}/export.zip`,
      generatedAt: new Date().toISOString()
    },
    taskSummary: {
      total: tasks.length,
      done: counts.done ?? 0,
      running: counts.running ?? 0,
      queued: counts.queued ?? 0,
      failed: counts.failed ?? 0,
      cancelled: counts.cancelled ?? 0,
      blocked: counts.blocked ?? 0
    },
    tasks: orderedTasks,
    review: review ? {
      phase: review.phase,
      status: review.status,
      resultSummary: review.resultSummary,
      error: review.error,
      completedAt: review.completedAt
    } : null,
    outputs
  };
}

async function materializeProjectDeliveryFile(store, project) {
  const result = await withRoomWorkspace(store, project.roomId);
  if (!result.ok) {
    const error = new Error(result.error ?? 'workspace_not_available');
    error.status = result.status;
    throw error;
  }
  const delivery = await buildProjectDeliverySummary(store, project);
  const deliveryPath = `${project.rootPath}/DELIVERY.md`;
  const storage = createWorkspaceStorage();
  const content = formatProjectDeliveryMarkdown(delivery);
  await storage.writeFile(result.workspace.id, deliveryPath, content);
  const artifact = await store.createArtifact({
    roomId: project.roomId,
    kind: 'project.delivery',
    title: `${project.name} delivery`,
    path: deliveryPath,
    mimeType: 'text/markdown',
    metadata: {
      projectId: project.id,
      projectSlug: project.slug,
      bytes: Buffer.byteLength(content, 'utf8'),
      previewable: true,
      generatedAt: new Date().toISOString()
    }
  });
  return {
    ok: true,
    path: deliveryPath,
    artifact,
    delivery: await buildProjectDeliverySummary(store, project)
  };
}

async function collectWorkspaceFiles(storage, workspaceId, dir, depth = 0) {
  if (depth > 6) return [];
  let entries = [];
  try {
    entries = await storage.listFiles(workspaceId, dir);
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.type === 'file') {
      files.push(entry);
    } else if (entry.type === 'directory') {
      files.push(...await collectWorkspaceFiles(storage, workspaceId, entry.path, depth + 1));
    }
  }
  return files;
}

function discoverProjectEntryPath(project, previewableFiles) {
  const paths = new Set(previewableFiles.map((file) => file.path));
  if (project.entryPath && paths.has(project.entryPath)) return project.entryPath;
  const candidates = [
    `${project.rootPath}/index.html`,
    `${project.rootPath}/src/index.html`,
    `${project.rootPath}/dist/index.html`,
    `${project.rootPath}/public/index.html`,
    `${project.rootPath}/app.html`
  ];
  return candidates.find((path) => paths.has(path)) ?? previewableFiles[0]?.path ?? project.entryPath;
}

function pathBelongsToProject(candidatePath, rootPath) {
  const path = String(candidatePath ?? '').replaceAll('\\', '/');
  const root = String(rootPath ?? '').replaceAll('\\', '/').replace(/\/$/, '');
  return path === root || path.startsWith(`${root}/`);
}

function downloadFilenameForPath(candidatePath) {
  const name = String(candidatePath ?? '')
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
    .pop() ?? 'download';
  return name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'download';
}

function contentTypeForWorkspacePath(candidatePath) {
  const path = String(candidatePath ?? '').toLowerCase();
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml; charset=utf-8';
  if (path.endsWith('.md') || path.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function formatProjectDeliveryMarkdown(delivery) {
  const project = delivery.project ?? {};
  const meta = delivery.delivery ?? {};
  const outputs = delivery.outputs ?? {};
  const tasks = Array.isArray(delivery.tasks) ? delivery.tasks : [];
  const recentFiles = Array.isArray(outputs.recentFiles) ? outputs.recentFiles : [];
  const recentArtifacts = Array.isArray(outputs.recentArtifacts) ? outputs.recentArtifacts : [];
  const review = delivery.review?.resultSummary || delivery.review?.error || 'No review summary yet.';
  return [
    `# ${project.name ?? 'Project Delivery'}`,
    '',
    `- Status: ${meta.status ?? project.status ?? 'unknown'}`,
    `- Room: ${project.roomName ?? project.roomId ?? 'unknown'}`,
    `- Type: ${project.type ?? 'project'}`,
    `- Root: ${project.rootPath ?? ''}`,
    meta.entryPath ? `- Preview entry: ${meta.entryPath}` : '',
    `- Generated: ${meta.generatedAt ?? new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `- Files: ${outputs.fileCount ?? 0}`,
    `- Previewable files: ${outputs.previewableCount ?? 0}`,
    `- Artifacts: ${outputs.artifactCount ?? 0}`,
    `- Tasks done: ${delivery.taskSummary?.done ?? 0}/${delivery.taskSummary?.total ?? 0}`,
    '',
    '## Review',
    '',
    review,
    '',
    '## Tasks',
    '',
    tasks.length > 0
      ? tasks.map((task) => `- ${task.phase}: ${task.status} - ${task.title}${task.error ? ` (${task.error})` : ''}`).join('\n')
      : '- No tasks recorded.',
    '',
    '## Recent Files',
    '',
    recentFiles.length > 0
      ? recentFiles.map((file) => `- ${file.path} (${file.size ?? 0} bytes)`).join('\n')
      : '- No files recorded.',
    '',
    '## Recent Artifacts',
    '',
    recentArtifacts.length > 0
      ? recentArtifacts.map((artifact) => `- ${artifact.path ?? artifact.title ?? artifact.kind}`).join('\n')
      : '- No artifacts recorded.',
    ''
  ].filter((line) => line !== '').join('\n');
}

function formatProjectOutputsForPrompt(outputs) {
  const lines = [
    `Files: ${outputs.fileCount}`,
    `Previewable files: ${outputs.previewableCount}`,
    outputs.discoveredEntryPath ? `Best preview entry: ${outputs.discoveredEntryPath}` : '',
    outputs.recentFiles.length > 0 ? `Recent files:\n${outputs.recentFiles.map((file) => `- ${file.path} (${file.size ?? 0} bytes)`).join('\n')}` : 'Recent files: none',
    outputs.recentArtifacts.length > 0 ? `Recent artifacts:\n${outputs.recentArtifacts.map((artifact) => `- ${artifact.path ?? artifact.title ?? artifact.kind}`).join('\n')}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

async function uniqueProjectSlug(store, roomId, name) {
  const base = slugifyProjectName(name) || 'project';
  const existing = new Set((await store.listProjects(roomId)).map((project) => project.slug));
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function slugifyProjectName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function projectStatusForPhase(phase) {
  return {
    product: 'planning',
    design: 'designing',
    development: 'developing',
    review: 'reviewing'
  }[phase] ?? 'developing';
}

function summarizeProjectTaskResult(content) {
  return String(content ?? '')
    .replaceAll(/```[\s\S]*?```/g, '[workspace block]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function normalizeProjectType(value) {
  const type = String(value ?? '').trim();
  return ['static-web', 'web-app', 'document-site', 'prototype'].includes(type) ? type : 'static-web';
}

function projectTypeLabel(type) {
  return {
    'static-web': 'Static web page',
    'web-app': 'Interactive web app',
    'document-site': 'Document/site project',
    prototype: 'Product prototype'
  }[type] ?? 'Static web page';
}

function effectiveAgentSkillIds(agent, registrySkills = [], role) {
  const enabledIds = registrySkills
    .filter((skill) => skill?.enabled !== false)
    .map((skill) => skill.id)
    .filter(Boolean);
  const roleSource = role ?? resolveAgentRole(agent);
  const rawRoleIds = Array.isArray(roleSource?.skillIds)
    ? roleSource.skillIds
    : agent?.roleId === DEFAULT_AGENT_ROLE_ID
      ? STANDARD_ROLE_SKILL_IDS
      : [];
  const roleIds = rawRoleIds.filter((id) => enabledIds.includes(id));
  return [...new Set(roleIds)];
}

function resolveAgentRole(agent) {
  return DEFAULT_ROLE_LOOKUP.get(agent?.roleId ?? DEFAULT_AGENT_ROLE_ID)
    ?? DEFAULT_ROLE_LOOKUP.get(DEFAULT_AGENT_ROLE_ID);
}

function resolveMentionTargets(content, agents) {
  const tokens = Array.from(content.matchAll(/@([^\s@]+)/g))
    .map((match) => normalizeMention(match[1]));
  if (tokens.includes('all')) return uniqueAgents(agents);

  const targets = [];
  for (const token of tokens) {
    const agent = agents.find((item) => normalizeMention(item.name) === token);
    if (agent) targets.push(agent);
  }
  return uniqueAgents(targets);
}

function uniqueAgents(agents) {
  const seen = new Set();
  return agents.filter((agent) => {
    if (!agent?.id || seen.has(agent.id)) return false;
    seen.add(agent.id);
    return true;
  });
}

function normalizeMention(value) {
  return String(value ?? '')
    .trim()
    .replace(/[，。！？、,.!?:;；：）)\]}]+$/g, '')
    .toLowerCase();
}

function normalizeProviderTimeoutInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 300000;
  return Math.max(Math.round(number), 5000);
}

function normalizeMessagePageSizeInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 20;
  return Math.min(Math.max(Math.round(number), 10), 100);
}

function normalizeApprovalModeInput(value) {
  const mode = String(value ?? '').trim().toLowerCase();
  return ['off', 'auto', 'balanced', 'strict'].includes(mode) ? mode : 'auto';
}

function normalizeInvocationLimitInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.min(Math.max(Math.round(number), 1), 200);
}

function normalizeTaskLimitInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.min(Math.max(Math.round(number), 1), 300);
}

function normalizeScheduleAtInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeRepeatIntervalInput(value) {
  const repeat = String(value ?? '').trim().toLowerCase();
  return ['daily', 'weekly'].includes(repeat) ? repeat : undefined;
}

function normalizeScheduledTaskDependencyInput(value) {
  const raw = Array.isArray(value) ? value : [value];
  return [...new Set(raw
    .flatMap((item) => typeof item === 'string' && item.includes(',') ? item.split(',') : [item])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean))];
}

function nextRepeatScheduleAt(scheduleAt, repeatInterval) {
  const date = new Date(scheduleAt);
  if (Number.isNaN(date.getTime())) return null;
  if (repeatInterval === 'daily') date.setUTCDate(date.getUTCDate() + 1);
  else if (repeatInterval === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else return null;
  return date.toISOString();
}

async function listMessagePage(c, store, roomId) {
  const settings = await store.getSettings();
  const defaultLimit = normalizeMessagePageSizeInput(settings?.chat?.messagePageSize);
  const requestedLimit = c.req.query('limit');
  const limit = requestedLimit === undefined
    ? defaultLimit
    : normalizeMessagePageSizeInput(requestedLimit);
  const beforeCreatedAt = String(c.req.query('before') ?? '').trim();
  const beforeId = String(c.req.query('beforeId') ?? '').trim();
  const messages = await store.listMessages(roomId, {
    limit: limit + 1,
    beforeCreatedAt,
    beforeId
  });
  const hasMore = messages.length > limit;
  const pageMessages = hasMore ? messages.slice(1) : messages;
  const oldest = pageMessages[0];
  return {
    messages: pageMessages,
    pagination: {
      limit,
      hasMore,
      nextBefore: oldest?.createdAt ?? null,
      nextBeforeId: oldest?.id ?? null
    }
  };
}
