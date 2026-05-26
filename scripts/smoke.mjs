const baseUrl = (process.env.AGENTIM_BASE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const runId = `smoke-${Date.now()}`;
const roomName = `Smoke ${runId}`;
const smokePassword = `secret-${runId}`;
const existingPassword = process.env.AGENTIM_SMOKE_PASSWORD ?? 'test123';
let cookieHeader = '';

let originalSettings = null;
let room = null;
let createdProvider = null;
let templateAgent = null;
let templateRole = null;
let templateRoom = null;
let templateRoomAgents = [];
let templateRoomRoles = [];
let restrictedRole = null;
let restrictedAgent = null;
let deliveryProject = null;

async function main() {
  await step('health', async () => {
    const health = await api('/api/health');
    assert(health.ok, 'health should be ok');
  });

  await step('auth status and optional password setup', async () => {
    const status = await api('/api/auth/status');
    assert(status.auth, 'auth status should include auth');
    if (!status.auth.passwordSet) {
      const setupRequired = await rawApi('/api/bootstrap', { cookie: '' });
      assert(setupRequired.status === 401, 'bootstrap should require password setup');
      const result = await api('/api/auth/password', {
        method: 'POST',
        body: { password: smokePassword }
      });
      assert(result.auth?.passwordSet, 'password should be set');
      const unauthorized = await rawApi('/api/bootstrap', { cookie: '' });
      assert(unauthorized.status === 401, 'bootstrap should require auth after password setup');
    } else if (!status.auth.authenticated) {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: { password: existingPassword }
      });
      assert(result.auth?.authenticated, 'existing password login should authenticate');
    }
  });

  originalSettings = await api('/api/settings');

  await step('sse ready and room events', async () => {
    let eventRoom = null;
    const event = await waitForSseEvent(
      (item) => item.type === 'room.created' && item.payload?.roomId === eventRoom?.id,
      async () => {
        eventRoom = await api('/api/rooms', {
          method: 'POST',
          body: {
            name: `Event Room ${runId}`,
            type: 'group',
            description: 'SSE smoke event room'
          }
        });
      }
    );
    assert(event.payload?.roomId === eventRoom.id, 'room.created event should include created room id');
    await api(`/api/rooms/${eventRoom.id}`, { method: 'DELETE' });
  });

  await step('create room and workspace', async () => {
    room = await api('/api/rooms', {
      method: 'POST',
      body: {
        name: `Product Room ${runId}`,
        type: 'group',
        description: 'Automated smoke test room'
      }
    });
    assert(room.id, 'room id should exist');
    const workspace = await api(`/api/rooms/${room.id}/workspace`);
    assert(workspace.ok && workspace.workspace?.id, 'workspace should exist');
  });

  await step('write and read workspace file', async () => {
    await api(`/api/rooms/${room.id}/files/write`, {
      method: 'PUT',
      body: {
        path: `${runId}/hello.txt`,
        content: 'hello smoke'
      }
    });
    const read = await api(`/api/rooms/${room.id}/files/read?path=${encodeURIComponent(`${runId}/hello.txt`)}`);
    assert(read.content === 'hello smoke', 'read content should match written content');
  });

  await step('auto mode requires approval for delete', async () => {
    await setApprovalMode('auto');
    const deletion = await api(`/api/rooms/${room.id}/files?path=${encodeURIComponent(`${runId}/hello.txt`)}`, {
      method: 'DELETE'
    });
    assert(deletion.approvalRequired, 'delete should require approval in auto mode');
    assert(deletion.approval?.status === 'pending', 'approval should be pending');
    const approved = await api(`/api/skill-approvals/${deletion.approval.id}/approve`, {
      method: 'POST'
    });
    assert(approved.approval?.status === 'approved', 'approval should be approved');
    const files = await api(`/api/rooms/${room.id}/files?path=${encodeURIComponent(runId)}`);
    assert(!files.files.some((file) => file.name === 'hello.txt'), 'approved delete should remove file');
  });

  await step('off mode deletes directly', async () => {
    await api(`/api/rooms/${room.id}/files/write`, {
      method: 'PUT',
      body: {
        path: `${runId}/direct.txt`,
        content: 'direct delete'
      }
    });
    await setApprovalMode('off');
    const deletion = await api(`/api/rooms/${room.id}/files?path=${encodeURIComponent(`${runId}/direct.txt`)}`, {
      method: 'DELETE'
    });
    assert(deletion.ok && !deletion.approvalRequired, 'delete should execute directly in off mode');
  });

  await step('export workspace zip', async () => {
    await api(`/api/rooms/${room.id}/files/write`, {
      method: 'PUT',
      body: {
        path: `${runId}/export.txt`,
        content: 'export me'
      }
    });
    const res = await fetchWithAuth(`${baseUrl}/api/rooms/${room.id}/export.zip`);
    assert(res.ok, `export should return 2xx, got ${res.status}`);
    const buffer = await res.arrayBuffer();
    assert(buffer.byteLength > 0, 'export zip should not be empty');
  });

  await step('agent template pack creates agent and role', async () => {
    const packs = await api('/api/agent-template-packs');
    assert(packs.some((pack) => pack.id === 'agency-agents'), 'agency-agents pack should exist');
    const templates = await api('/api/agent-templates?packId=agency-agents');
    const template = templates.find((item) => item.id === 'agency-qa-test-engineer');
    assert(template, 'qa template should exist');
    const provider = await ensureProvider();
    const created = await api(`/api/agent-templates/${template.id}/create-agent`, {
      method: 'POST',
      body: {
        name: `SmokeQA${runId.replace(/[^a-zA-Z0-9]/g, '')}`,
        providerId: provider.id,
        model: provider.defaultModel,
        roomId: room.id
      }
    });
    templateAgent = created.agent;
    templateRole = created.role;
    assert(templateAgent?.id, 'template-created agent should exist');
    assert(templateRole?.id, 'template-created role should exist');
    assert(templateRole.systemPrompt.includes(template.sourceUrl), 'template role should include source attribution');
  });

  await step('room template creates ready-to-work room', async () => {
    const templates = await api('/api/room-templates');
    const roomTemplate = templates.find((item) => item.id === 'web-app-delivery-circle');
    assert(roomTemplate, 'web app delivery room template should exist');
    const provider = await ensureProvider();
    const created = await api(`/api/room-templates/${roomTemplate.id}/create-room`, {
      method: 'POST',
      body: {
        name: `${roomTemplate.roomName} ${runId}`,
        defaultProviderId: provider.id,
        defaultModel: provider.defaultModel,
        agents: roomTemplate.agentTemplateIds.slice(0, 4).map((templateId) => ({
          templateId,
          providerId: provider.id,
          model: provider.defaultModel
        }))
      }
    });
    templateRoom = created.room;
    templateRoomAgents = created.agents ?? [];
    templateRoomRoles = created.roles ?? [];
    assert(templateRoom?.id, 'template-created room should exist');
    assert(templateRoomAgents.length === 4, 'room template should create selected agents');
    const roomAgents = await api(`/api/rooms/${templateRoom.id}/agents`);
    assert(roomAgents.length === templateRoomAgents.length, 'all template agents should be attached to the room');
  });

  await step('role skills restrict agent workspace writes', async () => {
    const provider = await ensureProvider();
    restrictedRole = await api('/api/roles', {
      method: 'POST',
      body: {
        name: `Smoke Readonly ${runId}`,
        description: 'Smoke role without workspace.write',
        systemPrompt: 'You are a smoke test role.',
        skillIds: ['provider.chat', 'workspace.read']
      }
    });
    restrictedAgent = await api('/api/agents', {
      method: 'POST',
      body: {
        name: `Smoke Restricted ${runId}`,
        roleId: restrictedRole.id,
        providerId: provider.id,
        model: provider.defaultModel,
        roomId: room.id
      }
    });
    await api(`/api/rooms/${room.id}/dispatch`, {
      method: 'POST',
      body: {
        content: '@all create a file using a workspace write block',
        senderName: 'Smoke'
      }
    });
    await api(`/api/rooms/${room.id}/agent-runs`, {
      method: 'POST',
      body: {
        agentId: restrictedAgent.id,
        maxTurns: 1
      }
    });
    await waitForRestrictedRunFailure(room.id, restrictedAgent.id);
    const files = await api(`/api/rooms/${room.id}/files?path=${encodeURIComponent('hello-web')}`).catch(() => ({ files: [] }));
    assert(!files.files?.some((file) => file.name === 'index.html'), 'restricted agent should not write mock file');
  });

  await step('project delivery endpoints package artifacts', async () => {
    const projectSlug = `delivery-${runId}`;
    deliveryProject = await api(`/api/rooms/${room.id}/projects`, {
      method: 'POST',
      body: {
        name: projectSlug,
        type: 'static-web',
        agentId: templateAgent.id,
        instructions: 'Smoke delivery project'
      }
    }).then((result) => result.project);
    await api(`/api/rooms/${room.id}/files/write`, {
      method: 'PUT',
      body: {
        path: `${deliveryProject.rootPath}/index.html`,
        content: '<!doctype html><html><body>delivery smoke</body></html>'
      }
    });
    await api(`/api/rooms/${room.id}/files/write`, {
      method: 'PUT',
      body: {
        path: `${deliveryProject.rootPath}/README.md`,
        content: '# Delivery smoke'
      }
    });
    const outputs = await api(`/api/projects/${deliveryProject.id}/outputs`);
    assert(outputs.fileCount >= 2, 'project outputs should count written files');
    assert(outputs.discoveredEntryPath === `${deliveryProject.rootPath}/index.html`, 'project outputs should discover index.html');
    const delivery = await api(`/api/projects/${deliveryProject.id}/delivery`);
    assert(delivery.delivery?.downloadUrl?.includes('/export.zip'), 'delivery should expose project zip URL');
    const materialized = await api(`/api/projects/${deliveryProject.id}/delivery-file`, { method: 'POST' });
    assert(materialized.path === `${deliveryProject.rootPath}/DELIVERY.md`, 'delivery file path should be stable');
    const deliveryFile = await api(`/api/rooms/${room.id}/files/read?path=${encodeURIComponent(materialized.path)}`);
    assert(deliveryFile.content.includes(deliveryProject.name), 'delivery file should include project name');
    const preview = await fetchWithAuth(`${baseUrl}/api/rooms/${room.id}/preview/${encodePath(`${deliveryProject.rootPath}/index.html`)}`);
    assert(preview.ok, `preview should return 2xx, got ${preview.status}`);
    const previewText = await preview.text();
    assert(previewText.includes('delivery smoke'), 'preview should serve project html');
    const fileDownload = await fetchWithAuth(`${baseUrl}/api/rooms/${room.id}/files/download?path=${encodeURIComponent(materialized.path)}`);
    assert(fileDownload.ok, `file download should return 2xx, got ${fileDownload.status}`);
    const projectZip = await fetchWithAuth(`${baseUrl}/api/projects/${deliveryProject.id}/export.zip`);
    assert(projectZip.ok, `project zip should return 2xx, got ${projectZip.status}`);
    const zipBuffer = await projectZip.arrayBuffer();
    assert(zipBuffer.byteLength > 0, 'project zip should not be empty');
    const artifacts = await api(`/api/rooms/${room.id}/artifacts?limit=20`);
    assert(artifacts.some((artifact) => artifact.kind === 'project.delivery' && artifact.path === materialized.path), 'delivery artifact should be listed');
  });

  await step('inline cross-room message block delivers', async () => {
    await api(`/api/roles/${templateRole.id}`, {
      method: 'PATCH',
      body: {
        name: templateRole.name,
        description: templateRole.description,
        systemPrompt: templateRole.systemPrompt,
        skillIds: ['provider.chat', 'workspace.read', 'workspace.write', 'agent.message']
      }
    });
    const sourceRoom = await api('/api/rooms', {
      method: 'POST',
      body: {
        name: `DM ${runId}`,
        type: 'dm',
        description: 'Inline cross-room smoke source',
        dmAgentId: templateAgent.id
      }
    });
    await api(`/api/rooms/${sourceRoom.id}/agents`, {
      method: 'POST',
      body: {
        agentId: templateAgent.id,
        triggerMode: 'manual'
      }
    }).catch(() => null);
    await api(`/api/rooms/${room.id}/agents`, {
      method: 'POST',
      body: {
        agentId: templateAgent.id,
        triggerMode: 'manual'
      }
    }).catch(() => null);
    const dispatch = await api(`/api/rooms/${sourceRoom.id}/dispatch`, {
      method: 'POST',
      body: {
        content: `@${templateAgent.name} Send an inline room message to ${room.name}.`,
        senderName: 'Smoke'
      }
    });
    assert(dispatch.targets.length > 0, 'source room should target template agent');
    const run = await api(`/api/rooms/${sourceRoom.id}/agent-runs`, {
      method: 'POST',
      body: {
        agentId: templateAgent.id,
        maxTurns: 1
      }
    });
    await waitForRunStatus(sourceRoom.id, run.run.id, ['done']);
    const sourceMessages = await api(`/api/rooms/${sourceRoom.id}/messages?limit=20`);
    const targetMessages = await api(`/api/rooms/${room.id}/messages?limit=50`);
    const sourceActivity = await api(`/api/rooms/${sourceRoom.id}/skill-invocations?limit=20`);
    assert(
      targetMessages.messages.some((message) => String(message.content ?? '').includes('inline cross-room smoke delivered')),
      `target room should receive inline room message block; source=${JSON.stringify(sourceMessages.messages.map((message) => ({ sender: message.senderName, status: message.status, content: String(message.content ?? '').slice(0, 240) })))} target=${JSON.stringify(targetMessages.messages.map((message) => ({ sender: message.senderName, content: String(message.content ?? '').slice(0, 180) })))}`
    );
    assert(sourceActivity.some((invocation) => invocation.skillId === 'agent.message' && invocation.status === 'done' && invocation.output?.roomId === room.id), 'source room activity should record delivered agent.message invocation');
    await api(`/api/rooms/${sourceRoom.id}`, { method: 'DELETE' });
  });

  await step('cross-room delivery publishes message event', async () => {
    const sourceRoom = await api('/api/rooms', {
      method: 'POST',
      body: {
        name: `SSE DM ${runId}`,
        type: 'dm',
        description: 'SSE cross-room source',
        dmAgentId: templateAgent.id
      }
    });
    await api(`/api/rooms/${sourceRoom.id}/agents`, {
      method: 'POST',
      body: {
        agentId: templateAgent.id,
        triggerMode: 'manual'
      }
    }).catch(() => null);
    await api(`/api/rooms/${room.id}/agents`, {
      method: 'POST',
      body: {
        agentId: templateAgent.id,
        triggerMode: 'manual'
      }
    }).catch(() => null);
    const eventPromise = waitForSseEvent(
      (item) => item.type === 'message.created' && item.payload?.roomId === room.id && item.payload?.senderName === templateAgent.name,
      async () => {
        await api(`/api/rooms/${sourceRoom.id}/dispatch`, {
          method: 'POST',
          body: {
            content: `@${templateAgent.name} Send an inline room message to ${room.name}.`,
            senderName: 'Smoke'
          }
        });
        const run = await api(`/api/rooms/${sourceRoom.id}/agent-runs`, {
          method: 'POST',
          body: {
            agentId: templateAgent.id,
            maxTurns: 1
          }
        });
        await waitForRunStatus(sourceRoom.id, run.run.id, ['done']);
        const targetMessages = await api(`/api/rooms/${room.id}/messages?limit=50`);
        const delivered = targetMessages.messages.find((message) => String(message.content ?? '').includes('inline cross-room smoke delivered'));
        assert(delivered?.id, 'target room should receive cross-room message before event assertion finishes');
      }
    );
    const event = await eventPromise;
    assert(event.payload?.messageId, 'message.created event should include delivered cross-room message id');
    await api(`/api/rooms/${sourceRoom.id}`, { method: 'DELETE' });
  });

  await step('agent reply strips repeated speaker prefix', async () => {
    const sourceMessages = await api(`/api/rooms/${room.id}/messages?limit=50`);
    const agentMessage = sourceMessages.messages.find((message) => message.senderName === templateAgent.name && message.senderType === 'agent');
    assert(agentMessage, 'agent message should exist for prefix assertion');
    const escapedName = escapeRegExp(templateAgent.name);
    const repeatedPrefix = new RegExp(`^(?:${escapedName}\\s*[:：]\\s*){2,}`, 'i');
    assert(!repeatedPrefix.test(String(agentMessage.content ?? '').trimStart()), 'agent message should not store repeated speaker prefixes');
  });

  await step('room message without skill does not deliver', async () => {
    const provider = await ensureProvider();
    const noMessageRole = await api('/api/roles', {
      method: 'POST',
      body: {
        name: `Smoke No Message ${runId}`,
        description: 'Role without agent.message',
        systemPrompt: 'You are a smoke role without room messaging.',
        skillIds: ['provider.chat', 'workspace.read']
      }
    });
    const noMessageAgent = await api('/api/agents', {
      method: 'POST',
      body: {
        name: `SmokeNoMessage${runId.replace(/[^a-zA-Z0-9]/g, '')}`,
        roleId: noMessageRole.id,
        providerId: provider.id,
        model: provider.defaultModel,
        roomId: room.id
      }
    });
    await api(`/api/rooms/${room.id}/dispatch`, {
      method: 'POST',
      body: {
        content: `@${noMessageAgent.name} Send a room message to ${room.name}.`,
        senderName: 'Smoke'
      }
    });
    const run = await api(`/api/rooms/${room.id}/agent-runs`, {
      method: 'POST',
      body: {
        agentId: noMessageAgent.id,
        maxTurns: 1
      }
    });
    const completedRun = await waitForRunStatus(room.id, run.run.id, ['failed', 'done']);
    const messages = await api(`/api/rooms/${room.id}/messages?limit=50`);
    const failureNotice = messages.messages.some((message) => String(message.content ?? '').includes('Room message failed') && String(message.content ?? '').includes('agent_missing_agent_message_skill'));
    const unauthorizedDelivery = messages.messages.some((message) =>
      message.senderName === noMessageAgent.name &&
      String(message.content ?? '').includes('[agentim-room-message') &&
      String(message.content ?? '').includes('inline cross-room smoke delivered')
    );
    assert(failureNotice || completedRun.status === 'done', 'run should either report the blocked room message or complete without attempting delivery');
    assert(!unauthorizedDelivery, 'agent without agent.message should not deliver a cross-room message');
    await api(`/api/agents/${noMessageAgent.id}`, { method: 'DELETE' });
    await api(`/api/roles/${noMessageRole.id}`, { method: 'DELETE' });
  });
}

async function api(path, options = {}) {
  const res = await rawApi(path, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${res.status} ${data.error ?? text}`);
  }
  return data;
}

async function rawApi(path, options = {}) {
  const headers = options.body ? { 'content-type': 'application/json' } : {};
  const cookie = options.cookie === undefined ? cookieHeader : options.cookie;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    cookieHeader = setCookie.split(';')[0];
  }
  return res;
}

async function fetchWithAuth(url, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (cookieHeader) headers.cookie = cookieHeader;
  return fetch(url, { ...options, headers });
}

async function waitForSseEvent(predicate, trigger, timeoutMs = 7000) {
  const controller = new AbortController();
  const res = await fetchWithAuth(`${baseUrl}/api/events`, {
    signal: controller.signal
  });
  assert(res.ok, `events stream should return 2xx, got ${res.status}`);
  assert(res.body, 'events stream should include a response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  const readLoop = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error('events stream closed before expected event');
      buffer += decoder.decode(value, { stream: true });
      let splitIndex = buffer.indexOf('\n\n');
      while (splitIndex >= 0) {
        const rawEvent = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + 2);
        const parsed = parseSseEvent(rawEvent);
        if (parsed.type === 'ready') readyResolve(parsed);
        if (predicate(parsed)) return parsed;
        splitIndex = buffer.indexOf('\n\n');
      }
    }
  })();

  try {
    await withTimeout(ready, timeoutMs, 'events stream did not become ready');
    await trigger();
    return await withTimeout(readLoop, timeoutMs, 'expected SSE event did not arrive');
  } finally {
    controller.abort();
    try {
      await reader.cancel();
    } catch {
      // The abort may close the stream before cancel resolves.
    }
  }
}

function parseSseEvent(rawEvent) {
  let type = 'message';
  const dataLines = [];
  for (const line of String(rawEvent ?? '').split('\n')) {
    if (line.startsWith('event:')) type = line.slice('event:'.length).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
  }
  const dataText = dataLines.join('\n');
  const data = dataText ? JSON.parse(dataText) : {};
  return {
    type,
    data,
    payload: data.payload ?? {}
  };
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function setApprovalMode(mode) {
  return api('/api/settings', {
    method: 'PATCH',
    body: {
      approvals: { mode }
    }
  });
}

async function ensureProvider() {
  if (createdProvider?.id) return createdProvider;
  createdProvider = await api('/api/model-providers', {
    method: 'POST',
    body: {
      name: `Smoke Provider ${runId}`,
      baseUrl: 'mock://provider',
      apiKey: 'mock-key',
      defaultModel: 'mock-agent',
      models: [{ id: 'mock-agent', name: 'mock-agent' }]
    }
  });
  return createdProvider;
}

async function waitForRestrictedRunFailure(roomId, agentId) {
  const deadline = Date.now() + 10000;
  let latestRun = null;
  while (Date.now() < deadline) {
    const runs = await api(`/api/rooms/${roomId}/agent-runs`);
    const run = runs
      .filter((item) => item.agentId === agentId)
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
    latestRun = run;
    if (run?.status === 'failed') {
      assert(String(run.error ?? '').includes('agent_missing_workspace_write_skill'), 'run should fail for missing workspace.write');
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`restricted agent run did not fail in time; latest=${JSON.stringify(latestRun)}`);
}

async function waitForRunStatus(roomId, runId, statuses) {
  const wanted = new Set(statuses);
  const deadline = Date.now() + 10000;
  let latest = null;
  while (Date.now() < deadline) {
    const runs = await api(`/api/rooms/${roomId}/agent-runs`);
    latest = runs.find((item) => item.id === runId);
    if (latest && wanted.has(latest.status)) return latest;
    if (latest?.status === 'failed') throw new Error(`run failed: ${latest.error}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`run did not reach ${statuses.join('/')} in time; latest=${JSON.stringify(latest)}`);
}

async function step(name, fn) {
  process.stdout.write(`- ${name}... `);
  await fn();
  process.stdout.write('ok\n');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function encodePath(value) {
  return String(value ?? '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function cleanup() {
  if (templateRoom?.id) {
    await api(`/api/rooms/${templateRoom.id}`, { method: 'DELETE' });
  }
  for (const agent of templateRoomAgents) {
    if (agent?.id) await api(`/api/agents/${agent.id}`, { method: 'DELETE' });
  }
  for (const role of templateRoomRoles) {
    if (role?.id) await api(`/api/roles/${role.id}`, { method: 'DELETE' });
  }
  if (templateAgent?.id) {
    await api(`/api/agents/${templateAgent.id}`, { method: 'DELETE' });
  }
  if (templateRole?.id) {
    await api(`/api/roles/${templateRole.id}`, { method: 'DELETE' });
  }
  if (restrictedAgent?.id) {
    await api(`/api/agents/${restrictedAgent.id}`, { method: 'DELETE' });
  }
  if (restrictedRole?.id) {
    await api(`/api/roles/${restrictedRole.id}`, { method: 'DELETE' });
  }
  if (createdProvider?.id) {
    await api(`/api/model-providers/${createdProvider.id}`, { method: 'DELETE' });
  }
  if (originalSettings?.approvals?.mode) {
    await setApprovalMode(originalSettings.approvals.mode);
  }
  if (room?.id) {
    await api(`/api/rooms/${room.id}`, { method: 'DELETE' });
  }
}

main()
  .then(async () => {
    await cleanup();
    console.log('Smoke test passed.');
  })
  .catch(async (error) => {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error(`Cleanup failed: ${cleanupError.message}`);
    }
    console.error(error);
    process.exitCode = 1;
  });
