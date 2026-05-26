export const ROOM_TEMPLATES = [
  circle({
    id: 'web-app-delivery-circle',
    name: 'Web App Delivery',
    category: 'software',
    description: 'A senior product, design, engineering, and review team for shipping polished web apps.',
    roomName: 'Web App Delivery Room',
    collaborationMode: 'delivery-pipeline',
    outcome: 'Validated requirements, public design preview, implementation, review, and delivery notes.',
    roomDescription: [
      'Goal: deliver a polished, previewable web app from a user brief.',
      '',
      'Collaboration mode: Delivery Pipeline.',
      '1. Product Manager turns the brief into scope, acceptance criteria, and task plans.',
      '2. UI Designer submits public previewable design artifacts as soon as they are ready; user feedback can interrupt or supersede later work.',
      '3. Frontend Developer implements only against approved or explicitly accepted design direction.',
      '4. Code Reviewer checks correctness, regressions, and missing verification before delivery.',
      '5. Technical Writer records setup, behavior, and handoff notes when useful.',
      '',
      'Default gates: PM approval before development, user feedback may interrupt active tasks, max design revision rounds: 3.'
    ].join('\n'),
    slots: [
      requiredSlot('pm', 'Product Manager', 'product-manager', 'agency-product-manager', 'Owns scope, acceptance criteria, review decisions, and task orchestration.'),
      requiredSlot('designer', 'UI Designer', 'designer', 'agency-ui-designer', 'Creates public previewable design proposals and revisions.'),
      requiredSlot('developer', 'Frontend Developer', 'full-stack-developer', 'agency-frontend-developer', 'Builds the approved design into workspace files.'),
      optionalSlot('reviewer', 'Code Reviewer', 'reviewer', 'agency-code-reviewer', 'Reviews implementation quality and risk.'),
      optionalSlot('writer', 'Technical Writer', 'general', 'agency-technical-writer', 'Creates concise delivery and usage documentation.')
    ],
    workflow: workflow({
      mode: 'delivery-pipeline',
      requirePmApprovalBeforeDevelopment: true,
      allowUserFeedbackInterrupts: true,
      maxRevisionRounds: 3,
      steps: [
        step('scope', 'pm', 'Define scope and acceptance criteria'),
        step('design', 'designer', 'Create public design preview', ['scope'], { artifact: 'public-preview' }),
        step('design-review', 'pm', 'Review design and request revisions or approve', ['design'], { reviewOf: 'design' }),
        step('build', 'developer', 'Implement approved design', ['design-review']),
        step('code-review', 'reviewer', 'Review implementation', ['build']),
        step('delivery', 'pm', 'Summarize delivery and next decisions', ['code-review'])
      ]
    }),
    agentTemplateIds: [
      'agency-product-manager',
      'agency-ui-designer',
      'agency-frontend-developer',
      'agency-code-reviewer',
      'agency-technical-writer'
    ]
  }),
  circle({
    id: 'product-design-review-circle',
    name: 'Product Design Review',
    category: 'product',
    description: 'A product and design team focused on design proposals, public previews, PM review, and revision loops.',
    roomName: 'Product Design Review Room',
    collaborationMode: 'review-loop',
    outcome: 'Clear requirements, public design artifacts, PM decisions, and user-visible revision history.',
    roomDescription: [
      'Goal: turn product intent into a reviewed design direction.',
      '',
      'Collaboration mode: Review Loop.',
      '1. Product Manager defines the user problem, success criteria, and constraints.',
      '2. UX Architect maps flows and edge cases when the product shape is unclear.',
      '3. UI Designer creates public previewable design proposals; previews are visible before PM approval.',
      '4. Product Manager reviews each proposal and either approves it or requests a revision with concrete reasons.',
      '5. User feedback always takes precedence over PM approval and may create a new revision task.'
    ].join('\n'),
    slots: [
      requiredSlot('pm', 'Product Manager', 'product-manager', 'agency-product-manager', 'Owns product criteria and review decisions.'),
      requiredSlot('designer', 'UI Designer', 'designer', 'agency-ui-designer', 'Produces public previewable design proposals.'),
      optionalSlot('ux', 'UX Architect', 'designer', 'agency-ux-architect', 'Clarifies flows, IA, and edge cases.'),
      optionalSlot('reviewer', 'Reviewer', 'reviewer', 'agency-code-reviewer', 'Reviews consistency, risk, and gaps.')
    ],
    workflow: workflow({
      mode: 'review-loop',
      requirePmApprovalBeforeDevelopment: true,
      allowUserFeedbackInterrupts: true,
      maxRevisionRounds: 4,
      steps: [
        step('criteria', 'pm', 'Define product criteria'),
        step('flows', 'ux', 'Map flows and edge cases', ['criteria'], { optional: true }),
        step('design', 'designer', 'Create public design preview', ['criteria'], { artifact: 'public-preview' }),
        step('pm-review', 'pm', 'Approve or request design changes', ['design'], { reviewOf: 'design' }),
        step('revision', 'designer', 'Revise design if requested', ['pm-review'], { conditional: 'changes_requested' })
      ]
    }),
    agentTemplateIds: [
      'agency-product-manager',
      'agency-ux-architect',
      'agency-ui-designer',
      'agency-code-reviewer'
    ]
  }),
  circle({
    id: 'github-to-product-circle',
    name: 'GitHub to Product',
    category: 'research',
    description: 'A research, product, and engineering team for studying links or repos and adapting ideas into the workspace.',
    roomName: 'GitHub Research Room',
    collaborationMode: 'research-build',
    outcome: 'External code analysis, product adaptation plan, prototype or implementation, and review.',
    roomDescription: [
      'Goal: inspect external links or GitHub repositories, identify useful patterns, and adapt the right ideas into this workspace.',
      '',
      'Collaboration mode: Research -> Build -> Review.',
      '1. Product Manager frames what should be learned and what should not be copied blindly.',
      '2. Backend Architect or Frontend Developer uses web.read and workspace tools to analyze relevant code and architecture.',
      '3. UI Designer adapts interaction or visual ideas when useful.',
      '4. Developer implements scoped improvements in the workspace.',
      '5. Reviewer checks licensing assumptions, implementation risk, and missing verification.'
    ].join('\n'),
    slots: [
      requiredSlot('pm', 'Product Manager', 'product-manager', 'agency-product-manager', 'Defines research goals and product fit.'),
      requiredSlot('developer', 'Frontend Developer', 'full-stack-developer', 'agency-frontend-developer', 'Adapts useful code/UI patterns into workspace files.'),
      optionalSlot('architect', 'Backend Architect', 'full-stack-developer', 'agency-backend-architect', 'Analyzes APIs, data models, and architecture.'),
      optionalSlot('designer', 'UI Designer', 'designer', 'agency-ui-designer', 'Adapts useful design and interaction patterns.'),
      optionalSlot('reviewer', 'Code Reviewer', 'reviewer', 'agency-code-reviewer', 'Reviews risk, licensing assumptions, and correctness.')
    ],
    workflow: workflow({
      mode: 'research-build',
      allowUserFeedbackInterrupts: true,
      maxRevisionRounds: 2,
      steps: [
        step('research-brief', 'pm', 'Define research objective'),
        step('repo-analysis', 'developer', 'Read and summarize external project code', ['research-brief']),
        step('adaptation-plan', 'pm', 'Choose what to adapt', ['repo-analysis']),
        step('implementation', 'developer', 'Implement scoped adaptation', ['adaptation-plan']),
        step('review', 'reviewer', 'Review adaptation and risks', ['implementation'])
      ]
    }),
    agentTemplateIds: [
      'agency-product-manager',
      'agency-frontend-developer',
      'agency-backend-architect',
      'agency-ui-designer',
      'agency-code-reviewer'
    ]
  }),
  circle({
    id: 'startup-discovery-circle',
    name: 'Startup Discovery',
    category: 'strategy',
    description: 'A compact founding team for exploring ideas, positioning, MVP scope, prototype direction, and launch risks.',
    roomName: 'Startup Discovery Room',
    collaborationMode: 'task-driven',
    outcome: 'Problem framing, target users, MVP scope, prototype plan, risks, and next experiments.',
    roomDescription: [
      'Goal: move from a rough idea to a testable MVP plan.',
      '',
      'Collaboration mode: Task Driven.',
      '1. Product Manager defines assumptions, target users, and success criteria.',
      '2. UX Architect maps core journeys and friction points.',
      '3. UI Designer creates early previewable concepts when useful.',
      '4. Frontend Developer estimates prototype complexity and can build a small proof of concept.',
      '5. Reviewer challenges risks, missing evidence, and validation gaps.'
    ].join('\n'),
    slots: [
      requiredSlot('pm', 'Product Manager', 'product-manager', 'agency-product-manager', 'Frames idea, market, scope, and experiments.'),
      requiredSlot('ux', 'UX Architect', 'designer', 'agency-ux-architect', 'Maps journeys and product ergonomics.'),
      optionalSlot('designer', 'UI Designer', 'designer', 'agency-ui-designer', 'Creates early visual concepts.'),
      optionalSlot('developer', 'Frontend Developer', 'full-stack-developer', 'agency-frontend-developer', 'Builds quick prototypes when needed.'),
      optionalSlot('reviewer', 'Reviewer', 'reviewer', 'agency-code-reviewer', 'Challenges assumptions and risks.')
    ],
    workflow: workflow({
      mode: 'task-driven',
      allowUserFeedbackInterrupts: true,
      maxRevisionRounds: 2,
      steps: [
        step('problem', 'pm', 'Define problem, audience, and success criteria'),
        step('journey', 'ux', 'Map primary user journey', ['problem']),
        step('concept', 'designer', 'Create concept preview if useful', ['journey'], { optional: true }),
        step('prototype-plan', 'developer', 'Plan or build lightweight prototype', ['journey'], { optional: true }),
        step('risk-review', 'reviewer', 'Review assumptions and next experiments', ['problem'])
      ]
    }),
    agentTemplateIds: [
      'agency-product-manager',
      'agency-ux-architect',
      'agency-ui-designer',
      'agency-frontend-developer',
      'agency-code-reviewer'
    ]
  }),
  circle({
    id: 'content-launch-circle',
    name: 'Content Launch',
    category: 'media',
    description: 'A product, UX, design, frontend, QA, and writing team for launching content-heavy pages or campaigns.',
    roomName: 'Content Launch Room',
    collaborationMode: 'delivery-pipeline',
    outcome: 'Content structure, page design, previewable implementation, QA notes, and publishing documentation.',
    roomDescription: [
      'Goal: plan, design, implement, and verify a content-heavy launch page or campaign asset.',
      '',
      'Collaboration mode: Delivery Pipeline.',
      '1. Product Manager defines audience, offer, conversion goal, and acceptance criteria.',
      '2. UX Architect structures content and navigation.',
      '3. UI Designer creates a public previewable page direction.',
      '4. Frontend Developer builds the page or prototype.',
      '5. QA verifies responsive behavior, content completeness, and obvious regressions.',
      '6. Technical Writer prepares publishing or handoff notes.'
    ].join('\n'),
    slots: [
      requiredSlot('pm', 'Product Manager', 'product-manager', 'agency-product-manager', 'Defines audience, goals, and acceptance criteria.'),
      requiredSlot('designer', 'UI Designer', 'designer', 'agency-ui-designer', 'Creates public previewable page direction.'),
      requiredSlot('developer', 'Frontend Developer', 'full-stack-developer', 'agency-frontend-developer', 'Builds previewable page artifacts.'),
      optionalSlot('ux', 'UX Architect', 'designer', 'agency-ux-architect', 'Structures content and navigation.'),
      optionalSlot('qa', 'QA Engineer', 'reviewer', 'agency-qa-test-engineer', 'Verifies content, responsive behavior, and regressions.'),
      optionalSlot('writer', 'Technical Writer', 'general', 'agency-technical-writer', 'Writes launch and handoff notes.')
    ],
    workflow: workflow({
      mode: 'delivery-pipeline',
      requirePmApprovalBeforeDevelopment: true,
      allowUserFeedbackInterrupts: true,
      maxRevisionRounds: 3,
      steps: [
        step('brief', 'pm', 'Define audience, offer, and acceptance criteria'),
        step('content-structure', 'ux', 'Structure content and navigation', ['brief'], { optional: true }),
        step('design', 'designer', 'Create public page design preview', ['brief'], { artifact: 'public-preview' }),
        step('build', 'developer', 'Build previewable content page', ['design']),
        step('qa', 'qa', 'Verify content and responsive behavior', ['build'], { optional: true }),
        step('handoff', 'writer', 'Prepare publishing notes', ['qa'], { optional: true })
      ]
    }),
    agentTemplateIds: [
      'agency-product-manager',
      'agency-ux-architect',
      'agency-ui-designer',
      'agency-frontend-developer',
      'agency-qa-test-engineer',
      'agency-technical-writer'
    ]
  }),
  circle({
    id: 'cinematic-storyboard-studio-circle',
    name: 'Cinematic Storyboard Studio',
    category: 'film',
    description: 'A complete AI film preproduction team for turning an idea into story, scene breakdown, storyboard prompts, video prompts, music, and continuity.',
    roomName: 'Cinematic Storyboard Studio',
    collaborationMode: 'film-preproduction-pipeline',
    outcome: 'A complete preproduction package with FINAL_PROMPTS.md ready for gpt-image-2 storyboard images and seedance video shots.',
    roomDescription: [
      'Goal: turn a raw film idea into a complete AI film preproduction package.',
      '',
      'Final user-facing output: FINAL_PROMPTS.md.',
      'FINAL_PROMPTS.md must contain self-contained prompts that can be copied directly into target generation models. Upstream documents are for collaboration and quality control; final prompts must already integrate the needed story, visual bible, shot list, sound, and continuity details.',
      '',
      'Default target models:',
      '- Static images, storyboard sheets, character sheets, environment sheets, prop/costume sheets, and keyframes: gpt-image-2.',
      '- Video shot prompts: seedance.',
      '',
      'Prompt formats are adaptive by asset type. Do not force one universal format. Do not default to Midjourney or Stable Diffusion syntax unless the user explicitly requests it.',
      '',
      'Supported prompt asset types:',
      '- image_storyboard_sheet: full cinematic production storyboard pages or director preproduction sheets.',
      '- image_character_sheet: character model sheets, expressions, costumes, poses, and continuity locks.',
      '- image_environment_sheet: locations, worldbuilding, atmosphere, and spatial design.',
      '- image_prop_costume_sheet: props, costumes, tools, symbolic objects, and material notes.',
      '- image_keyframe: individual cinematic frames or important story moments.',
      '- video_shot_seedance: per-shot video prompts with action, camera movement, rhythm, environment dynamics, lighting evolution, and negative prompt when useful.',
      '- audio_scene_prompt: music, ambience, foley, sound effects, and sonic motifs.',
      '',
      'Workflow rules:',
      '1. Creative Producer turns the user idea into a creative brief and delivery plan.',
      '2. Screenwriter develops the story, characters, theme, and scene breakdown.',
      '3. Director reviews story direction and can approve, request changes, or interrupt/reassign work if user feedback changes direction.',
      '4. Art Director creates the visual style bible, character/environment/prop/costume guidance, and continuity locks.',
      '5. Storyboard Artist and Cinematographer create the shot list and visual rhythm.',
      '6. Composer and Sound Designer define score, sound, ambience, and sonic motifs.',
      '7. Prompt Package Designer writes FINAL_PROMPTS.md with directly usable prompts for gpt-image-2 and seedance.',
      '8. Continuity Editor checks that final prompts are self-contained, coherent, and consistent across the whole package.',
      '9. Director performs final review and requests revisions when needed.',
      '',
      'Important rule: do not claim images, videos, or audio were generated. This Circle produces prompts and production documents only.'
    ].join('\n'),
    slots: [
      requiredSlot('producer', 'Creative Producer', 'product-manager', 'film-creative-producer', 'Owns creative brief, scope, deliverables, task orchestration, and user intent.'),
      requiredSlot('screenwriter', 'Screenwriter', 'general', 'film-screenwriter', 'Develops story, characters, scenes, and dialogue direction.'),
      requiredSlot('director', 'Director', 'product-manager', 'film-director', 'Owns creative approvals, tone, pacing, and film language.'),
      requiredSlot('art-director', 'Art Director', 'designer', 'film-art-director', 'Owns visual style bible, characters, environments, props, costumes, and continuity locks.'),
      requiredSlot('storyboard', 'Storyboard Artist', 'designer', 'film-storyboard-artist', 'Turns scenes into storyboard beats, visual panels, and shot purpose.'),
      requiredSlot('cinematographer', 'Cinematographer', 'designer', 'film-cinematographer', 'Owns camera language, lighting, movement, composition, and visual rhythm.'),
      requiredSlot('prompt-designer', 'Prompt Package Designer', 'general', 'film-prompt-package-designer', 'Writes FINAL_PROMPTS.md for gpt-image-2 and seedance.'),
      requiredSlot('continuity', 'Continuity Editor', 'reviewer', 'film-continuity-editor', 'Checks story, visual, sound, and prompt continuity before final delivery.'),
      optionalSlot('composer', 'Composer', 'general', 'film-composer', 'Creates score concepts, motifs, and music prompts.'),
      optionalSlot('sound', 'Sound Designer', 'general', 'film-sound-designer', 'Creates sound design, ambience, foley, and sonic motif prompts.'),
      optionalSlot('script-doctor', 'Script Doctor', 'reviewer', 'film-script-doctor', 'Reviews story logic, pacing, motivation, and emotional payoff.')
    ],
    workflow: workflow({
      mode: 'film-preproduction-pipeline',
      allowUserFeedbackInterrupts: true,
      requireDirectorApprovalBeforeFinalPrompts: true,
      maxRevisionRounds: 4,
      steps: [
        step('idea-intake', 'producer', 'Create creative brief and delivery plan'),
        step('story-development', 'screenwriter', 'Develop complete story, characters, and structure', ['idea-intake']),
        step('story-review', 'director', 'Review story direction and request changes or approve', ['story-development'], { reviewOf: 'story-development' }),
        step('scene-breakdown', 'screenwriter', 'Create scene breakdown', ['story-review']),
        step('visual-development', 'art-director', 'Create visual style bible and continuity locks', ['scene-breakdown']),
        step('shot-design', 'storyboard', 'Create storyboard beats and shot list', ['scene-breakdown', 'visual-development']),
        step('camera-plan', 'cinematographer', 'Create camera, lighting, movement, and rhythm plan', ['shot-design']),
        step('music-plan', 'composer', 'Create score and music prompt direction', ['scene-breakdown'], { optional: true }),
        step('sound-plan', 'sound', 'Create sound design and ambience prompt direction', ['scene-breakdown', 'camera-plan'], { optional: true }),
        step('final-prompts', 'prompt-designer', 'Create FINAL_PROMPTS.md for gpt-image-2 and seedance', ['visual-development', 'shot-design', 'camera-plan']),
        step('continuity-review', 'continuity', 'Review FINAL_PROMPTS.md for continuity and usability', ['final-prompts']),
        step('director-final-review', 'director', 'Approve or request revisions to the final prompt package', ['continuity-review'], { reviewOf: 'final-prompts' })
      ]
    }),
    agentTemplateIds: [
      'film-creative-producer',
      'film-screenwriter',
      'film-director',
      'film-art-director',
      'film-storyboard-artist',
      'film-cinematographer',
      'film-prompt-package-designer',
      'film-continuity-editor',
      'film-composer',
      'film-sound-designer',
      'film-script-doctor'
    ]
  }),
  circle({
    id: 'operations-readiness-circle',
    name: 'Operations Readiness',
    category: 'operations',
    description: 'An engineering, QA, DevOps, and documentation team for preparing runtime, verification, and handoff.',
    roomName: 'Operations Readiness Room',
    collaborationMode: 'task-driven',
    outcome: 'Operational checklist, test plan, deployment notes, rollback guidance, and documentation.',
    roomDescription: [
      'Goal: prepare a project for dependable operation and handoff.',
      '',
      'Collaboration mode: Task Driven.',
      '1. Backend Architect identifies runtime boundaries, persistence, queues, and integration risks.',
      '2. QA Engineer defines smoke and regression checks.',
      '3. DevOps Automator prepares setup, health check, rollback, and operational notes.',
      '4. Technical Writer turns the final process into concise documentation.',
      '5. Product Manager or Reviewer resolves tradeoffs and readiness questions.'
    ].join('\n'),
    slots: [
      requiredSlot('architect', 'Backend Architect', 'full-stack-developer', 'agency-backend-architect', 'Owns architecture and operational risk.'),
      requiredSlot('qa', 'QA Engineer', 'reviewer', 'agency-qa-test-engineer', 'Owns verification strategy.'),
      requiredSlot('devops', 'DevOps Automator', 'general', 'agency-devops-automator', 'Owns deployment and runtime readiness.'),
      optionalSlot('writer', 'Technical Writer', 'general', 'agency-technical-writer', 'Documents setup and handoff.'),
      optionalSlot('pm', 'Product Manager', 'product-manager', 'agency-product-manager', 'Prioritizes tradeoffs and readiness scope.')
    ],
    workflow: workflow({
      mode: 'task-driven',
      allowUserFeedbackInterrupts: true,
      maxRevisionRounds: 2,
      steps: [
        step('architecture-review', 'architect', 'Review architecture and runtime risks'),
        step('test-plan', 'qa', 'Create verification plan', ['architecture-review']),
        step('ops-plan', 'devops', 'Prepare operational readiness plan', ['architecture-review']),
        step('docs', 'writer', 'Write handoff documentation', ['test-plan', 'ops-plan'], { optional: true }),
        step('readiness-review', 'pm', 'Resolve readiness tradeoffs', ['test-plan', 'ops-plan'], { optional: true })
      ]
    }),
    agentTemplateIds: [
      'agency-backend-architect',
      'agency-qa-test-engineer',
      'agency-devops-automator',
      'agency-technical-writer',
      'agency-product-manager'
    ]
  })
];

function circle(input) {
  return {
    autoCreateRequiredAgents: true,
    ...input,
    agentTemplateIds: [...new Set(input.agentTemplateIds ?? input.slots.map((slot) => slot.agentTemplateId).filter(Boolean))]
  };
}

function requiredSlot(id, label, roleId, agentTemplateId, description) {
  return slot(id, label, roleId, agentTemplateId, description, true);
}

function optionalSlot(id, label, roleId, agentTemplateId, description) {
  return slot(id, label, roleId, agentTemplateId, description, false);
}

function slot(id, label, roleId, agentTemplateId, description, required) {
  return { id, label, roleId, agentTemplateId, description, required };
}

function workflow(input) {
  return {
    autoStartNextTask: true,
    ...input
  };
}

function step(id, slot, title, dependsOn = [], extra = {}) {
  return { id, slot, title, dependsOn, ...extra };
}
