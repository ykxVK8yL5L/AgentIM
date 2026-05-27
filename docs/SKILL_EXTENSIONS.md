# Skill Extension Roadmap

AgentIM should grow from chat-first Agents into capability-bearing Agents through a controlled Skill system. A Skill is not only a prompt snippet. It is a small capability package that teaches an Agent when to act, declares what it can execute, and lets the platform enforce network, secret, and approval policy.

This roadmap is intentionally AgentIM-native. It should not copy third-party product names, branding, assets, private APIs, or runtime internals.

## Goals

- Let Agents use real external capabilities without asking users to manually run commands.
- Keep all execution behind AgentIM-controlled policy: enabled Skills, network settings, secrets, and approval mode.
- Make Skills installable, inspectable, disableable, and removable by users.
- Prefer structured API actions before adding broader script or shell execution.
- Keep the runtime simple enough that built-in Skills and user-installed Skills share the same contract.

## Non-Goals

- Do not build a workflow canvas as the primary product model.
- Do not make shell/script execution the default extension mechanism.
- Do not expose secret values to model prompts or normal chat messages.
- Do not let imported Skills bypass host allowlists, HTTP/local network settings, or approval policy.
- Do not require users to understand internal action protocols.

## Skill Package Shape

The first stable package format should support documentation plus executable actions:

```text
apps/api/src/skills/<skill-id>/
  SKILL.md
  skill.json
  examples/
  schemas/
  assets/
```

Local user-added file Skills should use the same shape under:

```text
apps/api/data/skills/<skill-id>/
  SKILL.md
  skill.json
```

Required files:

- `SKILL.md`: human-readable and model-readable guidance. It explains when to use the Skill, expected behavior, limitations, and safety notes.
- `skill.json`: machine-readable manifest. It declares actions, input schemas, required permissions, required secrets, and response handling.

Optional files:

- `examples/`: example prompts, inputs, and expected outputs.
- `schemas/`: reusable JSON schemas for complex action inputs.
- `assets/`: icons or static metadata for the Settings UI.

## Manifest Contract

The manifest should start with API-backed actions:

```json
{
  "id": "weather",
  "name": "Weather",
  "version": "0.1.0",
  "description": "Current weather and forecast lookups.",
  "permissions": {
    "network": {
      "hosts": ["api.example-weather.com"],
      "allowHttp": false,
      "allowLocalhost": false,
      "allowPrivateNetwork": false
    },
    "secrets": ["WEATHER_API_KEY"],
    "approval": "auto"
  },
  "actions": [
    {
      "id": "current",
      "name": "Get Current Weather",
      "type": "http",
      "method": "GET",
      "url": "https://api.example-weather.com/current",
      "query": {
        "q": "${input.location}",
        "key": "${secret:WEATHER_API_KEY}"
      },
      "inputSchema": {
        "type": "object",
        "required": ["location"],
        "properties": {
          "location": {
            "type": "string"
          }
        }
      },
      "response": {
        "mode": "json",
        "maxBytes": 20000
      }
    }
  ]
}
```

Initial action type:

- `http`: executes an outbound HTTP request through AgentIM's API request runtime.

Future action types:

- `platform`: calls an AgentIM internal capability such as workspace, room, project, or scheduling APIs.
- `script`: runs a constrained local script with explicit approval and sandboxing.
- `mcp`: delegates to a configured MCP server after user approval.

## Runtime Rules

Agents should request Skill actions through a structured internal protocol. Users should not need to write or see that protocol during ordinary use.

Runtime responsibilities:

- Validate that the Skill is installed and enabled.
- Validate that the Agent's Role allows the Skill.
- Validate action input against `inputSchema`.
- Resolve `${input.*}` placeholders from validated input.
- Resolve `${secret:NAME}` placeholders at execution time only.
- Redact secret values from logs, activity records, messages, and errors.
- Enforce global Network settings.
- Enforce Skill-declared host permissions.
- Enforce Approval Mode before executing risky actions.
- Limit response size and store a compact action result.
- Return useful, user-facing summaries instead of raw platform-status text.

## Network And Secret Policy

Skill network permissions must compose with global settings:

- If API requests are disabled globally, no Skill HTTP action may run.
- If host allowlist is enabled globally, the action host must be allowed globally and by the Skill.
- If HTTP is disabled globally, `http://` action URLs must fail.
- If localhost/private network is disabled globally, those action URLs must fail.
- If a Skill requires a secret that is missing, the action must fail with a clear `missing_secret` result.

Credentials:

- Skills may declare dynamic credential schemas through `credentialTypes`.
- A credential type defines field names and field types, but AgentIM does not hard-code names such as `username`, `password`, `client_id`, or `client_secret`.
- Supported field types should include `string`, `secret`, `url`, `number`, `boolean`, `select`, and `json`.
- Credential instances are structured objects created by users in Settings.
- Fields with `type: "secret"` must be stored and redacted at field level.
- Skill actions can reference credential fields with `${credential.field_name}`.
- A Skill can allow multiple credential instances for the same credential type, such as multiple Bark devices or multiple service accounts.

Legacy secrets:

- Secret names are stable handles, not values.
- Skill manifests may reference secrets by name.
- Settings should let users create, update, and delete secrets.
- The runtime may inject secret values into requests, but the model should not receive raw values.
- Action results and errors must be redacted before becoming chat-visible.
- This `${secret:NAME}` path is retained for low-level API requests and compatibility, but first-class Skills should prefer structured credentials.

## Settings UI

Settings should expose user-configurable capability controls:

- `Skills`: installed Skills, enabled state, version, description, required permissions, required secrets, and remove/update controls.
- `Credentials`: dynamic credential forms generated from installed Skill credential schemas.
- `Network`: global API request policy, allowlist, HTTP, localhost, private network, timeout, and response size settings.
- `Chats`: message page size and approval mode.
- `System`: account and password controls.

Skill detail view should show:

- Actions provided by the Skill.
- Network hosts requested by the Skill.
- Secrets requested by the Skill.
- Whether all requirements are currently satisfied.
- Whether the Skill is usable by each Role or Agent.

## Agent And Role Integration

Skills should remain governed by Roles.

- A Role owns the allow-list of executable Skill IDs.
- An Agent inherits runtime capability from its Role.
- Installing a Skill does not automatically grant it to every Agent unless the user chooses that behavior.
- Built-in default Roles may include safe default Skills.
- High-risk Skills should require explicit Role assignment.

The prompt layer should tell Agents what Skills are available, what each Skill is for, and how to request action execution. The execution layer should still validate everything.

## Product Phases

### Phase 1: API-Backed Skills

Implement the smallest complete loop:

- Define `skill.json`.
- Load built-in Skills from local files.
- Execute `http` actions through the existing API request runtime.
- Bind secrets by `${secret:NAME}`.
- Enforce Network settings and Approval Mode.
- Show installed Skills in Settings.
- Add a small set of built-in public API Skills, such as weather, exchange rates, IP/domain lookup, or RSS.

### Phase 2: Installable Skills

Make Skills user-manageable:

- Install from local zip.
- Install from URL after explicit approval.
- Enable, disable, update, and delete Skills.
- Validate manifest schema before install.
- Show permission review before enabling.
- Store installed Skill metadata in the database.
- Preserve attribution and license metadata for imported packages.

### Phase 3: Skill Sharing And Cards

Add product-native sharing:

- Share a Skill as a message card.
- Install from a Skill card after explicit user approval.
- Show install result as a system notice.
- Prevent automatic install from untrusted messages.

### Phase 4: Advanced Platform Actions

Add richer internal capability surfaces:

- Workspace and artifact actions.
- Room and Agent delegation actions.
- Project/task actions.
- Scheduled actions.
- Structured result cards for action outputs.

### Phase 5: Script, MCP, And Local Bridges

Add higher-power execution only after the API Skill runtime is stable:

- Optional MCP server integrations.
- Optional local script actions.
- Optional command bridge for trusted local environments.
- Per-action approval gates.
- Strong audit logs.
- Clear off switches in Settings.

## Later Rules

These rules should guide future implementation even when the feature is not built yet:

- Any execution surface stronger than HTTP must be disabled by default.
- Any imported Skill must pass manifest validation before it can be enabled.
- Any Skill requesting local network, private network, HTTP, script, MCP, or workspace write access must show a permission review.
- Any Skill that sends data to a third-party host should expose that host before enablement.
- Any action that mutates external state should be approval-aware.
- Any action result shown in chat should be concise, redacted, and useful to the user.
- Any raw protocol emitted by an Agent should be hidden or collapsed in normal chat UI.
- Any generated artifact should have a user-facing card with open, preview, or inspect actions where applicable.

## Importers

AgentIM may later include importers that read public integration definitions and convert them into AgentIM Skill manifests.

Importer output should be classified:

- `auto`: can become an executable Skill without manual edits.
- `partial`: can become a draft Skill that requires review.
- `manual`: can only produce documentation or a starting template.

Importers are build-time or admin-time tools. Imported definitions should still run through AgentIM's own manifest, permission, network, secret, and approval model.

### Integration Definition Importer Plan

Future import work should use mature open integration definitions as a reference for executable Skill drafts. The goal is not to run another platform's runtime or clone its product model. The goal is to extract enough public integration structure to create editable AgentIM-native `skill.json` drafts.

Recommended extraction priority:

1. Credential definitions:
   - Credential id and display name.
   - Field names, labels, required state, defaults, and secret/password flags.
   - Authentication injection style such as query token, bearer token, header key, webhook URL, or basic username/password.
   - Credential test request when available.

2. Node/action descriptions:
   - Service name, description, category, and whether it is usable as an agent tool.
   - Resource and operation pairs mapped to AgentIM action ids.
   - Operation display names and human-readable action descriptions.

3. Input properties:
   - Required fields become JSON schema `required`.
   - String, number, boolean, options, multi-options, date/time, and JSON-like fields map to AgentIM input schema.
   - Collection/fixedCollection fields should be flattened only when the execution code clearly maps them to request fields.
   - Conditional fields from display options should become draft notes until AgentIM has conditional form support.

4. HTTP execution:
   - Extract method, base URL, path, query, body, and headers from simple request helpers.
   - Preserve host permissions in `permissions.network.hosts`.
   - Mark multipart/binary, pagination, dynamic load options, webhooks, long polling, and custom SDK logic as `partial` or `manual`.

5. Risk and approval:
   - Read-only lookup actions should default to `low`.
   - External notification or message-send actions should default to `medium` with `policy.externalEffect: true`.
   - Destructive, publishing, permission-changing, billing, deployment, or data deletion actions should default to `high` and require approval.
   - Imported risk should be reviewed manually before enabling.

Initial importer classifications:

- `auto`: simple HTTP actions with static URL/method/query/body, simple credentials, no binary data, no pagination requirement, and clear host permissions.
- `partial`: actions with conditional fields, dynamic options, resource/operation branching, pagination, OAuth variants, or optional external effects.
- `manual`: trigger nodes, webhook listeners, binary upload/download, file system/database protocol clients, custom SDK flows, long-running jobs, or actions that depend heavily on platform runtime helpers.

Recommended first reference nodes:

- Weather lookup: a low-risk read-only API Skill that validates credential and query extraction.
- Push notification: a medium-risk external-effect Skill that validates credential choice, approval, and credential lock behavior.
- Webhook message send: a focused outbound message Skill using a webhook URL credential.

Complex nodes such as large source-control, chat, CRM, or cloud-platform integrations should come later. They should first be converted by resource/operation subset rather than as one monolithic Skill.

## First Milestone

The recommended first milestone is:

1. Add a local built-in `weather` Skill.
2. Define the first version of `skill.json`.
3. Add a backend Skill action executor for `type: "http"`.
4. Show Skill install/enabled/permission status in Settings.
5. Let an Agent answer a weather question by calling the Skill, not by hand-writing an API request.

This milestone proves that Agents can gain real capabilities while staying inside AgentIM's control plane.
