const proxyAgents = new Map();

export async function createProviderFetch(store) {
  const settings = await store.getSettings();
  const proxyUrl = String(settings?.network?.proxyUrl ?? '').trim();
  if (!settings?.network?.proxyEnabled || !proxyUrl) return undefined;

  const parsed = new URL(proxyUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('proxy_url_must_be_http_or_https');
  }

  const { ProxyAgent, fetch: undiciFetch } = await import('undici');
  let dispatcher = proxyAgents.get(proxyUrl);
  if (!dispatcher) {
    dispatcher = new ProxyAgent(proxyUrl);
    proxyAgents.set(proxyUrl, dispatcher);
  }

  return (input, init = {}) => undiciFetch(input, {
    ...init,
    dispatcher
  });
}

export async function createProviderDeps(store) {
  const settings = await store.getSettings();
  const proxyEnabled = Boolean(settings?.network?.proxyEnabled && settings?.network?.proxyUrl);
  return {
    fetch: await createProviderFetch(store),
    timeoutMs: normalizeProviderTimeout(settings?.network?.providerTimeoutMs),
    proxyEnabled,
    proxyStreamingSupported: !proxyEnabled || isProxyStreamingSupported()
  };
}

function normalizeProviderTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 300000;
  return Math.max(Math.round(number), 5000);
}

function isProxyStreamingSupported() {
  const nodeVersion = globalThis.process?.versions?.node;
  if (!nodeVersion) return true;

  const major = Number(nodeVersion.split('.')[0]);
  if (!Number.isFinite(major)) return false;
  return major >= 22;
}
