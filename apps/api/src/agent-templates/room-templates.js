export const ROOM_TEMPLATES = [
  {
    id: 'development-project-room',
    name: 'Development Project',
    category: 'software',
    description: 'Product, design, development, review, QA, DevOps, and documentation Agents for building software projects.',
    roomName: 'Development Project Room',
    roomDescription: 'A multi-Agent software project room ready for product planning, design, development, QA, delivery, and operations.',
    agentTemplateIds: [
      'agency-product-manager',
      'agency-ui-designer',
      'agency-frontend-developer',
      'agency-backend-architect',
      'agency-code-reviewer',
      'agency-qa-test-engineer',
      'agency-devops-automator',
      'agency-technical-writer'
    ]
  },
  {
    id: 'media-project-room',
    name: 'Media Project',
    category: 'media',
    description: 'Planning, creative direction, UX, UI, frontend prototype, QA, and documentation Agents for media/content projects.',
    roomName: 'Media Project Room',
    roomDescription: 'A multi-Agent media project room ready for content planning, creative direction, interactive prototypes, review, and delivery.',
    agentTemplateIds: [
      'agency-product-manager',
      'agency-ux-architect',
      'agency-ui-designer',
      'agency-frontend-developer',
      'agency-qa-test-engineer',
      'agency-technical-writer'
    ]
  }
];
