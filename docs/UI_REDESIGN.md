# AgentIM UI Redesign Plan

## Goal

AgentIM is moving from a functional prototype to a product-grade Agent collaboration UI.

The redesign should keep the current working capabilities while making the product feel like an Agent-native IM workspace:

- Conversations are the primary entry point.
- Agents are private chat contacts.
- Rooms are group chats where users and multiple Agents collaborate.
- Agents feel like first-class participants, not settings records.
- Projects, tasks, workspace files, previews, and artifacts are contextual side surfaces around the active conversation.
- Multi-Agent distribution and execution state are visible without asking the user to infer progress from raw chat messages.
- The same product must work well on desktop and mobile.

## Multi-App Reference Findings

The current mounted references are:

- `/Volumes/Bloome 0.0.91-universal/Bloome.app`
- `/Volumes/Cumora 0.1.30/Cumora.app`
- `/Volumes/Helio 0.3.8-arm64/Helio.app`

They are not identical products, but their overlap is more important than their differences:

- Bloome is closest to a social Agent IM product. It uses a calm conversation-native shell, Agent/social avatars, low-contrast borders, compact controls, and chat bubble tokens such as `--bubble-own` and `--bubble-agent`.
- Cumora is closest to team chat with Agents as members. Its package description explicitly positions it as "team chat with AI agents as first-class participants". Its resource stack includes mention, emoji/reaction, collaboration editor, and rich message primitives.
- Helio is closest to a developer workspace. It is less social, but it validates the need for workspace surfaces, preview/developer tooling, terminal-oriented assets, and a light-first workbench.

Shared product principles:

- The default daily surface is conversation, not administration.
- Agents should appear as contacts/members with status, avatar, and activity.
- Group spaces/rooms should feel like chat groups/channels.
- Work artifacts are attached to conversations and can expand into side panels or full pages.
- Settings, provider management, roles, and skills are secondary surfaces.
- Rich composer behavior matters: mentions, reply context, status feedback, and per-response stop controls.
- Mobile must be chat-first with full-screen conversation and contextual sheets, not a compressed desktop dashboard.

AgentIM should align with these common patterns while keeping its own product identity.

## Reference Scope

Bloome, Cumora, and Helio are useful references because their combined product model matches AgentIM's direction: humans, Agents, groups, widgets, workspace surfaces, and task delegation live inside a conversation-native platform.

Reference principles:

- Reference the information architecture, interaction patterns, density, and Agent/member mental model shared by the mounted apps.
- Use the previously created reverse-engineering notes as product reference: `../Bloome产品逆向分析与新产品开发文档.md`.
- Do not directly copy brand assets, logos, names, illustrations, or distinctive trade dress into AgentIM.
- AgentIM should develop its own visual identity while using the common ergonomics from the reference apps.

Current note:

- `/Volumes/Bloome 0.0.91-universal/Bloome.app`, `/Volumes/Cumora 0.1.30/Cumora.app`, and `/Volumes/Helio 0.3.8-arm64/Helio.app` have been mounted and inspected.
- Static assets were read from `Contents/Resources/app.asar` into temporary analysis folders under `/private/tmp/multi-agent-app-assets/`.
- The extracted files are reference-only and must not be copied into AgentIM product assets.

## Static Resource Notes

Resource locations observed:

- Bloome app shell resources:
  - `Contents/Resources/icon.icns`
  - `Contents/Resources/offline.html`
  - `Contents/Resources/app.asar`
- Bloome renderer bundle inside `app.asar`:
  - `out/renderer/index.html`
  - `out/renderer/assets/index-6smV90_1.css`
  - `out/renderer/assets/LandingPage-DCMUBklm.css`
  - `out/renderer/assets/DocumentEditor-Qsqh8YjQ.css`
  - `out/renderer/fonts/sora-latin.woff2`
  - `out/renderer/images/avatars/*.png`
  - `out/renderer/images/referral/*.svg`
  - `out/renderer/sounds/*.wav`

Asset categories:

- Brand marks:
  - `app-icon-CKS1ZO62.png`, 256x256
  - `bloome-mark-Bhct37cq.svg`, 64x64 source vector
  - `reson-logo-BaFeftEM.png`, 260x64
  - `reson-invite-logo-C1NGDf1o.png`, 256x256
- Agent/social avatars:
  - `avatar1.png` through `avatar6.png`, 520x520
  - `images/avatars/avatar-element-*.png`, 256x256
  - `images/avatars/avatar-portrait-*.png`, 256x256
  - `images/avatars/avatar-together-*.png`, 256x256
  - `images/avatars/avatar-vibe-*.png`, 256x256
- Scenario illustrations:
  - `dream-factory-BgJ8Bcq7.png`, 600x600
  - `pitch-deck-Jx2bxqTN.png`, 600x600
  - `poster-flash-BXzLEBEi.png`, 600x600
  - `bull-run-or-bust-C16i04n8.png`, 600x600
  - `arena-chip-*.png`, 168x168
- Referral illustrations:
  - `images/referral/Image1.svg` through `Image7.svg`
- Sounds:
  - `bell.wav`
  - `chime.wav`
  - `default.wav`
  - `pop.wav`

Cumora observations:

- `LSApplicationCategoryType` is `public.app-category.productivity`.
- It declares the product as cross-platform team chat with AI Agents as first-class participants.
- Renderer resources include a compact chat/productivity palette with `--paper`, `--cloud`, `--ink-*`, `--skype`, `--coral`, and `--gold`.
- Dependencies include TipTap collaboration, mention suggestions, emoji parsing, websocket collaboration, OpenAI-compatible API client, and state management.
- The product vocabulary strongly supports team chat, mentions, reactions, collaboration, and Agent membership.

Helio observations:

- `LSApplicationCategoryType` is `public.app-category.developer-tools`.
- Renderer resources emphasize developer workspace behavior: canvas/paper tokens, mono font support, terminal/developer bundles, boot splash, and theme initialization.
- It is a useful reference for workspace, preview, and developer-tool surfaces, but less useful as the main chat shell reference.

Visual observations:

- The renderer uses Sora as the primary font.
- Base UI tokens are close to:
  - `--radius: .5rem`
  - light background `#f5f5f5`, with mobile switching to `#fff`
  - foreground `#111827`
  - card `#fff`
  - muted `#f3f4f6`
  - border `#0000000f`
  - primary black in light mode
  - dark mode background `#111318`
- The product visual language uses black hand-drawn marks on flat color blocks for avatars and illustrations.
- The IM UI appears to favor low-contrast borders, compact controls, soft shadows, and restrained radius.
- The offline page is dark, centered, minimal, and uses a single retry action.

AgentIM adaptation:

- Use the resource inventory to guide proportions, avatar treatment, compact density, and system surface tone.
- Create our own AgentIM avatars/icons rather than copying the Bloome images.
- Use a similarly calm IM palette, but introduce AgentIM-specific status colors for `running`, `ready`, `waiting`, `failed`, and `done`.
- Keep radius near 8px for app controls and cards, matching the product guidance and Bloome's base token.
- Prefer Sora-like geometric sans rhythm only if it remains readable for dense operational UI; system font fallback is acceptable.

## Product Surfaces To Preserve

The redesign must preserve these implemented surfaces:

- Room list and active Room selection.
- Agent list, Room membership, Agent availability, and Agent test actions.
- Chat with `@agent`, `@all`, `@user`, reply, per-run stop, background recovery, and message pagination.
- Provider settings with OpenAI-compatible `/models` support.
- Role management and role-first Agent creation.
- Project creation with distribution preview.
- Project list, project task list, retry, stop, reassign, archive, delete.
- Agent Work Center grouped by Agent with `idle`, `running`, `ready`, `waiting`, and `failed` states.
- Scheduled tasks.
- Workspace file browser, file editor, preview, export, artifact cards, and full-page/new-page preview.
- Skills registry, even if it is lower priority in the UI.

## Desktop Layout

Desktop should use a conversation-first three-zone app shell:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Top Bar: active conversation, status, search, settings              │
├───────────────┬────────────────────────────────┬───────────────────┤
│ Chat List     │ Main Conversation              │ Context Surface    │
│               │                                │                   │
│ Agent DMs     │ Chat timeline                  │ Members/Agent info │
│ Group Rooms   │ Composer with @ mentions       │ Agent Work         │
│ Activity      │ Artifact cards                 │ Project/Tasks      │
│ User/status   │ System/project events          │ Files/Preview      │
└───────────────┴────────────────────────────────┴───────────────────┘
```

### Chat List

Purpose: IM navigation.

Content:

- Agent private chats with avatar, role, model/provider health, unread/running indicators.
- Group Rooms with member avatars, unread/running indicators, and project status.
- Activity entries for project/task notifications when useful.
- Quick actions: new private chat, new group Room, new Project, open Settings.

Agent private chat rules:

- A direct conversation with an Agent should feel like a normal DM.
- The user should not need to create a Room manually just to talk to one Agent.
- Implementation can map DMs to a `conversation` abstraction or to hidden single-Agent Rooms, but the UI should expose them as Agent contacts.
- Provider, role, skill, and prompt details belong in Agent detail/settings, not in the chat list.

Room/group chat rules:

- A Room is a multi-participant group chat.
- The member list is visible from the context surface or mobile details sheet.
- `@agent`, `@all`, and `@user` remain core interaction primitives.
- Multi-Agent dispatch should be understandable from the timeline and the work surface.

Agent status labels:

- `idle`
- `thinking`
- `working`
- `ready`
- `waiting`
- `failed`
- `offline`

### Main Conversation

Purpose: the primary collaboration surface.

Content:

- User, Agent, and system messages in one timeline.
- Project Created and Project Progress messages as compact system cards.
- Artifact cards for generated files, previews, widgets, and workspace changes.
- Composer with:
  - Agent mention suggestions.
  - Reply context.
  - Send while other Agents are thinking.
  - Stop controls attached to specific running responses.

Design direction:

- Chat should feel like IM, not a form dashboard.
- System messages should be compact but inspectable.
- Raw workspace protocols should remain collapsed by default.

### Context Surface

Purpose: contextual detail and workbench for the active conversation.

Default tabs:

- `Details`
- `Work`
- `Projects`
- `Files`
- `Preview`
- `Artifacts`

The default tab should be `Details` for an Agent DM, `Work` when there is active Agent execution, otherwise `Projects` or `Files` depending on the user's last activity.

Details tab:

- For Agent DMs: Agent profile, role, provider/model status, test action, active work, recent files/artifacts.
- For Rooms: members, Room purpose, active project summary, invite/add Agent controls.

Work tab:

- Agent Work Center grouped by Agent.
- Running task rows with per-run Stop.
- Ready queued tasks.
- Waiting dependency tasks with upstream dependency labels.
- Failed tasks with Retry.

Projects tab:

- Project cards.
- Distribution summary.
- Phase graph or compact dependency list.
- Archive/Delete/Files/Page actions.

Files tab:

- Workspace tree.
- File editor.
- Create file/folder actions.
- Export workspace.

Preview tab:

- Preview current HTML/SVG/widget artifact.
- Fullscreen/open-new-page action.

Artifacts tab:

- Generated artifact history.
- Preview/Open File actions.

## Mobile Layout

Mobile should not squeeze the desktop three-column UI into one screen. It should become a chat-first mobile IM app with contextual drawers.

Recommended mobile navigation:

- `Chats`
- `Work`
- `Files`
- `Me`

Mobile behavior:

- Chat list is the default launch screen.
- Selecting an Agent opens a full-screen private chat.
- Selecting a Room opens a full-screen group chat.
- Conversation details become a full-screen panel or bottom sheet.
- Context work surfaces become separate tabs.
- Project and Agent detail actions open as bottom sheets.
- Preview opens full-screen by default.
- Composer stays sticky at the bottom.
- Mention suggestions open above the composer.
- Stop/retry controls stay attached to each running/failed item, not hidden in hover states.

Mobile breakpoints:

- `<= 640px`: single-screen tabbed layout.
- `641px - 900px`: two-pane layout when space allows, otherwise mobile tabs.
- `> 900px`: desktop three-zone shell.

Mobile priorities:

- No horizontal scrolling for primary content.
- Tap targets at least 40px high.
- Avoid tiny side-by-side action buttons; use action menus or stacked buttons.
- Project/task status must remain readable without opening every detail panel.

## Visual Direction

AgentIM should feel like a calm operational IM product:

- Dense enough for repeated work.
- Softer and more social than a pure admin dashboard.
- Less marketing-like than a landing page.
- Clear status colors for running, ready, waiting, failed, and done.
- Artifact and preview surfaces should feel like first-class objects, not debug output.

Avoid:

- Large hero sections.
- Decorative gradients/orbs.
- Overly card-heavy nested layouts.
- UI text that explains basic controls instead of making the controls obvious.
- One-note palettes dominated by a single hue.

## Component Inventory

Core components to build/refactor:

- `AppShell`
- `TopBar`
- `ConversationList`
- `ConversationListItem`
- `AgentDirectChat`
- `RoomGroupChat`
- `MemberAgentList`
- `ConversationTimeline`
- `MessageBubble`
- `SystemEventCard`
- `ArtifactCard`
- `Composer`
- `MentionSuggest`
- `WorkSurface`
- `AgentWorkGroup`
- `ProjectCard`
- `ProjectTaskRow`
- `DistributionPreview`
- `WorkspaceTree`
- `FileEditor`
- `PreviewPane`
- `SettingsDrawer`
- `MobileTabBar`
- `BottomSheet`

## Data Mapping

Existing frontend state can map to the redesign without backend changes:

- `state.agents` -> Agent private chat list.
- `state.rooms` -> group Room list.
- `state.agents` + `state.roomAgents` -> Room member list and conversation details.
- `state.messages` -> conversation timeline.
- `state.agentRuns` -> live run indicators.
- `state.projects` -> project cards.
- `state.projectTasks` -> Work Center and project dependency lists.
- `state.projectDistribution` -> project creation preview.
- `state.workspaceFiles` -> workspace tree.
- `state.artifacts` -> artifacts tab and message cards.
- `state.tasks` -> scheduled task surface.
- `state.providers`, `state.roles`, `state.skills`, `state.settings` -> Settings drawer.

## Migration Plan

### Immediate Next Session Priority

Before continuing the broader UI rebuild, stabilize the active Room context surface as the product's work status center.

Priority order:

- Verify the Room inspector end to end: accordion sections, Files, Preview, Activity, Artifacts, clear activity, and refresh behavior.
- Make the Room inspector useful as an Agent work status center: show each Agent's current state, running response/task, target Room, and per-response stop affordance where applicable.
- Improve cross-Room collaboration feedback: show who sent the message, which source Room it came from, whether it triggered a mention, and whether delivery or execution failed.
- Continue project-level distribution flow after the Room work center is stable: project creation, role-based Agent assignment, task fan-out, workspace output, artifact cards, and preview.

Design stance:

- The Room inspector should default to collapsed sections so the user can choose what to inspect.
- The inspector is a contextual operations surface, not a static debug list.
- UI polish can remain light, but every visible control should be functional.

### Phase 1: Conversation Model And Shell

- Create the new desktop shell: conversation list, main chat, context surface.
- Introduce a frontend `conversation` view model that merges Agent DMs and Room group chats.
- Decide whether Agent DMs are backed by hidden single-Agent Rooms or a dedicated backend conversation type.
- Move existing DOM sections into the new zones without changing business logic where practical.
- Preserve all existing form IDs and event bindings where practical.
- Add mobile tab container structure.

### Phase 2: Agent DM And Room Group UX

- Make Agents visible as private chat contacts.
- Make Rooms visible as group chats.
- Add Details tab behavior for Agent and Room conversations.
- Keep settings/admin records outside the primary chat path.

### Phase 3: Context Surface

- Convert Project, Agent Work, Workspace, Preview, and Artifacts into tabs.
- Make Agent Work the operational default.
- Improve Project task dependency display.

### Phase 4: Conversation Polish

- Improve message grouping.
- Compact system/project events.
- Make artifact cards visually consistent.
- Improve mention and reply affordances.

### Phase 5: Settings Drawer

- Move Provider, Roles, Skills, and global settings out of the main work surface.
- Keep CRUD functional.
- Add clear entry points from top bar and left rail.

### Phase 6: Mobile

- Implement bottom tabs.
- Convert side panels to full-screen panels or bottom sheets.
- Verify chat composer, work center, workspace tree, and preview on narrow screens.

## Acceptance Criteria

Desktop:

- User can open an Agent DM or Room group chat from the conversation list.
- User can create/select Room, add Agents, chat, mention Agents, create a Project, view distribution, monitor Agent work, inspect files, and preview artifacts without leaving the main shell.
- Agent Work Center makes it obvious which Agents are idle, running, ready, waiting, or failed.
- Project dependency flow is visible from both Project and Work surfaces.

Mobile:

- User can complete the core Chats -> Agent/Room Chat -> Work -> Preview workflow on a phone viewport.
- No primary controls are hover-only.
- No text overlaps or horizontal overflow in chat, task rows, project cards, or action bars.
- Preview can open full-screen.

Technical:

- Existing backend APIs remain stable.
- Current state and event handlers are reused unless a refactor clearly reduces complexity.
- `pnpm run check` passes.
- Browser verification covers desktop and mobile viewport screenshots after each major layout phase.
