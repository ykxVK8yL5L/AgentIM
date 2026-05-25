const DEFAULT_TIMEOUT_MS = 15000;

export function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('baseUrl is required');
  }

  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('baseUrl must start with http:// or https://');
  }
  return parsed.toString().replace(/\/+$/, '');
}

export async function probeOpenAICompatibleProvider(input, deps = {}) {
  const modelsResult = await listOpenAICompatibleModels(input, deps);
  if (!modelsResult.ok) return modelsResult;

  return {
    ok: true,
    protocol: 'openai_chat_completions',
    normalizedBaseUrl: modelsResult.normalizedBaseUrl,
    models: modelsResult.models
  };
}

export async function listOpenAICompatibleModels(input, deps = {}) {
  const fetchFn = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = String(input.apiKey ?? '').trim();

  if (!apiKey) {
    return {
      ok: false,
      stage: 'auth',
      message: 'missing_api_key',
      manualModelAllowed: true
    };
  }

  const controller = new AbortController();
  const releaseSignal = linkAbortSignal(input.signal, controller);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      signal: controller.signal,
      redirect: 'manual'
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        stage: 'auth',
        message: 'invalid_api_key',
        httpStatus: res.status,
        manualModelAllowed: true
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        stage: 'network',
        message: 'models_endpoint_failed',
        httpStatus: res.status,
        manualModelAllowed: true
      };
    }

    const body = await res.json();
    const rows = Array.isArray(body?.data) ? body.data : [];
    const seenModelIds = new Set();
    const models = rows
      .filter((m) => m && typeof m.id === 'string')
      .map((m) => ({
        id: m.id,
        name: typeof m.name === 'string' ? m.name : m.id
      }))
      .filter((model) => {
        if (seenModelIds.has(model.id)) return false;
        seenModelIds.add(model.id);
        return true;
      });

    if (models.length === 0) {
      return {
        ok: false,
        stage: 'parse',
        message: 'empty_models_list',
        manualModelAllowed: true
      };
    }

    return {
      ok: true,
      normalizedBaseUrl: baseUrl,
      models
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      stage: aborted ? 'timeout' : 'network',
      message: aborted ? 'timeout' : 'network_error',
      manualModelAllowed: true
    };
  } finally {
    releaseSignal();
    clearTimeout(timeout);
  }
}

export async function* streamOpenAICompatibleChat(input, deps = {}) {
  const fetchFn = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = String(input.apiKey ?? '').trim();

  if (!apiKey) {
    throw new Error('apiKey is required');
  }

  const controller = new AbortController();
  const releaseSignal = linkAbortSignal(input.signal, controller);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens,
        stream: true
      }),
      signal: controller.signal
    });
  } catch (error) {
    releaseSignal();
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('provider_request_failed:timeout');
    }
    throw error;
  }

  if (!res.ok || !res.body) {
    releaseSignal();
    clearTimeout(timeout);
    const detail = await safeReadText(res);
    throw new Error(`provider_request_failed:${res.status}:${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (error) {
      releaseSignal();
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('provider_request_failed:timeout');
      }
      throw error;
    }
    const { value, done } = chunk;
    if (done) {
      releaseSignal();
      clearTimeout(timeout);
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') {
        releaseSignal();
        clearTimeout(timeout);
        yield { type: 'done' };
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      const choice = parsed.choices?.[0];
      const text = choice?.delta?.content ?? choice?.message?.content ?? '';
      if (text) {
        yield { type: 'text_delta', text };
      }

      if (parsed.usage) {
        yield {
          type: 'usage',
          inputTokens: parsed.usage.prompt_tokens ?? 0,
          outputTokens: parsed.usage.completion_tokens ?? 0
        };
      }
    }
  }

  releaseSignal();
  clearTimeout(timeout);
  yield { type: 'done' };
}

export async function createOpenAICompatibleChat(input, deps = {}) {
  const fetchFn = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = String(input.apiKey ?? '').trim();

  if (!apiKey) {
    throw new Error('apiKey is required');
  }

  const controller = new AbortController();
  const releaseSignal = linkAbortSignal(input.signal, controller);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 80,
        stream: false
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const detail = await safeReadText(res);
      throw new Error(`provider_request_failed:${res.status}:${detail.slice(0, 300)}`);
    }

    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content ?? '';
    return {
      id: body?.id,
      model: body?.model ?? input.model,
      content: String(content),
      usage: body?.usage
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('provider_request_failed:timeout');
    }
    throw error;
  } finally {
    releaseSignal();
    clearTimeout(timeout);
  }
}

function linkAbortSignal(sourceSignal, controller) {
  if (!sourceSignal) return () => {};
  if (sourceSignal.aborted) {
    controller.abort();
    return () => {};
  }
  const abort = () => controller.abort();
  sourceSignal.addEventListener('abort', abort, { once: true });
  return () => sourceSignal.removeEventListener('abort', abort);
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
