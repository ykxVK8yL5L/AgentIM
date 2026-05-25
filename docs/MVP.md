# MVP Notes

## Product Slice

The first product slice is Web-first:

- A provider settings panel for OpenAI-compatible endpoints.
- A lightweight Agent creation form.
- A Room surface with streaming Agent replies.
- Room and Agent lists for multi-room, multi-agent management.
- A runtime-aware store layer: SQLite for local Node, D1 for Cloudflare later, Memory for tests.

## Provider Contract

Provider settings are user-owned:

- `name`
- `baseUrl`
- `apiKey`
- `protocol`
- `defaultModel`

The adapter normalizes base URLs, probes `/models`, and streams `/chat/completions`.

## Cloud Agent Development Room

AgentIM should support cloud development rooms, not only chat rooms.

Target behavior:

- A user creates a development Room.
- The Room owns or links to one cloud workspace.
- Multiple cloud Agents can join the Room.
- Agents can talk to the user and to each other inside the Room.
- Agents can read and write workspace files through controlled tools.
- The user can inspect the file tree in Web.
- The user can open files, download individual files, or export the whole workspace as a zip.
- Later, the same workspace can support command execution, app preview, and deployment.

MVP stance:

- Keep Cloudflare/R2/Durable Object adapters out of scope for now.
- Define the storage interface now, then implement `LocalWorkspaceStorage`.
- Keep routes stable so later cloud storage adapters can replace local storage.

## Workspace Storage Compatibility Layer

File operations must go through a compatibility layer, just like the database store.

```ts
export interface WorkspaceStorage {
  listFiles(workspaceId: string, path?: string): Promise<FileNode[]>
  readFile(workspaceId: string, path: string): Promise<string | Uint8Array>
  writeFile(workspaceId: string, path: string, content: string | Uint8Array): Promise<void>
  deleteFile(workspaceId: string, path: string): Promise<void>
  makeDirectory(workspaceId: string, path: string): Promise<void>
  exportZip(workspaceId: string): Promise<ReadableStream | Blob>
}
```

Initial adapter:

- `LocalWorkspaceStorage` implemented
- Root: `apps/api/data/workspaces/<workspaceId>/`

Future adapters:

- `R2WorkspaceStorage`
- `S3WorkspaceStorage`
- `DurableObjectWorkspaceStorage`

## Workspace APIs

Implemented API surface:

- `GET /api/rooms/:roomId/workspace`
- `GET /api/rooms/:roomId/files?path=src`
- `GET /api/rooms/:roomId/files/read?path=src/index.ts`
- `GET /api/rooms/:roomId/preview/src/index.html`
- `PUT /api/rooms/:roomId/files/write`
- `DELETE /api/rooms/:roomId/files?path=src/index.ts`
- `POST /api/rooms/:roomId/files/mkdir`
- `GET /api/rooms/:roomId/export.zip`

Current Web UI:

- Right-side Workspace panel per active Room.
- Lists files and directories for the current path.
- Opens text files into an editor.
- Saves file content through the workspace API.
- Creates directories.
- Deletes the selected file/path.
- Exports the whole workspace as a zip.
- Preview panel renders workspace HTML/SVG/text artifacts through a sandboxed iframe backed by the preview API. Relative HTML assets resolve through the same preview route.

## Agent Workspace Writes

Implemented MVP behavior:

- Hosted Agent responses can request workspace file writes through a controlled fenced block.
- Hosted Agent responses can create directories and multiple files in a single run, enough for small project scaffolds.
- Agent prompts include the current workspace file tree so Agents can see existing project paths before writing.
- The backend parses the block after the Agent run completes, validates the relative path through `WorkspaceStorage`, writes the file, and creates a system message summarizing the updated paths.

Protocol:

````md
```agentim-mkdir path="relative/dir"```

```agentim-write-file path="relative/path.txt"
file contents here
```
````

Guardrails:

- Only relative paths are allowed.
- Absolute paths and parent directory paths are rejected by the storage layer.
- A single response is limited to a bounded number of workspace actions.
- This is a transitional protocol before formal tool calling.

Product requirement:

- Users should not need to know or type the `agentim-mkdir` / `agentim-write-file` protocol.
- The user-facing workflow should allow natural language requests such as "create a preview card widget" or "build a small page in the workspace".
- Agent system prompts should explain the internal workspace write protocol so Agents emit it automatically when the task requires file creation.
- The Web chat should hide or collapse raw workspace protocol blocks by default and instead show a friendly artifact card: updated files, created directories, and previewable entry points.
- When an Agent creates a previewable artifact such as `*.html` or `*.svg`, the message should expose a direct "Preview" action that opens the Workspace Preview panel for that file.
- Raw protocol blocks should remain inspectable for debugging, but not be the normal product experience.

Current Web UI:

- Agent workspace protocol blocks render as artifact cards with file/directory rows.
- Raw protocol remains available inside a collapsed debug detail.
- Previewable file rows expose a `Preview` action.
- File rows expose an `Open File` action.
- System `Workspace updated` messages also render as artifact cards.
- Workspace includes a functional Project creation form that lets the user select an Agent, project type, project name, and brief.
- Project creation creates a structured `Project Request` room message and starts the selected Agent so the user does not need to remember the workspace protocol.
- Projects now use a stable root folder convention: `projects/<project-slug>/`.
- Project creation persists a `projects` record, creates the root folder, generates phase-based `project_tasks`, and starts the first ready task through a backend Project Orchestrator.
- Project phases are assigned by Role first: Product Manager, Designer, Full-stack Developer, and Reviewer. If a matching Role Agent is not in the Room, the selected fallback Agent is used.
- Project distribution is now previewable before creation. The backend exposes the template phases, role-to-Agent assignments, exact role matches, fallback assignments, and missing Role Agents so users can understand how work will be dispatched before starting a project.
- Project creation stores and announces the resolved distribution in the Room as a system message. This makes multi-Agent dispatch auditable from the chat stream instead of hiding assignment decisions inside the backend.
- Project tasks now support explicit dependency arrays. New project templates are dependency-driven instead of strictly linear: Product runs first, Design and Development can become ready together when the template allows it, and Review can depend on both.
- The Project Orchestrator starts every queued task whose dependencies are done. Actual run execution is still bounded by the global Agent run concurrency limit, so project work can be parallel without overwhelming provider calls.
- Agent run completion advances dependent project tasks automatically. When all project tasks are done, the project status becomes `done`; failed tasks mark the project `failed`.
- The Web UI shows a basic Project list, Project Task list, and Agent Work Center so active/queued/failed project work is visible outside the chat stream.
- Project list now supports opening the project folder, opening the preview entry, archiving projects, and deleting project records with an optional project-folder cleanup.
- Project tasks now expose basic controls: Stop running task, Retry task and downstream dependent tasks, and Reassign non-running tasks to another Agent in the Room. The UI also shows dependency labels such as `starts first` or `after design, development`.
- Agent Work Center is now grouped by Agent. Each Agent shows a coarse work state (`idle`, `running`, `ready`, `waiting`, `failed`) plus counts for running, ready, waiting, and failed project tasks.
- Queued project tasks are classified in the UI as `ready` when all dependencies are done, or `waiting dependencies` when they are blocked by unfinished upstream work.
- Agent Work Center now distinguishes queued chat runs as `waiting` instead of showing every live run as `running`, and it only exposes `Run Now` for scheduled tasks that the backend can actually run.
- Project creation messages now include a structured `agentim-project-created` payload. The Web chat renders it as a project distribution card with phase assignments, role matches/fallbacks, missing roles, dependency labels, and Files/Page shortcuts.
- Project list and the active Room inspector now render Project Progress Cards. These cards show project status, completion percentage, phase status, assigned Agent, dependency state, timing, and errors. The full Project view exposes phase-level Stop, Retry, and Reassign actions directly from the card.
- The Project Orchestrator writes compact system events when a project finishes or fails. The Web chat renders these as project status cards with progress, Files, and Page actions.
- Project output summaries are now available through `GET /api/projects/:id/outputs`. The backend recursively scans the project root, counts files, counts previewable files, discovers the best preview entry, and returns recent files plus recent project artifacts.
- Project Progress Cards show output summary chips, recent files, recent artifacts, and use the discovered preview entry for the Page action when available.
- Review phase task context now includes a project output summary: file count, previewable count, best preview entry, recent files, and recent artifacts. This lets reviewer Agents inspect the real produced project rather than only previous text summaries.
- Project delivery is now exposed through `GET /api/projects/:id/delivery`. It returns project metadata, task counts, task results, review summary, output summary, preview entry, and a project download URL.
- Project delivery can also be materialized into the workspace through `POST /api/projects/:id/delivery-file`, which writes `DELIVERY.md` into the project root and registers it as a project delivery artifact.
- When all project tasks finish successfully, the Project Orchestrator now automatically writes `DELIVERY.md`, registers a delivery artifact, and includes Delivery/Download actions in the project completion system message.
- Project exports are available through `GET /api/projects/:id/export.zip`, which downloads only the project root instead of the whole Room workspace.
- Workspace files and Artifacts now support direct download through `GET /api/rooms/:roomId/files/download?path=...`, so generated outputs can be opened, previewed, or saved from Resources, Project cards, and the Room inspector.
- The main smoke test now covers the project delivery loop end to end: project output discovery, `GET /api/projects/:id/delivery`, `POST /api/projects/:id/delivery-file`, preview serving, file download, project zip download, and delivery artifact listing.
- End-to-end project testing created `E2E Test Landing`. Product phase completed, wrote `projects/e2e-test-landing/SCOPE.md`, and Project Output Summary updated from empty to `1 files / 1 previewable / 1 artifacts`.
- Agent run recovery now cleans stale `provider.chat` invocations for the same run before starting a recovered attempt, so Activity no longer leaves duplicate running provider calls after a server restart.
- Background Agent runs now have a watchdog tied to the global provider timeout. On timeout, the run and linked project task are failed through the normal `failAgentRun` path instead of remaining indefinitely running. Recovery also fails stale running runs that have already exceeded the configured provider timeout.
- Agent run recovery now reconciles linked messages back to `queued/pending`, re-enqueues active runs, and reconciles running scheduled/project tasks against their linked runs. Tasks with finished runs are completed, tasks with active runs are resumed, and tasks missing a run are returned to a recoverable scheduled/queued state.
- The Web client treats active `agent_runs` as pending work even when the corresponding message is outside the current chat page, so refresh/reopen continues polling and shows an active response state.
- `pnpm run smoke:recovery` now runs a real restart recovery test against a temporary SQLite database. It starts a slow mock Agent run, kills and restarts the Hono server, verifies `recoveredAt` and pending message state, then waits for the recovered run to finish.
- The mock provider supports opt-in slow-mode environment variables (`AGENTIM_MOCK_REPEAT`, `AGENTIM_MOCK_DELAY_MS`) for recovery and queue testing without changing normal product behavior.

UI rebuild baseline:

- Keep the current functional surfaces during the redesign: Room/Agent/Role/Provider management, Project creation with distribution preview, Project list, Project Task list, Agent Work Center, Workspace file browser/editor/preview, scheduled tasks, artifacts, and chat.
- The redesigned UI should treat the Agent Work Center and Project views as first-class operational dashboards, not secondary debug lists.
- The active Room right-side inspector should become the near-term work status center. It should expose collapsible sections for Agents, Tasks, Projects, Files, Preview, Activity, and Artifacts, with all sections collapsed by default and fully functional when opened.
- Cross-Room Agent work should be visible from the conversation and Room inspector: source Room, target Room, delivery state, mention unread state, Agent run state, and failure feedback should not require reading backend logs.
- Cross-Room delivery feedback is now visible in the Web UI: delivered room messages render as cross-room cards with source, target, sender Agent, and `@user` mention state; conversation list rows show a cross-room notice for Rooms that received a message while inactive; Room Activity shows `agent.message` delivery source, target, status, sender, and linked message id.
- `agentim-room-message` supports the standard multi-line protocol and a tolerant same-line form. The standard form remains preferred:
  ```agentim-room-message room="Product Room"
  @user message text
  ```
- Cross-Room message execution is now observable from the source Room Activity. `agent.message` records are written as `running`, then `done` with target message id or `failed` with the concrete reason such as `room_message_target_not_found`, `agent_not_member_of_room`, or `agent_missing_agent_message_skill`.
- Cross-Room message failures also post a system notice into the source chat, for example `Room message failed to Product Room: agent_not_member_of_room:Product Room`, so users do not need to open Activity to understand why an Agent's claimed handoff did not happen.
- Agent lists show effective core skills derived from the Agent role and enabled skill registry, including whether `agent.message`, `workspace.read`, and `workspace.write` are currently missing.
- Agents with `user.request_approval` can emit `agentim-approval-request` blocks. The Web chat renders them as decision cards with Approve/Reject actions; clicking a decision replies to the requesting Agent with the decision and original message context so the conversation can continue.
- Global settings now include `approvals.mode`. The default is `auto`: ordinary low/medium-risk work executes by default, while high-risk or destructive actions should request approval. `off` disables approval checks and allows all skills to execute directly. `balanced` and `strict` modes are available for tighter policy. Agent prompts explicitly tell Agents not to ask for approval before normal project file writes, artifact generation, routine collaboration, or ordinary scheduled work.
- The data model now supports project-level orchestration, role-first Agent distribution, explicit task dependencies, background Agent runs, resumable task status, and workspace artifacts. The UI should expose these concepts directly and avoid making users infer them from chat messages alone.
- Detailed UI redesign plan: `docs/UI_REDESIGN.md`.

Write body:

```json
{
  "path": "src/index.ts",
  "content": "export const ok = true"
}
```

## Multi-Agent Collaboration

Room-Agent membership is now a core product concept.

Trigger modes:

- `manual`: user selects one Agent to reply.
- `mention`: `@AgentName` triggers the Agent.
- `roundtable`: multiple Agents reply in order.
- `handoff`: one Agent asks another Agent to continue a task.

MVP implements:

- Room list.
- Agent list.
- Attach Agent to Room.
- Manual trigger from the current Room.

Next collaboration features:

- Richer Agent-to-Agent task handoff controls.
- File change summaries.
- Workspace activity timeline.
- Downloadable code artifact.

## Scheduled Tasks And Plans

Scheduled tasks are the first implementation step toward product-grade room planning.

Implemented MVP behavior:

- A Task belongs to one Room and one Agent.
- A Task stores title, instructions, scheduled time, status, linked context message, linked Agent run, creator, timestamps, and error.
- Tasks persist in SQLite in a real indexed `scheduled_tasks` table.
- The backend starts one scheduler per store instance and checks due scheduled tasks.
- When a Task is due, the backend writes a `Scheduled Task` user-context message into the Room, then starts the selected Agent in the background.
- Task status follows the Agent run: `scheduled`, `running`, `done`, `failed`, or `cancelled`.
- Stopping a linked Agent run marks the linked running Task as failed with `agent_run_stopped`.
- Web UI exposes a functional Tasks panel in the left sidebar: select Agent, set time, write instructions, create Task, run now, and cancel scheduled Tasks.
- Room polling refreshes Task state so a browser refresh or background Agent run can still show current progress.
- Tasks support recurring `daily` and `weekly` schedules.
- A successful recurring Task schedules the next instance automatically. Failed runs do not create the next recurrence.
- Recurring Tasks keep a series link through `parentTaskId`; the Web UI can delete future scheduled instances in the series while keeping completed history.
- Agents with `task.schedule` can propose structured `agentim-task-plan` blocks. The Web chat renders these as task plan cards, and each plan item can be scheduled into the active Room task queue.
- Task plan cards include `Schedule All`, which creates every plan item in order and resolves `dependsOn` references to the newly created scheduled task ids. This lets an Agent propose a multi-step handoff plan and the user turn it into an executable dependency chain in one action.
- Scheduled Tasks now support dependency chains through `dependsOnTaskId` / `dependsOnTaskIds`. A due Task waits until all dependencies are `done`; if any dependency is missing, failed, or cancelled, the dependent Task is marked `failed` with `dependency_failed`.
- When a scheduled Task completes successfully, the scheduler immediately checks due Tasks again so dependent Agent handoffs can start without waiting for the next polling interval.
- On service restart, running scheduled Tasks are reconciled with their linked Agent run. Active runs resume, completed runs close the Task, and orphaned Tasks are rescheduled for immediate recovery instead of remaining stuck in `running`.

Implemented API surface:

- `GET /api/rooms/:roomId/tasks`
- `POST /api/rooms/:roomId/tasks`
- `POST /api/tasks/:id/run-now`
- `POST /api/tasks/:id/cancel`
- `DELETE /api/tasks/:id`
- `DELETE /api/tasks/:id/series`

Project creation API:

- `GET /api/rooms/:roomId/project-distribution?type=static-web&fallbackAgentId=<agent-id>`
- This returns the selected project template, phase list, resolved Role Agent assignments, fallback usage, and missing required roles.
- `POST /api/rooms/:roomId/projects`
- The API validates Room and Agent, resolves the project distribution, creates the project root folder, creates phase tasks, writes a structured Project Created system message, then starts ready project work in the background.
- The Web UI currently uses this endpoint from the Workspace Project panel.
- `GET /api/rooms/:roomId/projects`
- This returns both project records and project tasks for the Room.
- `POST /api/projects/:id/archive`
- `DELETE /api/projects/:id?deleteFiles=1`
- `POST /api/project-tasks/:id/retry`
- `PATCH /api/project-tasks/:id`

Product direction:

- Add task ownership and user notification rules, especially for `@user` decisions.
- Add a future queue adapter for Cloudflare Queues/Durable Objects or an external worker for long-running scheduled work.

## Agent Skills

Agent Skills are first-class product capabilities, not prompt snippets.

Target behavior:

- Users can understand and manage what each Role is responsible for.
- Agents can invoke tools, create artifacts, ask for approval, hand off work, schedule tasks, and operate on workspace files through a consistent skill system.
- Skills work across local Node, future Cloudflare runtimes, desktop bridges, and cloud-hosted Agent workers.
- Skill invocations produce structured results that the Web UI can render as cards, timelines, previews, confirmations, or downloadable artifacts.

Core concepts:

- `skill`: a reusable capability definition, such as `workspace.write`, `workspace.preview`, `workspace.export`, `agent.handoff`, `user.request_approval`, `task.schedule`, `code.review`, `web.fetch`, or `provider.chat`.
- `skill_version`: immutable implementation version so old Agent runs remain auditable and reproducible.
- `skill_runtime`: implementation adapter, such as Hono server runtime, Cloudflare Worker, Durable Object, local desktop bridge, MCP server, or external hosted service.
- `skill_schema`: typed input and output schema for validation, UI generation, and tool calling.
- `skill_policy`: permission requirements, approval rules, rate limits, workspace scope, network scope, and data access boundaries.
- `common_skill`: platform capability every Agent receives by default.
- `role`: reusable responsibility profile with name, description, and role instructions.
- `agent`: concrete Agent instance that selects a Role, provider, model, and optional prompt override.
- `room_skill_policy`: future Room-level restrictions such as denied skills or approval requirements.
- `skill_invocation`: each actual tool call, including input, output, status, errors, approval state, timestamps, actor, and linked message/run.
- `artifact`: a structured output created by skills, such as files, previews, patches, zip exports, screenshots, task plans, or scheduled jobs.

Current implementation:

- Default Skill Registry is exposed by `GET /api/skills`.
- Current built-in skills are common skills available to every Agent and cannot be disabled or deleted.
- Installed custom skills are persisted in the store, can be enabled, disabled, updated, and deleted.
- Skill install/update API accepts a product-style manifest with metadata, runtime adapter, input/output schemas, policy, UI renderer hints, risk level, and approval flag. The Web Skill list shows whether each Skill is currently `Auto` or requires approval under the global approval mode.
- Skill APIs exist: `POST /api/skills/install`, `PATCH /api/skills/:id`, `POST /api/skills/:id/enable`, `POST /api/skills/:id/disable`, `DELETE /api/skills/:id`.
- Web UI has functional Skill management: manifest install/update, list, enable, disable, and delete custom Skills.
- Skill invocation records are persisted for `provider.chat` and `workspace.write` executions.
- Room Skill Activity API/UI show recent invocation status, target, timing, and errors for audit/debugging.
- Workspace write outputs create persistent Artifact records linked to the originating invocation, run, message, Agent, and Room.
- Room Artifacts API/UI show recent file and directory artifacts with Open and Page actions for previewable files.
- Built-in Roles are exposed by `GET /api/roles`.
- Role CRUD APIs exist: `POST /api/roles`, `PATCH /api/roles/:id`, `DELETE /api/roles/:id`.
- Web UI has functional Role management: list, create, edit, and delete custom Roles.
- Built-in system Roles include General, Product Manager, Designer, Full-stack Developer, and Reviewer.
- Bootstrap includes `skills` and `roles` for the Web client.
- Agents persist `roleId`.
- Agent create/edit UI selects a Role.
- Agent list shows the Role and common skill count.
- Agent system prompts include Role instructions and enabled skill ids.

Skill lifecycle:

1. Register a skill with metadata, schemas, runtime adapter, and policy defaults.
2. Mark platform-wide baseline skills as common.
3. Create Roles that describe responsibility and behavior.
4. Create Agents by selecting a Role, provider, and model.
5. Optionally constrain or disable skills at the Room level in a future policy layer.
6. During an Agent run, expose skills allowed by common skills, Role policy, Room policy, user policy, and runtime policy.
7. Validate every invocation before execution.
8. Require explicit user approval for sensitive actions such as external network access, destructive file operations, deployment, scheduled future work, or sending data outside the workspace.
9. Execute through the selected runtime adapter.
10. Persist invocation records and artifacts.
11. Render user-friendly skill result cards in chat and Room timelines.

Product-grade skill UX:

- Agent creation starts from Role selection.
- Role management shows responsibility, default instructions, and future special skills or limits.
- Common skills are not repeatedly configured per Agent.
- Room configuration shows a future policy view for which skills are allowed in that Room.
- Chat messages show skill result cards instead of raw implementation details.
- Artifact cards provide direct actions such as Preview, Open File, Download Zip, Review Patch, Approve, Reject, Retry, Stop, or Schedule.
- Users can inspect raw invocation details when debugging, including inputs, outputs, errors, runtime, and duration.
- Skills that need approval pause the Agent run at the relevant message position and resume after approval.
- Skills that create user-visible artifacts should link into the Workspace panel, Preview panel, or Timeline.

Security and policy:

- Skill execution must be deny-by-default.
- Agent-level permission is necessary but not sufficient; Room policy and user policy must also allow the action.
- File operations must stay inside the workspace compatibility layer.
- Network-capable skills must declare destination scope and whether user data may leave the workspace.
- Destructive skills must support preview, confirmation, and audit records.
- Scheduled skills must show who scheduled them, when they will run, what they will do, and how to cancel them.
- Every invocation must be attributable to a user message, Agent run, Agent identity, Room, and workspace.

Runtime compatibility:

- Skill definitions are platform-neutral.
- Runtime adapters implement the same invocation contract on different platforms.
- Local Node can execute workspace and preview skills directly.
- Cloudflare deployments can route long-running work to Durable Objects, Queues, or external workers.
- Desktop integrations can expose local filesystem, terminal, browser, or coding-agent skills through a bridge.
- MCP-backed tools can be wrapped as skills with the same policy, approval, and artifact model.

Initial product skill catalog:

- `workspace.read`: list and read workspace files.
- `workspace.write`: create directories and write/update files.
- `workspace.delete`: delete workspace files or directories, approval-gated by default.
- `workspace.preview`: create or open previewable artifacts.
- `workspace.export`: create downloadable code artifacts.
- `artifact.card`: create structured chat cards for previews, patches, files, or task summaries.
- `agent.message`: send an Agent-to-Agent message inside a Room.
- `agent.handoff`: ask another Agent to continue a task with context.
- `user.notify`: explicitly mention or notify the human user.
- `user.request_approval`: pause for a user decision with clear approve/reject actions.
- `task.schedule`: create future or recurring Agent work.
- `code.review`: inspect code and produce review findings.
- `provider.chat`: call an OpenAI-compatible model provider.
- `web.fetch`: retrieve external web content under policy control.

Data model direction:

- `skills`
- `skill_versions`
- `skill_runtimes`
- `roles`
- `agent_roles`
- `room_skill_policies`
- `skill_invocations`
- `skill_approvals`
- `artifacts`
- `scheduled_tasks`
- `projects`
- `project_tasks`
- `artifact_links`

## Data Model Additions

Planned tables/entities:

- `rooms`
- `room_agents`
- `messages` implemented in SQLite as a real indexed table.
- `agent_runs` implemented in SQLite as a real indexed table.
- `workspaces`
- `room_workspaces`
- `workspace_files` or object-storage-backed file records
- `workspace_snapshots`
- `artifact_exports`
- `agent_workspace_permissions`
- `skills`
- `skill_versions`
- `roles`
- `agent_roles`
- `room_skill_policies`
- `skill_invocations`
- `skill_approvals`
- `artifacts`

Current SQLite persistence:

- `app_state` remains for low-volume configuration and metadata such as settings, providers, rooms, agents, workspace links, and room-agent membership.
- Global `settings.chat.messagePageSize` controls how many chat records the Web client loads per page. The default is 20, clamped to 10-100.
- Chat messages are no longer stored as one large JSON array in `app_state`.
- Agent runs are no longer stored as one large JSON array in `app_state`.
- Scheduled tasks are no longer stored as one large JSON array in `app_state`.
- Projects and project tasks are persisted in real indexed SQLite tables.
- Skill invocations for executed skills are stored in a real indexed `skill_invocations` table.
- Skill approvals are stored in a real indexed `skill_approvals` table and loaded into Room activity so pending decisions survive refreshes and service restarts.
- Artifacts created by skills are stored in a real indexed `artifacts` table.
- Existing JSON messages and runs are migrated into `messages` and `agent_runs` on startup if the real tables are empty.
- `messages` is indexed by `(room_id, created_at, id)` for room history loading.
- Chat history APIs load the newest page first and use `(createdAt, id)` cursor pagination to load older pages without pulling the full room history.

Implemented approval flow:

- Global `settings.approvals.mode` defaults to `auto`: high-risk or destructive skills require approval; low/medium routine work executes by default. `off` disables the approval gate completely.
- `workspace.delete` is the first formal approval-gated execution path. Delete requests create a `workspace.delete` invocation with `approval_required` status plus a pending `skill_approvals` record.
- Approving executes the delete through `WorkspaceStorage`, marks the invocation `done`, records the approval decision, and posts a system message. Rejecting marks the invocation `rejected`.
- Pending approvals render in Web Activity and the Room inspector with Approve/Reject actions.
- `agent_runs` is indexed by `(room_id, status, created_at)` for queue recovery and room run status.
- `scheduled_tasks` is indexed by `(status, schedule_at, id)` for due-task dispatch and `(room_id, schedule_at, id)` for Room task lists.
- `projects` is indexed by `(room_id, status, created_at)` for Project list and work center views.
- `project_tasks` is indexed by `(project_id, status, created_at)` and `run_id` for orchestration and Agent run completion.
- `skill_invocations` is indexed by `(room_id, created_at, id)` and `run_id` for Room activity and Agent run audit trails.
- `artifacts` is indexed by `(room_id, created_at, id)` and `invocation_id` for Room artifact lists and traceability.

## Next Engineering Steps

Completed for the current release candidate:

1. Add `WorkspaceStorage` and `LocalWorkspaceStorage`.
2. Create one workspace per Room.
3. Add Web Files panel.
4. Add read/write/list/export zip APIs.
5. Add Agent tool calls for controlled file writes.
6. Build the product-grade Agent Skills registry foundation with manifests, policies, invocations, approvals, and artifacts.
7. Add friendly artifact cards, workspace previews, project delivery files, and project package downloads.
8. Add verification coverage through `pnpm run check` and `pnpm run smoke`.

Deferred until after the current stabilization pass:

1. Add auth and user-owned provider encryption.
2. Move static Web to Next.js or Vite React.
3. Add Desktop WebSocket bridge for local Codex/Claude runtime.
4. Add richer Widget iframe state APIs for interactive app previews.
5. Add Cloudflare/R2/Durable Object/Queue production adapters.
