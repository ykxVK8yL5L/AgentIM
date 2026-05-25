import { getRuntimeKey } from 'hono/adapter';
import { D1Store } from './d1-store.js';
import { MemoryStore } from './memory-store.js';

const storeCache = new WeakMap();
let nodeStore = null;
let memoryStore = null;

export async function createStore(c) {
  const runtime = getRuntimeKey();

  if (runtime === 'workerd' && c?.env?.DB) {
    if (!storeCache.has(c.env.DB)) {
      storeCache.set(c.env.DB, new D1Store(c.env.DB));
    }
    return storeCache.get(c.env.DB);
  }

  if (runtime === 'node') {
    const { SQLiteStore } = await import('./sqlite-store.js');
    nodeStore ??= new SQLiteStore(process.env.AGENTIM_DB_PATH);
    return nodeStore;
  }

  memoryStore ??= new MemoryStore();
  return memoryStore;
}
