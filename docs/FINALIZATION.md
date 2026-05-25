# Finalization Checklist

AgentIM is in the final stabilization phase. The goal is to keep the current Web-first product slice reliable, usable, and easy to verify before adding larger platform integrations.

## Current Priority

Finish and polish the existing AgentIM product slice before expanding to new project domains.

Order of work:

1. Stabilize existing high-priority gaps in chat, Rooms, workspace resources, projects, artifacts, approvals, Circles, and template creation.
2. Productize the current UI and mobile behavior enough for daily use.
3. Run and maintain `pnpm run check`, `pnpm run smoke`, and a focused manual UI pass.
4. Only after the above is clean, expand Circles into broader project workspace presets for non-software domains such as AI short films, media campaigns, research, courses, games, and brand work.

Cross-domain expansion should use the existing Circle concept instead of adding a competing module. A future Circle can define goals, rules, phases, default workspace files, deliverables, recommended Agents, recommended Skills, and an initial guidance message.

## Product-Ready Scope

The current release candidate includes:

- OpenAI-compatible provider management, model refresh, global proxy, and timeout settings.
- Agent, Role, Skill, Room, DM, and group chat management.
- Multi-Agent room dispatch with Agent-to-Agent and cross-room messaging.
- Persistent chat, run, task, project, artifact, skill invocation, and approval records in SQLite.
- Room workspace file list, read, write, delete, mkdir, preview, export zip, and artifact downloads.
- Project creation, project task dispatch, delivery artifact generation, and project package download.
- Scheduled tasks, recurring tasks, dependency-aware task plans, and persisted background recovery.
- Approval modes: `off`, `auto`, `balanced`, and `strict`.
- Room inspector for files, preview, projects, artifacts, tasks, Agent status, Activity, and pending approvals.
- Circles with search, category filtering, preview, configurable Room name, Provider/Model selection, and selectable Agent membership before creation.
- Custom Circles can be added from the Circles UI, persisted in SQLite-backed settings, joined like built-in Circles, and deleted without affecting existing Rooms.
- Local single-user login is enabled through a Settings-managed password. When no password is set, the app blocks the main workspace and prompts for setup. Health checks expose only minimal service status.

## Verification Commands

Run static checks:

```bash
pnpm run check
```

Start the local server:

```bash
pnpm run dev
```

With the server running, execute the smoke test:

```bash
pnpm run smoke
```

The smoke test verifies:

- API health.
- Auth status, initial password setup, and post-setup API protection.
- Room and workspace creation.
- Workspace file write/read.
- `auto` approval mode for destructive delete.
- `off` approval mode for direct delete.
- Workspace zip export.
- Agency Agents template pack listing and Agent/Role creation from a template.
- Room template creation with multiple ready-to-work Agents attached.
- Project delivery endpoints, project preview/download, project zip packaging, and delivery artifact listing.
- Cross-room Agent message delivery and failure feedback.
- Cleanup of temporary test room and restoration of the original approval mode.

The recovery smoke verifies:

- Local auth password setup against a temporary database.
- Active Agent run recovery across service restart.
- Pending message/run reconciliation after restart.

## Manual UI Pass

Before calling a build complete:

- Open `http://127.0.0.1:8787`.
- If no password is set, confirm the app blocks the main workspace and prompts to set one.
- Confirm Chats list loads rooms and DM rooms.
- Search chats by room/Agent name.
- Switch between Chats, Contacts, Resources, and Settings.
- Open a Room, send a message, and verify thinking/pending state.
- Open Circles and Agent Templates, search/filter templates, add a custom Circle, delete it, preview one built-in Circle, configure Circle Provider/Model/Agents, and create a temporary Room/Agent.
- Open Room Inspector and check Work, Files, Preview, and Artifacts.
- Create a temporary file, delete it in `auto` mode, approve it from Activity, and confirm it disappears.
- Switch Approval Mode to `off`, delete a temporary file, and confirm it deletes without approval.
- Test a narrow/mobile viewport and confirm the primary panes remain reachable.

## Deferred Items

These remain out of the current release candidate unless explicitly pulled back in:

- Cloudflare R2, Queues, Durable Objects, and production D1 deployment adapters.
- Desktop WebSocket bridge for local terminal/browser/coding-agent integrations.
- Multi-user accounts, permission roles, and provider-key encryption at rest.
- React/Vite/Next.js migration.
- Room-level Skill policy UI and enforcement.
- Formal `agent.handoff`, `web.fetch`, `code.review`, and MCP-backed skills.

## Release Rule

Do not mark the project complete unless `pnpm run check`, `pnpm run smoke`, and the manual UI pass above are all clean.
