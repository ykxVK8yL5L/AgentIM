import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = Number(process.env.AGENTIM_RECOVERY_PORT ?? 18787);
const baseUrl = `http://127.0.0.1:${port}`;
const runId = `recovery-${Date.now()}`;
const cwd = path.resolve(new URL('..', import.meta.url).pathname);
const dbDir = await mkdtemp(path.join(os.tmpdir(), 'agentim-recovery-'));
const dbPath = path.join(dbDir, 'agentim.sqlite');
const recoveryPassword = `secret-${runId}`;
let cookieHeader = '';

let server = null;
let room = null;
let provider = null;
let agent = null;
let originalSettings = null;

async function main() {
  await step('start server', async () => {
    server = await startServer();
    await waitForHealth();
  });

  await step('setup auth password', async () => {
    const result = await api('/api/auth/password', {
      method: 'POST',
      body: { password: recoveryPassword }
    });
    assert(result.auth?.passwordSet, 'password should be set');
  });

  originalSettings = await api('/api/settings');

  await step('create slow mock run', async () => {
    await api('/api/settings', {
      method: 'PATCH',
      body: {
        network: { providerTimeoutMs: 60000 },
        approvals: { mode: 'off' }
      }
    });
    room = await api('/api/rooms', {
      method: 'POST',
      body: {
        name: `Recovery ${runId}`,
        type: 'group',
        description: 'Recovery smoke room'
      }
    });
    provider = await api('/api/model-providers', {
      method: 'POST',
      body: {
        name: `Recovery Provider ${runId}`,
        baseUrl: 'mock://provider',
        apiKey: 'mock-key',
        defaultModel: 'mock-agent',
        models: [{ id: 'mock-agent', name: 'mock-agent' }]
      }
    });
    agent = await api('/api/agents', {
      method: 'POST',
      body: {
        name: `RecoveryAgent${Date.now()}`,
        roleId: 'general',
        providerId: provider.id,
        model: provider.defaultModel,
        roomId: room.id
      }
    });
    await api(`/api/rooms/${room.id}/agents`, {
      method: 'POST',
      body: {
        agentId: agent.id,
        triggerMode: 'manual'
      }
    }).catch(() => null);
    await api(`/api/rooms/${room.id}/dispatch`, {
      method: 'POST',
      body: {
        content: `@${agent.name} run a long recovery smoke response`,
        senderName: 'Recovery Smoke'
      }
    });
    await api(`/api/rooms/${room.id}/agent-runs`, {
      method: 'POST',
      body: {
        agentId: agent.id,
        maxTurns: 1
      }
    });
    const run = await waitForRunStatus(['running']);
    assert(run.messageId, 'running run should be linked to a message');
  });

  await step('restart during active run', async () => {
    await stopServer();
    server = await startServer();
    await waitForHealth();
    const recovered = await waitForRunStatus(['queued', 'running']);
    assert(recovered.recoveredAt, 'run should record recoveredAt after restart');
    const page = await api(`/api/rooms/${room.id}/messages?limit=20`);
    const message = page.messages.find((item) => item.runId === recovered.id);
    assert(message?.pending === true || message?.status === 'queued' || message?.status === 'running', 'linked message should remain pending after recovery');
  });

  await step('complete recovered run', async () => {
    const done = await waitForRunStatus(['done'], 45000);
    assert(done.attempts >= 1, 'done run should have attempts');
    const page = await api(`/api/rooms/${room.id}/messages?limit=20`);
    const message = page.messages.find((item) => item.runId === done.id);
    assert(message?.status === 'done' && message.pending === false, 'linked message should finish');
    assert(String(message.content ?? '').trim() && message.content !== 'Thinking...', 'finished message should contain a real reply');
  });
}

async function startServer() {
  const child = spawn('node', ['apps/api/src/server.js'], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      AGENTIM_DB_PATH: dbPath,
      AGENTIM_MOCK_REPEAT: '8',
      AGENTIM_MOCK_DELAY_MS: '80'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  return child;
}

async function stopServer() {
  if (!server || server.killed) return;
  server.kill('SIGTERM');
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 3000);
    server.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  server = null;
}

async function waitForHealth() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const health = await api('/api/health');
      if (health.ok) return health;
    } catch {
      await sleep(150);
    }
  }
  throw new Error('server health did not become ready');
}

async function waitForRunStatus(statuses, timeoutMs = 12000) {
  const wanted = new Set(statuses);
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    const runs = await api(`/api/rooms/${room.id}/agent-runs`);
    latest = runs
      .filter((item) => item.agentId === agent.id)
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
    if (latest && wanted.has(latest.status)) return latest;
    if (latest?.status === 'failed') {
      throw new Error(`run failed while waiting for ${statuses.join('/')}: ${latest.error}`);
    }
    await sleep(250);
  }
  throw new Error(`run did not reach ${statuses.join('/')} in time; latest=${JSON.stringify(latest)}`);
}

async function api(pathname, options = {}) {
  const headers = options.body ? { 'content-type': 'application/json' } : {};
  if (cookieHeader) headers.cookie = cookieHeader;
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    cookieHeader = setCookie.split(';')[0];
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${pathname} failed: ${res.status} ${data.error ?? text}`);
  }
  return data;
}

async function step(name, fn) {
  process.stdout.write(`- ${name}... `);
  await fn();
  process.stdout.write('ok\n');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanup() {
  try {
    if (originalSettings) {
      await api('/api/settings', { method: 'PATCH', body: originalSettings }).catch(() => null);
    }
    if (room?.id) await api(`/api/rooms/${room.id}`, { method: 'DELETE' }).catch(() => null);
    if (agent?.id) await api(`/api/agents/${agent.id}`, { method: 'DELETE' }).catch(() => null);
    if (provider?.id) await api(`/api/model-providers/${provider.id}`, { method: 'DELETE' }).catch(() => null);
  } finally {
    await stopServer();
  }
}

main()
  .then(async () => {
    await cleanup();
    console.log('Recovery smoke test passed.');
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
