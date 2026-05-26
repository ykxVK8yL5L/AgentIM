import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../../web/public');
const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.HOST ?? '0.0.0.0';

app.use('*', serveStatic({
  root: webRoot,
  rewriteRequestPath: (requestPath) => {
    if (requestPath.startsWith('/api/')) return requestPath;
    if (requestPath === '/') return '/index.html';
    return requestPath;
  },
  onNotFound: async (_path, c) => {
    return c.env;
  }
}));

app.get('*', serveStatic({ path: `${webRoot}/index.html` }));

serve({
  fetch: app.fetch,
  port,
  hostname
}, (info) => {
  console.log(`AgentIM Hono dev server listening on http://${info.address}:${info.port}`);
});
