# Agency Agents Integration Plan

Source project: `msitarzewski/agency-agents`

## Fit

The project is a strong fit for AgentIM as an optional Agent/Role template pack. It provides many specialized agent personas across engineering, product, design, marketing, sales, support, finance, testing, strategy, and more.

Do not merge it as hard-coded built-in roles. Treat it as an installable template catalog so AgentIM can keep its own core roles clean while still letting users import richer specialists.

## Recommended Product Shape

Add a new concept:

- `agent_template_pack`: a named catalog of reusable Agent templates.
- `agent_template`: an importable template with name, description, category, source, license, instructions, suggested skills, and optional metadata.

User flow:

1. User opens Settings -> Role or Agent Templates.
2. User imports or enables the `Agency Agents` pack.
3. Templates appear grouped by category.
4. User selects a template such as Product Manager, Frontend Developer, Backend Architect, UI Designer, Code Reviewer, or QA/Test Engineer.
5. AgentIM creates a normal Agent using the selected provider/model, with the template instructions copied into the Agent/Role prompt.

## Role, Skill, Template, Circle Relationship

- `Skill` is a capability, such as workspace read/write, Agent messaging, artifact cards, provider chat, or future web/code/MCP tools.
- `Role` is the actual reusable behavior profile used by Agents. It owns long-term instructions and a role-level skill policy (`skillIds`).
- `Agent Template` is not a runtime role. It is a preset used to create a normal Role plus a normal Agent.
- `Circle` is a higher-level preset. It creates a Room, workspace, multiple Roles, multiple Agents, and Room memberships from a curated goal/rule/Agent bundle.

This means Templates and Circles should not compete with Roles. They are creation shortcuts. After creation, the user manages the generated Role and Agent through the normal Role/Agent UI.

Current implementation detail:

- Skills remain registered globally, but execution is now governed by the Agent's Role.
- `Role.skillIds` is the runtime allow-list for Agent-controlled actions such as workspace read/write and Agent messaging.
- System default Roles include a standard skill set so existing general Agents keep normal read/write/collaboration behavior.
- Agency Agent templates populate generated Roles with suggested `skillIds`; those IDs now affect runtime capability, not only prompt text.
- The Role editor exposes Role Skills, so new Roles can be created with explicit executable capabilities.
- A Role without `workspace.write` cannot successfully execute AgentIM workspace write blocks even if the model emits them.

## Adding New Circles

Current implementation:

- Built-in Circles are defined in `apps/api/src/agent-templates/room-templates.js`.
- Add a new item to `ROOM_TEMPLATES` with:
  - `id`: stable unique ID.
  - `name`: user-facing Circle name.
  - `category`: filter category such as `software`, `media`, `research`, or `brand`.
  - `description`: short card summary.
  - `roomName`: default Room name after joining.
  - `roomDescription`: Room description.
  - `agentTemplateIds`: Agent Template IDs to include.
- Each `agentTemplateId` must exist in `apps/api/src/agent-templates/agency-agents.js` or another registered Agent Template pack.

Near-term product direction:

- Keep Circles as a template catalog, but move authoring from code into persisted data.
- Add a Circle editor/import flow that can create Circles from JSON.
- Let each Circle define goals, rules, phases, default workspace files, deliverables, recommended Skills, and per-Agent model recommendations.
- Keep code-defined Circles as built-in defaults, while user-created Circles live in the database.

## Data Model

Add to `app_state` first, then move to real tables if the catalog grows:

```ts
agentTemplatePacks: Array<{
  id: string
  name: string
  sourceUrl: string
  license: string
  enabled: boolean
  importedAt: string
}>

agentTemplates: Array<{
  id: string
  packId: string
  name: string
  category: string
  description: string
  systemPrompt: string
  suggestedSkillIds: string[]
  sourcePath: string
  sourceUrl: string
  license: string
  attribution: string
}>
```

## API

Short-term local-pack APIs:

- `GET /api/agent-template-packs`
- `POST /api/agent-template-packs/agency-agents/install`
- `GET /api/agent-templates?packId=agency-agents`
- `POST /api/agent-templates/:id/create-agent`

Later remote import APIs:

- `POST /api/agent-template-packs/import-url`
- `POST /api/agent-template-packs/:id/refresh`

Remote imports should require approval unless Approval Mode is `off`.

## Mapping Rules

Agency Agents markdown files typically contain frontmatter and long role instructions.

Map:

- frontmatter `name` -> template name
- frontmatter `description` -> template description
- directory name -> category
- markdown body -> system prompt
- frontmatter `tools` -> suggested AgentIM skills

Suggested skill mapping:

- `Read` -> `workspace.read`
- `Write`, `Edit` -> `workspace.write`
- `WebFetch`, `WebSearch` -> future `web.fetch`
- review-oriented templates -> future `code.review`

## Licensing

The source repository uses MIT. Imported templates must preserve attribution and license metadata. If AgentIM bundles a curated subset, include a third-party notice in docs and in the template pack metadata.

## First Curated Pack

Start with a small, useful set instead of importing the entire catalog:

- Product Manager
- Frontend Developer
- Backend Architect
- UI Designer
- UX Architect
- Code Reviewer
- QA/Test Engineer
- DevOps Automator
- Technical Writer

This maps well to AgentIM's project workflow: product, design, development, review, testing, delivery.

## Current Implementation

- A curated local Agency Agents pack is available through `GET /api/agent-template-packs`.
- Templates are available through `GET /api/agent-templates?packId=agency-agents`.
- `POST /api/agent-templates/:id/create-agent` creates a normal AgentIM Role and Agent from a template, preserving source URL, MIT license, attribution, and suggested skill metadata in the Role prompt.
- Contacts now includes an Agent Templates section with one-click Agent creation using the selected/default Provider.
- Contacts now includes Room Templates for starting a multi-Agent Development Project Room or Media Project Room.
- Room templates create the Room, workspace link, template Roles, template Agents, and room memberships in one action.
- `pnpm run smoke` verifies template listing, Agent/Role creation, and Room template creation.

## Remaining Implementation Order

1. Add category filtering/search in the template UI.
2. Add a template preview drawer before creation.
3. Let users customize which Agents are included before creating a Room from a template.
4. Add remote GitHub import and refresh with approval gating.
5. Add template update/deduplication so repeated creation can reuse an existing template Role when desired.

## Decision

Recommended: integrate as an optional curated template pack, not as core built-ins.
