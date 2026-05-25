# AgentIM

AgentIM is a product-level rebuild of an Agent-native IM platform. The first runnable MVP focuses on the critical path:

1. Add an OpenAI-compatible model provider.
2. Create an Agent using that provider and model.
3. Chat with the Agent in a Web conversation.
4. Receive streaming responses through a unified provider adapter.

This scaffold intentionally avoids copying any third-party app source, branding, assets, or private APIs.

## Run

```bash
pnpm run dev
```

Then open:

```text
http://localhost:8787
```

Optional runtime settings:

```bash
PORT=8787 HOST=127.0.0.1 pnpm run dev
```

## Verify

Run syntax checks:

```bash
pnpm run check
```

With the dev server running, run the product smoke test:

```bash
pnpm run smoke
```

The smoke test creates a temporary room, exercises workspace read/write/delete/export, verifies approval behavior, restores the approval mode, and deletes the temporary room.

## Structure

```text
apps/api              Node HTTP API and static Web host
apps/web/public       Web MVP
apps/desktop          Electron shell placeholder
packages/provider-sdk OpenAI-compatible provider adapter
docs                  Product and engineering notes
infra                 Deployment placeholders
```

## MVP APIs

- `GET /api/health`
- `GET /api/bootstrap`
- `POST /api/model-providers/probe`
- `POST /api/model-providers`
- `GET /api/model-providers`
- `POST /api/agents`
- `GET /api/agents`
- `POST /api/conversations`
- `GET /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- `GET /api/conversations/:id/stream?agentId=...`
