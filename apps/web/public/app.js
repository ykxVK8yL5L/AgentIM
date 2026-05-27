const state = {
  settings: {
    auth: {
      passwordSet: false,
      authenticated: true
    },
    network: {
      proxyEnabled: false,
      proxyUrl: '',
      providerTimeoutMs: 300000
    },
    apiRequest: {
      enabled: true,
      allowlistEnabled: false,
      allowedHosts: [],
      allowHttp: true,
      allowLocalhost: true,
      allowPrivateNetwork: true,
      timeoutMs: 30000,
      maxResponseBytes: 512000
    },
    secrets: [],
    credentials: [],
    customCredentialTypes: [],
    chat: {
      messagePageSize: 20
    },
    approvals: {
      mode: 'auto'
    }
  },
  providers: [],
  agents: [],
  agentTemplatePacks: [],
  agentTemplates: [],
  roomTemplates: [],
  skills: [],
  roles: [],
  rooms: [],
  conversations: [],
  roomAgents: [],
  agentRuns: [],
  tasks: [],
  projects: [],
  projectTasks: [],
  projectOutputs: {},
  projectDeliveries: {},
  projectDistribution: null,
  skillInvocations: [],
  skillApprovals: [],
  artifacts: [],
  runtime: null,
  workspace: null,
  workspaceFiles: [],
  workspacePath: '',
  activeFilePath: '',
  inspectorFile: null,
  previewPath: '',
  previewUrl: '',
  messages: [],
  activeRoomId: null,
  editingProviderId: null,
  providerProbeRequestId: 0,
  editingCredentialId: null,
  editingRoleId: null,
  editingSkillId: null,
  editingAgentId: null,
  editingRoomId: null,
  replyToMessage: null,
  isResponding: false,
  activeResponseCount: 0,
  activeStreams: new Set(),
  activeRunIds: new Set(),
  messagePollTimer: null,
  messagePollInFlight: false,
  activeMessagePollUntil: 0,
  followLatestMessages: true,
  eventSource: null,
  eventRefreshTimer: null,
  eventRefreshInFlight: false,
  globalEventRefreshTimer: null,
  eventMentionRefreshTimers: {},
  lastResourcePollAt: 0,
  mentionPollTimer: null,
  stopRequested: false,
  messagesHasMore: false,
  oldestMessageCursor: null,
  isLoadingOlderMessages: false,
  userMentionIds: new Set(),
  roomMentionCounts: {},
  roomCrossRoomNotices: {},
  userMentionNoticeTimer: null,
  activeAppSection: 'chats',
  conversationFilter: 'all',
  conversationSearch: '',
  roomTemplateSearch: '',
  roomTemplateCategory: 'all',
  skillCategory: 'all',
  agentTemplateSearch: '',
  agentTemplateCategory: 'all',
  roomInspectorOpen: false,
  roomInspectorTab: 'details',
  roomInspectorSections: {
    agents: false,
    tasks: false,
    projects: false,
    files: false,
    preview: false,
    activity: false,
    artifacts: false
  }
};

const MAX_AGENT_TURNS = 6;
const ACTIVE_MESSAGE_POLL_MS = 1500;
const ACTIVE_MESSAGE_GRACE_MS = 12000;
const ACTIVE_ROOM_STORAGE_KEY = 'agentim.activeRoomId';
const SEEN_MENTIONS_STORAGE_KEY = 'agentim.seenMentionIds';
const ROOM_MENTION_COUNTS_STORAGE_KEY = 'agentim.roomMentionCounts';
const LEGACY_PASSWORD_STORAGE_KEYS = [
  'agentim.password',
  'agentim.authPassword',
  'agentim.loginPassword',
  'agentim.currentPassword',
  'promptlib.accessPassword',
  'agentim_session',
  'password'
];

const els = {
  apiStatus: document.querySelector('#api-status'),
  mobileApiStatus: document.querySelector('#mobile-api-status'),
  mobileChatListToggle: document.querySelector('#mobile-chat-list-toggle'),
  mobileRoomInfoToggle: document.querySelector('#mobile-room-info-toggle'),
  mobileRoomTitle: document.querySelector('#mobile-room-title'),
  appSectionButtons: document.querySelectorAll('[data-app-section-button]'),
  appSectionPanels: document.querySelectorAll('[data-app-section-panel]'),
  mobileTabs: document.querySelectorAll('[data-mobile-tab]'),
  mobilePanes: document.querySelectorAll('[data-mobile-pane]'),
  sectionTabs: document.querySelectorAll('[data-section-tab]'),
  sectionPanels: document.querySelectorAll('[data-section-panel]'),
  appShell: document.querySelector('#app-shell'),
  authGate: document.querySelector('#auth-gate'),
  authForm: document.querySelector('#auth-form'),
  authTitle: document.querySelector('#auth-title'),
  authHelp: document.querySelector('#auth-help'),
  authSubmit: document.querySelector('#auth-submit'),
  authError: document.querySelector('#auth-error'),
  passwordReminder: document.querySelector('#password-reminder'),
  passwordWarning: document.querySelector('#password-warning'),
  runtimeInfo: document.querySelector('#runtime-info'),
  passwordForm: document.querySelector('#password-form'),
  conversationFilters: document.querySelectorAll('[data-conversation-filter]'),
  conversationSearch: document.querySelector('#conversation-search'),
  workTabs: document.querySelectorAll('[data-work-tab]'),
  workPanels: document.querySelectorAll('[data-work-panel]'),
  roomForm: document.querySelector('#room-form'),
  roomSubmit: document.querySelector('#room-submit'),
  roomCancel: document.querySelector('#room-cancel'),
  settingsForm: document.querySelector('#settings-form'),
  chatSettingsForm: document.querySelector('#chat-settings-form'),
  trustedApprovalCount: document.querySelector('#trusted-approval-count'),
  trustedApprovalList: document.querySelector('#trusted-approval-list'),
  secretForm: document.querySelector('#secret-form'),
  secretSave: document.querySelector('#secret-save'),
  secretCancel: document.querySelector('#secret-cancel'),
  secretCount: document.querySelector('#secret-count'),
  secretList: document.querySelector('#secret-list'),
  credentialTypeOpen: document.querySelector('#credential-type-open'),
  credentialTypeModal: document.querySelector('#credential-type-modal'),
  credentialTypeForm: document.querySelector('#credential-type-form'),
  credentialTypeClose: document.querySelector('#credential-type-close'),
  credentialTypeCancel: document.querySelector('#credential-type-cancel'),
  credentialFieldAdd: document.querySelector('#credential-field-add'),
  credentialFieldList: document.querySelector('#credential-field-list'),
  credentialTypeList: document.querySelector('#credential-type-list'),
  roomCount: document.querySelector('#room-count'),
  roomCountCopy: document.querySelector('#room-count-copy'),
  conversationList: document.querySelector('#conversation-list'),
  roomList: document.querySelector('#room-list'),
  roomTemplateCount: document.querySelector('#room-template-count'),
  roomTemplateList: document.querySelector('#room-template-list'),
  roomTemplateSearch: document.querySelector('#room-template-search'),
  roomTemplateCategory: document.querySelector('#room-template-category'),
  circleForm: document.querySelector('#circle-form'),
  circleAgentTemplateList: document.querySelector('#circle-agent-template-list'),
  providerForm: document.querySelector('#provider-form'),
  probeButton: document.querySelector('#probe-provider'),
  probeResult: document.querySelector('#probe-result'),
  providerCount: document.querySelector('#provider-count'),
  providerList: document.querySelector('#provider-list'),
  providerSubmit: document.querySelector('#provider-submit'),
  providerCancel: document.querySelector('#provider-cancel'),
  roleForm: document.querySelector('#role-form'),
  roleList: document.querySelector('#role-list'),
  roleCount: document.querySelector('#role-count'),
  roleSubmit: document.querySelector('#role-submit'),
  roleCancel: document.querySelector('#role-cancel'),
  skillForm: document.querySelector('#skill-form'),
  skillList: document.querySelector('#skill-list'),
  skillCount: document.querySelector('#skill-count'),
  skillSubmit: document.querySelector('#skill-submit'),
  skillValidate: document.querySelector('#skill-validate'),
  skillPreview: document.querySelector('#skill-preview'),
  skillCancel: document.querySelector('#skill-cancel'),
  skillCategoryTabs: document.querySelector('#skill-category-tabs'),
  agentForm: document.querySelector('#agent-form'),
  agentList: document.querySelector('#agent-list'),
  agentCount: document.querySelector('#agent-count'),
  agentTemplateCount: document.querySelector('#agent-template-count'),
  agentTemplateList: document.querySelector('#agent-template-list'),
  agentTemplateSearch: document.querySelector('#agent-template-search'),
  agentTemplateCategory: document.querySelector('#agent-template-category'),
  agentSubmit: document.querySelector('#agent-submit'),
  agentCancel: document.querySelector('#agent-cancel'),
  agentRoleSelect: document.querySelector('#agent-form select[name="roleId"]'),
  taskForm: document.querySelector('#task-form'),
  taskCount: document.querySelector('#task-count'),
  taskList: document.querySelector('#task-list'),
  taskAgentSelect: document.querySelector('#task-form select[name="agentId"]'),
  providerSelect: document.querySelector('#agent-form select[name="providerId"]'),
  agentModelSelect: document.querySelector('#agent-form select[name="model"]'),
  conversationTitle: document.querySelector('#conversation-title'),
  roomInspectorToggle: document.querySelector('#room-inspector-toggle'),
  roomInspectorClose: document.querySelector('#room-inspector-close'),
  roomInspector: document.querySelector('#room-inspector'),
  roomInspectorTitle: document.querySelector('#room-inspector-title'),
  roomInspectorContent: document.querySelector('#room-inspector-content'),
  roomInspectorClear: document.querySelector('#room-inspector-clear'),
  messages: document.querySelector('#messages'),
  scrollLatest: document.querySelector('#scroll-latest'),
  messageForm: document.querySelector('#message-form'),
  mentionBar: document.querySelector('#mention-bar'),
  replyPreview: document.querySelector('#reply-preview'),
  responseStatus: document.querySelector('#response-status'),
  stopResponse: document.querySelector('#stop-response'),
  sendMessage: document.querySelector('#send-message'),
  workspaceMeta: document.querySelector('#workspace-meta'),
  workspaceExport: document.querySelector('#workspace-export'),
  projectForm: document.querySelector('#project-form'),
  projectAgentSelect: document.querySelector('#project-form select[name="agentId"]'),
  projectTypeSelect: document.querySelector('#project-form select[name="type"]'),
  projectDistribution: document.querySelector('#project-distribution'),
  projectList: document.querySelector('#project-list'),
  projectTaskList: document.querySelector('#project-task-list'),
  agentWorkCount: document.querySelector('#agent-work-count'),
  agentWorkList: document.querySelector('#agent-work-list'),
  workspacePath: document.querySelector('#workspace-path'),
  workspaceFiles: document.querySelector('#workspace-files'),
  workspaceNewFile: document.querySelector('#workspace-new-file'),
  workspaceNewDir: document.querySelector('#workspace-new-dir'),
  skillInvocationCount: document.querySelector('#skill-invocation-count'),
  skillInvocationList: document.querySelector('#skill-invocation-list'),
  artifactCount: document.querySelector('#artifact-count'),
  artifactList: document.querySelector('#artifact-list'),
  workspaceEditor: document.querySelector('#workspace-editor'),
  workspaceDelete: document.querySelector('#workspace-delete'),
  previewMeta: document.querySelector('#preview-meta'),
  previewPath: document.querySelector('#preview-path'),
  previewRefresh: document.querySelector('#preview-refresh'),
  previewOpen: document.querySelector('#preview-open'),
  previewFrame: document.querySelector('#preview-frame')
};

window.activateAppSection = activateAppSection;
window.activateWorkTab = activateWorkTab;
window.activateSectionTab = activateSectionTab;
window.activateMobilePane = activateMobilePane;

clearLegacyPasswordStorage();
await init();

for (const button of els.appSectionButtons) {
  button.addEventListener('click', () => activateAppSection(button.getAttribute('data-app-section-button')));
}

els.mobileChatListToggle?.addEventListener('click', () => toggleMobileChatList());
els.mobileRoomInfoToggle?.addEventListener('click', () => {
  state.roomInspectorOpen = !state.roomInspectorOpen;
  renderRoomInspector();
});

document.addEventListener('click', (event) => {
  const appButton = event.target.closest?.('[data-app-section-button]');
  if (appButton) {
    activateAppSection(appButton.getAttribute('data-app-section-button'));
    return;
  }
  const workButton = event.target.closest?.('[data-work-tab]');
  if (workButton) {
    activateWorkTab(workButton.getAttribute('data-work-tab'));
    return;
  }
  const sectionButton = event.target.closest?.('[data-section-tab]');
  if (sectionButton) {
    activateSectionTab(sectionButton.getAttribute('data-section-tab'));
    return;
  }
  const mobileButton = event.target.closest?.('[data-mobile-tab]');
  if (mobileButton) {
    activateMobilePane(mobileButton.getAttribute('data-mobile-tab'));
  }
});

for (const tab of els.workTabs) {
  tab.addEventListener('click', () => activateWorkTab(tab.getAttribute('data-work-tab')));
}

for (const tab of els.sectionTabs) {
  tab.addEventListener('click', () => activateSectionTab(tab.getAttribute('data-section-tab')));
}

for (const tab of els.mobileTabs) {
  tab.addEventListener('click', () => activateMobilePane(tab.getAttribute('data-mobile-tab')));
}

for (const button of els.conversationFilters) {
  button.addEventListener('click', () => activateConversationFilter(button.getAttribute('data-conversation-filter')));
}

els.conversationSearch?.addEventListener('input', () => {
  state.conversationSearch = els.conversationSearch.value.trim().toLowerCase();
  renderConversationList();
});

els.roomTemplateSearch?.addEventListener('input', () => {
  state.roomTemplateSearch = els.roomTemplateSearch.value.trim().toLowerCase();
  renderRoomTemplates();
});

els.roomTemplateCategory?.addEventListener('change', () => {
  state.roomTemplateCategory = els.roomTemplateCategory.value || 'all';
  renderRoomTemplates();
});

els.agentTemplateSearch?.addEventListener('input', () => {
  state.agentTemplateSearch = els.agentTemplateSearch.value.trim().toLowerCase();
  renderAgentTemplates();
});

els.agentTemplateCategory?.addEventListener('change', () => {
  state.agentTemplateCategory = els.agentTemplateCategory.value || 'all';
  renderAgentTemplates();
});

els.roomInspectorToggle?.addEventListener('click', () => {
  state.roomInspectorOpen = !state.roomInspectorOpen;
  renderRoomInspector();
});

els.roomInspectorClose?.addEventListener('click', () => {
  state.roomInspectorOpen = false;
  renderRoomInspector();
});

els.roomForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formData(els.roomForm);
  const editing = Boolean(state.editingRoomId);
  try {
    if (editing) {
      const room = await api(`/api/rooms/${state.editingRoomId}`, {
        method: 'PATCH',
        body: data
      });
      replaceById(state.rooms, room);
      resetRoomForm();
    } else {
      const room = await api('/api/rooms', {
        method: 'POST',
        body: data
      });
      state.rooms.push(room);
      setActiveRoomId(room.id);
      resetMessagePagination();
      state.agentRuns = [];
      state.tasks = [];
      state.projects = [];
      state.projectTasks = [];
      state.projectOutputs = {};
      state.skillInvocations = [];
      state.skillApprovals = [];
      state.artifacts = [];
      state.workspace = null;
      state.workspaceFiles = [];
      state.workspacePath = '';
      state.activeFilePath = '';
      resetPreview();
      await refreshRoomAgents();
      await refreshTasks();
      await refreshProjects();
      await refreshSkillInvocations();
      await refreshSkillApprovals();
      await refreshArtifacts();
      await refreshWorkspace();
    }
    state.conversations = state.rooms;
    renderAll();
    alert(editing ? 'Room updated successfully.' : 'Room created successfully.');
  } catch (error) {
    alert(`Room ${editing ? 'update' : 'creation'} failed: ${roomErrorMessage(error)}`);
  }
});

els.roomCancel.addEventListener('click', resetRoomForm);
els.messages.addEventListener('scroll', () => {
  if (els.messages.scrollTop <= 12) {
    loadOlderMessages();
  }
  state.followLatestMessages = isMessagesNearBottom(32);
  updateScrollLatestButton();
});

els.scrollLatest?.addEventListener('click', () => {
  scrollMessagesToBottom();
});

els.passwordReminder?.addEventListener('click', () => {
  activateAppSection('settings');
  activateSectionTab('settings:system');
  els.passwordForm?.elements.password?.focus();
});

els.circleForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(els.circleForm);
  const agentTemplateIds = data.getAll('agentTemplateIds').map((id) => String(id));
  if (agentTemplateIds.length === 0) {
    alert('Select at least one Agent Template.');
    return;
  }
  const result = await api('/api/room-templates', {
    method: 'POST',
    body: {
      name: String(data.get('name') ?? '').trim(),
      category: String(data.get('category') ?? 'custom').trim(),
      description: String(data.get('description') ?? '').trim(),
      roomName: String(data.get('roomName') ?? '').trim() || String(data.get('name') ?? '').trim(),
      roomDescription: String(data.get('roomDescription') ?? '').trim(),
      agentTemplateIds
    }
  });
  els.circleForm.reset();
  els.circleForm.elements.category.value = result.template?.category ?? 'custom';
  await refreshRoomTemplates();
  renderRoomTemplates();
  alert('Circle saved.');
});

els.authForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formData(els.authForm);
  els.authError.textContent = '';
  try {
    const passwordSet = Boolean(state.settings?.auth?.passwordSet);
    const result = await api(passwordSet ? '/api/auth/login' : '/api/auth/password', {
      method: 'POST',
      body: passwordSet
        ? { password: data.password }
        : { password: data.password }
    });
    state.settings.auth = result.auth ?? { passwordSet: true, authenticated: true };
    els.authForm.reset();
    showAuthGate(false);
    await init({ skipAuthCheck: true });
  } catch (error) {
    els.authError.textContent = authErrorMessage(error);
  }
});

els.passwordForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formData(els.passwordForm);
  const auth = state.settings?.auth ?? {};
  const currentPassword = String(data.currentPassword ?? '').trim();
  const nextPassword = String(data.password ?? '');
  if (auth.passwordSet && !currentPassword) {
    alert(authErrorMessage({ message: 'current_password_required' }));
    els.passwordForm.elements.currentPassword?.focus();
    return;
  }
  try {
    const result = await api('/api/auth/password', {
      method: 'POST',
      body: {
        currentPassword,
        password: nextPassword
      }
    });
    state.settings.auth = result.auth ?? { passwordSet: true, authenticated: true };
    els.passwordForm.reset();
    renderSettings();
    alert('Login password saved.');
  } catch (error) {
    alert(authErrorMessage(error));
  }
});

els.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formData(els.settingsForm);
  const settings = await api('/api/settings', {
    method: 'PATCH',
    body: {
      network: {
        proxyEnabled: data.proxyEnabled === 'on',
        proxyUrl: data.proxyUrl,
        providerTimeoutMs: Number(data.providerTimeoutMs)
      },
      apiRequest: {
        enabled: data.apiRequestEnabled === 'on',
        allowlistEnabled: data.apiRequestAllowlistEnabled === 'on',
        allowedHosts: String(data.apiRequestAllowedHosts ?? '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
        allowHttp: data.apiRequestAllowHttp === 'on',
        allowLocalhost: data.apiRequestAllowLocalhost === 'on',
        allowPrivateNetwork: data.apiRequestAllowPrivateNetwork === 'on',
        timeoutMs: Number(data.apiRequestTimeoutMs),
        maxResponseBytes: Number(data.apiRequestMaxResponseBytes)
      }
    }
  });
  state.settings = settings;
  state.messagePageSize = settings.chat?.messagePageSize ?? 20;
  renderSettings();
  if (state.activeRoomId) {
    await loadLatestMessages();
    renderMessages();
  }
  alert('Global settings saved.');
});

els.chatSettingsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formData(els.chatSettingsForm);
  const settings = await api('/api/settings', {
    method: 'PATCH',
    body: {
      chat: {
        messagePageSize: Number(data.messagePageSize)
      },
      approvals: {
        mode: data.approvalMode
      }
    }
  });
  state.settings = settings;
  state.messagePageSize = settings.chat?.messagePageSize ?? 20;
  renderSettings();
  if (state.activeRoomId) {
    await loadLatestMessages();
    renderMessages();
  }
  alert('Chat settings saved.');
});

els.secretSave?.addEventListener('click', async () => {
  const type = String(els.secretForm?.querySelector('[name="type"]')?.value ?? '').trim();
  const nameInput = els.secretForm?.querySelector('[name="name"]');
  const name = String(nameInput?.value ?? '').trim();
  const schema = credentialTypeOptions().find((item) => item.id === type);
  if (!type || !schema || !name) {
    alert('Credential type and name are required.');
    return;
  }
  const values = {};
  for (const field of schema.fields ?? []) {
    const input = els.secretForm?.querySelector(`[name="field:${CSS.escape(field.name)}"]`);
    if (!input) continue;
    values[field.name] = input.type === 'checkbox' ? input.checked : input.value;
  }
  const result = await api('/api/settings/credentials', {
    method: 'POST',
    body: { id: state.editingCredentialId, type, name, values }
  });
  state.settings.credentials = result.credentials ?? [];
  resetCredentialForm();
  renderSettings();
});

els.secretCancel?.addEventListener('click', () => {
  resetCredentialForm();
  renderSettings();
});

els.credentialTypeOpen?.addEventListener('click', () => openCredentialTypeModal());
els.credentialTypeClose?.addEventListener('click', closeCredentialTypeModal);
els.credentialTypeCancel?.addEventListener('click', closeCredentialTypeModal);
els.credentialFieldAdd?.addEventListener('click', () => addCredentialFieldRow());
els.credentialTypeForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const manifest = credentialTypeManifestFromForm();
  if (!manifest.id || !manifest.name || manifest.fields.length === 0) {
    alert('Credential type id, name, and at least one field are required.');
    return;
  }
  const result = await api('/api/settings/credential-types', {
    method: 'POST',
    body: manifest
  });
  state.settings.customCredentialTypes = result.customCredentialTypes ?? [];
  closeCredentialTypeModal();
  renderSettings();
});

els.secretForm?.querySelector('[name="typeFilter"]')?.addEventListener('input', () => {
  renderCredentialTypeSelect();
  renderCredentialFields();
});

els.probeButton.addEventListener('click', async () => {
  const requestId = state.providerProbeRequestId + 1;
  state.providerProbeRequestId = requestId;
  const data = formData(els.providerForm);
  if (state.editingProviderId && !String(data.apiKey ?? '').trim()) {
    data.providerId = state.editingProviderId;
  }
  els.probeResult.style.display = 'block';
  els.probeResult.textContent = 'Probing...';
  els.probeButton.disabled = true;
  els.probeButton.textContent = 'Probing';

  try {
    if (data.baseUrl === 'mock://provider') {
      if (requestId !== state.providerProbeRequestId) return;
      els.probeResult.textContent = JSON.stringify({
        ok: true,
        protocol: 'mock',
        models: [{ id: data.defaultModel, name: data.defaultModel }]
      }, null, 2);
      return;
    }

    const result = await api('/api/model-providers/probe', {
      method: 'POST',
      body: data
    });
    if (requestId !== state.providerProbeRequestId) return;
    els.probeResult.textContent = JSON.stringify(result, null, 2);

    if (result.ok && result.models?.[0]) {
      els.providerForm.elements.defaultModel.value = result.models[0].id;
    }
  } catch (error) {
    if (requestId !== state.providerProbeRequestId) return;
    els.probeResult.textContent = JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      details: error?.data ?? null
    }, null, 2);
  } finally {
    if (requestId === state.providerProbeRequestId) {
      els.probeButton.disabled = false;
      els.probeButton.textContent = 'Probe';
    }
  }
});

els.providerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formData(els.providerForm);
  const path = state.editingProviderId
    ? `/api/model-providers/${state.editingProviderId}`
    : '/api/model-providers';
  const saved = await api(path, {
    method: state.editingProviderId ? 'PATCH' : 'POST',
    body: {
      ...data,
      models: [{ id: data.defaultModel, name: data.defaultModel }]
    }
  });
  if (state.editingProviderId) {
    replaceById(state.providers, saved);
    resetProviderForm();
  } else {
    state.providers.push(saved);
  }
  renderAll();
});

els.providerCancel.addEventListener('click', resetProviderForm);

els.roleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = {
    ...formData(els.roleForm),
    skillIds: selectedRoleSkillIds()
  };
  const path = state.editingRoleId
    ? `/api/roles/${state.editingRoleId}`
    : '/api/roles';
  const saved = await api(path, {
    method: state.editingRoleId ? 'PATCH' : 'POST',
    body: data
  });
  if (state.editingRoleId) {
    replaceById(state.roles, saved);
    resetRoleForm();
  } else {
    state.roles.push(saved);
    resetRoleForm();
  }
  renderAll();
});

els.roleCancel.addEventListener('click', resetRoleForm);

els.skillForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  let manifest;
  try {
    manifest = JSON.parse(els.skillForm.elements.manifest.value);
  } catch {
    alert('Skill manifest must be valid JSON.');
    return;
  }
  const preview = previewSkillManifest(manifest);
  renderSkillPreview(preview);
  if (!preview.ok) return;
  if (skillManifestNeedsInstallConfirmation(manifest) && !confirm(`Install "${manifest.name ?? manifest.id}" with network or elevated permissions?`)) {
    return;
  }
  try {
    const saved = await api('/api/skills/install', {
      method: 'POST',
      body: manifest
    });
    replaceByIdOrPush(state.skills, saved);
    resetSkillForm();
    renderAll();
  } catch (error) {
    alert(`Skill install failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

els.skillValidate?.addEventListener('click', () => {
  let manifest;
  try {
    manifest = JSON.parse(els.skillForm.elements.manifest.value);
  } catch {
    renderSkillPreview({ ok: false, errors: ['Manifest must be valid JSON.'], summary: [] });
    return;
  }
  renderSkillPreview(previewSkillManifest(manifest));
});

els.skillCancel.addEventListener('click', resetSkillForm);

els.agentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = formData(els.agentForm);
  const editing = Boolean(state.editingAgentId);
  try {
    if (editing) {
      const saved = await api(`/api/agents/${state.editingAgentId}`, {
        method: 'PATCH',
        body: data
      });
      replaceById(state.agents, saved);
      resetAgentForm();
    } else {
      const saved = await api('/api/agents', {
        method: 'POST',
        body: {
          ...data,
          roomId: state.activeRoomId
        }
      });
      state.agents.push(saved);
      if (state.activeRoomId) {
        await refreshRoomAgents();
      }
    }
    renderAll();
    alert(editing ? 'Agent updated successfully.' : 'Agent created successfully.');
  } catch (error) {
    alert(`Agent ${editing ? 'update' : 'creation'} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

els.agentCancel.addEventListener('click', resetAgentForm);

els.projectAgentSelect.addEventListener('change', async () => {
  await refreshProjectDistribution();
  renderProjectDistribution();
});

els.projectTypeSelect.addEventListener('change', async () => {
  await refreshProjectDistribution();
  renderProjectDistribution();
});

els.projectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.activeRoomId) return;
  const data = formData(els.projectForm);
  try {
    setResponseState(true, 'Starting project...');
    const result = await api(`/api/rooms/${state.activeRoomId}/projects`, {
      method: 'POST',
      body: {
        agentId: data.agentId,
        name: data.name,
        type: data.type,
        instructions: data.instructions
      }
    });
    if (result.project) replaceByIdOrPush(state.projects, result.project);
    if (Array.isArray(result.tasks)) state.projectTasks = mergeProjectTasks(state.projectTasks, result.tasks);
    if (result.distribution) state.projectDistribution = result.distribution;
    resetProjectForm();
    await loadLatestMessages({ markMentionsSeen: true });
    state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
    await refreshProjects();
    renderAll();
    ensureMessagePolling();
  } catch (error) {
    setResponseState(false);
    alert(`Project creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

els.taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.activeRoomId) return;
  const data = formData(els.taskForm);
  try {
    const task = await api(`/api/rooms/${state.activeRoomId}/tasks`, {
      method: 'POST',
      body: {
        title: data.title,
        agentId: data.agentId,
        scheduleAt: data.scheduleAt,
        instructions: data.instructions,
        repeatInterval: data.repeatInterval
      }
    });
    replaceByIdOrPush(state.tasks, task);
    resetTaskForm();
    renderAll();
  } catch (error) {
    alert(`Task schedule failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

els.providerSelect.addEventListener('change', async () => {
  await refreshProviderModels(els.providerSelect.value);
  renderAgentModelOptions();
});

els.stopResponse.addEventListener('click', stopCurrentResponses);

els.workspaceNewFile.addEventListener('click', () => {
  const path = els.workspacePath.value.trim() || 'src/index.js';
  openWorkspaceFile(path, '');
});

els.workspaceNewDir.addEventListener('click', async () => {
  const path = els.workspacePath.value.trim();
  if (!path || !state.activeRoomId) return;
  await api(`/api/rooms/${state.activeRoomId}/files/mkdir`, {
    method: 'POST',
    body: { path }
  });
  await refreshWorkspaceFiles(dirname(path));
});

els.workspaceEditor.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.activeRoomId) return;
  const data = formData(els.workspaceEditor);
  const path = String(data.path ?? '').trim();
  if (!path) return;
  await api(`/api/rooms/${state.activeRoomId}/files/write`, {
    method: 'PUT',
    body: {
      path,
      content: data.content ?? ''
    }
  });
  state.activeFilePath = path;
  if (isPreviewablePath(path)) setPreviewPath(path, false);
  await refreshWorkspaceFiles(dirname(path));
});

els.workspaceDelete.addEventListener('click', async () => {
  if (!state.activeRoomId) return;
  const path = els.workspaceEditor.elements.path.value.trim();
  if (!path) return;
  const result = await api(`/api/rooms/${state.activeRoomId}/files?path=${encodeURIComponent(path)}`, {
    method: 'DELETE'
  });
  if (result.approvalRequired) {
    replaceByIdOrPush(state.skillApprovals, result.approval);
    replaceByIdOrPush(state.skillInvocations, result.invocation);
    activateWorkTab('activity');
    renderSkillInvocations();
    renderRoomInspector();
    alert('Delete request is waiting for approval in Activity.');
    return;
  }
  openWorkspaceFile('', '');
  await refreshWorkspaceFiles(dirname(path));
});

els.previewRefresh.addEventListener('click', () => {
  setPreviewPath(els.previewPath.value.trim() || state.activeFilePath);
});

els.previewOpen.addEventListener('click', () => {
  openPreviewPage(state.previewPath);
});

els.messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = els.messageForm.elements.content.value.trim();
  if (!content || !state.activeRoomId) return;
  const explicitMentions = resolveComposerMentions(content);

  state.stopRequested = false;
  state.activeResponseCount += 1;
  markActiveMessagePolling();
  setResponseState(true, 'Sending message...');

  try {
    const dispatch = await api(`/api/rooms/${state.activeRoomId}/dispatch`, {
      method: 'POST',
      body: {
        content,
        targetAgentIds: explicitMentions
          .filter((mention) => mention.id !== 'all')
          .map((mention) => mention.id),
        targetAll: explicitMentions.some((mention) => mention.id === 'all'),
        senderName: 'You',
        replyToMessageId: state.replyToMessage?.id
      }
    });
    els.messageForm.elements.content.value = '';
    clearReplyTarget();
    state.messages.push(dispatch.message);
    renderMessages();
    await streamReplies(dispatch.targets);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'target_required') {
      alert('Mention an Agent with @name, or use @all.');
      return;
    }
    state.messages.push({
      id: `error-${Date.now()}`,
      roomId: state.activeRoomId,
      conversationId: state.activeRoomId,
      senderType: 'system',
      senderName: 'AgentIM',
      content: `Message failed: ${message}`,
      createdAt: new Date().toISOString()
    });
    renderMessages();
  } finally {
    state.activeResponseCount = Math.max(0, state.activeResponseCount - 1);
    if (state.activeResponseCount === 0 && !hasPendingMessages()) {
      setResponseState(false);
    } else {
      setResponseState(true, 'Agent is responding...');
    }
  }
});

async function init(options = {}) {
  restoreMentionState();
  try {
    const health = await api('/api/health');
    state.runtime = health.runtime ?? state.runtime;
    setApiStatus(health.ok ? onlineStatusLabel() : 'Degraded');
  } catch (error) {
    setApiStatus('Offline');
    console.error(error);
    return;
  }

  if (!options.skipAuthCheck) {
    try {
      const authStatus = await api('/api/auth/status');
      state.settings.auth = authStatus.auth ?? state.settings.auth;
      if (!authStatus.auth?.passwordSet || !authStatus.auth?.authenticated) {
        showAuthGate(true);
        renderSettings();
        return;
      }
    } catch (error) {
      setApiStatus('Degraded · auth failed');
      console.error(error);
      return;
    }
  }

  try {
    const boot = await api('/api/bootstrap');
    updateRuntimeInfo(boot.runtime);
    state.settings = boot.settings ?? state.settings;
    state.providers = boot.providers ?? [];
    state.agents = boot.agents ?? [];
    await refreshAgentTemplates();
    await refreshRoomTemplates();
    state.skills = boot.skills ?? [];
    state.roles = boot.roles ?? [];
    state.rooms = boot.rooms ?? boot.conversations ?? [];
    state.conversations = state.rooms;
    state.roomAgents = boot.roomAgents ?? [];
    state.agentRuns = boot.agentRuns ?? [];
    state.tasks = boot.scheduledTasks ?? [];
    state.projects = boot.projects ?? [];
    state.projectTasks = boot.projectTasks ?? [];
    state.skillInvocations = boot.skillInvocations ?? [];
    state.skillApprovals = boot.skillApprovals ?? [];
    state.artifacts = boot.artifacts ?? [];
    state.messagePageSize = state.settings?.chat?.messagePageSize ?? 20;
    setActiveRoomId(resolveInitialActiveRoomId());
  } catch (error) {
    setApiStatus('Degraded · bootstrap failed');
    console.error(error);
    renderAll();
    return;
  }

  if (state.activeRoomId) {
    try {
      await loadLatestMessages({ markMentionsSeen: true });
      state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
      await refreshTasks();
      await refreshProjects();
      await refreshSkillInvocations();
      await refreshSkillApprovals();
      await refreshArtifacts();
      await refreshRoomAgents();
      await refreshWorkspace();
    } catch (error) {
      setApiStatus('Degraded · room data failed');
      console.error(error);
    }
  }

  renderAll();
  resetSkillForm();
  resetTaskForm();
  resetProjectForm();
  connectEventStream();
  ensureMessagePolling();
  ensureMentionPolling();
  if (state.providers[0]) {
    await refreshProviderModels(state.providers[0].id);
    renderProviders();
    renderAgents();
  }
}

function renderAll() {
  renderAppSections();
  renderConversationFilters();
  renderSettings();
  renderRooms();
  renderRoomTemplates();
  renderConversationList();
  renderProviders();
  renderRoles();
  renderRoleSkillOptions();
  renderSkills();
  renderAgentRoleOptions();
  renderAgents();
  renderAgentTemplates();
  renderTaskAgentOptions();
  renderProjectAgentOptions();
  renderProjectDistribution();
  renderTasks();
  renderProjects();
  renderAgentWorkCenter();
  renderConversation();
  renderRoomInspector();
  renderMessages();
  renderReplyPreview();
  renderWorkspace();
  renderSkillInvocations();
  renderTrustedApprovals();
  renderArtifacts();
}

function resolveInitialActiveRoomId() {
  const savedRoomId = localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
  if (savedRoomId && state.rooms.some((room) => room.id === savedRoomId)) return savedRoomId;
  return state.rooms[0]?.id ?? null;
}

function setActiveRoomId(roomId) {
  const nextRoomId = roomId || null;
  state.activeRoomId = nextRoomId;
  if (nextRoomId) localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, nextRoomId);
  else localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
}

function renderAppSections() {
  els.appShell?.classList.toggle('management-mode', state.activeAppSection !== 'chats');
  if (els.appShell) els.appShell.dataset.activeSection = state.activeAppSection;
  renderMobileAppBar();
  for (const button of els.appSectionButtons) {
    button.classList.toggle('active', button.getAttribute('data-app-section-button') === state.activeAppSection);
  }
  for (const panel of els.appSectionPanels) {
    panel.classList.toggle('active', panel.getAttribute('data-app-section-panel') === state.activeAppSection);
  }
}

function renderSettings() {
  const auth = state.settings?.auth ?? {};
  if (els.passwordReminder) {
    els.passwordReminder.hidden = Boolean(auth.passwordSet);
  }
  if (els.passwordWarning) {
    els.passwordWarning.hidden = Boolean(auth.passwordSet);
  }
  if (els.passwordForm?.elements.currentPassword) {
    els.passwordForm.elements.currentPassword.closest('label').hidden = !auth.passwordSet;
    els.passwordForm.elements.currentPassword.required = Boolean(auth.passwordSet);
  }
  els.settingsForm.elements.proxyEnabled.checked = Boolean(state.settings?.network?.proxyEnabled);
  els.settingsForm.elements.proxyUrl.value = state.settings?.network?.proxyUrl ?? '';
  els.settingsForm.elements.providerTimeoutMs.value = state.settings?.network?.providerTimeoutMs ?? 300000;
  const apiRequest = state.settings?.apiRequest ?? {};
  els.settingsForm.elements.apiRequestEnabled.checked = apiRequest.enabled !== false;
  els.settingsForm.elements.apiRequestAllowlistEnabled.checked = Boolean(apiRequest.allowlistEnabled);
  els.settingsForm.elements.apiRequestAllowedHosts.value = (apiRequest.allowedHosts ?? []).join('\n');
  els.settingsForm.elements.apiRequestAllowHttp.checked = apiRequest.allowHttp !== false;
  els.settingsForm.elements.apiRequestAllowLocalhost.checked = apiRequest.allowLocalhost !== false;
  els.settingsForm.elements.apiRequestAllowPrivateNetwork.checked = apiRequest.allowPrivateNetwork !== false;
  els.settingsForm.elements.apiRequestTimeoutMs.value = apiRequest.timeoutMs ?? 30000;
  els.settingsForm.elements.apiRequestMaxResponseBytes.value = apiRequest.maxResponseBytes ?? 512000;
  if (els.chatSettingsForm) {
    els.chatSettingsForm.elements.messagePageSize.value = state.settings?.chat?.messagePageSize ?? 20;
    els.chatSettingsForm.elements.approvalMode.value = state.settings?.approvals?.mode ?? 'auto';
  }
  renderRuntimeInfo();
  renderTrustedApprovals();
  renderSecrets();
}

function renderSecrets() {
  if (!els.secretList) return;
  renderCredentialTypeSelect();
  renderCredentialFields();
  const credentials = state.settings?.credentials ?? [];
  if (els.secretCount) els.secretCount.textContent = String(credentials.length);
  els.secretList.innerHTML = credentials.length > 0
    ? credentialGroups(credentials).map(({ type, typeName, credentials: groupCredentials }) => `
      <section class="skill-category-group">
        <div class="skill-category-heading">
          <strong>${escapeHtml(typeName)}</strong>
          <span>${escapeHtml(type)} · ${groupCredentials.length}</span>
        </div>
        <div class="skill-category-list">
          ${groupCredentials.map((credential) => `
            <div class="entity-item">
              <div class="entity-main">
                <strong>${escapeHtml(credential.name)}</strong>
                <span>${escapeHtml(credential.type)}</span>
                <span>${escapeHtml(credentialFieldSummary(credential))}</span>
              </div>
              <div class="entity-actions">
                <button type="button" data-test-credential="${escapeHtml(credential.id)}">Test</button>
                <button type="button" data-edit-credential="${escapeHtml(credential.id)}">Edit</button>
                <button type="button" class="danger-button" data-delete-credential="${escapeHtml(credential.id)}">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `).join('')
    : '<div class="muted-empty">No credentials saved.</div>';
  for (const item of els.secretList.querySelectorAll('[data-test-credential]')) {
    item.addEventListener('click', async () => {
      await testCredential(item.getAttribute('data-test-credential'));
    });
  }
  for (const item of els.secretList.querySelectorAll('[data-edit-credential]')) {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-edit-credential');
      const credential = credentials.find((entry) => entry.id === id);
      if (credential) startCredentialEdit(credential);
    });
  }
  for (const item of els.secretList.querySelectorAll('[data-delete-credential]')) {
    item.addEventListener('click', async () => {
      const id = item.getAttribute('data-delete-credential');
      if (!confirm('Delete credential?')) return;
      const result = await api(`/api/settings/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.settings.credentials = result.credentials ?? [];
      renderSettings();
    });
  }
  renderCredentialTypeList();
}

function credentialGroups(credentials) {
  const types = new Map(credentialTypeOptions().map((type) => [type.id, type]));
  const groups = new Map();
  for (const credential of credentials) {
    const type = credential.type || 'unknown';
    if (!groups.has(type)) {
      groups.set(type, {
        type,
        typeName: types.get(type)?.name ?? type,
        credentials: []
      });
    }
    groups.get(type).credentials.push(credential);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      credentials: group.credentials.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    }))
    .sort((a, b) => a.typeName.localeCompare(b.typeName));
}

async function testCredential(id) {
  if (!id) return;
  try {
    const result = await api(`/api/settings/credentials/${encodeURIComponent(id)}/test`, { method: 'POST' });
    alert(formatCredentialTestResult(result));
  } catch (error) {
    const result = error?.data;
    if (result?.checks) {
      alert(formatCredentialTestResult(result));
      return;
    }
    alert(`Credential test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function formatCredentialTestResult(result) {
  const lines = [
    result.ok ? 'Credential test passed.' : 'Credential test failed.',
    ...(result.checks ?? []).map((check) => `${check.status}: ${check.name} - ${check.message}`)
  ];
  return lines.join('\n');
}

function renderTrustedApprovals() {
  if (!els.trustedApprovalList) return;
  const trusted = trustedApprovalsForActiveRoom();
  if (els.trustedApprovalCount) els.trustedApprovalCount.textContent = String(trusted.length);
  els.trustedApprovalList.innerHTML = trusted.length > 0
    ? trusted.map((approval) => `
      <div class="entity-item">
        <div class="entity-main">
          <strong>${escapeHtml(approval.title ?? approval.skillId)}</strong>
          <span>${escapeHtml(trustedApprovalSummary(approval))}</span>
          <span>${escapeHtml(approval.decidedAt ? `Trusted ${new Date(approval.decidedAt).toLocaleString()}` : 'Trusted')}</span>
        </div>
        <div class="entity-actions">
          <button type="button" class="danger-button" data-revoke-approval-trust="${escapeHtml(approval.id)}">Revoke</button>
        </div>
      </div>
    `).join('')
    : '<div class="muted-empty">No chat-level approval trusts.</div>';
  for (const item of els.trustedApprovalList.querySelectorAll('[data-revoke-approval-trust]')) {
    item.addEventListener('click', async () => {
      const id = item.getAttribute('data-revoke-approval-trust');
      if (!confirm('Revoke this chat trust?')) return;
      const result = await api(`/api/skill-approvals/${encodeURIComponent(id)}/revoke-trust`, { method: 'POST' });
      if (result.approval) replaceByIdOrPush(state.skillApprovals, result.approval);
      await refreshSkillApprovals();
      renderTrustedApprovals();
      renderSkillInvocations();
    });
  }
}

function trustedApprovalsForActiveRoom() {
  return (state.skillApprovals ?? [])
    .filter((approval) =>
      approval.roomId === state.activeRoomId &&
      approval.status === 'approved' &&
      approval.input?.kind === 'skill_action' &&
      approval.input?.trustScope === 'room'
    )
    .sort((a, b) => String(b.decidedAt ?? b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.decidedAt ?? a.updatedAt ?? a.createdAt ?? '')));
}

function trustedApprovalSummary(approval) {
  const input = approval.input ?? {};
  return [
    input.skillId ?? approval.skillId,
    input.actionId,
    input.credentialName ? `credential: ${input.credentialName}` : ''
  ].filter(Boolean).join(' · ');
}

function renderCredentialTypeSelect() {
  const typeSelect = els.secretForm?.querySelector('[name="type"]');
  if (!typeSelect) return;
  const types = filteredCredentialTypeOptions();
  const current = typeSelect.value || types[0]?.id || '';
  typeSelect.innerHTML = types.length > 0
    ? types.map((type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(type.name)} · ${escapeHtml(type.id)}</option>`).join('')
    : '<option value="">No matching credential types</option>';
  typeSelect.value = types.some((type) => type.id === current) ? current : types[0]?.id ?? '';
  typeSelect.onchange = renderCredentialFields;
}

function credentialTypeOptions() {
  const byId = new Map();
  for (const skill of state.skills ?? []) {
    const types = skill.credentialTypes && typeof skill.credentialTypes === 'object' ? skill.credentialTypes : {};
    for (const [id, type] of Object.entries(types)) {
      if (!byId.has(id)) byId.set(id, { id, name: type.name ?? id, fields: type.fields ?? [], skillId: skill.id });
    }
  }
  for (const type of state.settings?.customCredentialTypes ?? []) {
    byId.set(type.id, { id: type.id, name: type.name ?? type.id, fields: type.fields ?? [], source: 'user' });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function filteredCredentialTypeOptions() {
  const query = String(els.secretForm?.querySelector('[name="typeFilter"]')?.value ?? '').trim().toLowerCase();
  const types = credentialTypeOptions();
  if (!query) return types;
  return types.filter((type) => {
    const fields = (type.fields ?? []).map((field) => `${field.name} ${field.label ?? ''} ${field.type ?? ''}`).join(' ');
    return `${type.id} ${type.name} ${fields}`.toLowerCase().includes(query);
  });
}

function renderCredentialTypeList() {
  if (!els.credentialTypeList) return;
  const types = state.settings?.customCredentialTypes ?? [];
  els.credentialTypeList.innerHTML = types.length > 0
    ? types.map((type) => `
      <div class="entity-item">
        <div class="entity-main">
          <strong>${escapeHtml(type.name)}</strong>
          <span>${(type.fields ?? []).map((field) => `${field.name}:${field.type}`).join(', ')}</span>
        </div>
        <div class="entity-actions">
          <button type="button" data-edit-credential-type="${escapeHtml(type.id)}">Edit</button>
          <button type="button" class="danger-button" data-delete-credential-type="${escapeHtml(type.id)}">Delete</button>
        </div>
      </div>
    `).join('')
    : '<div class="muted-empty">No custom credential types.</div>';
  for (const item of els.credentialTypeList.querySelectorAll('[data-edit-credential-type]')) {
    item.addEventListener('click', () => {
      const type = types.find((entry) => entry.id === item.getAttribute('data-edit-credential-type'));
      if (type) openCredentialTypeModal(type);
    });
  }
  for (const item of els.credentialTypeList.querySelectorAll('[data-delete-credential-type]')) {
    item.addEventListener('click', async () => {
      const id = item.getAttribute('data-delete-credential-type');
      if (!confirm(`Delete credential type "${id}"?`)) return;
      const result = await api(`/api/settings/credential-types/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.settings.customCredentialTypes = result.customCredentialTypes ?? [];
      renderSettings();
    });
  }
}

function openCredentialTypeModal(type = null) {
  if (!els.credentialTypeModal || !els.credentialTypeForm) return;
  els.credentialTypeForm.reset();
  els.credentialTypeForm.dataset.editingId = type?.id ?? '';
  els.credentialTypeForm.elements.name.value = type?.name ?? '';
  els.credentialFieldList.innerHTML = '';
  const fields = type?.fields?.length
    ? type.fields
    : [
      { name: 'base_url', label: 'Base URL', type: 'url', required: true },
      { name: 'api_key', label: 'API Key', type: 'secret', required: true }
    ];
  for (const field of fields) addCredentialFieldRow(field);
  els.credentialTypeModal.hidden = false;
  els.credentialTypeForm.elements.name.focus();
}

function closeCredentialTypeModal() {
  if (els.credentialTypeModal) els.credentialTypeModal.hidden = true;
}

function credentialTypeIdFromName(value) {
  const words = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  const [first, ...rest] = words;
  return [
    first.charAt(0).toLowerCase() + first.slice(1),
    ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  ].join('').replace(/^[^A-Za-z]+/, '');
}

function addCredentialFieldRow(field = {}) {
  if (!els.credentialFieldList) return;
  const row = document.createElement('div');
  row.className = 'credential-field-row';
  row.innerHTML = `
    <input name="fieldName" placeholder="field_name" value="${escapeHtml(field.name ?? '')}" />
    <input name="fieldLabel" placeholder="Label" value="${escapeHtml(field.label ?? '')}" />
    <select name="fieldType">
      ${['string', 'secret', 'url', 'number', 'boolean', 'select', 'json'].map((type) => `<option value="${type}" ${field.type === type ? 'selected' : ''}>${type}</option>`).join('')}
    </select>
    <label class="checkbox-label"><input type="checkbox" name="fieldRequired" ${field.required ? 'checked' : ''} /> Required</label>
    <input name="fieldDefault" placeholder="Default" value="${escapeHtml(field.default ?? '')}" />
    <button type="button" class="danger-button" data-remove-field>Remove</button>
  `;
  row.querySelector('[data-remove-field]')?.addEventListener('click', () => row.remove());
  els.credentialFieldList.appendChild(row);
}

function credentialTypeManifestFromForm() {
  const fields = [...(els.credentialFieldList?.querySelectorAll('.credential-field-row') ?? [])]
    .map((row) => ({
      name: String(row.querySelector('[name="fieldName"]')?.value ?? '').trim(),
      label: String(row.querySelector('[name="fieldLabel"]')?.value ?? '').trim(),
      type: String(row.querySelector('[name="fieldType"]')?.value ?? 'string').trim(),
      required: Boolean(row.querySelector('[name="fieldRequired"]')?.checked),
      default: String(row.querySelector('[name="fieldDefault"]')?.value ?? '').trim()
    }))
    .filter((field) => field.name);
  return {
    id: els.credentialTypeForm?.dataset.editingId || generatedCredentialTypeId(els.credentialTypeForm?.elements.name.value),
    name: String(els.credentialTypeForm?.elements.name.value ?? '').trim(),
    fields: fields.map((field) => field.default ? field : (({ default: _default, ...rest }) => rest)(field))
  };
}

function generatedCredentialTypeId(name) {
  const base = credentialTypeIdFromName(name) || 'credentialType';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}_${suffix}`;
}

function renderCredentialFields() {
  const root = document.querySelector('#credential-fields');
  const typeId = els.secretForm?.querySelector('[name="type"]')?.value;
  if (!root) return;
  const schema = credentialTypeOptions().find((item) => item.id === typeId);
  root.innerHTML = schema
    ? (schema.fields ?? []).map(renderCredentialField).join('')
    : '<div class="muted-empty">No credential types are available from installed skills.</div>';
}

function renderCredentialField(field) {
  const required = field.required ? ' required' : '';
  const name = `field:${field.name}`;
  if (field.type === 'boolean') {
    return `<label class="checkbox-label"><input type="checkbox" name="${escapeHtml(name)}" /> ${escapeHtml(field.label ?? field.name)}</label>`;
  }
  if (field.type === 'select') {
    const options = Array.isArray(field.options) ? field.options : [];
    return `<label>${escapeHtml(field.label ?? field.name)}<select name="${escapeHtml(name)}">${options.map((option) => `<option value="${escapeHtml(option)}" ${String(field.default ?? '') === String(option) ? 'selected' : ''}>${escapeHtml(option || 'None')}</option>`).join('')}</select></label>`;
  }
  const type = field.type === 'secret' ? 'password' : field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text';
  return `<label>${escapeHtml(field.label ?? field.name)}<input name="${escapeHtml(name)}" type="${type}" value="${escapeHtml(field.default ?? '')}" ${required} /></label>`;
}

function credentialFieldSummary(credential) {
  const values = credential.values ?? {};
  return Object.entries(values)
    .map(([key, value]) => value?.secret ? `${key}: stored` : `${key}: ${String(value).slice(0, 48)}`)
    .join(' · ');
}

function startCredentialEdit(credential) {
  state.editingCredentialId = credential.id;
  const typeSelect = els.secretForm?.querySelector('[name="type"]');
  const filter = els.secretForm?.querySelector('[name="typeFilter"]');
  if (filter) filter.value = '';
  renderCredentialTypeSelect();
  if (typeSelect) typeSelect.value = credential.type;
  els.secretForm.querySelector('[name="name"]').value = credential.name ?? '';
  renderCredentialFields();
  populateCredentialFields(credential);
  if (els.secretSave) els.secretSave.textContent = 'Update Credential';
  if (els.secretCancel) els.secretCancel.hidden = false;
  els.secretForm.scrollIntoView({ block: 'nearest' });
}

function populateCredentialFields(credential) {
  const values = credential.values ?? {};
  for (const [key, value] of Object.entries(values)) {
    const input = els.secretForm?.querySelector(`[name="field:${CSS.escape(key)}"]`);
    if (!input) continue;
    if (input.type === 'checkbox') {
      input.checked = Boolean(value);
    } else if (value?.secret) {
      input.value = '';
      input.placeholder = value.hasValue ? 'Stored. Leave blank to keep.' : '';
    } else if (typeof value === 'object') {
      input.value = JSON.stringify(value, null, 2);
    } else {
      input.value = value ?? '';
    }
  }
}

function resetCredentialForm() {
  state.editingCredentialId = null;
  const nameInput = els.secretForm?.querySelector('[name="name"]');
  if (nameInput) nameInput.value = '';
  for (const input of els.secretForm?.querySelectorAll('[name^="field:"]') ?? []) {
    if (input.type === 'checkbox') input.checked = false;
    else input.value = '';
  }
  if (els.secretSave) els.secretSave.textContent = 'Save Credential';
  if (els.secretCancel) els.secretCancel.hidden = true;
}

function showAuthGate(show) {
  if (!els.authGate) return;
  const auth = state.settings?.auth ?? {};
  els.authGate.hidden = !show;
  document.body.classList.toggle('auth-locked', Boolean(show));
  if (!show) return;
  const passwordSet = Boolean(auth.passwordSet);
  els.authTitle.textContent = passwordSet ? 'Login' : 'Set Login Password';
  els.authHelp.textContent = passwordSet
    ? 'Enter your local access password to open AgentIM.'
    : 'Set a local password before using this workspace. The reminder will disappear after it is saved.';
  els.authSubmit.textContent = passwordSet ? 'Login' : 'Set Password';
  if (els.authError) {
    els.authError.textContent = '';
  }
}

function authErrorMessage(error) {
  const code = error?.data?.error ?? error?.message;
  const messages = {
    auth_required: 'Please log in first.',
    current_password_required: 'Enter your current password first.',
    invalid_password: 'Password is incorrect.',
    invalid_current_password: 'Current password is incorrect.',
    password_not_set: 'Set a login password first.',
    password_min_length_6: 'Password must be at least 6 characters.'
  };
  return messages[code] ?? 'Authentication failed.';
}

function roomErrorMessage(error) {
  const code = error?.data?.error ?? error?.message;
  const messages = {
    room_name_exists: 'A room with this name already exists.',
    name_required: 'Room name is required.',
    room_not_found: 'Room was not found.'
  };
  return messages[code] ?? (error instanceof Error ? error.message : String(error));
}

function clearLegacyPasswordStorage() {
  try {
    for (const key of LEGACY_PASSWORD_STORAGE_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

function renderConversationFilters() {
  for (const button of els.conversationFilters) {
    button.classList.toggle('active', button.getAttribute('data-conversation-filter') === state.conversationFilter);
  }
}

function renderRooms() {
  els.roomCount.textContent = String(state.rooms.length);
  if (els.roomCountCopy) els.roomCountCopy.textContent = String(state.rooms.length);
  els.roomList.innerHTML = state.rooms
    .map((room) => `
      <div class="entity-item ${room.id === state.activeRoomId ? 'active' : ''}">
        <div class="entity-main" data-room-id="${escapeHtml(room.id)}">
          <strong>${escapeHtml(room.name)}</strong>
          <span>${escapeHtml(room.type)} room</span>
        </div>
        <div class="entity-actions">
          <button type="button" data-edit-room="${escapeHtml(room.id)}">Edit</button>
          <button type="button" class="danger-button" data-delete-room="${escapeHtml(room.id)}">Delete</button>
        </div>
      </div>
    `)
    .join('');

  for (const item of els.roomList.querySelectorAll('[data-room-id]')) {
    item.addEventListener('click', async () => {
      setActiveRoomId(item.getAttribute('data-room-id'));
      resetPreview();
      await loadLatestMessages({ markMentionsSeen: true });
      state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
      await refreshTasks();
      await refreshProjects();
      await refreshSkillInvocations();
      await refreshSkillApprovals();
      await refreshArtifacts();
      await refreshRoomAgents();
      await refreshWorkspace();
      renderAll();
      closeMobileChatList();
      ensureMessagePolling();
    });
  }

  for (const item of els.roomList.querySelectorAll('[data-edit-room]')) {
    item.addEventListener('click', () => {
      const room = state.rooms.find((entry) => entry.id === item.getAttribute('data-edit-room'));
      if (!room) return;
      state.editingRoomId = room.id;
      els.roomForm.elements.name.value = room.name;
      els.roomSubmit.textContent = 'Update Room';
      els.roomCancel.hidden = false;
      activateAppSection('contacts');
      activateSectionTab('contacts:create');
      els.roomForm.elements.name.focus();
    });
  }

  for (const item of els.roomList.querySelectorAll('[data-delete-room]')) {
    item.addEventListener('click', async () => {
      const roomId = item.getAttribute('data-delete-room');
      const room = state.rooms.find((entry) => entry.id === roomId);
      if (!room || !confirm(`Delete room "${room.name}" and its messages?`)) return;
      await api(`/api/rooms/${roomId}`, { method: 'DELETE' });
      state.rooms = state.rooms.filter((entry) => entry.id !== roomId);
      state.conversations = state.rooms;
      state.roomAgents = state.roomAgents.filter((entry) => entry.roomId !== roomId);
      if (state.activeRoomId === roomId) {
        setActiveRoomId(state.rooms[0]?.id ?? null);
        if (state.activeRoomId) await loadLatestMessages({ markMentionsSeen: true });
        else resetMessagePagination();
        state.agentRuns = state.activeRoomId ? await api(`/api/rooms/${state.activeRoomId}/agent-runs`) : [];
        if (state.activeRoomId) await refreshTasks();
        else state.tasks = [];
        if (state.activeRoomId) await refreshProjects();
        else {
          state.projects = [];
          state.projectTasks = [];
          state.projectOutputs = {};
        }
        if (state.activeRoomId) await refreshSkillInvocations();
        else {
          state.skillInvocations = [];
          state.skillApprovals = [];
        }
        if (state.activeRoomId) await refreshSkillApprovals();
        if (state.activeRoomId) await refreshArtifacts();
        else state.artifacts = [];
        resetPreview();
        await refreshRoomAgents();
        await refreshWorkspace();
      }
      if (state.editingRoomId === roomId) resetRoomForm();
      renderAll();
    });
  }
}

function renderRoomTemplates() {
  if (!els.roomTemplateCount || !els.roomTemplateList) return;
  renderCircleBuilder();
  syncSelectOptions(
    els.roomTemplateCategory,
    ['all', ...uniqueSorted(state.roomTemplates.map((template) => template.category))],
    state.roomTemplateCategory,
    (value) => value === 'all' ? 'All categories' : titleCase(value)
  );
  if (els.roomTemplateSearch && els.roomTemplateSearch.value !== state.roomTemplateSearch) {
    els.roomTemplateSearch.value = state.roomTemplateSearch;
  }
  const templates = filterTemplates(state.roomTemplates, state.roomTemplateSearch, state.roomTemplateCategory);
  els.roomTemplateCount.textContent = `${templates.length}/${state.roomTemplates.length}`;
  els.roomTemplateList.innerHTML = templates.length > 0
    ? templates.map((template) => {
      const agents = template.agents ?? [];
      const providerOptions = state.providers
        .map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)}</option>`)
        .join('');
      const firstProvider = state.providers[0];
      const modelOptions = normalizeProviderModels(firstProvider)
        .map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name ?? model.id)}</option>`)
        .join('');
      return `
      <form class="entity-item circle-create-card" data-room-template-form="${escapeHtml(template.id)}">
        <div class="entity-main">
          <div class="circle-card-heading">
            <strong>${escapeHtml(template.name)}</strong>
            <span>${escapeHtml(titleCase(template.category))}</span>
          </div>
          <p class="circle-card-description">${escapeHtml(template.description)}</p>
          <div class="circle-card-meta">
            <span>${agents.length} Agents</span>
            ${template.collaborationMode ? `<span>${escapeHtml(titleCase(template.collaborationMode))}</span>` : ''}
            <span>${escapeHtml(agents.slice(0, 3).map((agent) => agent.name).join(' / '))}${agents.length > 3 ? ' +' : ''}</span>
          </div>
          <details class="template-preview">
            <summary>Preview</summary>
            <div class="template-preview-body">
              <button type="button" class="circle-sheet-close" data-circle-close-detail>Close</button>
              <p>${escapeHtml(template.roomDescription ?? template.description ?? '')}</p>
              ${template.outcome ? `<p><strong>Outcome:</strong> ${escapeHtml(template.outcome)}</p>` : ''}
              ${Array.isArray(template.slots) && template.slots.length > 0 ? `
                <div class="circle-slot-list">
                  ${template.slots.map((slot) => `
                    <div class="circle-slot-item ${slot.required ? 'required' : ''}">
                      <strong>${escapeHtml(slot.label ?? slot.id)}</strong>
                      <span>${escapeHtml(slot.required ? 'Required' : 'Optional')} · ${escapeHtml(slot.description ?? slot.roleId ?? '')}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              ${template.workflow?.steps?.length ? `
                <div class="circle-workflow-list">
                  ${template.workflow.steps.map((step, index) => `
                    <span>${index + 1}. ${escapeHtml(step.title ?? step.id)}</span>
                  `).join('')}
                </div>
              ` : ''}
              <div class="template-chip-list">
                ${agents.map((agent) => `<span>${escapeHtml(agent.name)}</span>`).join('')}
              </div>
            </div>
          </details>
          <details class="circle-config">
            <summary>Configure</summary>
            <div class="circle-config-grid">
              <button type="button" class="circle-sheet-close" data-circle-close-detail>Close</button>
              <label>
                Room Name
                <input name="name" value="${escapeHtml(template.roomName ?? template.name)}" required />
              </label>
              <label>
                Default Provider
                <select name="providerId" data-circle-provider>
                  ${providerOptions || '<option value="">No provider</option>'}
                </select>
              </label>
              <label>
                Default Model
                <select name="model" data-circle-model>
                  ${modelOptions || '<option value="">No models available</option>'}
                </select>
              </label>
              <div class="circle-agent-picker">
                <strong>Agents</strong>
                ${agents.map((agent) => {
                  const slot = (template.slots ?? []).find((item) => item.agentTemplateId === agent.id);
                  return `
                  <div class="circle-agent-row" data-circle-agent-row="${escapeHtml(agent.id)}">
                    <label class="circle-agent-enable">
                      <input type="checkbox" name="agentTemplateIds" value="${escapeHtml(agent.id)}" ${slot?.required ? 'checked disabled' : 'checked'} />
                      <span>${escapeHtml(agent.name)}${slot?.required ? ' · required' : ''}</span>
                    </label>
                    <select name="agentProvider:${escapeHtml(agent.id)}" data-circle-agent-provider>
                      ${providerOptions || '<option value="">No provider</option>'}
                    </select>
                    <select name="agentModel:${escapeHtml(agent.id)}" data-circle-agent-model>
                      ${modelOptions || '<option value="">No models available</option>'}
                    </select>
                  </div>
                `;
                }).join('')}
              </div>
            </div>
          </details>
          <button type="button" class="circle-sheet-overlay" data-circle-sheet-overlay aria-label="Close circle preview overlay" tabindex="-1"></button>
        </div>
        <div class="entity-actions">
          <button type="submit">Join</button>
          ${template.custom ? `<button type="button" class="secondary-button" data-delete-circle="${escapeHtml(template.id)}">Delete</button>` : ''}
        </div>
      </form>
    `;
    }).join('')
    : '<div class="muted-empty">No circles match the current filter.</div>';

  for (const providerSelect of els.roomTemplateList.querySelectorAll('[data-circle-provider]')) {
    providerSelect.addEventListener('change', () => {
      const form = providerSelect.closest('[data-room-template-form]');
      renderCircleModelOptions(form, providerSelect.value);
      syncCircleAgentDefaults(form);
    });
  }

  for (const form of els.roomTemplateList.querySelectorAll('[data-room-template-form]')) {
    renderCircleModelOptions(form, form.elements.providerId?.value);
    syncCircleAgentDefaults(form);
    for (const detail of form.querySelectorAll('.template-preview, .circle-config')) {
      detail.addEventListener('toggle', () => {
        if (!detail.open) return;
        for (const sibling of form.querySelectorAll('.template-preview, .circle-config')) {
          if (sibling !== detail) sibling.open = false;
        }
      });
    }
    for (const closeButton of form.querySelectorAll('[data-circle-close-detail]')) {
      closeButton.addEventListener('click', () => {
        closeButton.closest('details')?.removeAttribute('open');
      });
    }
    for (const overlay of form.querySelectorAll('[data-circle-sheet-overlay]')) {
      overlay.addEventListener('click', () => {
        for (const detail of form.querySelectorAll('.template-preview, .circle-config')) {
          detail.removeAttribute('open');
        }
      });
    }
    form.querySelector('[data-circle-model]')?.addEventListener('change', () => syncCircleAgentDefaults(form, { onlyMatchingPrevious: true }));
    for (const agentProvider of form.querySelectorAll('[data-circle-agent-provider]')) {
      agentProvider.addEventListener('change', () => {
        const row = agentProvider.closest('[data-circle-agent-row]');
        renderCircleModelOptions(row, agentProvider.value, '[data-circle-agent-model]');
      });
    }
    for (const agentModel of form.querySelectorAll('[data-circle-agent-model]')) {
      agentModel.addEventListener('change', () => {
        agentModel.dataset.syncedDefault = agentModel.value === form.elements.model?.value ? 'true' : 'false';
      });
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await createRoomFromTemplate(form.getAttribute('data-room-template-form'), form);
    });
  }

  for (const button of els.roomTemplateList.querySelectorAll('[data-delete-circle]')) {
    button.addEventListener('click', async () => {
      const templateId = button.getAttribute('data-delete-circle');
      const template = state.roomTemplates.find((item) => item.id === templateId);
      if (!template || !confirm(`Delete custom Circle "${template.name}"? Existing rooms will not be deleted.`)) return;
      await api(`/api/room-templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' });
      await refreshRoomTemplates();
      renderRoomTemplates();
    });
  }
}

function renderCircleBuilder() {
  if (!els.circleAgentTemplateList) return;
  const templates = state.agentTemplates;
  els.circleAgentTemplateList.innerHTML = templates.length > 0
    ? templates.map((template) => `
      <label class="circle-agent-enable">
        <input type="checkbox" name="agentTemplateIds" value="${escapeHtml(template.id)}" />
        <span>${escapeHtml(template.name)} · ${escapeHtml(titleCase(template.category ?? 'agent'))}</span>
      </label>
    `).join('')
    : '<div class="muted-empty">No Agent Templates available.</div>';
}

async function createRoomFromTemplate(templateId, form) {
  const template = state.roomTemplates.find((item) => item.id === templateId);
  const data = form ? new FormData(form) : null;
  const providerId = String(data?.get('providerId') ?? els.providerSelect?.value ?? state.providers[0]?.id ?? '');
  const provider = state.providers.find((item) => item.id === providerId) ?? state.providers[0];
  if (!template) return;
  if (!provider) {
    alert('Create a model provider before creating a Room from a template.');
    activateAppSection('settings');
    activateSectionTab('settings:providers');
    return;
  }
  const selectedAgentIds = data
    ? data.getAll('agentTemplateIds').map((id) => String(id))
    : (template.agentTemplateIds ?? []);
  const requiredAgentIds = (template.slots ?? [])
    .filter((slot) => slot.required && slot.agentTemplateId)
    .map((slot) => String(slot.agentTemplateId));
  const agentIds = [...new Set([...selectedAgentIds, ...requiredAgentIds])];
  if (agentIds.length === 0) {
    alert('Select at least one Agent for this Circle.');
    return;
  }
  const model = String(data?.get('model') ?? '') || (provider.defaultModel ?? provider.models?.[0]?.id ?? '');
  if (!model) {
    alert(`Provider "${provider.name}" does not have a default model.`);
    return;
  }
  const submitButton = form?.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  const result = await api(`/api/room-templates/${encodeURIComponent(template.id)}/create-room`, {
    method: 'POST',
    body: {
      name: String(data?.get('name') ?? template.roomName ?? template.name).trim(),
      defaultProviderId: provider.id,
      defaultModel: model,
      agents: agentIds.map((templateId) => ({
        templateId,
        providerId: String(data?.get(`agentProvider:${templateId}`) ?? provider.id),
        model: String(data?.get(`agentModel:${templateId}`) ?? model)
      }))
    }
  }).finally(() => {
    if (submitButton) submitButton.disabled = false;
  });
  if (result.room) {
    replaceByIdOrPush(state.rooms, result.room);
    state.conversations = state.rooms;
    setActiveRoomId(result.room.id);
    state.activeAppSection = 'chats';
  }
  for (const role of result.roles ?? []) replaceByIdOrPush(state.roles, role);
  for (const agent of result.agents ?? []) replaceByIdOrPush(state.agents, agent);
  await refreshRoomAgents();
  await refreshWorkspace();
  await loadLatestMessages({ markMentionsSeen: true });
  renderAll();
  const autoAssigned = (result.circle?.slotAssignments ?? [])
    .filter((assignment) => requiredAgentIds.includes(String(assignment.templateId)) && !selectedAgentIds.includes(String(assignment.templateId)))
    .map((assignment) => assignment.agentName);
  alert(`${template.name} room created with ${(result.agents ?? []).length} Agents.${autoAssigned.length > 0 ? `\nAuto-added required Agents: ${autoAssigned.join(', ')}` : ''}`);
}

function renderCircleModelOptions(container, providerId, selector = '[data-circle-model]') {
  const select = container?.querySelector(selector);
  if (!select) return;
  const provider = state.providers.find((entry) => entry.id === providerId) ?? state.providers[0];
  const models = normalizeProviderModels(provider);
  select.innerHTML = models.length > 0
    ? models.map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name ?? model.id)}</option>`).join('')
    : '<option value="">No models available</option>';
  select.disabled = models.length === 0;
  if (provider?.defaultModel && models.some((model) => model.id === provider.defaultModel)) {
    select.value = provider.defaultModel;
  }
}

function syncCircleAgentDefaults(form, options = {}) {
  if (!form) return;
  const defaultProviderId = form.elements.providerId?.value ?? '';
  const defaultModel = form.elements.model?.value ?? '';
  for (const row of form.querySelectorAll('[data-circle-agent-row]')) {
    const providerSelect = row.querySelector('[data-circle-agent-provider]');
    const modelSelect = row.querySelector('[data-circle-agent-model]');
    if (!providerSelect || !modelSelect) continue;
    const shouldUpdateModel = !options.onlyMatchingPrevious || modelSelect.dataset.syncedDefault === 'true';
    providerSelect.value = defaultProviderId;
    renderCircleModelOptions(row, defaultProviderId, '[data-circle-agent-model]');
    if (defaultModel && shouldUpdateModel && [...modelSelect.options].some((option) => option.value === defaultModel)) {
      modelSelect.value = defaultModel;
      modelSelect.dataset.syncedDefault = 'true';
    }
  }
}

function renderConversationList() {
  if (!els.conversationList) return;
  if (els.conversationSearch && els.conversationSearch.value !== state.conversationSearch) {
    els.conversationSearch.value = state.conversationSearch;
  }
  const query = state.conversationSearch;
  const rooms = state.rooms
    .filter((room) => {
      if (state.conversationFilter === 'rooms') return room.type !== 'dm';
      if (state.conversationFilter === 'agents') return room.type === 'dm';
      return true;
    })
    .filter((room) => {
      if (!query) return true;
      return `${room.name ?? ''} ${room.description ?? ''} ${room.type ?? ''}`.toLowerCase().includes(query);
    })
    .map((room) => ({
      kind: 'room',
      id: room.id,
      title: room.name,
      subtitle: conversationSubtitle(room),
      meta: room.id === state.activeRoomId ? 'active' : '',
      unread: state.roomMentionCounts[room.id] ?? 0,
      crossRoomNotice: state.roomCrossRoomNotices[room.id],
      active: room.id === state.activeRoomId
    }));
  const items = rooms;
  const visibleItems = items.slice(0, 8);
  els.conversationList.innerHTML = visibleItems.length > 0
    ? visibleItems.map((item) => `
      <button type="button" class="entity-item conversation-item ${item.active ? 'active' : ''}" data-conversation-kind="${escapeHtml(item.kind)}" data-conversation-id="${escapeHtml(item.id)}">
        ${item.unread > 0 ? `<span class="mention-count">${item.unread}</span>` : ''}
        ${item.crossRoomNotice && item.unread === 0 ? '<span class="mention-count cross-room-dot">room</span>' : ''}
        <div class="entity-main">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.subtitle)}</span>
        </div>
        <span class="conversation-state">${escapeHtml(item.meta || 'Open')}</span>
      </button>
    `).join('')
    : `
      <div class="muted-empty">
        <div>${state.conversationFilter === 'rooms' ? 'No rooms yet.' : state.conversationFilter === 'agents' ? 'No DM rooms yet.' : 'No chats yet.'}</div>
        <button type="button" class="secondary-button" data-create-room-cta>New room</button>
      </div>
    `;

  for (const item of els.conversationList.querySelectorAll('[data-conversation-kind="room"]')) {
    item.addEventListener('click', async () => {
      setActiveRoomId(item.getAttribute('data-conversation-id'));
      clearRoomMentionCount(state.activeRoomId);
      clearRoomCrossRoomNotice(state.activeRoomId);
      await loadLatestMessages({ markMentionsSeen: true });
      await refreshRoomAgents();
      await refreshTasks();
      await refreshProjects();
      await refreshSkillInvocations();
      await refreshSkillApprovals();
      await refreshArtifacts();
      await refreshWorkspace();
      renderAll();
      ensureMessagePolling();
    });
  }

  for (const item of els.conversationList.querySelectorAll('[data-create-room-cta]')) {
    item.addEventListener('click', () => {
      activateAppSection('contacts');
      activateSectionTab('contacts:create');
      els.roomForm.elements.name.focus();
    });
  }
}

function activateConversationFilter(filter) {
  state.conversationFilter = filter || 'all';
  renderConversationList();
}

function conversationSubtitle(room) {
  const notice = state.roomCrossRoomNotices[room.id];
  if (notice) {
    return `from ${notice.source} · ${notice.agent}`;
  }
  return `${room.type} room`;
}

async function openAgentConversation(agentId) {
  const agent = state.agents.find((item) => item.id === agentId);
  if (!agent) return;
  const existingRoom = state.rooms.find((room) => room.type === 'dm' && room.dmAgentId === agentId)
    ?? state.rooms.find((room) => {
      if (room.type !== 'dm' || room.dmAgentId) return false;
      const members = state.roomAgents.filter((join) => join.roomId === room.id && join.enabled !== false);
      return members.length === 1 && members[0].agentId === agentId;
    });
  let room = existingRoom;
  if (!room) {
    room = await api('/api/rooms', {
      method: 'POST',
      body: {
        name: agent.name,
        type: 'dm',
        description: `Direct chat with ${agent.name}`,
        dmAgentId: agent.id
      }
    });
    state.rooms.push(room);
    await api(`/api/rooms/${room.id}/agents`, {
      method: 'POST',
      body: {
        agentId: agent.id,
        triggerMode: 'manual'
      }
    });
    await refreshRoomAgents();
  } else {
    if (room.dmAgentId !== agent.id) {
      room = await api(`/api/rooms/${room.id}`, {
        method: 'PATCH',
        body: {
          name: room.name,
          type: 'dm',
          description: room.description ?? `Direct chat with ${agent.name}`,
          dmAgentId: agent.id
        }
      });
      const roomIndex = state.rooms.findIndex((item) => item.id === room.id);
      if (roomIndex >= 0) state.rooms[roomIndex] = room;
    }
    const hasMembership = state.roomAgents.some((join) =>
      join.roomId === room.id &&
      join.agentId === agent.id &&
      join.enabled !== false
    );
    if (!hasMembership) {
      await api(`/api/rooms/${room.id}/agents`, {
        method: 'POST',
        body: {
          agentId: agent.id,
          triggerMode: 'manual'
        }
      });
      await refreshRoomAgents();
    }
  }
  setActiveRoomId(room.id);
  resetPreview();
  await loadLatestMessages({ markMentionsSeen: true });
  state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
  await refreshTasks();
  await refreshProjects();
  await refreshSkillInvocations();
  await refreshSkillApprovals();
  await refreshArtifacts();
  await refreshRoomAgents();
  await refreshWorkspace();
  activateAppSection('chats');
  renderAll();
  closeMobileChatList();
  ensureMessagePolling();
}

function renderProviders() {
  els.providerCount.textContent = String(state.providers.length);
  const previousProviderId = els.providerSelect.value;
  els.providerSelect.innerHTML = state.providers
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
    .join('');

  const selected = state.providers.find((provider) => provider.id === previousProviderId) ?? state.providers[0];
  if (selected) {
    els.providerSelect.value = selected.id;
  }
  renderAgentModelOptions();

  els.providerList.innerHTML = state.providers
    .map((provider) => `
      <div class="entity-item">
        <div class="entity-main">
          <strong>${escapeHtml(provider.name)}</strong>
          <span>${escapeHtml(provider.defaultModel)} · ${escapeHtml(provider.baseUrl)}</span>
        </div>
        <div class="entity-actions">
          <button type="button" data-edit-provider="${escapeHtml(provider.id)}">Edit</button>
          <button type="button" class="danger-button" data-delete-provider="${escapeHtml(provider.id)}">Delete</button>
        </div>
      </div>
    `)
    .join('');

  for (const item of els.providerList.querySelectorAll('[data-edit-provider]')) {
    item.addEventListener('click', () => {
      const provider = state.providers.find((entry) => entry.id === item.getAttribute('data-edit-provider'));
      if (!provider) return;
      state.editingProviderId = provider.id;
      els.providerForm.elements.name.value = provider.name;
      els.providerForm.elements.baseUrl.value = provider.baseUrl;
      els.providerForm.elements.apiKey.value = '';
      els.providerForm.elements.apiKey.required = false;
      els.providerForm.elements.apiKey.placeholder = 'Leave blank to keep current key';
      els.providerForm.elements.defaultModel.value = provider.defaultModel;
      els.providerSubmit.textContent = 'Update';
      els.providerCancel.hidden = false;
      activateAppSection('settings');
      activateSectionTab('settings:providers');
      els.providerForm.elements.name.focus();
    });
  }

  for (const item of els.providerList.querySelectorAll('[data-delete-provider]')) {
    item.addEventListener('click', async () => {
      const providerId = item.getAttribute('data-delete-provider');
      const provider = state.providers.find((entry) => entry.id === providerId);
      if (!provider || !confirm(`Delete provider "${provider.name}" and its dependent agents?`)) return;
      await api(`/api/model-providers/${providerId}`, { method: 'DELETE' });
      state.providers = state.providers.filter((entry) => entry.id !== providerId);
      const agents = await api('/api/agents');
      state.agents = agents;
      await refreshRoomAgents();
      await refreshTasks();
      if (state.editingProviderId === providerId) resetProviderForm();
      renderAll();
    });
  }
}

function renderRoles() {
  els.roleCount.textContent = String(state.roles.length);
  els.roleList.innerHTML = state.roles
    .map((role) => {
      const usedBy = state.agents.filter((agent) => agent.roleId === role.id).length;
      const roleSkills = roleSkillSummary(role);
      return `
        <div class="entity-item">
          <div class="entity-main">
            <strong>${escapeHtml(role.name)}${role.system ? ' · System' : ''}</strong>
            <span>${escapeHtml(role.description || 'No description')}</span>
            <span>${usedBy} agent${usedBy === 1 ? '' : 's'} · ${escapeHtml(roleSkills)}</span>
            <span>${escapeHtml(roleSkillPreview(role))}</span>
            <span>${escapeHtml(roleRiskSummary(role))}</span>
          </div>
          <div class="entity-actions">
            <button type="button" data-edit-role="${escapeHtml(role.id)}">Edit</button>
            ${role.system ? '' : `<button type="button" class="danger-button" data-delete-role="${escapeHtml(role.id)}">Delete</button>`}
          </div>
        </div>
      `;
    })
    .join('');

  for (const item of els.roleList.querySelectorAll('[data-edit-role]')) {
    item.addEventListener('click', () => {
      openRoleEditor(item.getAttribute('data-edit-role'));
    });
  }

  for (const item of els.roleList.querySelectorAll('[data-delete-role]')) {
    item.addEventListener('click', async () => {
      const roleId = item.getAttribute('data-delete-role');
      const role = state.roles.find((entry) => entry.id === roleId);
      if (!role || !confirm(`Delete role "${role.name}"? Agents using it will be moved to General.`)) return;
      await api(`/api/roles/${roleId}`, { method: 'DELETE' });
      state.roles = state.roles.filter((entry) => entry.id !== roleId);
      state.agents = await api('/api/agents');
      if (state.editingRoleId === roleId) resetRoleForm();
      renderAll();
    });
  }
}

function openRoleEditor(roleId) {
  const role = state.roles.find((entry) => entry.id === roleId);
  if (!role) return;
  state.editingRoleId = role.id;
  els.roleForm.elements.name.value = role.name;
  els.roleForm.elements.description.value = role.description ?? '';
  els.roleForm.elements.systemPrompt.value = role.systemPrompt ?? '';
  renderRoleSkillOptions();
  setSelectedRoleSkillIds(role.skillIds ?? []);
  els.roleSubmit.textContent = role.system ? 'Update System Role' : 'Update Role';
  els.roleCancel.hidden = false;
  activateAppSection('settings');
  activateSectionTab('settings:roles');
  els.roleForm.elements.name.focus();
}

function renderRoleSkillOptions() {
  const select = els.roleForm?.elements?.skillIds;
  if (!select) return;
  const previous = new Set([...select.selectedOptions].map((option) => option.value));
  select.innerHTML = state.skills
    .filter((skill) => skill.enabled !== false)
    .map((skill) => `<option value="${escapeHtml(skill.id)}">${escapeHtml(skill.name)} · ${escapeHtml(skill.id)}</option>`)
    .join('');
  const selected = previous.size > 0
    ? previous
    : new Set(['workspace.read', 'workspace.write', 'workspace.preview', 'artifact.card', 'agent.message']);
  for (const option of select.options) option.selected = selected.has(option.value);
}

function selectedRoleSkillIds() {
  const select = els.roleForm?.elements?.skillIds;
  return select ? [...select.selectedOptions].map((option) => option.value) : [];
}

function setSelectedRoleSkillIds(skillIds) {
  const select = els.roleForm?.elements?.skillIds;
  if (!select) return;
  const selected = new Set(skillIds);
  for (const option of select.options) option.selected = selected.has(option.value);
}

function roleSkillSummary(role) {
  const ids = Array.isArray(role?.skillIds) ? role.skillIds : [];
  if (ids.length === 0) return '0 executable skills';
  return `${effectiveRoleSkillIds(role).length} executable skills`;
}

function roleSkillPreview(role, limit = 6) {
  const skills = skillsForRole(role);
  if (skills.length === 0) return 'No enabled skills';
  const visible = skills.slice(0, limit).map((skill) => skill.id).join(', ');
  return skills.length > limit ? `${visible}, +${skills.length - limit} more` : visible;
}

function roleRiskSummary(role) {
  const skills = skillsForRole(role);
  const high = skills.filter((skill) => String(skill.riskLevel ?? '').toLowerCase() === 'high' || skill.requiresApproval).length;
  const external = skills.filter((skill) => skill.policy?.externalEffect).length;
  const credentials = skills.filter((skill) => Array.isArray(skill.credentials) && skill.credentials.length > 0).length;
  return [
    high ? `${high} approval-aware` : '',
    external ? `${external} external effect` : '',
    credentials ? `${credentials} credential-backed` : ''
  ].filter(Boolean).join(' · ') || 'Low-risk only';
}

function skillsForRole(role) {
  const ids = new Set(effectiveRoleSkillIds(role));
  return state.skills.filter((skill) => ids.has(skill.id));
}

function renderSkills() {
  const enabledCount = enabledSkills().length;
  els.skillCount.textContent = `${enabledCount}/${state.skills.length}`;
  renderSkillCategoryTabs();
  const visibleSkills = state.skillCategory === 'all'
    ? state.skills
    : state.skills.filter((skill) => skillCategoryId(skill) === state.skillCategory);
  const grouped = groupSkillsByCategory(visibleSkills);
  els.skillList.innerHTML = grouped
    .map(({ category, skills }) => {
      const groupEnabled = skills.filter((skill) => skill.enabled !== false).length;
      return `
        <section class="skill-category-group">
          <div class="skill-category-heading">
            <strong>${escapeHtml(titleCase(category))}</strong>
            <span>${groupEnabled}/${skills.length}</span>
          </div>
          <div class="skill-category-list">
            ${skills.map(renderSkillItem).join('')}
          </div>
        </section>
      `;
    }).join('');
  if (grouped.length === 0) {
    els.skillList.innerHTML = '<div class="muted-empty">No skills in this category.</div>';
  }

  for (const item of els.skillList.querySelectorAll('[data-edit-skill]')) {
    item.addEventListener('click', () => {
      const skill = state.skills.find((entry) => entry.id === item.getAttribute('data-edit-skill'));
      if (!skill) return;
      state.editingSkillId = skill.id;
      els.skillForm.elements.manifest.value = JSON.stringify(skillManifestForEdit(skill), null, 2);
      els.skillSubmit.textContent = skill.common ? 'Update Common Skill' : 'Update Skill';
      els.skillCancel.hidden = false;
      activateAppSection('settings');
      activateSectionTab('settings:skills');
      els.skillForm.elements.manifest.focus();
    });
  }

  for (const item of els.skillList.querySelectorAll('[data-enable-skill]')) {
    item.addEventListener('click', async () => {
      await updateSkillState(item.getAttribute('data-enable-skill'), 'enable');
    });
  }

  for (const item of els.skillList.querySelectorAll('[data-disable-skill]')) {
    item.addEventListener('click', async () => {
      await updateSkillState(item.getAttribute('data-disable-skill'), 'disable');
    });
  }

  for (const item of els.skillList.querySelectorAll('[data-delete-skill]')) {
    item.addEventListener('click', async () => {
      const skillId = item.getAttribute('data-delete-skill');
      const skill = state.skills.find((entry) => entry.id === skillId);
      if (!skill || !confirm(`Delete skill "${skill.name}"?`)) return;
      await api(`/api/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE' });
      state.skills = state.skills.filter((entry) => entry.id !== skillId);
      if (state.editingSkillId === skillId) resetSkillForm();
      renderAll();
    });
  }
}

function renderSkillCategoryTabs() {
  if (!els.skillCategoryTabs) return;
  const categories = skillCategoryOptions();
  const current = categories.some((item) => item.id === state.skillCategory) ? state.skillCategory : 'all';
  state.skillCategory = current;
  els.skillCategoryTabs.innerHTML = categories.map((item) => `
    <button type="button" class="${item.id === current ? 'active' : ''}" data-skill-category="${escapeHtml(item.id)}">
      <span>${escapeHtml(item.label)}</span>
      <span>${item.count}</span>
    </button>
  `).join('');
  for (const item of els.skillCategoryTabs.querySelectorAll('[data-skill-category]')) {
    item.addEventListener('click', () => {
      state.skillCategory = item.getAttribute('data-skill-category') || 'all';
      renderSkills();
    });
  }
}

function skillCategoryOptions() {
  const counts = new Map();
  for (const skill of state.skills) {
    const id = skillCategoryId(skill);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [
    { id: 'all', label: 'All', count: state.skills.length },
    ...[...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, count]) => ({ id, label: titleCase(id), count }))
  ];
}

function skillCategoryId(skill) {
  return String(skill?.category ?? 'custom').trim() || 'custom';
}

function renderSkillItem(skill) {
  const badges = [
    skill.common ? 'Common' : 'Installed',
    skill.enabled === false ? 'Disabled' : 'Enabled',
    skill.riskLevel ? `Risk: ${skill.riskLevel}` : null,
    approvalBadgeForSkill(skill)
  ].filter(Boolean).join(' · ');
  const runtime = skill.runtime?.kind
    ? `${skill.runtime.kind}${skill.runtime.adapter ? `:${skill.runtime.adapter}` : ''}`
    : 'runtime: unknown';
  const actionCount = Array.isArray(skill.actions) ? skill.actions.length : 0;
  const hosts = Array.isArray(skill.permissions?.network?.hosts)
    ? skill.permissions.network.hosts.filter(Boolean).slice(0, 3)
    : [];
  return `
    <div class="entity-item ${skill.enabled === false ? '' : 'active'}">
      <div class="entity-main">
        <strong>${escapeHtml(skill.name)} · ${escapeHtml(skill.id)}</strong>
        <span>${escapeHtml(skill.description || 'No description')}</span>
        <span>v${escapeHtml(skill.version ?? '1.0.0')} · ${escapeHtml(runtime)}</span>
        ${actionCount > 0 ? `<span>${actionCount} action${actionCount === 1 ? '' : 's'}${hosts.length > 0 ? ` · ${escapeHtml(hosts.join(', '))}` : ''}</span>` : ''}
        <span>${escapeHtml(badges)}</span>
      </div>
      <div class="entity-actions">
        <button type="button" data-edit-skill="${escapeHtml(skill.id)}">Manifest</button>
        ${skill.common
          ? ''
          : skill.enabled === false
            ? `<button type="button" data-enable-skill="${escapeHtml(skill.id)}">Enable</button>`
            : `<button type="button" data-disable-skill="${escapeHtml(skill.id)}">Disable</button>`}
        ${skill.common ? '' : `<button type="button" class="danger-button" data-delete-skill="${escapeHtml(skill.id)}">Delete</button>`}
      </div>
    </div>
  `;
}

function groupSkillsByCategory(skills) {
  const groups = new Map();
  for (const skill of skills) {
    const category = String(skill.category ?? 'custom').trim() || 'custom';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(skill);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, items]) => ({
      category,
      skills: items.slice().sort((left, right) => String(left.name ?? left.id).localeCompare(String(right.name ?? right.id)))
    }));
}

function approvalBadgeForSkill(skill) {
  const mode = state.settings?.approvals?.mode ?? 'auto';
  if (mode === 'off') return 'Approval off';
  const risk = String(skill?.riskLevel ?? 'medium').toLowerCase();
  const destructive = Boolean(skill?.policy?.destructive);
  const requires = mode === 'auto'
    ? risk === 'high' || destructive
    : mode === 'balanced'
      ? ['medium', 'high'].includes(risk) || Boolean(skill?.requiresApproval)
      : ['medium', 'high'].includes(risk) || destructive || Boolean(skill?.requiresApproval);
  return requires ? `Approval: ${mode}` : 'Auto';
}

async function refreshAgentTemplates() {
  try {
    const [packs, templates] = await Promise.all([
      api('/api/agent-template-packs'),
      api('/api/agent-templates?packId=agency-agents')
    ]);
    state.agentTemplatePacks = packs;
    state.agentTemplates = templates;
  } catch (error) {
    console.warn('Agent template refresh failed.', error);
    state.agentTemplatePacks = [];
    state.agentTemplates = [];
  }
}

async function refreshRoomTemplates() {
  try {
    state.roomTemplates = await api('/api/room-templates');
  } catch (error) {
    console.warn('Room template refresh failed.', error);
    state.roomTemplates = [];
  }
}

function renderAgents() {
  els.agentCount.textContent = String(state.agents.length);
  const activeAgents = state.agents.filter((agent) => isAgentInActiveRoom(agent.id));
  renderMentionBar(activeAgents);

  els.agentList.innerHTML = state.agents
    .map((agent) => {
      const attached = isAgentInActiveRoom(agent.id);
      const role = state.roles.find((entry) => entry.id === agent.roleId);
      return `
        <div class="entity-item ${attached ? 'active' : ''}">
          <div class="entity-main">
            <strong>${escapeHtml(agent.name)}</strong>
            <span>${escapeHtml(agent.model)} · ${attached ? 'in this room' : 'not in room'}</span>
            <span>${escapeHtml(agentRoleSummary(agent))}</span>
            <span>${escapeHtml(agentEffectiveSkillSummary(agent))}</span>
            <span>${escapeHtml(roleSkillPreview(role))}</span>
            <span>${escapeHtml(roleRiskSummary(role))}</span>
          </div>
          <div class="entity-actions">
            <button type="button" data-open-agent-chat="${escapeHtml(agent.id)}">Chat</button>
            ${attached ? '' : `<button type="button" data-attach-agent="${escapeHtml(agent.id)}">Attach</button>`}
            <button type="button" data-manage-agent-skills="${escapeHtml(agent.id)}">Manage Skills</button>
            <button type="button" data-test-agent="${escapeHtml(agent.id)}">Test</button>
            <button type="button" data-edit-agent="${escapeHtml(agent.id)}">Edit</button>
            <button type="button" class="danger-button" data-delete-agent="${escapeHtml(agent.id)}">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');

  for (const item of els.agentList.querySelectorAll('[data-attach-agent]')) {
    item.addEventListener('click', async () => {
      const agentId = item.getAttribute('data-attach-agent');
      await api(`/api/rooms/${state.activeRoomId}/agents`, {
        method: 'POST',
        body: { agentId, triggerMode: 'manual' }
      });
      await refreshRoomAgents();
      renderAll();
    });
  }

  for (const item of els.agentList.querySelectorAll('[data-open-agent-chat]')) {
    item.addEventListener('click', async () => {
      await openAgentConversation(item.getAttribute('data-open-agent-chat'));
    });
  }

  for (const item of els.agentList.querySelectorAll('[data-test-agent]')) {
    item.addEventListener('click', async () => {
      const agentId = item.getAttribute('data-test-agent');
      const agent = state.agents.find((entry) => entry.id === agentId);
      item.disabled = true;
      item.textContent = 'Testing';
      try {
        const result = await api(`/api/agents/${agentId}/test`, { method: 'POST', body: {} });
        alert(`${agent?.name ?? 'Agent'} is available.\nModel: ${result.model}\nLatency: ${result.latencyMs}ms\nReply: ${result.content || '(empty)'}`);
      } catch (error) {
        alert(`${agent?.name ?? 'Agent'} test failed.\n${error instanceof Error ? error.message : String(error)}`);
      } finally {
        item.disabled = false;
        item.textContent = 'Test';
      }
    });
  }

  for (const item of els.agentList.querySelectorAll('[data-manage-agent-skills]')) {
    item.addEventListener('click', () => {
      const agent = state.agents.find((entry) => entry.id === item.getAttribute('data-manage-agent-skills'));
      const role = state.roles.find((entry) => entry.id === agent?.roleId);
      if (!role) return;
      openRoleEditor(role.id);
    });
  }

  for (const item of els.agentList.querySelectorAll('[data-edit-agent]')) {
    item.addEventListener('click', async () => {
      await openAgentEditor(item.getAttribute('data-edit-agent'));
    });
  }

  for (const item of els.agentList.querySelectorAll('[data-delete-agent]')) {
    item.addEventListener('click', async () => {
      const agentId = item.getAttribute('data-delete-agent');
      const agent = state.agents.find((entry) => entry.id === agentId);
      if (!agent || !confirm(`Delete agent "${agent.name}"?`)) return;
      await api(`/api/agents/${agentId}`, { method: 'DELETE' });
      state.agents = state.agents.filter((entry) => entry.id !== agentId);
      state.roomAgents = state.roomAgents.filter((entry) => entry.agentId !== agentId);
      await refreshTasks();
      if (state.editingAgentId === agentId) resetAgentForm();
      renderAll();
    });
  }
}

async function openAgentEditor(agentId) {
  const agent = state.agents.find((entry) => entry.id === agentId);
  if (!agent) return;
  state.editingAgentId = agent.id;
  els.agentForm.elements.name.value = agent.name;
  els.agentForm.elements.roleId.value = agent.roleId ?? 'general';
  els.agentForm.elements.providerId.value = agent.providerId;
  renderAgentModelOptions(agent.providerId, agent.model);
  if (els.agentForm.elements.bio) els.agentForm.elements.bio.value = agent.bio ?? '';
  els.agentSubmit.textContent = 'Update Agent';
  els.agentCancel.hidden = false;
  activateAppSection('contacts');
  activateSectionTab('contacts:create');
  els.agentForm.elements.name.focus();
  await refreshProviderModels(agent.providerId, agent.model);
  renderAgentModelOptions(agent.providerId, agent.model);
}

function renderAgentTemplates() {
  if (!els.agentTemplateCount || !els.agentTemplateList) return;
  syncSelectOptions(
    els.agentTemplateCategory,
    ['all', ...uniqueSorted(state.agentTemplates.map((template) => template.category))],
    state.agentTemplateCategory,
    (value) => value === 'all' ? 'All categories' : titleCase(value)
  );
  if (els.agentTemplateSearch && els.agentTemplateSearch.value !== state.agentTemplateSearch) {
    els.agentTemplateSearch.value = state.agentTemplateSearch;
  }
  const templates = filterTemplates(state.agentTemplates, state.agentTemplateSearch, state.agentTemplateCategory);
  els.agentTemplateCount.textContent = `${templates.length}/${state.agentTemplates.length}`;
  const pack = state.agentTemplatePacks.find((item) => item.id === 'agency-agents');
  els.agentTemplateList.innerHTML = templates.length > 0
    ? templates.map((template) => `
      <div class="entity-item">
        <div class="entity-main">
          <strong>${escapeHtml(template.name)}</strong>
          <span>${escapeHtml(template.category)} · ${escapeHtml(template.description)}</span>
          <span>${escapeHtml(pack?.name ?? template.packId)} · ${escapeHtml(template.license ?? 'license unknown')}</span>
          <details class="template-preview">
            <summary>Preview</summary>
            <div class="template-preview-body">
              <p>${escapeHtml(template.systemPrompt ?? '')}</p>
              <div class="template-chip-list">
                ${(template.suggestedSkillIds ?? []).map((skillId) => `<span>${escapeHtml(skillId)}</span>`).join('')}
              </div>
            </div>
          </details>
        </div>
        <div class="entity-actions">
          <button type="button" data-create-template-agent="${escapeHtml(template.id)}">Create</button>
        </div>
      </div>
    `).join('')
    : '<div class="muted-empty">No Agent templates match the current filter.</div>';

  for (const item of els.agentTemplateList.querySelectorAll('[data-create-template-agent]')) {
    item.addEventListener('click', async () => {
      await createAgentFromTemplate(item.getAttribute('data-create-template-agent'));
    });
  }
}

async function createAgentFromTemplate(templateId) {
  const template = state.agentTemplates.find((item) => item.id === templateId);
  const provider = state.providers.find((item) => item.id === els.providerSelect?.value) ?? state.providers[0];
  if (!template) return;
  if (!provider) {
    alert('Create a model provider before creating an Agent from a template.');
    activateAppSection('settings');
    activateSectionTab('settings:providers');
    return;
  }
  const model = provider.defaultModel ?? provider.models?.[0]?.id ?? '';
  if (!model) {
    alert(`Provider "${provider.name}" does not have a default model.`);
    return;
  }
  const result = await api(`/api/agent-templates/${encodeURIComponent(template.id)}/create-agent`, {
    method: 'POST',
    body: {
      name: template.name,
      providerId: provider.id,
      model,
      roomId: state.activeRoomId
    }
  });
  if (result.role) replaceByIdOrPush(state.roles, result.role);
  if (result.agent) replaceByIdOrPush(state.agents, result.agent);
  await refreshRoomAgents();
  renderAll();
  alert(`${template.name} Agent created from Agency Agents.`);
}

async function refreshTasks() {
  if (!state.activeRoomId) {
    state.tasks = [];
    return;
  }
  state.tasks = await api(`/api/rooms/${state.activeRoomId}/tasks?limit=100`);
}

async function refreshProjects() {
  if (!state.activeRoomId) {
    state.projects = [];
    state.projectTasks = [];
    state.projectOutputs = {};
    return;
  }
  const result = await api(`/api/rooms/${state.activeRoomId}/projects`);
  state.projects = result.projects ?? [];
  state.projectTasks = result.tasks ?? [];
  await refreshProjectOutputs();
}

async function refreshProjectOutputs() {
  const outputs = {};
  await Promise.all(state.projects.map(async (project) => {
    try {
      outputs[project.id] = await api(`/api/projects/${encodeURIComponent(project.id)}/outputs`);
    } catch (error) {
      console.warn('Project output refresh failed.', project.id, error);
    }
  }));
  state.projectOutputs = outputs;
}

async function refreshProjectDistribution() {
  if (!state.activeRoomId || !els.projectForm) {
    state.projectDistribution = null;
    return;
  }
  const type = els.projectForm.elements.type.value || 'static-web';
  const fallbackAgentId = els.projectForm.elements.agentId.value || '';
  try {
    state.projectDistribution = await api(`/api/rooms/${state.activeRoomId}/project-distribution?type=${encodeURIComponent(type)}&fallbackAgentId=${encodeURIComponent(fallbackAgentId)}`);
  } catch (error) {
    console.warn('Project distribution preview failed.', error);
    state.projectDistribution = null;
  }
}

function renderTaskAgentOptions() {
  if (!els.taskAgentSelect) return;
  const previousAgentId = els.taskAgentSelect.value;
  const activeAgents = state.agents.filter((agent) => isAgentInActiveRoom(agent.id));
  const candidates = activeAgents.length > 0 ? activeAgents : state.agents;

  els.taskAgentSelect.innerHTML = candidates.length > 0
    ? candidates
      .map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`)
      .join('')
    : '<option value="">No agents available</option>';
  els.taskAgentSelect.disabled = candidates.length === 0;

  const selected = candidates.find((agent) => agent.id === previousAgentId) ?? candidates[0];
  if (selected) els.taskAgentSelect.value = selected.id;
}

function renderProjectAgentOptions() {
  if (!els.projectAgentSelect) return;
  const previousAgentId = els.projectAgentSelect.value;
  const activeAgents = state.agents.filter((agent) => isAgentInActiveRoom(agent.id));
  const candidates = activeAgents.length > 0 ? activeAgents : state.agents;

  els.projectAgentSelect.innerHTML = candidates.length > 0
    ? candidates
      .map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`)
      .join('')
    : '<option value="">No agents available</option>';
  els.projectAgentSelect.disabled = candidates.length === 0;

  const selected = candidates.find((agent) => agent.id === previousAgentId) ?? candidates[0];
  if (selected) els.projectAgentSelect.value = selected.id;
  refreshProjectDistribution().then(renderProjectDistribution).catch((error) => console.warn('Project distribution refresh failed.', error));
}

function renderProjectDistribution() {
  if (!els.projectDistribution) return;
  const distribution = state.projectDistribution;
  if (!distribution) {
    els.projectDistribution.innerHTML = '<div class="muted-empty">Select an Agent and project type to preview distribution.</div>';
    return;
  }
  const missing = distribution.missingRoles ?? [];
  els.projectDistribution.innerHTML = [
    missing.length > 0
      ? `<div class="entity-item">
          <div class="entity-main">
            <strong>Missing Role Agents</strong>
            <span>${escapeHtml(missing.map((role) => role.roleName).join(', '))}</span>
            <span>These phases will fallback to ${escapeHtml(distribution.fallbackAgent?.name ?? 'another available Agent')}.</span>
          </div>
        </div>`
      : '',
    ...(distribution.assignments ?? []).map((item) => `
      <div class="entity-item ${item.exactMatch ? 'active' : ''}">
        <div class="entity-main">
            <strong>${escapeHtml(item.phase)} · ${escapeHtml(item.roleName)}</strong>
            <span>${escapeHtml(item.agent?.name ?? 'Unassigned')}${item.exactMatch ? ' · role match' : item.agent ? ' · fallback' : ''}</span>
          <span>${escapeHtml((item.dependsOn ?? []).length > 0 ? `after ${item.dependsOn.join(', ')}` : 'starts first')}</span>
          <span>${escapeHtml(item.title)}</span>
        </div>
      </div>
    `)
  ].join('') || '<div class="muted-empty">No phases for this template.</div>';
}

function renderTasks() {
  if (!els.taskCount || !els.taskList) return;
  els.taskCount.textContent = String(state.tasks.length);
  els.taskList.innerHTML = state.tasks.length > 0
    ? state.tasks
      .map((task) => {
        const agent = state.agents.find((item) => item.id === task.agentId);
        const status = task.status ?? 'scheduled';
        const canAct = status === 'scheduled';
        return `
          <div class="entity-item ${status === 'running' ? 'active' : ''}">
            <div class="entity-main">
              <strong>${escapeHtml(task.title)} · ${escapeHtml(status)}</strong>
              <span>${escapeHtml(agent?.name ?? 'Unknown Agent')} · ${escapeHtml(formatTaskTime(task))}</span>
              ${scheduledTaskDependencyLabel(task) ? `<span>${escapeHtml(scheduledTaskDependencyLabel(task))}</span>` : ''}
              ${task.repeatInterval ? `<span>Repeat · ${escapeHtml(task.repeatInterval)}${task.parentTaskId ? ' · recurring instance' : ''}</span>` : ''}
              ${task.reviewDecision ? `<span>Review · ${escapeHtml(task.reviewDecision)}${task.reviewNotes ? ` · ${escapeHtml(task.reviewNotes)}` : ''}</span>` : ''}
              ${task.reviewOfTaskId ? `<span>Review of · ${escapeHtml(taskTitleById(task.reviewOfTaskId))}</span>` : ''}
              ${task.revisionOfTaskId ? `<span>Revision of · ${escapeHtml(taskTitleById(task.revisionOfTaskId))}</span>` : ''}
              ${task.supersededByTaskId ? `<span>Superseded by · ${escapeHtml(taskTitleById(task.supersededByTaskId))}</span>` : ''}
              <span>${escapeHtml(task.instructions)}</span>
              ${task.error ? `<span>${escapeHtml(task.error)}</span>` : ''}
            </div>
            <div class="entity-actions">
              ${canAct ? `<button type="button" data-run-task="${escapeHtml(task.id)}">Run Now</button>` : ''}
              ${['done', 'changes_requested'].includes(status) ? `<button type="button" data-approve-task="${escapeHtml(task.id)}">Approve</button>` : ''}
              ${['done', 'approved'].includes(status) ? `<button type="button" data-request-task-changes="${escapeHtml(task.id)}">Request Changes</button>` : ''}
              ${status === 'running' ? `<button type="button" class="danger-button" data-interrupt-task="${escapeHtml(task.id)}">Interrupt</button>` : ''}
              ${canAct ? `<button type="button" class="danger-button" data-cancel-task="${escapeHtml(task.id)}">Cancel</button>` : ''}
              ${status !== 'running' && (task.repeatInterval || task.parentTaskId) ? `<button type="button" class="danger-button" data-delete-task-series="${escapeHtml(task.id)}">Delete Series</button>` : ''}
              ${status === 'running' ? '' : `<button type="button" class="danger-button" data-delete-task="${escapeHtml(task.id)}">Delete</button>`}
            </div>
          </div>
        `;
      })
      .join('')
    : '<div class="muted-empty">No scheduled tasks yet.</div>';

  for (const item of els.taskList.querySelectorAll('[data-run-task]')) {
    item.addEventListener('click', async () => {
      await updateTaskAction(item.getAttribute('data-run-task'), 'run-now');
    });
  }

  for (const item of els.taskList.querySelectorAll('[data-cancel-task]')) {
    item.addEventListener('click', async () => {
      const taskId = item.getAttribute('data-cancel-task');
      const task = state.tasks.find((entry) => entry.id === taskId);
      if (!task || !confirm(`Cancel task "${task.title}"?`)) return;
      await updateTaskAction(taskId, 'cancel');
    });
  }

  for (const item of els.taskList.querySelectorAll('[data-approve-task]')) {
    item.addEventListener('click', async () => {
      await reviewTask(item.getAttribute('data-approve-task'), 'approved');
    });
  }

  for (const item of els.taskList.querySelectorAll('[data-request-task-changes]')) {
    item.addEventListener('click', async () => {
      const taskId = item.getAttribute('data-request-task-changes');
      const notes = prompt('What changes are needed?');
      if (notes === null) return;
      await reviewTask(taskId, 'changes_requested', notes);
    });
  }

  for (const item of els.taskList.querySelectorAll('[data-interrupt-task]')) {
    item.addEventListener('click', async () => {
      const taskId = item.getAttribute('data-interrupt-task');
      const reason = prompt('Why interrupt this task?');
      if (reason === null) return;
      await interruptTask(taskId, reason);
    });
  }

  for (const item of els.taskList.querySelectorAll('[data-delete-task]')) {
    item.addEventListener('click', async () => {
      const taskId = item.getAttribute('data-delete-task');
      const task = state.tasks.find((entry) => entry.id === taskId);
      if (!task || !confirm(`Delete task "${task.title}"? Chat history will be kept.`)) return;
      await deleteTask(taskId);
    });
  }

  for (const item of els.taskList.querySelectorAll('[data-delete-task-series]')) {
    item.addEventListener('click', async () => {
      const taskId = item.getAttribute('data-delete-task-series');
      const task = state.tasks.find((entry) => entry.id === taskId);
      if (!task || !confirm(`Delete future scheduled tasks in the "${task.title}" series? Completed history will be kept.`)) return;
      await deleteTaskSeries(taskId);
    });
  }
}

async function scheduleTaskPlanItem(indexValue) {
  if (!state.activeRoomId) return;
  const [messageId, rawIndex] = String(indexValue ?? '').split(':');
  const index = Number(rawIndex);
  if (!Number.isInteger(index)) return;
  const sourceMessage = state.messages.find((message) => message.id === messageId);
  const plan = sourceMessage ? parseTaskPlanMessage(renderMessageContent(sourceMessage)) : null;
  const item = plan?.items?.[index];
  if (!item) return;
  const scheduled = await createTaskFromPlanItem(plan, item, new Map());
  if (scheduled) {
    replaceByIdOrPush(state.tasks, scheduled);
    renderAll();
  }
}

async function scheduleTaskPlanAll(messageId) {
  if (!state.activeRoomId) return;
  const sourceMessage = state.messages.find((message) => message.id === messageId);
  const plan = sourceMessage ? parseTaskPlanMessage(renderMessageContent(sourceMessage)) : null;
  if (!plan?.items?.length) return;
  const createdByPlanId = new Map();
  const createdTasks = [];
  for (const item of plan.items) {
    const task = await createTaskFromPlanItem(plan, item, createdByPlanId);
    if (task) {
      createdByPlanId.set(item.id, task);
      createdTasks.push(task);
    } else {
      break;
    }
  }
  for (const task of createdTasks) replaceByIdOrPush(state.tasks, task);
  renderAll();
}

async function createTaskFromPlanItem(plan, item, createdByPlanId) {
  const agent = resolvePlanAgent(item, activeRoomAgents());
  if (!agent) {
    alert(`No Agent found for "${item.agent || 'this task'}" in the active Room.`);
    return null;
  }
  return await api(`/api/rooms/${state.activeRoomId}/tasks`, {
    method: 'POST',
    body: {
      title: item.title,
      agentId: agent.id,
      scheduleAt: resolvePlanScheduleAt(item.scheduleAt).toISOString(),
      instructions: item.instructions,
      repeatInterval: item.repeatInterval,
      dependsOnTaskIds: resolvePlanDependencyTaskIds(plan, item, createdByPlanId)
    }
  });
}

async function sendApprovalDecision(value) {
  if (!state.activeRoomId) return;
  const [messageId, decision] = String(value ?? '').split(':');
  const message = state.messages.find((entry) => entry.id === messageId);
  if (!message) return;
  const request = parseApprovalRequestMessage(renderMessageContent(message));
  const approved = decision === 'approved';
  const content = [
    `@${message.senderName} Approval ${approved ? 'approved' : 'rejected'}: ${request?.title ?? 'request'}`,
    request?.reason ? `Reason: ${request.reason}` : '',
    approved
      ? 'You may proceed with the approved path.'
      : 'Do not proceed with that path. Propose a safer or revised alternative.'
  ].filter(Boolean).join('\n');
  const dispatch = await api(`/api/rooms/${state.activeRoomId}/dispatch`, {
    method: 'POST',
    body: {
      content,
      senderName: 'You',
      replyToMessageId: message.id
    }
  });
  replaceByIdOrPush(state.messages, dispatch.message);
  renderMessages({ stickToBottom: true });
  await streamReplies(dispatch.targets);
}

async function sendCredentialChoice(value) {
  let payload = null;
  try {
    payload = JSON.parse(decodeURIComponent(String(value ?? '')));
  } catch {
    payload = null;
  }
  const messageId = String(payload?.messageId ?? '');
  const credentialId = String(payload?.credentialId ?? '').trim();
  const credentialName = String(payload?.credentialName ?? '').trim();
  const message = state.messages.find((entry) => entry.id === messageId);
  const choice = parseCredentialChoiceMessage(renderMessageContent(message));
  if (!choice || (!credentialId && !credentialName) || !state.activeRoomId) return;
  const credentialLabel = credentialName || credentialId;
  const content = [
    `Use credential "${credentialLabel}" for ${choice.skillId}.${choice.actionId}.`,
    `This credential is locked for this attempt. If the action fails, report the failure for this credential and do not switch to another credential unless I explicitly choose one.`,
    '',
    'Continue the requested action by emitting this skill action with the selected credential and original input:',
    '```agentim-skill-action',
    JSON.stringify({
      skillId: choice.skillId,
      action: choice.actionId,
      credential: credentialId || credentialName,
      input: choice.input ?? {}
    }, null, 2),
    '```',
    '',
    'Original input:',
    '```json',
    JSON.stringify(choice.input ?? {}, null, 2),
    '```'
  ].join('\n');
  const dispatch = await api(`/api/rooms/${state.activeRoomId}/dispatch`, {
    method: 'POST',
    body: {
      content,
      targetAgentIds: choice.agentId ? [choice.agentId] : [],
      senderName: 'You',
      replyToMessageId: messageId
    }
  });
  replaceByIdOrPush(state.messages, dispatch.message);
  renderMessages({ stickToBottom: true });
  await streamReplies(dispatch.targets);
}

function renderProjects() {
  if (!els.projectList || !els.projectTaskList) return;
  els.projectList.innerHTML = state.projects.length > 0
    ? state.projects.map((project) => renderProjectProgressCard(project, {
      interactive: true,
      compact: false
    })).join('')
    : '<div class="muted-empty">No projects yet.</div>';

  els.projectTaskList.innerHTML = state.projectTasks.length > 0
    ? state.projectTasks.map((task) => {
      const agent = state.agents.find((item) => item.id === task.agentId);
      const project = state.projects.find((item) => item.id === task.projectId);
      const dependencyLabel = projectTaskDependencyLabel(task);
      return `
        <div class="entity-item ${task.status === 'running' ? 'active' : ''}">
          <div class="entity-main">
            <strong>${escapeHtml(task.phase)} · ${escapeHtml(task.status)}</strong>
            <span>${escapeHtml(project?.name ?? 'Project')} · ${escapeHtml(agent?.name ?? task.roleId)}</span>
            <span>${escapeHtml(dependencyLabel)}</span>
            <span>${escapeHtml(task.title)}</span>
          </div>
          <div class="entity-actions">
            ${task.status === 'running' && task.runId ? `<button type="button" class="danger-button" data-stop-project-task="${escapeHtml(task.runId)}">Stop</button>` : ''}
            ${task.status !== 'running' ? `<button type="button" data-retry-project-task="${escapeHtml(task.id)}">Retry</button>` : ''}
            ${task.status !== 'running' ? `<button type="button" data-reassign-project-task="${escapeHtml(task.id)}">Reassign</button>` : ''}
          </div>
        </div>
      `;
    }).join('')
    : '<div class="muted-empty">No project tasks yet.</div>';

  for (const item of els.projectList.querySelectorAll('[data-open-project]')) {
    item.addEventListener('click', async () => {
      await refreshWorkspaceFiles(item.getAttribute('data-open-project'));
    });
  }

  for (const item of els.projectList.querySelectorAll('[data-preview-project]')) {
    item.addEventListener('click', () => {
      openPreviewPage(item.getAttribute('data-preview-project'));
    });
  }

  for (const item of els.projectList.querySelectorAll('[data-deliver-project]')) {
    item.addEventListener('click', async () => {
      await showProjectDelivery(item.getAttribute('data-deliver-project'));
    });
  }

  for (const item of els.projectList.querySelectorAll('[data-write-delivery]')) {
    item.addEventListener('click', async () => {
      await writeProjectDeliveryFile(item.getAttribute('data-write-delivery'));
    });
  }

  for (const item of els.projectList.querySelectorAll('[data-archive-project]')) {
    item.addEventListener('click', async () => {
      const projectId = item.getAttribute('data-archive-project');
      const project = state.projects.find((entry) => entry.id === projectId);
      if (!project || !confirm(`Archive project "${project.name}"? Active project tasks will be cancelled.`)) return;
      await updateProjectAction(projectId, 'archive');
    });
  }

  for (const item of els.projectList.querySelectorAll('[data-delete-project]')) {
    item.addEventListener('click', async () => {
      const projectId = item.getAttribute('data-delete-project');
      const project = state.projects.find((entry) => entry.id === projectId);
      if (!project) return;
      const deleteFiles = confirm(`Delete project "${project.name}" from the list?\n\nPress OK to also delete its folder:\n${project.rootPath}\n\nPress Cancel to delete only the project record.`);
      if (!deleteFiles && !confirm(`Delete only the project record for "${project.name}"? Files will remain.`)) return;
      await deleteProject(projectId, deleteFiles);
    });
  }

  for (const item of els.projectTaskList.querySelectorAll('[data-stop-project-task]')) {
    item.addEventListener('click', async () => {
      await stopAgentRun(item.getAttribute('data-stop-project-task'));
      await refreshProjects();
      renderProjects();
      renderAgentWorkCenter();
    });
  }

  for (const item of els.projectTaskList.querySelectorAll('[data-retry-project-task]')) {
    item.addEventListener('click', async () => {
      await retryProjectTask(item.getAttribute('data-retry-project-task'));
    });
  }

  for (const item of els.projectTaskList.querySelectorAll('[data-reassign-project-task]')) {
    item.addEventListener('click', async () => {
      await reassignProjectTask(item.getAttribute('data-reassign-project-task'));
    });
  }
}

function renderProjectProgressCard(project, options = {}) {
  const tasks = projectTasksForProject(project.id);
  const progress = projectProgressSummary(project, tasks);
  const outputs = state.projectOutputs[project.id] ?? null;
  const previewPath = outputs?.discoveredEntryPath || project.entryPath;
  const compactClass = options.compact ? ' compact' : '';
  return `
    <section class="project-progress-card${compactClass} ${project.status === 'done' ? 'done' : ''}">
      <div class="project-progress-header">
        <div>
          <strong>${escapeHtml(project.name)} · ${escapeHtml(project.status)}</strong>
          <span>${escapeHtml(project.type)} · ${escapeHtml(project.rootPath)}</span>
          <span>${escapeHtml(progress.summary)}</span>
        </div>
        ${options.interactive ? `
          <div class="project-event-actions">
            <button type="button" data-open-project="${escapeHtml(project.rootPath)}">Files</button>
            ${previewPath ? `<button type="button" data-preview-project="${escapeHtml(previewPath)}">Page</button>` : ''}
            <button type="button" data-deliver-project="${escapeHtml(project.id)}">Delivery</button>
            <button type="button" data-write-delivery="${escapeHtml(project.id)}">Write Delivery</button>
            <a class="button-link" href="${escapeHtml(projectDownloadUrl(project.id))}" download>Download</a>
            ${project.status === 'archived' ? '' : `<button type="button" data-archive-project="${escapeHtml(project.id)}">Archive</button>`}
            <button type="button" class="danger-button" data-delete-project="${escapeHtml(project.id)}">Delete</button>
          </div>
        ` : ''}
      </div>
      <div class="project-progress-meter" aria-label="${escapeHtml(progress.summary)}">
        <span style="width: ${escapeHtml(String(progress.percent))}%"></span>
      </div>
      ${state.projectDeliveries[project.id] ? renderProjectDeliverySummary(state.projectDeliveries[project.id]) : ''}
      ${outputs ? renderProjectOutputSummary(outputs, { compact: options.compact }) : ''}
      <div class="project-phase-list">
        ${tasks.length > 0 ? tasks.map((task) => renderProjectProgressPhase(task)).join('') : '<div class="muted-empty">No project tasks yet.</div>'}
      </div>
    </section>
  `;
}

function renderProjectOutputSummary(outputs, options = {}) {
  const recentFiles = Array.isArray(outputs.recentFiles) ? outputs.recentFiles.slice(0, options.compact ? 3 : 5) : [];
  const recentArtifacts = Array.isArray(outputs.recentArtifacts) ? outputs.recentArtifacts.slice(0, options.compact ? 2 : 4) : [];
  return `
    <div class="project-output-summary">
      <div class="project-output-stats">
        <span>${escapeHtml(String(outputs.fileCount ?? 0))} files</span>
        <span>${escapeHtml(String(outputs.previewableCount ?? 0))} previewable</span>
        <span>${escapeHtml(String(outputs.artifactCount ?? 0))} artifacts</span>
        ${outputs.discoveredEntryPath ? `<span>entry ${escapeHtml(outputs.discoveredEntryPath)}</span>` : ''}
      </div>
      ${recentFiles.length > 0 ? `
        <div class="project-output-list">
          ${recentFiles.map((file) => `
            <button type="button" data-open-artifact="${escapeHtml(file.path)}">
              <strong>${escapeHtml(file.name ?? file.path.split('/').pop())}</strong>
              <span>${escapeHtml(file.path)}</span>
            </button>
          `).join('')}
        </div>
      ` : ''}
      ${recentArtifacts.length > 0 && !options.compact ? `
        <div class="project-output-list">
          ${recentArtifacts.map((artifact) => `
            <div class="artifact-output-row">
              <button type="button" data-open-artifact="${escapeHtml(artifact.path ?? '')}" ${artifact.path ? '' : 'disabled'}>
                <strong>${escapeHtml(artifact.title ?? artifact.kind)}</strong>
                <span>${escapeHtml(artifact.path ?? 'No path')}</span>
              </button>
              ${projectPackageDownloadLink(artifact)}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderProjectDeliverySummary(delivery) {
  const status = delivery.delivery?.status ?? delivery.project?.status ?? 'unknown';
  const outputCount = delivery.outputs?.fileCount ?? 0;
  const taskSummary = delivery.taskSummary ?? {};
  const reviewText = delivery.review?.resultSummary || delivery.review?.error || 'No review summary yet.';
  const entryPath = delivery.delivery?.entryPath;
  return `
    <div class="project-delivery-summary">
      <div>
        <strong>Delivery · ${escapeHtml(status)}</strong>
        <span>${escapeHtml(String(outputCount))} files · ${escapeHtml(String(taskSummary.done ?? 0))}/${escapeHtml(String(taskSummary.total ?? 0))} tasks done</span>
      </div>
      <p>${escapeHtml(reviewText)}</p>
      <div class="project-event-actions">
        ${entryPath ? `<button type="button" data-preview-project="${escapeHtml(entryPath)}">Open Page</button>` : ''}
        <button type="button" data-write-delivery="${escapeHtml(delivery.project?.id ?? '')}">Write DELIVERY.md</button>
        <a class="button-link" href="${escapeHtml(delivery.delivery?.downloadUrl ?? projectDownloadUrl(delivery.project?.id))}" download>Download Zip</a>
      </div>
    </div>
  `;
}

function renderProjectProgressPhase(task) {
  const agent = state.agents.find((item) => item.id === task.agentId);
  const dependencyLabel = projectTaskDependencyLabel(task);
  const canStop = task.status === 'running' && task.runId;
  const canRetry = task.status !== 'running';
  return `
    <div class="project-phase-row status-${escapeHtml(task.status ?? 'unknown')}">
      <div>
        <strong>${escapeHtml(task.phase)} · ${escapeHtml(task.status)}</strong>
        <span>${escapeHtml(task.title)}</span>
        ${task.error ? `<span>${escapeHtml(task.error)}</span>` : ''}
      </div>
      <div class="project-phase-meta">
        <strong>${escapeHtml(agent?.name ?? task.roleId ?? 'Unassigned')}</strong>
        <span>${escapeHtml(dependencyLabel)}</span>
        <span>${escapeHtml(formatProjectTaskTime(task))}</span>
        <div class="project-phase-actions">
          ${canStop ? `<button type="button" class="danger-button" data-stop-project-task="${escapeHtml(task.runId)}">Stop</button>` : ''}
          ${canRetry ? `<button type="button" data-retry-project-task="${escapeHtml(task.id)}">Retry</button>` : ''}
          ${canRetry ? `<button type="button" data-reassign-project-task="${escapeHtml(task.id)}">Reassign</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function projectTasksForProject(projectId) {
  return state.projectTasks
    .filter((task) => task.projectId === projectId)
    .sort((a, b) => compareMessagesAsc(a, b));
}

function projectProgressSummary(project, tasks) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === 'done').length;
  const running = tasks.filter((task) => task.status === 'running').length;
  const failed = tasks.filter((task) => task.status === 'failed').length;
  const waiting = tasks.filter((task) => task.status === 'queued' || task.status === 'blocked').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const parts = [
    `${done}/${total} done`,
    running ? `${running} running` : '',
    waiting ? `${waiting} waiting` : '',
    failed ? `${failed} failed` : '',
    project.currentPhase ? `phase ${project.currentPhase}` : ''
  ].filter(Boolean);
  return {
    done,
    total,
    running,
    waiting,
    failed,
    percent,
    summary: parts.join(' · ') || 'No tasks yet'
  };
}

function renderAgentWorkCenter() {
  if (!els.agentWorkCount || !els.agentWorkList) return;
  const groups = buildAgentWorkGroups();
  const activeWorkCount = groups.reduce((total, group) => total + group.items.length, 0);
  els.agentWorkCount.textContent = String(activeWorkCount);
  els.agentWorkList.innerHTML = groups.length > 0
    ? groups.map((group) => `
      <div class="entity-item work-agent ${group.status === 'running' ? 'active' : ''}">
        <div class="work-agent-heading">
          <div class="entity-main">
            <strong>${escapeHtml(group.agent?.name ?? group.name)} · ${escapeHtml(group.status)}</strong>
            <span>${escapeHtml(group.summary)}</span>
          </div>
          <div class="work-badges">
            <span class="work-badge">run ${group.counts.running}</span>
            <span class="work-badge">ready ${group.counts.ready}</span>
            <span class="work-badge">wait ${group.counts.waiting}</span>
            <span class="work-badge">fail ${group.counts.failed}</span>
          </div>
        </div>
        ${group.items.length > 0 ? `
          <div class="work-task-list">
            ${group.items.map((item) => `
              <div class="work-task-row ${item.status === 'running' ? 'active' : ''}">
                <div class="entity-main">
                  <strong>${escapeHtml(item.status)} · ${escapeHtml(item.kindLabel)}</strong>
                  <span>${escapeHtml(item.meta)}</span>
                  <span>${escapeHtml(item.title)}</span>
                </div>
                <div class="entity-actions">
                  ${item.runId && ['queued', 'running'].includes(item.status) ? `<button type="button" class="danger-button" data-work-stop="${escapeHtml(item.runId)}">Stop</button>` : ''}
                  ${item.kind === 'project' && item.status !== 'running' ? `<button type="button" data-work-retry="${escapeHtml(item.id)}">Retry</button>` : ''}
                  ${item.kind === 'scheduled' && item.status === 'scheduled' ? `<button type="button" data-work-run-task="${escapeHtml(item.id)}">Run Now</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="muted-empty">Idle</div>'}
      </div>
    `).join('')
    : '<div class="muted-empty">No Agents in this Room.</div>';

  for (const item of els.agentWorkList.querySelectorAll('[data-work-stop]')) {
    item.addEventListener('click', async () => {
      await stopAgentRun(item.getAttribute('data-work-stop'));
      await refreshTasks();
      await refreshProjects();
      renderAll();
    });
  }

  for (const item of els.agentWorkList.querySelectorAll('[data-work-retry]')) {
    item.addEventListener('click', async () => {
      await retryProjectTask(item.getAttribute('data-work-retry'));
    });
  }

  for (const item of els.agentWorkList.querySelectorAll('[data-work-run-task]')) {
    item.addEventListener('click', async () => {
      await updateTaskAction(item.getAttribute('data-work-run-task'), 'run-now');
    });
  }
}

async function updateTaskAction(taskId, action) {
  if (!taskId || !state.activeRoomId) return;
  try {
    const task = await api(`/api/tasks/${encodeURIComponent(taskId)}/${action}`, { method: 'POST' });
    replaceByIdOrPush(state.tasks, task);
    await loadLatestMessages({ markMentionsSeen: true });
    state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
    await refreshTasks();
    await refreshProjects();
    renderAll();
    ensureMessagePolling();
  } catch (error) {
    alert(`Task action failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function reviewTask(taskId, decision, notes = '') {
  if (!taskId || !state.activeRoomId) return;
  try {
    const result = await api(`/api/tasks/${encodeURIComponent(taskId)}/review`, {
      method: 'POST',
      body: { decision, notes }
    });
    if (result.task) replaceByIdOrPush(state.tasks, result.task);
    if (result.revision) replaceByIdOrPush(state.tasks, result.revision);
    await refreshTasks();
    renderAll();
    ensureMessagePolling();
  } catch (error) {
    alert(`Task review failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function interruptTask(taskId, reason = '') {
  if (!taskId || !state.activeRoomId) return;
  try {
    const result = await api(`/api/tasks/${encodeURIComponent(taskId)}/interrupt`, {
      method: 'POST',
      body: { reason }
    });
    if (result.task) replaceByIdOrPush(state.tasks, result.task);
    if (result.replacement) replaceByIdOrPush(state.tasks, result.replacement);
    state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
    await refreshTasks();
    renderAll();
    ensureMessagePolling();
  } catch (error) {
    alert(`Task interrupt failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function deleteTask(taskId) {
  if (!taskId || !state.activeRoomId) return;
  try {
    await api(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    renderTasks();
    renderAgentWorkCenter();
    renderRoomInspector();
  } catch (error) {
    alert(`Task delete failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function deleteTaskSeries(taskId) {
  if (!taskId || !state.activeRoomId) return;
  try {
    const result = await api(`/api/tasks/${encodeURIComponent(taskId)}/series`, { method: 'DELETE' });
    const deletedIds = new Set((result.deleted ?? []).map((task) => task.id));
    state.tasks = state.tasks.filter((task) => !deletedIds.has(task.id));
    renderTasks();
    renderAgentWorkCenter();
    renderRoomInspector();
  } catch (error) {
    alert(`Task series delete failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function updateProjectAction(projectId, action) {
  if (!projectId || !state.activeRoomId) return;
  try {
    await api(`/api/projects/${encodeURIComponent(projectId)}/${action}`, { method: 'POST' });
    await refreshProjects();
    renderProjects();
    renderAgentWorkCenter();
  } catch (error) {
    alert(`Project ${action} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function showProjectDelivery(projectId) {
  if (!projectId) return;
  try {
    state.projectDeliveries[projectId] = await api(`/api/projects/${encodeURIComponent(projectId)}/delivery`);
    renderProjects();
    renderRoomInspector();
  } catch (error) {
    alert(`Project delivery failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeProjectDeliveryFile(projectId) {
  if (!projectId) return;
  try {
    const result = await api(`/api/projects/${encodeURIComponent(projectId)}/delivery-file`, { method: 'POST' });
    state.projectDeliveries[projectId] = result.delivery;
    await refreshProjects();
    await refreshArtifacts();
    if (result.path) {
      await refreshWorkspaceFiles(dirname(result.path), false);
      await openInspectorFile(result.path);
      state.roomInspectorTab = 'files';
    }
    renderAll();
  } catch (error) {
    alert(`Write delivery failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function deleteProject(projectId, deleteFiles) {
  if (!projectId || !state.activeRoomId) return;
  try {
    await api(`/api/projects/${encodeURIComponent(projectId)}${deleteFiles ? '?deleteFiles=1' : ''}`, { method: 'DELETE' });
    state.projects = state.projects.filter((project) => project.id !== projectId);
    state.projectTasks = state.projectTasks.filter((task) => task.projectId !== projectId);
    if (deleteFiles) await refreshWorkspaceFiles(state.workspacePath);
    renderProjects();
    renderAgentWorkCenter();
  } catch (error) {
    alert(`Project delete failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function retryProjectTask(taskId) {
  if (!taskId || !state.activeRoomId) return;
  try {
    const result = await api(`/api/project-tasks/${encodeURIComponent(taskId)}/retry`, { method: 'POST' });
    if (result.project) replaceByIdOrPush(state.projects, result.project);
    if (Array.isArray(result.tasks)) state.projectTasks = mergeProjectTasks(state.projectTasks, result.tasks);
    await loadLatestMessages({ markMentionsSeen: true });
    state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
    await refreshProjects();
    renderAll();
    ensureMessagePolling();
  } catch (error) {
    alert(`Project task retry failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function reassignProjectTask(taskId) {
  if (!taskId || !state.activeRoomId) return;
  const task = state.projectTasks.find((entry) => entry.id === taskId);
  if (!task) return;
  const candidates = state.agents.filter((agent) => isAgentInActiveRoom(agent.id));
  const hint = candidates.map((agent) => `${agent.name} (${agent.id})`).join('\n');
  const value = prompt(`Assign "${task.title}" to which Agent?\n\n${hint}`, task.agentId ?? candidates[0]?.id ?? '');
  if (!value) return;
  const normalized = normalizeMentionToken(value);
  const agent = candidates.find((entry) => entry.id === value.trim() || normalizeMentionToken(entry.name) === normalized);
  if (!agent) {
    alert('Agent not found in this room.');
    return;
  }
  try {
    const result = await api(`/api/project-tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: { agentId: agent.id }
    });
    if (result.task) replaceByIdOrPush(state.projectTasks, result.task);
    renderProjects();
    renderAgentWorkCenter();
  } catch (error) {
    alert(`Project task reassign failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderAgentRoleOptions() {
  const previousRoleId = els.agentRoleSelect.value;
  els.agentRoleSelect.innerHTML = state.roles
    .map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`)
    .join('');
  const selected = state.roles.find((role) => role.id === previousRoleId)
    ?? state.roles.find((role) => role.id === 'general')
    ?? state.roles[0];
  if (selected) els.agentRoleSelect.value = selected.id;
}

function agentRoleSummary(agent) {
  const role = state.roles.find((item) => item.id === agent.roleId);
  const roleName = role?.name ?? 'General';
  const skills = effectiveRoleSkillIds(role);
  const preview = skills.slice(0, 4).join(', ');
  return `${roleName} · ${skills.length} skills${preview ? ` · ${preview}${skills.length > 4 ? ', ...' : ''}` : ''}`;
}

function agentEffectiveSkillSummary(agent) {
  const role = state.roles.find((item) => item.id === agent.roleId);
  const skills = effectiveRoleSkillIds(role);
  const core = ['agent.message', 'workspace.read', 'workspace.write', 'task.schedule']
    .filter((id) => skills.includes(id));
  const missing = ['agent.message', 'workspace.read', 'workspace.write']
    .filter((id) => !skills.includes(id));
  return [
    `Effective: ${core.length > 0 ? core.join(', ') : 'no core skills'}`,
    missing.length > 0 ? `Missing: ${missing.join(', ')}` : ''
  ].filter(Boolean).join(' · ');
}

function effectiveRoleSkillIds(role) {
  const enabled = new Set(enabledSkills().map((skill) => skill.id));
  return [...new Set((role?.skillIds ?? []).filter((id) => enabled.has(id)))];
}

function renderConversation() {
  const room = state.rooms.find((c) => c.id === state.activeRoomId);
  const dmAgent = room?.type === 'dm'
    ? state.agents.find((agent) => agent.id === room.dmAgentId)
      ?? state.agents.find((agent) => agent.id === state.roomAgents.find((item) => item.roomId === room.id && item.enabled !== false)?.agentId)
      ?? null
    : null;
  const conversationName = room?.type === 'dm'
    ? dmAgent?.name ?? room?.name ?? 'Direct chat'
    : room?.name ?? 'Room';
  els.conversationTitle.textContent = conversationName;
  if (els.mobileRoomTitle) els.mobileRoomTitle.textContent = conversationName;
  if (els.messageForm?.elements?.content) {
    els.messageForm.elements.content.placeholder = room?.type === 'dm'
      ? `Message ${conversationName}`
      : 'Message @agent or @all...';
  }
  if (els.mentionBar) {
    els.mentionBar.hidden = room?.type === 'dm';
    if (room?.type === 'dm') els.mentionBar.innerHTML = '';
  }
}

function renderRoomInspector() {
  if (!els.roomInspector || !els.roomInspectorContent) return;
  const room = state.rooms.find((item) => item.id === state.activeRoomId);
  els.roomInspector.hidden = !state.roomInspectorOpen;
  els.roomInspectorToggle?.classList.toggle('active', state.roomInspectorOpen);
  els.mobileRoomInfoToggle?.classList.toggle('active', state.roomInspectorOpen);
  if (els.roomInspectorTitle) els.roomInspectorTitle.textContent = room ? `${room.name} · ${room.type}` : 'No room selected';
  if (!room) {
    els.roomInspectorContent.innerHTML = '<div class="muted-empty">No room selected.</div>';
    return;
  }

  const activeAgents = state.agents.filter((agent) => isAgentInActiveRoom(agent.id));
  const workGroups = buildAgentWorkGroups();
  const agentWorkRows = buildInspectorAgentWorkRows(activeAgents, workGroups);
  const files = state.workspaceFiles.slice(0, 8);
  const inspectorFile = state.inspectorFile;
  const tasks = buildInspectorTaskRows().slice(0, 10);
  const projects = state.projects.slice(0, 6);
  const artifacts = state.artifacts.slice().reverse().slice(0, 6);
  const pendingApprovals = state.skillApprovals.filter((approval) => approval.status === 'pending');
  const activity = state.skillInvocations.slice().reverse().slice(0, 8);
  const activeRuns = agentWorkRows.reduce((total, row) => total + row.runs.filter((run) => ['queued', 'running'].includes(run.status)).length, 0);
  const readyTasks = tasks.filter((row) => row.status === 'ready' || row.detail.includes('ready')).length;
  const activeTab = ['details', 'work', 'projects', 'files', 'preview', 'artifacts'].includes(state.roomInspectorTab)
    ? state.roomInspectorTab
    : 'details';
  const tabButton = (key, label, count = '') => `
    <button type="button" class="${activeTab === key ? 'active' : ''}" data-inspector-tab="${escapeHtml(key)}">
      <span>${escapeHtml(label)}</span>
      ${count !== '' ? `<em>${escapeHtml(String(count))}</em>` : ''}
    </button>
  `;
  const tabPanel = (key, body) => activeTab === key ? `<section class="inspector-tab-panel" data-inspector-panel="${escapeHtml(key)}">${body}</section>` : '';
  const agentsBody = `
    ${agentWorkRows.length > 0 ? agentWorkRows.map((row) => {
      const run = row.runs[0];
      return `
        <div class="inspector-item inspector-agent ${row.status === 'running' ? 'active' : ''}">
          <strong>${escapeHtml(row.agent.name)} · ${escapeHtml(row.status)}</strong>
          <span>${escapeHtml(row.summary)}</span>
          <span>${escapeHtml(row.agent.model)}${row.provider ? ` · ${escapeHtml(row.provider.name)}` : ''}</span>
          ${run ? `<span>Run ${escapeHtml(run.status)} · ${escapeHtml(formatInvocationTime(run))}</span>` : ''}
          ${row.workItem ? `<span>${escapeHtml(row.workItem.kindLabel)} · ${escapeHtml(row.workItem.status)} · ${escapeHtml(row.workItem.title)}</span>` : ''}
          <div class="inspector-actions">
            <button type="button" data-inspector-edit-agent="${escapeHtml(row.agent.id)}">Edit</button>
            ${run && ['queued', 'running'].includes(run.status) ? `<button type="button" class="danger-button" data-inspector-stop-run="${escapeHtml(run.id)}">Stop</button>` : ''}
            ${row.workItem?.kind === 'project' && row.workItem.status !== 'running' ? `<button type="button" data-inspector-retry-task="${escapeHtml(row.workItem.id)}">Retry Task</button>` : ''}
            ${row.workItem?.kind === 'scheduled' && ['scheduled', 'failed', 'cancelled'].includes(row.workItem.status) ? `<button type="button" data-inspector-run-task="${escapeHtml(row.workItem.id)}">Run Now</button>` : ''}
          </div>
        </div>
      `;
    }).join('') : '<div class="muted-empty">No agents in this room.</div>'}
  `;
  const roomSettingsBody = `
    <form class="inspector-room-form" id="room-inspector-form">
      <label>
        Name
        <input name="name" value="${escapeHtml(room.name ?? '')}" required />
      </label>
      <label>
        Description / Rules
        <textarea name="description" rows="4" placeholder="Room goals, rules, workflow, and expected deliverables">${escapeHtml(room.description ?? '')}</textarea>
      </label>
      <div class="inspector-actions">
        <button type="submit">Save Room</button>
      </div>
    </form>
  `;
  const tasksBody = `
    ${tasks.length > 0 ? tasks.map((row) => `
      <div class="inspector-item ${row.status === 'running' ? 'active' : ''}">
        <strong>${escapeHtml(row.title)} · ${escapeHtml(row.status)}</strong>
        <span>${escapeHtml(row.meta)}</span>
        <span>${escapeHtml(row.detail)}</span>
        <div class="inspector-actions">
          ${row.runId && row.status === 'running' ? `<button type="button" class="danger-button" data-inspector-stop-run="${escapeHtml(row.runId)}">Stop</button>` : ''}
          ${row.kind === 'project' && row.status !== 'running' ? `<button type="button" data-inspector-retry-task="${escapeHtml(row.id)}">Retry</button>` : ''}
          ${row.kind === 'scheduled' && ['scheduled', 'failed', 'cancelled'].includes(row.status) ? `<button type="button" data-inspector-run-task="${escapeHtml(row.id)}">Run Now</button>` : ''}
        </div>
      </div>
    `).join('') : '<div class="muted-empty">No tasks yet.</div>'}
  `;
  const projectsBody = `
    ${projects.length > 0 ? projects.map((project) => renderProjectProgressCard(project, {
      interactive: false,
      compact: true
    })).join('') : '<div class="muted-empty">No projects yet.</div>'}
  `;
  const filesBody = `
    ${state.workspacePath ? `
      <button type="button" class="workspace-file inspector-file" data-inspector-dir="${escapeHtml(dirname(state.workspacePath))}">
        <strong>..</strong>
        <span>Parent</span>
        <small></small>
      </button>
    ` : ''}
    ${files.length > 0 ? files.map((file) => `
      <button type="button" class="workspace-file inspector-file" ${file.type === 'directory' ? `data-inspector-dir="${escapeHtml(file.path)}"` : `data-inspector-file="${escapeHtml(file.path)}"`}>
        <strong>${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(file.type)} · ${escapeHtml(file.path)}</span>
        <small ${file.type === 'file' && isPreviewablePath(file.path) ? `data-inspector-preview="${escapeHtml(file.path)}"` : ''}>${file.type === 'file' && isPreviewablePath(file.path) ? 'Preview' : ''}</small>
      </button>
    `).join('') : '<div class="muted-empty">No files here.</div>'}
    ${inspectorFile ? `
      <div class="inspector-file-viewer">
        <div class="inspector-file-viewer-header">
          <div>
            <strong>${escapeHtml(inspectorFile.path)}</strong>
            <span>${escapeHtml(formatBytes(inspectorFile.content.length))}</span>
          </div>
          <div class="inspector-actions">
            <button type="button" data-inspector-open-resource="${escapeHtml(inspectorFile.path)}">Edit</button>
            ${isPreviewablePath(inspectorFile.path) ? `<button type="button" data-inspector-preview="${escapeHtml(inspectorFile.path)}">Preview</button>` : ''}
            <a class="button-link" href="${escapeHtml(fileDownloadUrl(inspectorFile.path))}" download>Download</a>
          </div>
        </div>
        <pre>${escapeHtml(inspectorFile.content)}</pre>
      </div>
    ` : ''}
  `;
  const previewBody = `
    <div class="inspector-preview-toolbar">
      <input id="room-inspector-preview-path" value="${escapeHtml(state.previewPath)}" placeholder="index.html" />
      <button type="button" id="room-inspector-preview-refresh">Preview</button>
    </div>
    <div class="inspector-preview-actions">
      <button type="button" id="room-inspector-preview-open" class="secondary-button" ${state.previewUrl ? '' : 'disabled'}>Open Full Page</button>
    </div>
    <iframe class="inspector-preview-frame" id="room-inspector-preview-frame" title="Room preview" sandbox="allow-scripts allow-forms allow-modals" src="${escapeHtml(state.previewUrl || 'about:blank')}"></iframe>
  `;
  const activityBody = `
    <button type="button" class="secondary-button inspector-clear" id="room-inspector-clear-activity" ${activity.length || artifacts.length || pendingApprovals.length ? '' : 'disabled'}>Clear Activity</button>
    ${pendingApprovals.length > 0 ? pendingApprovals.map((approval) =>
      renderSkillApprovalItem(approval, 'inspector-item active')
    ).join('') : ''}
    ${activity.length > 0 ? activity.map((invocation) => {
      const activity = formatInspectorActivity(invocation);
      return `
        <div class="inspector-item">
          <strong>${escapeHtml(activity.title)}</strong>
          <span>${escapeHtml(activity.meta)}</span>
          <span>${escapeHtml(activity.detail)}</span>
          ${invocation.error ? `<span>${escapeHtml(invocation.error)}</span>` : ''}
        </div>
      `;
    }).join('') : '<div class="muted-empty">No activity yet.</div>'}
  `;
  const artifactsBody = `
    ${artifacts.length > 0 ? renderArtifactGroups(artifacts, { inspector: true }) : '<div class="muted-empty">No artifacts yet.</div>'}
  `;

  els.roomInspectorContent.innerHTML = `
    <div class="inspector-summary">
      <div>
        <strong>${escapeHtml(room.name)}</strong>
        <span>${escapeHtml(room.type)} · ${activeAgents.length} agents · ${activeRuns} active</span>
      </div>
      <div class="inspector-summary-stats">
        <span>${escapeHtml(String(projects.length))} projects</span>
        <span>${escapeHtml(String(tasks.length))} tasks</span>
        <span>${escapeHtml(String(artifacts.length))} artifacts</span>
      </div>
    </div>
    <nav class="inspector-tabs" aria-label="Room context">
      ${tabButton('details', 'Details', activeAgents.length)}
      ${tabButton('work', 'Work', activeRuns || readyTasks || tasks.length)}
      ${tabButton('projects', 'Projects', projects.length)}
      ${tabButton('files', 'Files', files.length)}
      ${tabButton('preview', 'Preview', state.previewPath ? 'on' : '')}
      ${tabButton('artifacts', 'Artifacts', artifacts.length)}
    </nav>
    ${tabPanel('details', `
      <div class="inspector-tab-heading">
        <strong>Room Settings</strong>
        <span>Define the room target, rules, and workflow</span>
      </div>
      ${roomSettingsBody}
      <div class="inspector-tab-heading">
        <strong>Room Members</strong>
        <span>${escapeHtml(activeAgents.length)} active Agents in this conversation</span>
      </div>
      ${agentsBody}
    `)}
    ${tabPanel('work', `
      <div class="inspector-tab-heading">
        <strong>Agent Work</strong>
        <span>${escapeHtml(activeRuns)} active · ${escapeHtml(readyTasks)} ready</span>
      </div>
      ${tasksBody}
      <div class="inspector-tab-heading">
        <strong>Activity</strong>
        <span>${escapeHtml(activity.length + pendingApprovals.length)} recent events</span>
      </div>
      ${activityBody}
    `)}
    ${tabPanel('projects', `
      <div class="inspector-tab-heading">
        <strong>Projects</strong>
        <span>${escapeHtml(projects.length)} recent projects</span>
      </div>
      ${projectsBody}
    `)}
    ${tabPanel('files', `
      <div class="inspector-tab-heading">
        <strong>Files</strong>
        <span>${escapeHtml(state.workspacePath || 'workspace root')}</span>
      </div>
      ${filesBody}
    `)}
    ${tabPanel('preview', `
      <div class="inspector-tab-heading">
        <strong>Preview</strong>
        <span>${escapeHtml(state.previewPath || 'No preview selected')}</span>
      </div>
      ${previewBody}
    `)}
    ${tabPanel('artifacts', `
      <div class="inspector-tab-heading">
        <strong>Artifacts</strong>
        <span>${escapeHtml(artifacts.length)} recent outputs</span>
      </div>
      ${artifactsBody}
    `)}
  `;

  for (const item of els.roomInspectorContent.querySelectorAll('[data-inspector-tab]')) {
    item.addEventListener('click', () => {
      state.roomInspectorTab = item.getAttribute('data-inspector-tab') || 'details';
      renderRoomInspector();
    });
  }
  bindSkillApprovalActions(els.roomInspectorContent);

  const roomInspectorForm = els.roomInspectorContent.querySelector('#room-inspector-form');
  if (roomInspectorForm) {
    roomInspectorForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveInspectorRoomSettings(roomInspectorForm);
    });
  }

  for (const item of els.roomInspectorContent.querySelectorAll('[data-inspector-stop-run]')) {
    item.addEventListener('click', async () => {
      await stopAgentRun(item.getAttribute('data-inspector-stop-run'));
      await refreshTasks();
      await refreshProjects();
      renderAll();
    });
  }

  for (const item of els.roomInspectorContent.querySelectorAll('[data-inspector-edit-agent]')) {
    item.addEventListener('click', async () => {
      await openAgentEditor(item.getAttribute('data-inspector-edit-agent'));
    });
  }

  for (const item of els.roomInspectorContent.querySelectorAll('[data-inspector-retry-task]')) {
    item.addEventListener('click', async () => {
      await retryProjectTask(item.getAttribute('data-inspector-retry-task'));
    });
  }

  for (const item of els.roomInspectorContent.querySelectorAll('[data-inspector-run-task]')) {
    item.addEventListener('click', async () => {
      await updateTaskAction(item.getAttribute('data-inspector-run-task'), 'run-now');
    });
  }

  for (const item of els.roomInspectorContent.querySelectorAll('[data-inspector-dir]')) {
    item.addEventListener('click', async () => {
      await refreshWorkspaceFiles(item.getAttribute('data-inspector-dir'));
      state.inspectorFile = null;
      renderRoomInspector();
    });
  }
  for (const item of els.roomInspectorContent.querySelectorAll('[data-inspector-file]')) {
    item.addEventListener('click', async () => {
      await openInspectorFile(item.getAttribute('data-inspector-file'));
      renderRoomInspector();
    });
  }
  for (const item of els.roomInspectorContent.querySelectorAll('[data-open-artifact]')) {
    item.addEventListener('click', async () => {
      const path = item.getAttribute('data-open-artifact');
      if (!path) return;
      await openInspectorFile(path);
      state.roomInspectorTab = 'files';
      renderRoomInspector();
    });
  }
  for (const item of els.roomInspectorContent.querySelectorAll('[data-open-project-artifacts]')) {
    item.addEventListener('click', async () => {
      await openProjectFilesFromArtifacts(item.getAttribute('data-open-project-artifacts'));
    });
  }
  for (const item of els.roomInspectorContent.querySelectorAll('[data-inspector-open-resource]')) {
    item.addEventListener('click', async () => {
      const path = item.getAttribute('data-inspector-open-resource');
      if (!path) return;
      await readWorkspaceFile(path);
      activateAppSection('resources');
      activateWorkTab('files');
    });
  }
  for (const item of els.roomInspectorContent.querySelectorAll('.inspector-file')) {
    item.addEventListener('dblclick', () => {
      const filePath = item.getAttribute('data-inspector-file');
      if (filePath) openPreviewPage(filePath);
    });
  }
  for (const item of els.roomInspectorContent.querySelectorAll('[data-inspector-preview]')) {
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      openPreviewPage(item.getAttribute('data-inspector-preview'));
    });
  }
  const previewRefresh = els.roomInspectorContent.querySelector('#room-inspector-preview-refresh');
  const previewPath = els.roomInspectorContent.querySelector('#room-inspector-preview-path');
  if (previewRefresh && previewPath) {
    previewRefresh.addEventListener('click', () => {
      setPreviewPath(previewPath.value.trim() || state.activeFilePath);
      renderRoomInspector();
    });
  }
  const previewOpen = els.roomInspectorContent.querySelector('#room-inspector-preview-open');
  if (previewOpen) {
    previewOpen.addEventListener('click', () => openPreviewPage(state.previewPath));
  }
  const clearActivity = els.roomInspectorContent.querySelector('#room-inspector-clear-activity');
  if (clearActivity) {
    clearActivity.addEventListener('click', async () => {
      if (!state.activeRoomId || !confirm('Clear room activity and artifact records? Pending approvals will stay. Files will not be deleted.')) return;
      await api(`/api/rooms/${state.activeRoomId}/activity`, { method: 'DELETE' });
      state.skillInvocations = [];
      state.artifacts = [];
      await refreshSkillApprovals();
      renderRoomInspector();
      renderSkillInvocations();
      renderArtifacts();
    });
  }
}

async function saveInspectorRoomSettings(form) {
  if (!state.activeRoomId) return;
  const data = formData(form);
  try {
    const room = await api(`/api/rooms/${state.activeRoomId}`, {
      method: 'PATCH',
      body: {
        name: String(data.name ?? '').trim(),
        description: String(data.description ?? '').trim()
      }
    });
    replaceById(state.rooms, room);
    state.conversations = state.rooms;
    renderConversationList();
    renderConversation();
    renderRoomInspector();
  } catch (error) {
    alert(`Room settings update failed: ${roomErrorMessage(error)}`);
  }
}

function activateAppSection(name) {
  const target = name || 'chats';
  state.activeAppSection = target;
  if (els.appShell) els.appShell.dataset.activeSection = target;
  renderMobileAppBar();
  for (const button of els.appSectionButtons) {
    button.classList.toggle('active', button.getAttribute('data-app-section-button') === target);
  }
  for (const panel of els.appSectionPanels) {
    panel.classList.toggle('active', panel.getAttribute('data-app-section-panel') === target);
  }
  els.appShell?.classList.toggle('management-mode', target !== 'chats');
  if (target !== 'chats') closeMobileChatList();
  if (target === 'settings') activateWorkTab('work');
}

function renderMobileAppBar() {
  if (!els.mobileRoomTitle) return;
  els.mobileChatListToggle?.toggleAttribute('hidden', state.activeAppSection !== 'chats');
  els.mobileRoomInfoToggle?.toggleAttribute('hidden', state.activeAppSection !== 'chats');
  els.mobileRoomInfoToggle?.classList.toggle('active', Boolean(state.roomInspectorOpen));
  const labels = {
    chats: state.rooms.find((room) => room.id === state.activeRoomId)?.name ?? 'Conversation',
    circles: 'Circles',
    contacts: 'Contacts',
    resources: 'Resources',
    settings: 'Settings'
  };
  els.mobileRoomTitle.textContent = labels[state.activeAppSection] ?? 'AgentIM';
}

function toggleMobileChatList(force) {
  const shouldOpen = force ?? !els.appShell?.classList.contains('mobile-chat-list-open');
  els.appShell?.classList.toggle('mobile-chat-list-open', Boolean(shouldOpen));
}

function closeMobileChatList() {
  els.appShell?.classList.remove('mobile-chat-list-open');
}

function setApiStatus(text) {
  const isOnline = /^Online/i.test(String(text ?? ''));
  for (const item of [els.apiStatus, els.mobileApiStatus].filter(Boolean)) {
    item.textContent = item === els.mobileApiStatus ? text.replace(/^Online · /, '') : text;
    item.classList.toggle('online-text', isOnline);
  }
}

function updateRuntimeInfo(runtime) {
  if (!runtime) return;
  const previousId = state.runtime?.instanceId;
  state.runtime = runtime;
  setApiStatus(onlineStatusLabel());
  renderRuntimeInfo();
  if (previousId && runtime.instanceId && previousId !== runtime.instanceId) {
    flashStatus(`API restarted · ${runtime.instanceId}`);
  }
}

function onlineStatusLabel() {
  return state.runtime?.instanceId
    ? `Online · ${state.runtime.instanceId}`
    : 'Online';
}

function renderRuntimeInfo() {
  if (!els.runtimeInfo) return;
  const runtime = state.runtime ?? {};
  const started = runtime.startedAt ? new Date(runtime.startedAt).toLocaleString() : 'Unknown';
  els.runtimeInfo.innerHTML = `
    <div class="entity-main">
      <strong>API Runtime</strong>
      <span>Version: ${escapeHtml(runtime.version ?? 'unknown')}</span>
      <span>Instance: ${escapeHtml(runtime.instanceId ?? 'unknown')}</span>
      <span>Started: ${escapeHtml(started)}</span>
    </div>
  `;
}

function flashStatus(text) {
  setApiStatus(text);
  setTimeout(() => setApiStatus(onlineStatusLabel()), 2400);
}

function activateWorkTab(name) {
  const target = name || 'work';
  for (const tab of els.workTabs) {
    tab.classList.toggle('active', tab.getAttribute('data-work-tab') === target);
  }
  for (const panel of els.workPanels) {
    panel.classList.toggle('active', panel.getAttribute('data-work-panel') === target);
  }
}

function activateSectionTab(name) {
  const target = String(name ?? '');
  const section = target.split(':')[0];
  if (!section) return;
  for (const tab of els.sectionTabs) {
    const value = tab.getAttribute('data-section-tab') ?? '';
    if (value.startsWith(`${section}:`)) tab.classList.toggle('active', value === target);
  }
  for (const panel of els.sectionPanels) {
    const value = panel.getAttribute('data-section-panel') ?? '';
    if (value.startsWith(`${section}:`)) panel.classList.toggle('active', value === target);
  }
}

function activateMobilePane(name) {
  const target = name === 'files' ? 'work' : (name || 'chat');
  if (name === 'files') activateWorkTab('files');
  for (const tab of els.mobileTabs) {
    tab.classList.toggle('active', tab.getAttribute('data-mobile-tab') === name);
  }
  for (const pane of els.mobilePanes) {
    pane.classList.toggle('active', pane.getAttribute('data-mobile-pane') === target);
  }
}

async function loadLatestMessages(options = {}) {
  if (!state.activeRoomId) {
    resetMessagePagination();
    return;
  }
  const page = await fetchMessagePage();
  state.messages = page.messages;
  applyMessagePagination(page.pagination);
  if (options.markMentionsSeen) markUserMentionsSeen(state.messages);
}

async function loadOlderMessages() {
  if (!state.activeRoomId || !state.messagesHasMore || state.isLoadingOlderMessages) return;
  state.isLoadingOlderMessages = true;
  const previousHeight = els.messages.scrollHeight;
  try {
    const page = await fetchMessagePage({
      before: state.oldestMessageCursor?.createdAt,
      beforeId: state.oldestMessageCursor?.id
    });
    state.messages = mergeMessages([...page.messages, ...state.messages]);
    applyMessagePagination(page.pagination);
    renderMessages({ preserveScroll: true, previousHeight });
  } catch (error) {
    console.warn('Loading older messages failed.', error);
  } finally {
    state.isLoadingOlderMessages = false;
    renderMessages({ preserveScroll: true, previousHeight });
  }
}

async function fetchMessagePage(options = {}) {
  const limit = state.settings?.chat?.messagePageSize ?? 20;
  const params = new URLSearchParams({ limit: String(limit) });
  if (options.before) params.set('before', options.before);
  if (options.beforeId) params.set('beforeId', options.beforeId);
  return api(`/api/rooms/${state.activeRoomId}/messages?${params.toString()}`);
}

function applyMessagePagination(pagination = {}) {
  state.messagesHasMore = Boolean(pagination.hasMore);
  state.oldestMessageCursor = pagination.nextBefore && pagination.nextBeforeId
    ? { createdAt: pagination.nextBefore, id: pagination.nextBeforeId }
    : null;
}

function resetMessagePagination() {
  state.messages = [];
  state.messagesHasMore = false;
  state.oldestMessageCursor = null;
  state.isLoadingOlderMessages = false;
  state.userMentionIds = new Set();
}

function mergeMessages(messages) {
  const byId = new Map();
  for (const message of messages) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort(compareMessagesAsc);
}

function compareMessagesAsc(a, b) {
  const createdAt = String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  if (createdAt !== 0) return createdAt;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

function renderMessages(options = {}) {
  const shouldStickToBottom = options.stickToBottom ?? state.followLatestMessages;
  const previousHeight = options.previousHeight ?? els.messages.scrollHeight;
  const previousTop = options.previousTop ?? els.messages.scrollTop;
  const control = state.messagesHasMore
    ? `<div class="message-history-control">
        <button type="button" class="secondary-button" data-load-older ${state.isLoadingOlderMessages ? 'disabled' : ''}>
          ${state.isLoadingOlderMessages ? 'Loading...' : 'Load earlier'}
        </button>
      </div>`
    : '';
  els.messages.innerHTML = control + state.messages
    .map((message) => {
      const run = findRunForMessage(message);
      const mentionsUser = messageMentionsUser(message);
      return `
      <article class="message ${escapeHtml(message.senderType)} ${isPendingMessage(message) ? 'pending' : ''} ${mentionsUser ? 'mentioned-user' : ''}" data-id="${escapeHtml(message.id)}">
        <div class="message-meta">
          <span>
            ${escapeHtml(message.senderName)}
            ${renderMessageStatusBadge(message, run)}
            ${mentionsUser ? '<span class="mention-badge">Mentioned you</span>' : ''}
          </span>
          <span>
            ${new Date(message.createdAt).toLocaleTimeString()}
            <button type="button" class="message-action" data-copy-message="${escapeHtml(message.id)}">Copy</button>
            <button type="button" class="message-action" data-reply-message="${escapeHtml(message.id)}">Reply</button>
            ${isPendingMessage(message) && message.runId
          ? `<button type="button" class="message-action danger-text" data-stop-run="${escapeHtml(message.runId)}">Stop</button>`
          : ''}
            ${canRetryMessage(message) && message.runId
          ? `<button type="button" class="message-action" data-retry-run="${escapeHtml(message.runId)}">Retry</button>`
          : ''}
          </span>
        </div>
        ${message.replyTo ? `
          <button type="button" class="reply-quote" data-jump-message="${escapeHtml(message.replyTo.id)}">
            <strong>${escapeHtml(message.replyTo.senderName)}</strong>
            <span>${escapeHtml(message.replyTo.content)}</span>
          </button>
        ` : ''}
        <div class="message-content">${renderMessageBody(message)}</div>
      </article>
    `;
    })
    .join('');
  if (options.preserveScroll) {
    els.messages.scrollTop = els.messages.scrollHeight - previousHeight + previousTop;
  } else if (shouldStickToBottom) {
    scrollMessagesToBottom({ immediate: true, updateButton: false });
  } else {
    els.messages.scrollTop = Math.min(previousTop, els.messages.scrollHeight);
  }
  updateScrollLatestButton();

  const loadOlderButton = els.messages.querySelector('[data-load-older]');
  if (loadOlderButton) {
    loadOlderButton.addEventListener('click', loadOlderMessages);
  }

  for (const item of els.messages.querySelectorAll('[data-copy-message]')) {
    item.addEventListener('click', async () => {
      const message = state.messages.find((entry) => entry.id === item.getAttribute('data-copy-message'));
      if (!message) return;
      await copyTextToClipboard(String(message.content ?? ''));
      const previous = item.textContent;
      item.textContent = 'Copied';
      setTimeout(() => {
        item.textContent = previous;
      }, 1200);
    });
  }

  for (const item of els.messages.querySelectorAll('[data-reply-message]')) {
    item.addEventListener('click', () => {
      const message = state.messages.find((entry) => entry.id === item.getAttribute('data-reply-message'));
      if (message) setReplyTarget(message);
    });
  }

  for (const item of els.messages.querySelectorAll('[data-stop-run]')) {
    item.addEventListener('click', async () => {
      await stopAgentRun(item.getAttribute('data-stop-run'));
    });
  }

  for (const item of els.messages.querySelectorAll('[data-retry-run]')) {
    item.addEventListener('click', async () => {
      await retryAgentRun(item.getAttribute('data-retry-run'));
    });
  }

  for (const item of els.messages.querySelectorAll('[data-jump-message]')) {
    item.addEventListener('click', () => {
      const target = document.querySelector(`[data-id="${item.getAttribute('data-jump-message')}"]`);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add('highlight');
      setTimeout(() => target.classList.remove('highlight'), 1300);
    });
  }

  for (const item of els.messages.querySelectorAll('[data-open-preview-artifact]')) {
    item.addEventListener('click', () => {
      openPreviewPage(item.getAttribute('data-open-preview-artifact'));
    });
  }

  for (const item of els.messages.querySelectorAll('[data-open-artifact]')) {
    item.addEventListener('click', async () => {
      const path = item.getAttribute('data-open-artifact');
      if (path) await readWorkspaceFile(path);
    });
  }

  for (const item of els.messages.querySelectorAll('[data-schedule-plan-item]')) {
    item.addEventListener('click', async () => {
      await scheduleTaskPlanItem(item.getAttribute('data-schedule-plan-item'));
    });
  }

  for (const item of els.messages.querySelectorAll('[data-schedule-plan-all]')) {
    item.addEventListener('click', async () => {
      await scheduleTaskPlanAll(item.getAttribute('data-schedule-plan-all'));
    });
  }

  for (const item of els.messages.querySelectorAll('[data-approval-decision]')) {
    item.addEventListener('click', async () => {
      await sendApprovalDecision(item.getAttribute('data-approval-decision'));
    });
  }

  for (const item of els.messages.querySelectorAll('[data-credential-choice]')) {
    item.addEventListener('click', async () => {
      await sendCredentialChoice(item.getAttribute('data-credential-choice'));
    });
  }

  for (const item of els.messages.querySelectorAll('[data-open-settings-tab]')) {
    item.addEventListener('click', () => {
      activateAppSection('settings');
      activateSectionTab(item.getAttribute('data-open-settings-tab'));
    });
  }

  bindSkillApprovalActions(els.messages);
}

function isMessagesNearBottom(threshold = 96) {
  if (!els.messages) return true;
  return els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight <= threshold;
}

function scrollMessagesToBottom(options = {}) {
  if (!els.messages) return;
  state.followLatestMessages = true;
  const top = els.messages.scrollHeight;
  els.messages.scrollTo({
    top,
    behavior: options.immediate ? 'auto' : 'auto'
  });
  els.messages.scrollTop = els.messages.scrollHeight;
  if (options.updateButton !== false) {
    requestAnimationFrame(() => {
      els.messages.scrollTop = els.messages.scrollHeight;
      updateScrollLatestButton();
    });
    setTimeout(() => {
      els.messages.scrollTop = els.messages.scrollHeight;
      updateScrollLatestButton();
    }, 80);
  }
}

function updateScrollLatestButton() {
  if (!els.scrollLatest || !els.messages) return;
  const canScroll = els.messages.scrollHeight > els.messages.clientHeight + 8;
  els.scrollLatest.hidden = !canScroll || isMessagesNearBottom(140);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function refreshWorkspace(path = state.workspacePath) {
  if (!state.activeRoomId) {
    state.workspace = null;
    state.workspaceFiles = [];
    state.workspacePath = '';
    state.activeFilePath = '';
    resetPreview();
    renderWorkspace();
    return;
  }
  const result = await api(`/api/rooms/${state.activeRoomId}/workspace`);
  state.workspace = result.workspace;
  await refreshWorkspaceFiles(path, false);
}

async function refreshWorkspaceFiles(path = state.workspacePath, shouldRender = true) {
  if (!state.activeRoomId) return;
  const normalized = normalizeUiPath(path);
  const result = await api(`/api/rooms/${state.activeRoomId}/files?path=${encodeURIComponent(normalized)}`);
  state.workspace = result.workspace ?? state.workspace;
  state.workspacePath = normalized;
  state.workspaceFiles = result.files ?? [];
  if (shouldRender) renderWorkspace();
}

async function refreshSkillInvocations() {
  if (!state.activeRoomId) {
    state.skillInvocations = [];
    return;
  }
  state.skillInvocations = await api(`/api/rooms/${state.activeRoomId}/skill-invocations?limit=50`);
}

async function refreshSkillApprovals() {
  if (!state.activeRoomId) {
    state.skillApprovals = [];
    return;
  }
  state.skillApprovals = await api(`/api/rooms/${state.activeRoomId}/skill-approvals?limit=50`);
}

async function refreshArtifacts() {
  if (!state.activeRoomId) {
    state.artifacts = [];
    return;
  }
  state.artifacts = await api(`/api/rooms/${state.activeRoomId}/artifacts?limit=50`);
}

function renderWorkspace() {
  els.workspaceMeta.textContent = state.workspace
    ? `${state.workspace.name} · ${state.workspacePath || '/'}`
    : 'No room selected';
  els.workspaceExport.href = state.activeRoomId ? `/api/rooms/${state.activeRoomId}/export.zip` : '#';
  els.workspacePath.value = state.workspacePath;
  els.workspaceEditor.elements.path.value = state.activeFilePath;
  els.previewPath.value = state.previewPath;
  els.previewMeta.textContent = state.previewPath ? state.previewPath : 'No preview selected';
  els.previewOpen.disabled = !state.previewUrl;
  if (els.previewFrame.getAttribute('src') !== state.previewUrl) {
    els.previewFrame.src = state.previewUrl || 'about:blank';
  }

  els.workspaceFiles.innerHTML = [
    state.workspacePath
      ? `<button type="button" style="background: rgba(15, 123, 108, 0.08)" class="workspace-file" data-workspace-dir="${escapeHtml(dirname(state.workspacePath))}"><strong>..</strong><span>Parent</span><small></small></button>`
      : '',
    ...state.workspaceFiles.map((file) => `
      <button style="background: ${file.path === state.activeFilePath ? 'rgba(15, 123, 108, 0.08)' : 'transparent'};" type="button" class="workspace-file ${file.path === state.activeFilePath ? 'active' : ''}" ${file.type === 'directory' ? `data-workspace-dir="${escapeHtml(file.path)}"` : `data-workspace-file="${escapeHtml(file.path)}"`}>
        <strong>${file.type === 'directory' ? 'Dir' : 'File'}</strong>
        <span>${escapeHtml(file.name)}</span>
        <small>${file.type === 'file' ? fileActionLabel(file) : ''}</small>
      </button>
    `)
  ].join('');

  for (const item of els.workspaceFiles.querySelectorAll('[data-workspace-dir]')) {
    item.addEventListener('click', async () => {
      await refreshWorkspaceFiles(item.getAttribute('data-workspace-dir'));
    });
  }

  for (const item of els.workspaceFiles.querySelectorAll('[data-workspace-file]')) {
    item.addEventListener('click', async () => {
      await readWorkspaceFile(item.getAttribute('data-workspace-file'));
    });
  }
}

function renderSkillInvocations() {
  if (!els.skillInvocationCount || !els.skillInvocationList) return;
  const pendingApprovals = state.skillApprovals.filter((approval) => approval.status === 'pending');
  els.skillInvocationCount.textContent = String(state.skillInvocations.length + pendingApprovals.length);
  const approvalHtml = pendingApprovals.length > 0
    ? pendingApprovals
      .slice()
      .reverse()
      .map((approval) => renderSkillApprovalItem(approval, 'entity-item active'))
      .join('')
    : '';
  const invocationHtml = state.skillInvocations.length > 0
    ? state.skillInvocations
      .slice()
      .reverse()
      .map((invocation) => {
        const activity = formatInspectorActivity(invocation);
        const status = invocation.status ?? 'queued';
        return `
          <div class="entity-item ${status === 'done' ? 'active' : ''}">
            <div class="entity-main">
              <strong>${escapeHtml(activity.title)}</strong>
              <span>${escapeHtml(activity.meta)}</span>
              <span>${escapeHtml(activity.detail)}</span>
              ${invocation.error ? `<span>${escapeHtml(invocation.error)}</span>` : ''}
            </div>
          </div>
        `;
      })
      .join('')
    : '';
  els.skillInvocationList.innerHTML = approvalHtml || invocationHtml
    ? `${approvalHtml}${invocationHtml}`
    : '<div class="muted-empty">No skill activity yet.</div>';
  bindSkillApprovalActions(els.skillInvocationList);
}

function renderSkillApprovalItem(approval, className = 'entity-item active') {
  const summary = formatApprovalActivity(approval);
  return `
    <div class="${className}">
      <div class="entity-main">
        <strong>${escapeHtml(summary.title)}</strong>
        <span>${escapeHtml(summary.meta)}</span>
        <span>${escapeHtml(summary.detail)}</span>
        ${summary.extra ? `<span>${escapeHtml(summary.extra)}</span>` : ''}
      </div>
      ${approval.status === 'pending' ? `
        <div class="approval-actions">
          <button type="button" data-skill-approval-action="approve" data-skill-approval-id="${escapeHtml(approval.id)}">Approve once</button>
          <button type="button" data-skill-approval-action="approve-room" data-skill-approval-id="${escapeHtml(approval.id)}">Trust in this chat</button>
          <button type="button" class="danger-button" data-skill-approval-action="reject" data-skill-approval-id="${escapeHtml(approval.id)}">Reject</button>
        </div>
      ` : ''}
    </div>
  `;
}

function bindSkillApprovalActions(root) {
  if (!root) return;
  for (const item of root.querySelectorAll('[data-skill-approval-action]')) {
    item.addEventListener('click', async () => {
      await decideSkillApproval(
        item.getAttribute('data-skill-approval-id'),
        item.getAttribute('data-skill-approval-action')
      );
    });
  }
}

async function decideSkillApproval(approvalId, action) {
  if (!approvalId || !['approve', 'approve-room', 'reject'].includes(action)) return;
  const endpointAction = action === 'approve-room' ? 'approve' : action;
  const result = await api(`/api/skill-approvals/${encodeURIComponent(approvalId)}/${endpointAction}`, {
    method: 'POST',
    body: action === 'approve-room' ? { trustScope: 'room' } : undefined
  });
  if (result.approval) replaceByIdOrPush(state.skillApprovals, result.approval);
  if (result.invocation) replaceByIdOrPush(state.skillInvocations, result.invocation);
  if (result.path && action === 'approve') {
    if (state.activeFilePath === result.path) openWorkspaceFile('', '');
    await refreshWorkspaceFiles(dirname(result.path), false);
  }
  await refreshSkillApprovals();
  await refreshSkillInvocations();
  await loadLatestMessages();
  renderWorkspace();
  renderSkillInvocations();
  renderRoomInspector();
  renderMessages();
}

function renderArtifacts() {
  if (!els.artifactCount || !els.artifactList) return;
  els.artifactCount.textContent = String(state.artifacts.length);
  els.artifactList.innerHTML = state.artifacts.length > 0
    ? renderArtifactGroups(state.artifacts)
    : '<div class="muted-empty">No artifacts yet.</div>';

  for (const item of els.artifactList.querySelectorAll('[data-open-artifact-file]')) {
    item.addEventListener('click', async () => {
      await readWorkspaceFile(item.getAttribute('data-open-artifact-file'));
    });
  }

  for (const item of els.artifactList.querySelectorAll('[data-preview-artifact-file]')) {
    item.addEventListener('click', () => {
      openPreviewPage(item.getAttribute('data-preview-artifact-file'));
    });
  }

  for (const item of els.artifactList.querySelectorAll('[data-open-project-artifacts]')) {
    item.addEventListener('click', async () => {
      await openProjectFilesFromArtifacts(item.getAttribute('data-open-project-artifacts'));
    });
  }
}

async function openProjectFilesFromArtifacts(rootPath) {
  if (!rootPath) return;
  await refreshWorkspaceFiles(rootPath);
  state.roomInspectorTab = 'files';
  renderRoomInspector();
  activateAppSection('resources');
  activateWorkTab('files');
}

function renderArtifactGroups(artifacts, options = {}) {
  const groups = groupArtifactsByProject(artifacts);
  return groups.map((group) => renderArtifactGroup(group, options)).join('');
}

function renderArtifactGroup(group, options = {}) {
  const latestDelivery = group.deliveries[0];
  const history = group.deliveries.slice(1);
  const recentFiles = group.files.slice(0, 6);
  const title = group.project?.name ?? 'Unassigned Artifacts';
  const root = group.project?.rootPath ?? 'No project root';
  const shellClass = options.inspector ? 'inspector-item artifact-group-card' : 'entity-item active artifact-group-card';
  return `
    <section class="${shellClass}">
      <div class="artifact-group-header">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(root)} · ${escapeHtml(String(group.artifacts.length))} artifacts</span>
        </div>
        <div class="inspector-actions entity-actions">
          ${group.project ? `<button type="button" data-open-project-artifacts="${escapeHtml(group.project.rootPath)}">Files</button>` : ''}
          ${group.project ? `<a class="button-link package-link" href="${escapeHtml(projectDownloadUrl(group.project.id))}" download>Project Zip</a>` : ''}
        </div>
      </div>
      ${latestDelivery ? renderLatestDeliveryBlock(latestDelivery, group.project, options) : ''}
      ${recentFiles.length > 0 ? `
        <div class="artifact-group-list">
          ${recentFiles.map((artifact) => renderGroupedArtifactRow(artifact, { inspector: options.inspector })).join('')}
        </div>
      ` : '<div class="muted-empty">No file artifacts yet.</div>'}
      ${history.length > 0 ? `
        <details class="artifact-history">
          <summary>${escapeHtml(String(history.length))} older deliver${history.length === 1 ? 'y' : 'ies'}</summary>
          <div class="artifact-group-list">
            ${history.map((artifact) => renderGroupedArtifactRow(artifact, { delivery: true, inspector: options.inspector })).join('')}
          </div>
        </details>
      ` : ''}
    </section>
  `;
}

function renderLatestDeliveryBlock(artifact, project, options = {}) {
  return `
    <div class="latest-delivery-card">
      <div>
        <strong><span class="latest-badge">Latest</span> ${escapeHtml(artifact.title ?? 'Project delivery')}</strong>
        <span>${escapeHtml(formatArtifactTime(artifact))}</span>
        <span>${escapeHtml(artifact.path ?? 'No path')}</span>
      </div>
      <div class="inspector-actions entity-actions">
        ${artifact.path ? `<button type="button" ${options.inspector ? `data-open-artifact="${escapeHtml(artifact.path)}"` : `data-open-artifact-file="${escapeHtml(artifact.path)}"`}>Open</button>` : ''}
        ${artifact.path ? `<a class="button-link" href="${escapeHtml(fileDownloadUrl(artifact.path))}" download>Download</a>` : ''}
      </div>
    </div>
  `;
}

function renderGroupedArtifactRow(artifact, options = {}) {
  const previewable = artifact.path && isPreviewablePath(artifact.path);
  const label = options.delivery ? `Delivery · ${formatArtifactTime(artifact)}` : `${artifact.kind} · ${formatArtifactTime(artifact)}`;
  return `
    <div class="artifact-group-row">
      <div>
        <strong>${escapeHtml(artifact.title ?? artifact.path ?? artifact.kind)}</strong>
        <span>${escapeHtml(label)}${artifact.mimeType ? ` · ${escapeHtml(artifact.mimeType)}` : ''}</span>
        <span>${escapeHtml(artifact.path ?? 'No path')}</span>
      </div>
      <div class="inspector-actions entity-actions">
        ${artifact.path ? `<button type="button" ${options.inspector ? `data-open-artifact="${escapeHtml(artifact.path)}"` : `data-open-artifact-file="${escapeHtml(artifact.path)}"`}>Open</button>` : ''}
        ${previewable ? `<button type="button" data-preview-artifact-file="${escapeHtml(artifact.path)}" data-inspector-preview="${escapeHtml(artifact.path)}">Page</button>` : ''}
        ${artifact.path ? `<a class="button-link" href="${escapeHtml(fileDownloadUrl(artifact.path))}" download>Download</a>` : ''}
      </div>
    </div>
  `;
}

function groupArtifactsByProject(artifacts) {
  const groups = new Map();
  for (const artifact of artifacts.slice().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))) {
    const project = projectForArtifact(artifact);
    const key = project?.id ?? 'unassigned';
    if (!groups.has(key)) {
      groups.set(key, {
        project,
        artifacts: [],
        deliveries: [],
        files: []
      });
    }
    const group = groups.get(key);
    group.artifacts.push(artifact);
    if (artifact.kind === 'project.delivery') group.deliveries.push(artifact);
    else group.files.push(artifact);
  }
  return Array.from(groups.values());
}

function formatArtifactTime(artifact) {
  if (!artifact?.createdAt) return 'No timestamp';
  return new Date(artifact.createdAt).toLocaleString();
}

async function readWorkspaceFile(path) {
  if (!state.activeRoomId || !path) return;
  const result = await api(`/api/rooms/${state.activeRoomId}/files/read?path=${encodeURIComponent(path)}`);
  openWorkspaceFile(path, result.content ?? '');
}

async function openInspectorFile(path) {
  if (!state.activeRoomId || !path) return;
  const result = await api(`/api/rooms/${state.activeRoomId}/files/read?path=${encodeURIComponent(path)}`);
  state.inspectorFile = {
    path,
    content: result.content ?? ''
  };
  state.activeFilePath = path;
  if (isPreviewablePath(path)) {
    setPreviewPath(path, false);
  }
}

function openWorkspaceFile(path, content) {
  state.activeFilePath = path;
  els.workspaceEditor.elements.path.value = path;
  els.workspaceEditor.elements.content.value = content;
  if (isPreviewablePath(path)) {
    setPreviewPath(path, false);
  }
  renderWorkspace();
}

function setPreviewPath(path, shouldRender = true) {
  const normalized = normalizeUiPath(path);
  state.previewPath = normalized;
  state.previewUrl = previewUrlForPath(normalized);
  if (shouldRender) renderWorkspace();
}

function previewUrlForPath(path, includeCacheBust = true) {
  const normalized = normalizeUiPath(path);
  if (!state.activeRoomId || !normalized) return '';
  const url = `/api/rooms/${encodeURIComponent(state.activeRoomId)}/preview/${encodeWorkspacePath(normalized)}`;
  return includeCacheBust ? `${url}?t=${Date.now()}` : url;
}

function openPreviewPage(path) {
  const url = previewUrlForPath(path || state.previewPath, false);
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function fileDownloadUrl(path) {
  if (!state.activeRoomId || !path) return '#';
  return `/api/rooms/${encodeURIComponent(state.activeRoomId)}/files/download?path=${encodeURIComponent(normalizeUiPath(path))}`;
}

function projectDownloadUrl(projectId) {
  return projectId ? `/api/projects/${encodeURIComponent(projectId)}/export.zip` : '#';
}

function projectPackageDownloadLink(artifact) {
  const project = projectForArtifact(artifact);
  if (!project) return '';
  return `<a class="button-link package-link" href="${escapeHtml(projectDownloadUrl(project.id))}" download>Project Zip</a>`;
}

function projectForArtifact(artifact) {
  const metadataProjectId = artifact?.metadata?.projectId;
  if (metadataProjectId) {
    const project = state.projects.find((item) => item.id === metadataProjectId);
    if (project) return project;
  }
  const metadataSlug = artifact?.metadata?.projectSlug;
  if (metadataSlug) {
    const project = state.projects.find((item) => item.slug === metadataSlug);
    if (project) return project;
  }
  const artifactPath = normalizeUiPath(artifact?.path);
  if (!artifactPath) return null;
  return state.projects
    .slice()
    .sort((a, b) => String(b.rootPath ?? '').length - String(a.rootPath ?? '').length)
    .find((project) => pathBelongsToUiRoot(artifactPath, project.rootPath)) ?? null;
}

function pathBelongsToUiRoot(candidatePath, rootPath) {
  const candidate = normalizeUiPath(candidatePath);
  const root = normalizeUiPath(rootPath).replace(/\/$/, '');
  return Boolean(root) && (candidate === root || candidate.startsWith(`${root}/`));
}

function resetPreview() {
  state.previewPath = '';
  state.previewUrl = '';
  if (els.previewFrame) els.previewFrame.src = 'about:blank';
}

function isPreviewablePath(path) {
  return /\.(html?|svg|txt|md|json)$/i.test(String(path ?? ''));
}

function fileActionLabel(file) {
  return isPreviewablePath(file.path) ? 'Preview' : formatBytes(file.size);
}

function encodeWorkspacePath(path) {
  return String(path ?? '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function streamReply(agentId) {
  if (!agentId) {
    alert('Attach or create an Agent for this room first.');
    return;
  }

  const result = await api(`/api/rooms/${state.activeRoomId}/agent-runs`, {
    method: 'POST',
    body: {
      agentId,
      maxTurns: MAX_AGENT_TURNS
    }
  });
  state.activeRunIds.add(result.run.id);
  upsertRun(result.run);
  upsertMessage(result.message);
  renderMessages();
  ensureMessagePolling();
  return result.message;
}

async function streamReplies(agentIds) {
  const queue = agentIds
    .map((target) => typeof target === 'string'
      ? state.agents.find((item) => item.id === target)
      : target)
    .filter(Boolean);
  for (const [index, target] of queue.entries()) {
    if (state.stopRequested) break;
    setResponseState(true, `${target.name ?? 'Agent'} is responding... (${index + 1}/${queue.length})`);
    await streamReply(target.id);
  }
  ensureMessagePolling();
}

async function resolveAgentMentions(message, sourceAgentId) {
  if (!message?.content || message.senderType !== 'agent') return [];
  try {
    const result = await api(`/api/rooms/${state.activeRoomId}/mentions`, {
      method: 'POST',
      body: {
        content: message.content,
        excludeAgentId: sourceAgentId
      }
    });
    return result.targets ?? [];
  } catch (error) {
    console.warn('Agent mention resolution failed.', error);
    return [];
  }
}

async function refreshRoomAgents() {
  if (!state.activeRoomId) {
    state.roomAgents = [];
    return;
  }
  const agents = await api(`/api/rooms/${state.activeRoomId}/agents`);
  const otherRooms = state.roomAgents.filter((item) => item.roomId !== state.activeRoomId);
  const joins = agents.map((agent) => ({
    roomId: state.activeRoomId,
    agentId: agent.id,
    enabled: true,
    triggerMode: agent.roomAgent?.triggerMode ?? 'manual'
  }));
  state.roomAgents = [...otherRooms, ...joins];
}

function isAgentInActiveRoom(agentId) {
  return state.roomAgents.some((item) => item.roomId === state.activeRoomId && item.agentId === agentId && item.enabled !== false);
}

function renderMentionBar(activeAgents) {
  if (!els.mentionBar) return;
  const room = state.rooms.find((c) => c.id === state.activeRoomId);
  if (room?.type === 'dm') {
    els.mentionBar.innerHTML = '';
    els.mentionBar.hidden = true;
    return;
  }
  els.mentionBar.hidden = false;
  els.mentionBar.innerHTML = [
    { id: 'user', name: 'user' },
    activeAgents.length > 1 ? { id: 'all', name: 'all' } : null,
    ...activeAgents
  ]
    .filter(Boolean)
    .map((agent) => `<button type="button" data-mention="${escapeHtml(agent.name)}">@${escapeHtml(agent.name)}</button>`)
    .join('');
  for (const item of els.mentionBar.querySelectorAll('[data-mention]')) {
    item.addEventListener('click', () => {
      insertTextMention(item.getAttribute('data-mention'));
    });
  }
}

function resolveComposerMentions(content) {
  const mentions = [];
  const activeAgents = state.agents.filter((agent) => isAgentInActiveRoom(agent.id));
  if (mentionContentMatchesName(content, 'all') && !mentions.some((mention) => mention.id === 'all')) {
    mentions.push({ id: 'all', name: 'all' });
  }
  for (const agent of activeAgents) {
    if (
      mentionContentMatchesName(content, agent.name)
      && !mentions.some((mention) => mention.id === agent.id)
    ) {
      mentions.push({ id: agent.id, name: agent.name });
    }
  }
  return mentions;
}

function mentionContentMatchesName(content, name) {
  const escaped = escapeRegExp(String(name ?? '').trim()).replace(/\s+/g, '\\s+');
  if (!escaped) return false;
  return new RegExp(`(^|\\s)@${escaped}(?=$|[\\s，。！？、,.!?:;；：）)\\]}])`, 'i')
    .test(String(content ?? ''));
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function insertTextMention(name) {
  const textarea = els.messageForm.elements.content;
  const mention = `@${name} `;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const prefix = textarea.value.slice(0, start);
  const suffix = textarea.value.slice(end);
  const needsSpace = prefix.length > 0 && !/\s$/.test(prefix);
  const inserted = `${needsSpace ? ' ' : ''}${mention}`;
  textarea.value = `${prefix}${inserted}${suffix}`;
  const cursor = prefix.length + inserted.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
}

function setReplyTarget(message) {
  state.replyToMessage = {
    id: message.id,
    senderName: message.senderName,
    content: String(message.content ?? '').slice(0, 180)
  };
  const room = state.rooms.find((item) => item.id === state.activeRoomId);
  if (room?.type !== 'dm' && message.senderType === 'agent' && !messageMentionsAgent(els.messageForm.elements.content.value, message.senderName)) {
    prependMention(message.senderName);
  }
  renderReplyPreview();
  els.messageForm.elements.content.focus();
}

function prependMention(name) {
  insertTextMention(name);
  const textarea = els.messageForm.elements.content;
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function messageMentionsAgent(content, name) {
  return mentionContentMatchesName(content, name);
}

function normalizeMentionToken(value) {
  return String(value ?? '')
    .trim()
    .replace(/[，。！？、,.!?:;；：）)\]}]+$/g, '')
    .toLowerCase();
}

function clearReplyTarget() {
  state.replyToMessage = null;
  renderReplyPreview();
}

function renderReplyPreview() {
  if (!state.replyToMessage) {
    els.replyPreview.hidden = true;
    els.replyPreview.innerHTML = '';
    return;
  }

  els.replyPreview.hidden = false;
  els.replyPreview.innerHTML = `
    <div>
      <strong>Replying to ${escapeHtml(state.replyToMessage.senderName)}</strong>
      <span>${escapeHtml(state.replyToMessage.content)}</span>
    </div>
    <button type="button" data-clear-reply>Cancel</button>
  `;
  els.replyPreview.querySelector('[data-clear-reply]').addEventListener('click', clearReplyTarget);
}

function replaceById(collection, item) {
  const index = collection.findIndex((entry) => entry.id === item.id);
  if (index >= 0) collection[index] = item;
}

function replaceByIdOrPush(collection, item) {
  const index = collection.findIndex((entry) => entry.id === item.id);
  if (index >= 0) collection[index] = item;
  else collection.push(item);
}

function filterTemplates(templates, query, category) {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  const normalizedCategory = String(category ?? 'all');
  return templates.filter((template) => {
    if (normalizedCategory !== 'all' && template.category !== normalizedCategory) return false;
    if (!normalizedQuery) return true;
    return [
      template.name,
      template.category,
      template.description,
      template.roomDescription,
      ...(template.agents ?? []).map((agent) => `${agent.name} ${agent.description ?? ''}`),
      ...(template.suggestedSkillIds ?? [])
    ].join(' ').toLowerCase().includes(normalizedQuery);
  });
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function syncSelectOptions(select, values, selectedValue, labelForValue = (value) => value) {
  if (!select) return;
  const currentValue = values.includes(selectedValue) ? selectedValue : values[0];
  select.innerHTML = values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(labelForValue(value))}</option>`)
    .join('');
  select.value = currentValue;
}

function titleCase(value) {
  return String(value ?? '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function mergeProjectTasks(existing, incoming) {
  const byId = new Map(existing.map((task) => [task.id, task]));
  for (const task of incoming) byId.set(task.id, task);
  return Array.from(byId.values()).sort(compareMessagesAsc);
}

function projectTaskDependencyLabel(task) {
  const ids = projectTaskDependencyIds(task);
  if (ids.length === 0) return 'starts first';
  const names = ids.map((id) => {
    const dependency = state.projectTasks.find((item) => item.id === id);
    return dependency ? `${dependency.phase}:${dependency.status}` : 'unknown';
  });
  return `after ${names.join(', ')}`;
}

function projectTaskDependencyIds(task) {
  const ids = [];
  if (Array.isArray(task?.dependsOnTaskIds)) ids.push(...task.dependsOnTaskIds);
  if (task?.dependsOnTaskId) ids.push(task.dependsOnTaskId);
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function scheduledTaskDependencyIds(task) {
  const ids = [];
  if (Array.isArray(task?.dependsOnTaskIds)) ids.push(...task.dependsOnTaskIds);
  if (task?.dependsOnTaskId) ids.push(task.dependsOnTaskId);
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function scheduledTaskDependencyLabel(task) {
  const ids = scheduledTaskDependencyIds(task);
  if (ids.length === 0) return '';
  const labels = ids.map((id) => {
    const dependency = state.tasks.find((item) => item.id === id);
    if (!dependency) return `missing:${id.slice(0, 8)}`;
    return `${dependency.title}:${dependency.status}`;
  });
  return `after ${labels.join(', ')}`;
}

function taskTitleById(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  return task?.title ?? taskId;
}

function buildAgentWorkGroups() {
  const activeAgents = state.agents.filter((agent) => isAgentInActiveRoom(agent.id));
  const agentMap = new Map(activeAgents.map((agent) => [agent.id, {
    key: agent.id,
    name: agent.name,
    agent,
    items: []
  }]));
  const unassigned = {
    key: 'unassigned',
    name: 'Unassigned',
    agent: null,
    items: []
  };

  for (const run of state.agentRuns.filter(isVisibleAgentRun)) {
    const agent = state.agents.find((item) => item.id === run.agentId);
    const group = ensureAgentWorkGroup(agentMap, unassigned, agent, run.agentId);
    group.items.push(agentRunWorkItem(run));
  }

  for (const task of state.tasks.filter(isVisibleScheduledWorkTask)) {
    const agent = state.agents.find((item) => item.id === task.agentId);
    const group = ensureAgentWorkGroup(agentMap, unassigned, agent, task.agentId);
    group.items.push(scheduledTaskWorkItem(task));
  }

  for (const task of state.projectTasks.filter(isVisibleWorkTask)) {
    const project = state.projects.find((item) => item.id === task.projectId);
    const agent = state.agents.find((item) => item.id === task.agentId);
    const group = ensureAgentWorkGroup(agentMap, unassigned, agent, task.agentId);
    group.items.push(projectTaskWorkItem(task, project));
  }

  const groups = [...agentMap.values()];
  if (unassigned.items.length > 0) groups.push(unassigned);
  return groups
    .map((group) => ({
      ...group,
      items: dedupeAgentWorkItems(group.items)
        .sort((a, b) => agentWorkItemRank(a) - agentWorkItemRank(b) || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
      counts: agentWorkCounts(group.items),
      status: agentWorkStatus(group.items),
      summary: agentWorkSummary(group.items)
    }))
    .sort((a, b) => agentWorkRank(a.status) - agentWorkRank(b.status) || String(a.name).localeCompare(String(b.name)));
}

function ensureAgentWorkGroup(agentMap, unassigned, agent, agentId) {
  if (!agentId) return unassigned;
  if (agentMap.has(agentId)) return agentMap.get(agentId);
  const group = {
    key: agentId,
    name: agent?.name ?? agentId,
    agent,
    items: []
  };
  agentMap.set(agentId, group);
  return group;
}

function isVisibleAgentRun(run) {
  return ['queued', 'running', 'failed'].includes(run.status);
}

function isVisibleScheduledWorkTask(task) {
  return ['scheduled', 'running', 'failed', 'cancelled', 'approved', 'changes_requested', 'interrupted', 'superseded'].includes(task.status);
}

function agentRunWorkItem(run) {
  const message = state.messages.find((item) => item.runId === run.id);
  return {
    kind: 'run',
    kindLabel: 'Agent response',
    id: run.id,
    runId: run.id,
    status: run.status ?? 'unknown',
    title: message?.replyTo ? `Replying to ${message.replyTo.senderName}` : (message?.content ? summarizeInline(message.content, 90) : 'Conversation response'),
    meta: `${run.model ?? 'model'} · ${formatInvocationTime(run) || 'queued'}`,
    createdAt: run.createdAt ?? run.startedAt
  };
}

function scheduledTaskWorkItem(task) {
  return {
    kind: 'scheduled',
    kindLabel: 'Scheduled task',
    id: task.id,
    runId: task.runId,
    status: task.status ?? 'unknown',
    title: task.title,
    meta: [
      formatTaskTime(task),
      scheduledTaskDependencyLabel(task),
      task.repeatInterval ? `repeat ${task.repeatInterval}` : ''
    ].filter(Boolean).join(' · '),
    createdAt: task.createdAt ?? task.scheduleAt
  };
}

function projectTaskWorkItem(task, project) {
  const readiness = projectTaskReadiness(task);
  return {
    kind: 'project',
    kindLabel: task.phase ?? 'Project task',
    id: task.id,
    runId: task.runId,
    status: task.status === 'queued' ? readiness : (task.status ?? 'unknown'),
    title: task.title,
    meta: `${project?.name ?? 'Project'} · ${projectTaskDependencyLabel(task)}`,
    createdAt: task.createdAt ?? task.startedAt
  };
}

function dedupeAgentWorkItems(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = item.runId ? `run:${item.runId}` : `${item.kind}:${item.id}`;
    const existing = byKey.get(key);
    if (!existing || agentWorkItemRank(item) < agentWorkItemRank(existing)) byKey.set(key, item);
  }
  return Array.from(byKey.values());
}

function buildInspectorAgentWorkRows(activeAgents, workGroups) {
  return activeAgents.map((agent) => {
    const provider = state.providers.find((item) => item.id === agent.providerId);
    const group = workGroups.find((item) => item.agent?.id === agent.id);
    const runs = state.agentRuns
      .filter((run) => run.agentId === agent.id)
      .sort((a, b) => compareMessagesAsc(b, a));
    const liveRun = runs.find((run) => ['queued', 'running'].includes(run.status));
    const latestRun = liveRun ?? runs[0] ?? null;
    const workItem = group?.items.find((item) => item.status === 'running')
      ?? group?.items.find((item) => item.status === 'ready')
      ?? group?.items[0]
      ?? null;
    const status = liveRun
      ? liveRun.status === 'queued' ? 'waiting' : 'running'
      : group?.status ?? agent.status ?? 'idle';
    const summary = liveRun
      ? `${liveRun.status === 'queued' ? 'Queued response' : 'Active response'} · ${latestRun?.id ?? 'run'}`
      : group?.summary ?? 'No active work';
    return {
      agent,
      provider,
      runs: latestRun ? [latestRun] : [],
      workItem,
      status,
      summary
    };
  }).sort((a, b) => agentWorkRank(a.status) - agentWorkRank(b.status) || String(a.agent.name).localeCompare(String(b.agent.name)));
}

function buildInspectorTaskRows() {
  const scheduled = state.tasks.map((task) => {
    const agent = state.agents.find((item) => item.id === task.agentId);
    return {
      kind: 'scheduled',
      id: task.id,
      title: task.title,
      status: task.status,
      runId: task.runId,
      meta: `Scheduled · ${agent?.name ?? 'Unknown Agent'} · ${formatTaskTime(task)}${task.repeatInterval ? ` · repeat ${task.repeatInterval}` : ''}`,
      detail: task.instructions || task.error || 'No instructions'
    };
  });

  const projectRows = state.projectTasks.map((task) => {
    const agent = state.agents.find((item) => item.id === task.agentId);
    const project = state.projects.find((item) => item.id === task.projectId);
    return {
      kind: 'project',
      id: task.id,
      title: task.title,
      status: task.status,
      runId: task.runId,
      meta: `${project?.name ?? 'Project'} · ${agent?.name ?? task.roleId ?? 'Unknown Agent'}`,
      detail: `${task.phase ?? 'phase'} · ${projectTaskDependencyLabel(task)}`
    };
  });

  return [...scheduled, ...projectRows].sort((a, b) => inspectorTaskRank(a.status) - inspectorTaskRank(b.status));
}

function inspectorTaskRank(status) {
  return {
    running: 0,
    queued: 1,
    scheduled: 2,
    blocked: 3,
    failed: 4,
    cancelled: 5,
    changes_requested: 5,
    interrupted: 5,
    superseded: 5,
    approved: 6,
    done: 6
  }[status] ?? 7;
}

function isVisibleWorkTask(task) {
  return ['running', 'queued', 'blocked', 'failed'].includes(task.status);
}

function projectTaskReadiness(task) {
  if (task.status === 'queued') {
    return projectTaskWaitingDependencyIds(task).length > 0 ? 'waiting dependencies' : 'ready';
  }
  return task.status ?? 'unknown';
}

function projectTaskWaitingDependencyIds(task) {
  const doneIds = new Set(state.projectTasks.filter((item) => item.status === 'done').map((item) => item.id));
  return projectTaskDependencyIds(task).filter((id) => !doneIds.has(id));
}

function agentWorkCounts(items) {
  return items.reduce((counts, item) => {
    if (item.status === 'running') counts.running += 1;
    else if (item.status === 'failed') counts.failed += 1;
    else if (item.status === 'ready' || item.status === 'scheduled') counts.ready += 1;
    else if (item.status === 'queued' || item.status === 'blocked' || item.status === 'waiting dependencies') counts.waiting += 1;
    return counts;
  }, { running: 0, ready: 0, waiting: 0, failed: 0 });
}

function agentWorkStatus(items) {
  const counts = agentWorkCounts(items);
  if (counts.running > 0) return 'running';
  if (counts.failed > 0) return 'failed';
  if (counts.ready > 0) return 'ready';
  if (counts.waiting > 0) return 'waiting';
  return 'idle';
}

function agentWorkSummary(items) {
  if (items.length === 0) return 'No active work';
  const labels = [...new Set(items.map((item) => item.kindLabel))].slice(0, 3);
  return `${items.length} work item${items.length === 1 ? '' : 's'} · ${labels.join(', ')}`;
}

function agentWorkRank(status) {
  return {
    running: 0,
    failed: 1,
    ready: 2,
    waiting: 3,
    idle: 4
  }[status] ?? 5;
}

function agentWorkItemRank(item) {
  return {
    running: 0,
    failed: 1,
    ready: 2,
    scheduled: 3,
    queued: 4,
    'waiting dependencies': 5,
    blocked: 6,
    cancelled: 7
  }[item.status] ?? 8;
}

async function updateSkillState(skillId, action) {
  if (!skillId) return;
  try {
    const saved = await api(`/api/skills/${encodeURIComponent(skillId)}/${action}`, { method: 'POST' });
    replaceByIdOrPush(state.skills, saved);
    renderAll();
  } catch (error) {
    alert(`Skill ${action} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function enabledSkills() {
  return state.skills.filter((skill) => skill.enabled !== false);
}

function previewSkillManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) errors.push('Manifest must be an object.');
  if (!String(manifest?.id ?? '').trim()) errors.push('id is required.');
  if (!String(manifest?.name ?? '').trim()) errors.push('name is required.');
  const actions = Array.isArray(manifest?.actions) ? manifest.actions : [];
  const credentialTypes = manifest?.credentialTypes && typeof manifest.credentialTypes === 'object' && !Array.isArray(manifest.credentialTypes)
    ? Object.keys(manifest.credentialTypes)
    : [];
  const hosts = [
    ...(manifest?.permissions?.network?.hosts ?? []),
    ...actions.flatMap((action) => action?.permissions?.network?.hosts ?? [])
  ].filter(Boolean);
  const summary = [
    `Runtime: ${manifest?.runtime?.kind ?? 'unknown'}${manifest?.runtime?.adapter ? `:${manifest.runtime.adapter}` : ''}`,
    `Actions: ${actions.length}`,
    `Credential types: ${credentialTypes.length ? credentialTypes.join(', ') : 'none'}`,
    `Network hosts: ${hosts.length ? [...new Set(hosts)].join(', ') : 'none'}`,
    `Risk: ${manifest?.riskLevel ?? 'medium'}${manifest?.requiresApproval ? ' · requires approval' : ''}`
  ];
  return { ok: errors.length === 0, errors, summary };
}

function renderSkillPreview(preview) {
  if (!els.skillPreview) return;
  els.skillPreview.hidden = false;
  els.skillPreview.innerHTML = `
    <strong>${preview.ok ? 'Manifest looks valid' : 'Manifest needs changes'}</strong>
    ${(preview.errors ?? []).map((error) => `<span>${escapeHtml(error)}</span>`).join('')}
    ${(preview.summary ?? []).map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
  `;
}

function skillManifestNeedsInstallConfirmation(manifest) {
  return Boolean(
    manifest?.requiresApproval ||
    manifest?.policy?.network ||
    manifest?.policy?.destructive ||
    manifest?.policy?.externalEffect ||
    manifest?.permissions?.approval ||
    manifest?.permissions?.network ||
    String(manifest?.riskLevel ?? '').toLowerCase() === 'high'
  );
}

function skillManifestForEdit(skill) {
  return {
    id: skill.id,
    name: skill.name,
    version: skill.version ?? '1.0.0',
    category: skill.category ?? 'custom',
    description: skill.description ?? '',
    enabled: skill.enabled !== false,
    runtime: skill.runtime ?? { kind: 'external', adapter: 'manual' },
    inputSchema: skill.inputSchema ?? { type: 'object' },
    outputSchema: skill.outputSchema ?? { type: 'object' },
    credentialTypes: skill.credentialTypes ?? {},
    credentials: skill.credentials ?? [],
    permissions: skill.permissions ?? {},
    actions: skill.actions ?? [],
    policy: skill.policy ?? { workspace: 'none', network: false, destructive: false },
    ui: skill.ui ?? { card: 'skill-result' },
    riskLevel: skill.riskLevel ?? 'medium',
    requiresApproval: Boolean(skill.requiresApproval)
  };
}

function defaultSkillManifest() {
  return {
    id: 'custom.example',
    name: 'Custom Example',
    version: '1.0.0',
    category: 'custom',
    description: 'Describe what this skill lets agents do.',
    enabled: true,
    runtime: {
      kind: 'external',
      adapter: 'manual'
    },
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      properties: {}
    },
    credentialTypes: {},
    credentials: [],
    permissions: {},
    actions: [],
    policy: {
      workspace: 'none',
      network: false,
      destructive: false
    },
    ui: {
      card: 'skill-result'
    },
    riskLevel: 'medium',
    requiresApproval: false
  };
}

async function refreshProviderModels(providerId, selectedModel) {
  const provider = state.providers.find((entry) => entry.id === providerId);
  if (!provider) return;

  renderAgentModelOptions(providerId, selectedModel ?? provider.defaultModel, true);
  try {
    const result = await api(`/api/model-providers/${providerId}/models`);
    if (Array.isArray(result.models) && result.models.length > 0) {
      provider.models = result.models;
      provider.defaultModel = result.models.some((model) => model.id === provider.defaultModel)
        ? provider.defaultModel
        : result.models[0].id;
    }
  } catch (error) {
    console.warn('Provider models refresh failed; using cached models.', error);
  }
}

function renderAgentModelOptions(providerId = els.providerSelect.value, selectedModel) {
  const provider = state.providers.find((entry) => entry.id === providerId);
  const models = normalizeProviderModels(provider);

  els.agentModelSelect.disabled = models.length === 0;
  els.agentModelSelect.innerHTML = models.length > 0
    ? models
      .map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name ?? model.id)}</option>`)
      .join('')
    : '<option value="">No models available</option>';

  const nextModel = selectedModel
    ?? (state.editingAgentId
      ? state.agents.find((agent) => agent.id === state.editingAgentId)?.model
      : provider?.defaultModel);
  if (nextModel && models.some((model) => model.id === nextModel)) {
    els.agentModelSelect.value = nextModel;
  } else if (models[0]) {
    els.agentModelSelect.value = models[0].id;
  }
}

function normalizeProviderModels(provider) {
  if (!provider) return [];
  if (Array.isArray(provider.models) && provider.models.length > 0) {
    return provider.models
      .filter((model) => model?.id)
      .map((model) => ({
        id: String(model.id),
        name: String(model.name ?? model.id)
      }));
  }
  return provider.defaultModel
    ? [{ id: provider.defaultModel, name: provider.defaultModel }]
    : [];
}

function resetRoomForm() {
  state.editingRoomId = null;
  els.roomForm.reset();
  els.roomForm.elements.name.value = 'Product Room';
  els.roomSubmit.textContent = 'Create Room';
  els.roomCancel.hidden = true;
}

function resetProviderForm() {
  state.editingProviderId = null;
  state.providerProbeRequestId += 1;
  els.providerForm.reset();
  els.providerForm.elements.name.value = 'Mock Provider';
  els.providerForm.elements.baseUrl.value = 'mock://provider';
  els.providerForm.elements.apiKey.value = 'mock-key';
  els.providerForm.elements.apiKey.required = true;
  els.providerForm.elements.apiKey.placeholder = '';
  els.providerForm.elements.defaultModel.value = 'mock-agent';
  els.providerSubmit.textContent = 'Save';
  els.providerCancel.hidden = true;
  els.probeButton.disabled = false;
  els.probeButton.textContent = 'Probe';
  els.probeResult.textContent = '';
  els.probeResult.style.display = 'none';
}

function resetRoleForm() {
  state.editingRoleId = null;
  els.roleForm.reset();
  els.roleForm.elements.name.value = '';
  els.roleForm.elements.description.value = '';
  els.roleForm.elements.systemPrompt.value = '';
  renderRoleSkillOptions();
  els.roleSubmit.textContent = 'Create Role';
  els.roleCancel.hidden = true;
}

function resetSkillForm() {
  state.editingSkillId = null;
  els.skillForm.reset();
  els.skillForm.elements.manifest.value = JSON.stringify(defaultSkillManifest(), null, 2);
  els.skillSubmit.textContent = 'Install Skill';
  els.skillCancel.hidden = true;
  if (els.skillPreview) {
    els.skillPreview.hidden = true;
    els.skillPreview.innerHTML = '';
  }
}

function resetAgentForm() {
  state.editingAgentId = null;
  els.agentForm.reset();
  els.agentForm.elements.name.value = 'Launch Agent';
  if (state.roles[0]) els.agentForm.elements.roleId.value = state.roles.find((role) => role.id === 'general')?.id ?? state.roles[0].id;
  if (state.providers[0]) els.agentForm.elements.providerId.value = state.providers[0].id;
  renderAgentModelOptions();
  els.agentSubmit.textContent = 'Create Agent';
  els.agentCancel.hidden = true;
}

function resetTaskForm() {
  if (!els.taskForm) return;
  els.taskForm.reset();
  els.taskForm.elements.title.value = 'Follow up task';
  els.taskForm.elements.scheduleAt.value = defaultTaskScheduleLocal();
  if (els.taskForm.elements.repeatInterval) els.taskForm.elements.repeatInterval.value = '';
  els.taskForm.elements.instructions.value = '';
  renderTaskAgentOptions();
}

function resetProjectForm() {
  if (!els.projectForm) return;
  els.projectForm.reset();
  els.projectForm.elements.name.value = 'New Web Project';
  els.projectForm.elements.type.value = 'static-web';
  els.projectForm.elements.instructions.value = '';
  renderProjectAgentOptions();
}

function updateMessageNode(message) {
  const stickToBottom = state.followLatestMessages;
  const previousTop = els.messages.scrollTop;
  const index = state.messages.findIndex((m) => m.id === message.id);
  if (index >= 0) state.messages[index] = message;
  const wrapper = document.querySelector(`[data-id="${message.id}"]`);
  if (wrapper) {
    wrapper.classList.toggle('pending', isPendingMessage(message));
    wrapper.classList.toggle('mentioned-user', messageMentionsUser(message));
  }
  const node = wrapper?.querySelector('.message-content');
  if (node) node.innerHTML = renderMessageBody(message);
  if (stickToBottom) scrollMessagesToBottom({ immediate: true, updateButton: false });
  else els.messages.scrollTop = previousTop;
  updateScrollLatestButton();
}

function setResponseState(isResponding, label = '') {
  state.isResponding = isResponding;
  els.responseStatus.textContent = label;
  els.responseStatus.classList.toggle('active', isResponding);
  els.stopResponse.hidden = true;
}

async function stopCurrentResponses() {
  if (!state.isResponding) return;
  const runIds = state.messages
    .filter((message) => isPendingMessage(message) && message.runId)
    .map((message) => message.runId);
  await Promise.all(runIds.map((runId) => stopAgentRun(runId)));
}

async function stopAgentRun(runId) {
  if (!runId) return;
  if (state.activeRoomId) {
    try {
      await api(`/api/agent-runs/${encodeURIComponent(runId)}/stop`, { method: 'POST' });
      await loadLatestMessages({ markMentionsSeen: true });
      state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
      renderMessages();
    } catch (error) {
      console.warn('Stop request failed.', error);
    }
  }
  state.activeRunIds.delete(runId);
  if (hasPendingMessages()) {
    setResponseState(true, 'Agent is responding...');
    ensureMessagePolling();
  } else {
    state.activeResponseCount = 0;
    setResponseState(false);
  }
}

async function retryAgentRun(runId) {
  if (!runId || !state.activeRoomId) return;
  try {
    const result = await api(`/api/agent-runs/${encodeURIComponent(runId)}/retry`, { method: 'POST' });
    if (result.message) upsertMessage(result.message);
    if (result.run) upsertRun(result.run);
    renderMessages();
    setResponseState(true, 'Agent is responding...');
    ensureMessagePolling();
  } catch (error) {
    alert(`Retry failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function ensureMessagePolling() {
  if (!state.activeRoomId) return;
  if (!shouldPollActiveRoomMessages()) {
    stopMessagePolling();
    return;
  }
  if (hasPendingWork() || state.activeResponseCount > 0) {
    setResponseState(true, 'Agent is responding...');
  }
  if (state.messagePollTimer) return;
  state.messagePollTimer = setInterval(refreshActiveRoomMessages, ACTIVE_MESSAGE_POLL_MS);
  refreshActiveRoomMessages();
}

function connectEventStream() {
  if (!window.EventSource || state.eventSource) return;
  const source = new EventSource('/api/events');
  state.eventSource = source;
  source.addEventListener('ready', () => {});
  source.addEventListener('heartbeat', () => {});
  [
    'message.created',
    'message.updated',
    'agent_run.created',
    'agent_run.updated',
    'room.created',
    'room.updated',
    'room.deleted',
    'room.members.updated',
    'skill_approval.created',
    'agent.created',
    'agent.updated',
    'agent.deleted',
    'role.created',
    'role.updated',
    'role.deleted'
  ].forEach((type) => {
    source.addEventListener(type, (event) => handlePlatformEvent(type, event));
  });
  source.addEventListener('error', () => {
    if (source.readyState === EventSource.CLOSED && state.eventSource === source) {
      state.eventSource = null;
    }
  });
}

function closeEventStream() {
  if (!state.eventSource) return;
  state.eventSource.close();
  state.eventSource = null;
}

function handlePlatformEvent(type, event) {
  let detail = null;
  try {
    detail = JSON.parse(event.data);
  } catch {
    detail = {};
  }
  const payload = detail?.payload ?? {};
  if (type.startsWith('message.') || type.startsWith('agent_run.') || type.startsWith('skill_approval.')) {
    handleRoomActivityEvent(type, payload);
    return;
  }
  scheduleGlobalEventRefresh(payload);
}

function handleRoomActivityEvent(type, payload = {}) {
  const roomId = payload.roomId;
  if (!roomId) return;
  const activeStatus = payload.status === 'queued' || payload.status === 'running' || payload.pending;
  if (roomId === state.activeRoomId) {
    if (activeStatus || type === 'agent_run.created') {
      markActiveMessagePolling();
      ensureMessagePolling();
    }
    scheduleActiveRoomEventRefresh({ refreshResources: !activeStatus });
    return;
  }
  if (type === 'message.created' || type === 'message.updated') {
    scheduleRoomMentionRefresh(roomId);
  }
}

function scheduleActiveRoomEventRefresh(options = {}) {
  if (!state.activeRoomId) return;
  if (state.eventRefreshTimer) clearTimeout(state.eventRefreshTimer);
  state.eventRefreshTimer = setTimeout(() => {
    state.eventRefreshTimer = null;
    refreshActiveRoomFromEvent(options).catch((error) => {
      console.warn('Event refresh failed.', error);
    });
  }, 120);
}

async function refreshActiveRoomFromEvent(options = {}) {
  if (!state.activeRoomId) return;
  if (state.eventRefreshInFlight || state.messagePollInFlight) {
    scheduleActiveRoomEventRefresh(options);
    return;
  }
  state.eventRefreshInFlight = true;
  try {
    const previousHeight = els.messages.scrollHeight;
    const previousTop = els.messages.scrollTop;
    const stickToBottom = isMessagesNearBottom();
    await loadLatestMessages({ markMentionsSeen: true });
    state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
    pruneInactiveRunIds();
    if (options.refreshResources) {
      await refreshActiveRoomResources();
    }
    renderMessages({ stickToBottom, previousHeight, previousTop });
    renderTasks();
    renderProjects();
    renderAgentWorkCenter();
    renderSkillInvocations();
    renderTrustedApprovals();
    renderArtifacts();
    renderRoomInspector();
    if (hasPendingWork()) {
      setResponseState(true, 'Agent is responding...');
      markActiveMessagePolling();
      ensureMessagePolling();
    } else if (state.activeResponseCount === 0) {
      setResponseState(false);
      stopMessagePolling();
    }
  } finally {
    state.eventRefreshInFlight = false;
  }
}

function scheduleGlobalEventRefresh(payload = {}) {
  if (state.globalEventRefreshTimer) clearTimeout(state.globalEventRefreshTimer);
  state.globalEventRefreshTimer = setTimeout(async () => {
    state.globalEventRefreshTimer = null;
    try {
      await refreshGlobalState();
      if (payload.roomId && payload.roomId === state.activeRoomId) {
        await refreshRoomAgents();
        renderRoomInspector();
      }
    } catch (error) {
      console.warn('Global event refresh failed.', error);
    }
  }, 180);
}

function scheduleRoomMentionRefresh(roomId) {
  if (state.eventMentionRefreshTimers[roomId]) {
    clearTimeout(state.eventMentionRefreshTimers[roomId]);
  }
  state.eventMentionRefreshTimers[roomId] = setTimeout(async () => {
    delete state.eventMentionRefreshTimers[roomId];
    try {
      const limit = state.settings?.chat?.messagePageSize ?? 20;
      const page = await api(`/api/rooms/${roomId}/messages?limit=${encodeURIComponent(limit)}`);
      notifyNewUserMentions(page.messages ?? []);
      renderConversationList();
    } catch (error) {
      console.warn('Room mention refresh failed.', error);
    }
  }, 250);
}

function ensureMentionPolling() {
  if (state.mentionPollTimer) {
    clearInterval(state.mentionPollTimer);
    state.mentionPollTimer = null;
  }
}

function markActiveMessagePolling(duration = ACTIVE_MESSAGE_GRACE_MS) {
  state.activeMessagePollUntil = Math.max(state.activeMessagePollUntil, Date.now() + duration);
}

function shouldPollActiveRoomMessages() {
  return Boolean(state.activeRoomId)
    && (
      state.activeResponseCount > 0
      || state.activeRunIds.size > 0
      || hasPendingMessages()
      || Date.now() < state.activeMessagePollUntil
    );
}

function stopMessagePolling() {
  if (state.messagePollTimer) {
    clearInterval(state.messagePollTimer);
    state.messagePollTimer = null;
  }
}

async function refreshActiveRoomMessages(options = {}) {
  if (!state.activeRoomId) return;
  if (!shouldPollActiveRoomMessages()) {
    stopMessagePolling();
    return;
  }
  if (state.messagePollInFlight) return;
  state.messagePollInFlight = true;
  let shouldRefreshResources = Boolean(options.refreshResources);
  try {
    const previousHeight = els.messages.scrollHeight;
    const previousTop = els.messages.scrollTop;
    const stickToBottom = isMessagesNearBottom();
    const page = await fetchMessagePage();
    state.messages = mergeMessages([...state.messages, ...page.messages]);
    notifyNewUserMentions(page.messages);
    applyMessagePagination({
      ...page.pagination,
      hasMore: state.messagesHasMore || page.pagination?.hasMore,
      nextBefore: state.oldestMessageCursor?.createdAt ?? page.pagination?.nextBefore,
      nextBeforeId: state.oldestMessageCursor?.id ?? page.pagination?.nextBeforeId
    });
    state.agentRuns = await api(`/api/rooms/${state.activeRoomId}/agent-runs`);
    pruneInactiveRunIds();
    const pendingWork = hasPendingWork();
    if (shouldRefreshResources) {
      state.lastResourcePollAt = Date.now();
      await refreshActiveRoomResources();
    }
    renderMessages({
      stickToBottom,
      previousHeight,
      previousTop
    });
    renderTasks();
    renderProjects();
    renderAgentWorkCenter();
    renderSkillInvocations();
    renderArtifacts();
    renderRoomInspector();
    if (pendingWork) {
      setResponseState(true, 'Agent is responding...');
      return;
    }
    if (shouldPollActiveRoomMessages()) return;
    stopMessagePolling();
    state.activeRunIds.clear();
    if (state.activeResponseCount === 0) setResponseState(false);
  } catch (error) {
    console.warn('Message polling failed.', error);
  } finally {
    state.messagePollInFlight = false;
  }
}

async function refreshActiveRoomResources() {
  await refreshGlobalState();
  await refreshTasks();
  await refreshProjects();
  await refreshSkillInvocations();
  await refreshSkillApprovals();
  await refreshArtifacts();
}

async function refreshGlobalState() {
  const boot = await api('/api/bootstrap');
  updateRuntimeInfo(boot.runtime);
  const previousActiveRoomId = state.activeRoomId;
  state.settings = boot.settings ?? state.settings;
  state.providers = boot.providers ?? state.providers;
  state.agents = boot.agents ?? state.agents;
  state.skills = boot.skills ?? state.skills;
  state.roles = boot.roles ?? state.roles;
  state.rooms = boot.rooms ?? boot.conversations ?? state.rooms;
  state.conversations = state.rooms;
  state.roomAgents = boot.roomAgents ?? state.roomAgents;
  if (previousActiveRoomId && state.rooms.some((room) => room.id === previousActiveRoomId)) {
    state.activeRoomId = previousActiveRoomId;
  } else {
    setActiveRoomId(state.rooms[0]?.id ?? null);
  }
  renderSettings();
  renderRooms();
  renderConversationList();
  renderProviders();
  renderRoles();
  renderRoleSkillOptions();
  renderSkills();
  renderAgentRoleOptions();
  renderAgents();
  renderTaskAgentOptions();
  renderProjectAgentOptions();
  renderConversation();
  renderRoomInspector();
}

function upsertMessage(message) {
  const index = state.messages.findIndex((item) => item.id === message.id);
  if (index >= 0) state.messages[index] = message;
  else state.messages.push(message);
  state.messages = mergeMessages(state.messages);
  notifyNewUserMentions([message]);
}

function upsertRun(run) {
  const index = state.agentRuns.findIndex((item) => item.id === run.id);
  if (index >= 0) state.agentRuns[index] = run;
  else state.agentRuns.push(run);
}

function hasPendingMessages() {
  return state.messages.some(isPendingMessage);
}

function hasPendingWork() {
  return hasPendingMessages() || state.agentRuns.some((run) => run.status === 'queued' || run.status === 'running');
}

function pruneInactiveRunIds() {
  const activeIds = new Set(
    state.agentRuns
      .filter((run) => run.status === 'queued' || run.status === 'running')
      .map((run) => run.id)
  );
  for (const runId of Array.from(state.activeRunIds)) {
    if (!activeIds.has(runId)) state.activeRunIds.delete(runId);
  }
}

function isPendingMessage(message) {
  return Boolean(message?.pending) || message?.status === 'queued' || message?.status === 'running';
}

function canRetryMessage(message) {
  return message?.senderType === 'agent' && (message?.status === 'failed' || message?.status === 'stopped');
}

function restoreMentionState() {
  state.userMentionIds = new Set(readJsonStorage(SEEN_MENTIONS_STORAGE_KEY, []));
  const counts = readJsonStorage(ROOM_MENTION_COUNTS_STORAGE_KEY, {});
  state.roomMentionCounts = counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : {};
}

function persistMentionState() {
  const seen = Array.from(state.userMentionIds).slice(-500);
  state.userMentionIds = new Set(seen);
  localStorage.setItem(SEEN_MENTIONS_STORAGE_KEY, JSON.stringify(seen));
  localStorage.setItem(ROOM_MENTION_COUNTS_STORAGE_KEY, JSON.stringify(state.roomMentionCounts));
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function messageMentionsUser(message) {
  if (!message || message.senderType === 'user') return false;
  return /(^|\s)@user(?=$|[\s，。！？、,.!?:;；：）)\]}])/i.test(String(message.content ?? ''));
}

function markUserMentionsSeen(messages) {
  let changed = false;
  for (const message of messages) {
    if (messageMentionsUser(message) && !state.userMentionIds.has(message.id)) {
      state.userMentionIds.add(message.id);
      changed = true;
    }
  }
  if (state.activeRoomId) clearRoomMentionCount(state.activeRoomId);
  if (state.activeRoomId) clearRoomCrossRoomNotice(state.activeRoomId);
  if (changed) persistMentionState();
}

function clearRoomMentionCount(roomId) {
  if (!roomId || !state.roomMentionCounts[roomId]) return;
  state.roomMentionCounts = {
    ...state.roomMentionCounts,
    [roomId]: 0
  };
  persistMentionState();
  renderConversationList();
}

function notifyNewUserMentions(messages) {
  notifyCrossRoomMessages(messages);
  const newMention = messages.find((message) => {
    if (!messageMentionsUser(message) || state.userMentionIds.has(message.id)) return false;
    state.userMentionIds.add(message.id);
    if (message.roomId && message.roomId !== state.activeRoomId) {
      state.roomMentionCounts = {
        ...state.roomMentionCounts,
        [message.roomId]: (state.roomMentionCounts[message.roomId] ?? 0) + 1
      };
      persistMentionState();
      renderConversationList();
    } else {
      persistMentionState();
    }
    return true;
  });
  if (!newMention) return;

  if (state.userMentionNoticeTimer) {
    clearTimeout(state.userMentionNoticeTimer);
  }
  els.responseStatus.textContent = `${newMention.senderName} mentioned you`;
  els.responseStatus.classList.add('active', 'mention-alert');
  state.userMentionNoticeTimer = setTimeout(() => {
    els.responseStatus.classList.remove('mention-alert');
    if (hasPendingMessages()) {
      setResponseState(true, 'Agent is responding...');
    } else {
      setResponseState(false);
    }
  }, 5000);
}

function notifyCrossRoomMessages(messages) {
  let changed = false;
  for (const message of messages) {
    if (!message?.roomId || message.roomId === state.activeRoomId) continue;
    const crossRoom = parseCrossRoomMessage(message.content);
    if (!crossRoom) continue;
    const existing = state.roomCrossRoomNotices[message.roomId];
    if (existing?.messageId === message.id) continue;
    state.roomCrossRoomNotices = {
      ...state.roomCrossRoomNotices,
      [message.roomId]: {
        messageId: message.id,
        source: crossRoom.source,
        target: crossRoom.target,
        agent: crossRoom.agent,
        createdAt: message.createdAt
      }
    };
    changed = true;
  }
  if (changed) renderConversationList();
}

function clearRoomCrossRoomNotice(roomId) {
  if (!roomId || !state.roomCrossRoomNotices[roomId]) return;
  const next = { ...state.roomCrossRoomNotices };
  delete next[roomId];
  state.roomCrossRoomNotices = next;
  renderConversationList();
}

async function refreshRoomMentionCounts() {
  if (!state.rooms.length) return;
  const rooms = state.rooms.filter((room) => room.id !== state.activeRoomId);
  for (const room of rooms) {
    try {
      const page = await api(`/api/rooms/${room.id}/messages?limit=20`);
      notifyNewUserMentions(page.messages ?? []);
    } catch (error) {
      console.warn('Room mention refresh failed.', error);
    }
  }
}

function findRunForMessage(message) {
  if (!message?.runId) return null;
  return state.agentRuns.find((run) => run.id === message.runId) ?? null;
}

function renderMessageStatusBadge(message, run) {
  if (message.senderType !== 'agent' || !message.status) return '';
  const attempts = Number(run?.attempts ?? 0);
  const label = attempts > 0 ? `${message.status} · #${attempts}` : message.status;
  const titleParts = [
    run?.error ? `Error: ${run.error}` : '',
    run?.startedAt ? `Started: ${new Date(run.startedAt).toLocaleString()}` : '',
    run?.completedAt ? `Completed: ${new Date(run.completedAt).toLocaleString()}` : ''
  ].filter(Boolean);
  return `<span class="message-status ${escapeHtml(message.status)}" title="${escapeHtml(titleParts.join('\n'))}">${escapeHtml(label)}</span>`;
}

function renderMessageContent(message) {
  if (isPendingMessage(message) && !String(message.content ?? '').trim()) return 'Thinking...';
  if (message?.senderType === 'agent') {
    return stripRepeatedSpeakerPrefix(message.content ?? '', message.senderName);
  }
  return message.content ?? '';
}

function stripRepeatedSpeakerPrefix(content, speakerName) {
  const name = String(speakerName ?? '').trim();
  if (!name) return String(content ?? '');
  const escaped = escapeRegExp(name).replace(/\s+/g, '\\s+');
  return String(content ?? '').trimStart().replace(new RegExp(`^(?:${escaped}\\s*[:：]\\s*)+`, 'i'), '');
}

function renderMessageBody(message) {
  const content = renderMessageContent(message);
  const crossRoomMessage = parseCrossRoomMessage(content);
  if (crossRoomMessage) return renderCrossRoomMessageCard(crossRoomMessage);
  const roomManagement = parseRoomManagementMessage(message, content);
  if (roomManagement) return renderRoomManagementCard(roomManagement);
  const taskPlan = parseTaskPlanMessage(content);
  if (taskPlan) return renderTaskPlanCard(taskPlan, message.id);
  const credentialChoice = parseCredentialChoiceMessage(content);
  if (credentialChoice) return renderCredentialChoiceCard(credentialChoice, message);
  const skillApproval = parseSkillApprovalMessage(content);
  if (skillApproval) return renderSkillApprovalCard(skillApproval);
  const actionError = parseActionErrorMessage(content);
  if (actionError) return renderActionErrorCard(actionError);
  const approvalRequest = parseApprovalRequestMessage(content);
  if (approvalRequest) return renderApprovalRequestCard(approvalRequest, message);
  const projectCreated = parseProjectCreatedMessage(content);
  if (projectCreated) return renderProjectCreatedCard(projectCreated);
  const projectStatus = parseProjectStatusMessage(message, content);
  if (projectStatus) return renderProjectStatusCard(projectStatus);
  const actions = parseWorkspaceActions(content);
  if (actions.length === 0) {
    const systemArtifacts = parseWorkspaceUpdatedMessage(message);
    if (systemArtifacts.length > 0) {
      return renderArtifactCard({
        title: 'Workspace updated',
        description: `${systemArtifacts.length} artifact${systemArtifacts.length === 1 ? '' : 's'} updated`,
        actions: systemArtifacts,
        summary: ''
      });
    }
    return escapeHtml(content);
  }

  const summary = content
    .replaceAll(/```agentim-(?:mkdir|write-file)[\s\S]*?```/g, '')
    .trim();
  return [
    summary ? `<div class="message-summary">${escapeHtml(summary)}</div>` : '',
    renderArtifactCard({
      title: 'Workspace artifacts',
      description: `${actions.length} workspace action${actions.length === 1 ? '' : 's'} completed`,
      actions,
      summary: ''
    }),
    `<details class="protocol-details">
      <summary>Raw workspace protocol</summary>
      <pre>${escapeHtml(content)}</pre>
    </details>`
  ].join('');
}

function parseProjectStatusMessage(message, content) {
  if (message?.senderType !== 'system') return null;
  const lines = String(content ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const first = lines[0] ?? '';
  const match = first.match(/^Project\s+(done|failed):\s+(.+)$/i);
  if (!match) return null;
  const data = {
    status: match[1].toLowerCase(),
    name: match[2],
    projectId: '',
    progress: '',
    rootPath: '',
    entryPath: '',
    deliveryPath: '',
    downloadUrl: '',
    error: ''
  };
  for (const line of lines.slice(1)) {
    if (line.startsWith('Progress:')) data.progress = line.slice('Progress:'.length).trim();
    else if (line.startsWith('Project ID:')) data.projectId = line.slice('Project ID:'.length).trim();
    else if (line.startsWith('Root:')) data.rootPath = line.slice('Root:'.length).trim();
    else if (line.startsWith('Preview:')) data.entryPath = line.slice('Preview:'.length).trim();
    else if (line.startsWith('Delivery:')) data.deliveryPath = line.slice('Delivery:'.length).trim();
    else if (line.startsWith('Download:')) data.downloadUrl = line.slice('Download:'.length).trim();
    else if (line.startsWith('Error:')) data.error = line.slice('Error:'.length).trim();
  }
  return data;
}

function renderProjectStatusCard(status) {
  return `
    <section class="project-status-card ${escapeHtml(status.status)}">
      <div>
        <strong>Project ${escapeHtml(status.status)} · ${escapeHtml(status.name)}</strong>
        <span>${escapeHtml(status.progress)}</span>
        ${status.error ? `<span>${escapeHtml(status.error)}</span>` : ''}
      </div>
      <div class="project-event-actions">
        ${status.rootPath ? `<button type="button" data-open-artifact="${escapeHtml(status.rootPath)}">Files</button>` : ''}
        ${status.entryPath ? `<button type="button" data-open-preview-artifact="${escapeHtml(status.entryPath)}">Page</button>` : ''}
        ${status.deliveryPath ? `<button type="button" data-open-artifact="${escapeHtml(status.deliveryPath)}">DELIVERY.md</button>` : ''}
        ${status.downloadUrl ? `<a class="button-link" href="${escapeHtml(status.downloadUrl)}" download>Download Zip</a>` : ''}
      </div>
    </section>
  `;
}

function parseProjectCreatedMessage(content) {
  const match = String(content ?? '').match(/```agentim-project-created\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function parseTaskPlanMessage(content) {
  const match = String(content ?? '').match(/```agentim-task-plan\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]);
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) return null;
    return {
      title: String(payload.title ?? 'Task plan').trim() || 'Task plan',
      summary: String(payload.summary ?? '').trim(),
      items: items.map((item, index) => ({
        id: String(item.id ?? `plan-${index}`).trim() || `plan-${index}`,
        title: String(item.title ?? `Task ${index + 1}`).trim() || `Task ${index + 1}`,
        instructions: String(item.instructions ?? '').trim(),
        agent: String(item.agent ?? '').trim(),
        scheduleAt: String(item.scheduleAt ?? '').trim(),
        repeatInterval: normalizePlanRepeatInterval(item.repeatInterval),
        dependsOn: normalizePlanDependsOn(item.dependsOn ?? item.dependsOnTaskIds ?? item.dependsOnTaskId)
      })).filter((item) => item.instructions)
    };
  } catch {
    return null;
  }
}

function parseApprovalRequestMessage(content) {
  const match = String(content ?? '').match(/```agentim-approval-request\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]);
    return {
      title: String(payload.title ?? 'Approval requested').trim() || 'Approval requested',
      reason: String(payload.reason ?? payload.summary ?? '').trim(),
      approveLabel: String(payload.approveLabel ?? 'Approve').trim() || 'Approve',
      rejectLabel: String(payload.rejectLabel ?? 'Reject').trim() || 'Reject',
      details: Array.isArray(payload.details)
        ? payload.details.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 8)
        : []
    };
  } catch {
    return null;
  }
}

function parseSkillApprovalMessage(content) {
  const match = String(content ?? '').match(/```agentim-skill-approval\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]);
    const approvalId = String(payload.approvalId ?? '').trim();
    if (!approvalId) return null;
    const current = state.skillApprovals.find((approval) => approval.id === approvalId);
    return {
      approvalId,
      status: current?.status ?? 'pending',
      title: String(payload.title ?? current?.title ?? 'Skill approval required').trim() || 'Skill approval required',
      reason: String(payload.reason ?? current?.reason ?? '').trim(),
      skillName: String(payload.skillName ?? payload.skillId ?? current?.skillId ?? '').trim(),
      actionName: String(payload.actionName ?? payload.actionId ?? '').trim()
    };
  } catch {
    return null;
  }
}

function renderSkillApprovalCard(approval) {
  const pending = approval.status === 'pending';
  return `
    <section class="approval-card">
      <div class="approval-card-header">
        <div>
          <strong>${escapeHtml(approval.title)}</strong>
          <span>${escapeHtml([approval.skillName, approval.actionName, approval.status].filter(Boolean).join(' · '))}</span>
        </div>
      </div>
      ${approval.reason ? `<p>${escapeHtml(approval.reason)}</p>` : ''}
      <div class="approval-actions">
        ${pending ? `
          <button type="button" data-skill-approval-action="approve" data-skill-approval-id="${escapeHtml(approval.approvalId)}">Approve once</button>
          <button type="button" data-skill-approval-action="approve-room" data-skill-approval-id="${escapeHtml(approval.approvalId)}">Trust in this chat</button>
          <button type="button" class="danger-button" data-skill-approval-action="reject" data-skill-approval-id="${escapeHtml(approval.approvalId)}">Reject</button>
        ` : `<button type="button" disabled>${escapeHtml(approval.status)}</button>`}
      </div>
    </section>
  `;
}

function parseActionErrorMessage(content) {
  const text = String(content ?? '');
  const bracket = text.match(/\[Action error:\s*([\s\S]*?)\]\s*$/);
  const plain = text.match(/^Action error:\s*([\s\S]*)$/);
  const message = String(bracket?.[1] ?? plain?.[1] ?? '').trim();
  if (!message) return null;
  return {
    message,
    fixes: actionErrorFixes(message)
  };
}

function actionErrorFixes(message) {
  const text = String(message ?? '').toLowerCase();
  const fixes = [];
  if (text.includes('credential')) fixes.push({ label: 'Open Credentials', tab: 'settings:secrets' });
  if (text.includes('network policy') || text.includes('api requests') || text.includes('http requests') || text.includes('localhost') || text.includes('private network')) {
    fixes.push({ label: 'Open Network', tab: 'settings:network' });
  }
  if (text.includes('provider') || text.includes('api key') || text.includes('timed out')) fixes.push({ label: 'Open Providers', tab: 'settings:providers' });
  if (text.includes('required skill') || text.includes('agent does not have')) fixes.push({ label: 'Open Roles', tab: 'settings:roles' });
  return fixes.length > 0 ? fixes : [{ label: 'Open Activity', tab: 'settings:chats' }];
}

function renderActionErrorCard(error) {
  return `
    <section class="approval-card action-error-card">
      <div class="approval-card-header">
        <div>
          <strong>Action failed</strong>
          <span>${escapeHtml(error.message)}</span>
        </div>
      </div>
      <div class="approval-actions">
        ${error.fixes.map((fix) => `<button type="button" data-open-settings-tab="${escapeHtml(fix.tab)}">${escapeHtml(fix.label)}</button>`).join('')}
      </div>
    </section>
  `;
}

function parseCredentialChoiceMessage(content) {
  const match = String(content ?? '').match(/```agentim-credential-choice\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]);
    const credentials = Array.isArray(payload.credentials)
      ? payload.credentials
        .map((credential) => ({
          id: String(credential?.id ?? '').trim(),
          name: String(credential?.name ?? '').trim()
        }))
        .filter((credential) => credential.name)
      : [];
    if (!payload.skillId || !payload.actionId || credentials.length === 0) return null;
    return {
      agentId: String(payload.agentId ?? '').trim(),
      skillId: String(payload.skillId ?? '').trim(),
      skillName: String(payload.skillName ?? payload.skillId ?? '').trim(),
      actionId: String(payload.actionId ?? '').trim(),
      actionName: String(payload.actionName ?? payload.actionId ?? '').trim(),
      credentialType: String(payload.credentialType ?? '').trim(),
      credentials,
      input: payload.input && typeof payload.input === 'object' ? payload.input : {}
    };
  } catch {
    return null;
  }
}

function renderCredentialChoiceCard(choice, message) {
  return `
    <section class="approval-card credential-choice-card">
      <div class="approval-card-header">
        <div>
          <strong>Select credential</strong>
          <span>${escapeHtml(choice.skillName)} · ${escapeHtml(choice.actionName)}</span>
        </div>
      </div>
      <p>${escapeHtml(choice.credentialType ? `Choose a ${choice.credentialType} credential to continue this skill action.` : 'Choose a credential to continue this skill action.')}</p>
      <div class="approval-actions">
        ${choice.credentials.map((credential) => {
    const value = encodeURIComponent(JSON.stringify({
      messageId: message.id,
      credentialId: credential.id,
      credentialName: credential.name
    }));
    return `<button type="button" data-credential-choice="${escapeHtml(value)}">${escapeHtml(credential.name)}</button>`;
  }).join('')}
      </div>
    </section>
  `;
}

function renderApprovalRequestCard(request, message) {
  return `
    <section class="approval-card">
      <div class="approval-card-header">
        <div>
          <strong>${escapeHtml(request.title)}</strong>
          <span>${escapeHtml(message.senderName)} needs a decision</span>
        </div>
      </div>
      ${request.reason ? `<p>${escapeHtml(request.reason)}</p>` : ''}
      ${request.details.length > 0 ? `
        <ul>
          ${request.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}
        </ul>
      ` : ''}
      <div class="approval-actions">
        <button type="button" data-approval-decision="${escapeHtml(`${message.id}:approved`)}">${escapeHtml(request.approveLabel)}</button>
        <button type="button" class="danger-button" data-approval-decision="${escapeHtml(`${message.id}:rejected`)}">${escapeHtml(request.rejectLabel)}</button>
      </div>
    </section>
  `;
}

function renderTaskPlanCard(plan, messageId) {
  const items = plan.items ?? [];
  const activeAgents = activeRoomAgents();
  return `
    <section class="task-plan-card">
      <div class="task-plan-header">
        <div>
          <strong>${escapeHtml(plan.title)}</strong>
          <span>${escapeHtml(plan.summary || `${items.length} proposed task${items.length === 1 ? '' : 's'}`)}</span>
        </div>
        <div class="task-plan-actions">
          <button type="button" data-schedule-plan-all="${escapeHtml(messageId)}">Schedule All</button>
        </div>
      </div>
      <div class="task-plan-list">
        ${items.map((item, index) => {
    const agent = resolvePlanAgent(item, activeAgents);
    const schedule = resolvePlanScheduleAt(item.scheduleAt);
    return `
            <div class="task-plan-item">
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(agent?.name ?? item.agent ?? 'Select an Agent in Tasks')}</span>
                <span>${escapeHtml(formatPlanScheduleLabel(schedule, item.repeatInterval))}</span>
                ${item.dependsOn.length > 0 ? `<span>after ${escapeHtml(item.dependsOn.join(', '))}</span>` : ''}
                <p>${escapeHtml(item.instructions)}</p>
              </div>
              <div class="task-plan-actions">
                ${agent
      ? `<button type="button" data-schedule-plan-item="${escapeHtml(`${messageId}:${index}`)}">Schedule</button>`
      : '<button type="button" disabled>Missing Agent</button>'}
              </div>
            </div>
          `;
  }).join('')}
      </div>
    </section>
  `;
}

function renderProjectCreatedCard(payload) {
  const project = payload.project ?? {};
  const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
  const missingRoles = Array.isArray(payload.missingRoles) ? payload.missingRoles : [];
  return `
    <section class="project-event-card">
      <div class="project-event-header">
        <div>
          <strong>${escapeHtml(project.name ?? 'Project created')}</strong>
          <span>${escapeHtml(project.type ?? 'project')} · ${escapeHtml(project.rootPath ?? '')}</span>
        </div>
        <div class="project-event-actions">
          ${project.rootPath ? `<button type="button" data-open-artifact="${escapeHtml(project.rootPath)}">Files</button>` : ''}
          ${project.entryPath ? `<button type="button" data-open-preview-artifact="${escapeHtml(project.entryPath)}">Page</button>` : ''}
        </div>
      </div>
      ${missingRoles.length > 0 ? `
        <div class="project-event-warning">
          Missing role Agents: ${escapeHtml(missingRoles.map((role) => role.roleName).join(', '))}
        </div>
      ` : ''}
      <div class="project-phase-list">
        ${assignments.map((item) => `
          <div class="project-phase-row">
            <div>
              <strong>${escapeHtml(item.phase)} · ${escapeHtml(item.roleName)}</strong>
              <span>${escapeHtml(item.title ?? '')}</span>
            </div>
            <div>
              <strong>${escapeHtml(item.agent?.name ?? 'Unassigned')}</strong>
              <span>${escapeHtml((item.dependsOn ?? []).length > 0 ? `after ${item.dependsOn.join(', ')}` : 'starts first')}${item.exactMatch ? ' · role match' : item.agent ? ' · fallback' : ''}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function parseCrossRoomMessage(content) {
  const raw = String(content ?? '');
  const match = raw.match(/^\[agentim-room-message\s+([^\]]+)\]\s*\n\n?([\s\S]*)$/);
  if (!match) return null;
  const attrs = parseInlineAttributes(match[1]);
  return {
    source: attrs.source ?? 'Unknown room',
    target: attrs.target ?? 'Current room',
    agent: attrs.agent ?? 'Agent',
    content: String(match[2] ?? '').trim()
  };
}

function parseInlineAttributes(value) {
  const attrs = {};
  const pattern = /([a-zA-Z0-9_-]+)=(?:"((?:\\"|[^"])*)"|'([^']*)'|([^\s]+))/g;
  for (const match of String(value ?? '').matchAll(pattern)) {
    attrs[match[1]] = String(match[2] ?? match[3] ?? match[4] ?? '').replaceAll('\\"', '"').replaceAll('\\\\', '\\');
  }
  return attrs;
}

function renderCrossRoomMessageCard(message) {
  const mentionsUser = /(^|\s)@user(?=$|[\s，。！？、,.!?:;；：）)\]}])/i.test(message.content);
  return `
    <section class="cross-room-card">
      <div class="cross-room-card-header">
        <strong>Cross-room message</strong>
        <span>${escapeHtml(message.source)} -> ${escapeHtml(message.target)}</span>
      </div>
      <div class="cross-room-meta">
        <span>Sent by ${escapeHtml(message.agent)}</span>
        ${mentionsUser ? '<span class="cross-room-mention">Mentions you</span>' : ''}
      </div>
      <div class="cross-room-card-body">${escapeHtml(message.content)}</div>
    </section>
  `;
}

function parseRoomManagementMessage(message, content) {
  if (message?.senderType !== 'system') return null;
  const lines = String(content ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const createdLine = lines.find((line) => line.startsWith('Rooms created:'));
  const assignedLine = lines.find((line) => line.startsWith('Agents assigned:'));
  if (!createdLine && !assignedLine) return null;
  return {
    created: createdLine
      ? createdLine.slice('Rooms created:'.length).split(',').map((item) => item.trim()).filter(Boolean)
      : [],
    assigned: assignedLine
      ? assignedLine.slice('Agents assigned:'.length).split(',').map((item) => item.trim()).filter(Boolean)
      : []
  };
}

function renderRoomManagementCard(event) {
  return `
    <section class="cross-room-card">
      <div class="cross-room-card-header">
        <strong>Room management</strong>
        <span>${escapeHtml([
    event.created.length ? `${event.created.length} created` : '',
    event.assigned.length ? `${event.assigned.length} assigned` : ''
  ].filter(Boolean).join(' · '))}</span>
      </div>
      <div class="cross-room-card-body">
        ${event.created.length > 0 ? `<p>Created: ${escapeHtml(event.created.join(', '))}</p>` : ''}
        ${event.assigned.length > 0 ? `<p>Assigned: ${escapeHtml(event.assigned.join(', '))}</p>` : ''}
      </div>
    </section>
  `;
}

function parseWorkspaceActions(content) {
  const actions = [];
  const mkdirPattern = /```agentim-mkdir\s+path="([^"]+)"\s*```/g;
  for (const match of String(content ?? '').matchAll(mkdirPattern)) {
    actions.push({ type: 'directory', path: normalizeUiPath(match[1]) });
  }

  const writePattern = /```agentim-write-file\s+path="([^"]+)"\n[\s\S]*?```/g;
  for (const match of String(content ?? '').matchAll(writePattern)) {
    actions.push({ type: 'file', path: normalizeUiPath(match[1]) });
  }
  return dedupeArtifactActions(actions);
}

function parseWorkspaceUpdatedMessage(message) {
  if (message?.senderType !== 'system') return [];
  const prefix = 'Workspace updated:';
  const content = String(message.content ?? '');
  if (!content.startsWith(prefix)) return [];
  return dedupeArtifactActions(content
    .slice(prefix.length)
    .split(',')
    .map((path) => normalizeUiPath(path))
    .filter(Boolean)
    .map((path) => ({
      type: looksLikeFilePath(path) ? 'file' : 'directory',
      path
    })));
}

function dedupeArtifactActions(actions) {
  const byKey = new Map();
  for (const action of actions) {
    if (!action.path) continue;
    byKey.set(`${action.type}:${action.path}`, action);
  }
  return Array.from(byKey.values());
}

function renderArtifactCard({ title, description, actions }) {
  return `
    <section class="artifact-card">
      <div class="artifact-card-header">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
      <div class="artifact-list">
        ${actions.map(renderArtifactRow).join('')}
      </div>
    </section>
  `;
}

function renderArtifactRow(action) {
  const previewable = action.type === 'file' && isPreviewablePath(action.path);
  return `
    <div class="artifact-row">
      <div>
        <strong>${action.type === 'directory' ? 'Directory' : 'File'}</strong>
        <span>${escapeHtml(action.path)}</span>
      </div>
      <div class="artifact-actions">
        ${action.type === 'file' ? `<button type="button" data-open-artifact="${escapeHtml(action.path)}">Open File</button>` : ''}
        ${previewable ? `<button type="button" data-open-preview-artifact="${escapeHtml(action.path)}">Open Page</button>` : ''}
        ${action.type === 'file' ? `<a class="button-link" href="${escapeHtml(fileDownloadUrl(action.path))}" download>Download</a>` : ''}
      </div>
    </div>
  `;
}

function looksLikeFilePath(path) {
  return /\/?[^/]+\.[a-z0-9]+$/i.test(String(path ?? ''));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error ?? data.message ?? `Request failed: ${res.status}`);
    error.data = data;
    if (res.status === 401 && data.error === 'auth_required') {
      state.settings.auth = {
        ...(state.settings.auth ?? {}),
        passwordSet: true,
        authenticated: false
      };
      closeEventStream();
      showAuthGate(true);
    }
    throw error;
  }
  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function normalizeUiPath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

function dirname(value) {
  const normalized = normalizeUiPath(value);
  if (!normalized || !normalized.includes('/')) return '';
  return normalized.split('/').slice(0, -1).join('/');
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '0 B';
  if (number < 1024) return `${number} B`;
  if (number < 1024 * 1024) return `${(number / 1024).toFixed(1)} KB`;
  return `${(number / 1024 / 1024).toFixed(1)} MB`;
}

function formatInvocationTime(invocation) {
  const created = invocation.createdAt ? new Date(invocation.createdAt).toLocaleTimeString() : '';
  const completed = invocation.completedAt ? new Date(invocation.completedAt).toLocaleTimeString() : '';
  return completed && completed !== created ? `${created} -> ${completed}` : created;
}

function formatInspectorActivity(invocation) {
  const actor = formatInvocationActor(invocation);
  const time = formatInvocationTime(invocation) || 'pending';
  if (invocation.skillId === 'provider.chat') {
    const diagnostics = invocation.output?.diagnostics ?? {};
    const usage = diagnostics.usage ?? {};
    const tokens = usage.prompt_tokens !== undefined || usage.completion_tokens !== undefined
      ? ` · tokens ${usage.prompt_tokens ?? 0}/${usage.completion_tokens ?? 0}`
      : '';
    const finish = diagnostics.finishReason ? ` · finish ${diagnostics.finishReason}` : '';
    const fallback = diagnostics.fallbackUsed ? ' · fallback' : '';
    const streamError = diagnostics.streamError ? ` · stream error: ${diagnostics.streamError}` : '';
    const http = diagnostics.response?.status !== undefined
      ? ` · HTTP ${diagnostics.response.status}${diagnostics.response.statusText ? ` ${diagnostics.response.statusText}` : ''}`
      : '';
    const body = diagnostics.response?.bodyPreview ? ` · body: ${summarizeInline(diagnostics.response.bodyPreview, 140)}` : '';
    return {
      title: `Provider chat · ${invocation.status}`,
      meta: `${actor} · ${diagnostics.providerName ?? invocation.input?.providerId ?? 'Provider'} · ${diagnostics.model ?? invocation.input?.model ?? 'model'}`,
      detail: `${diagnostics.mode ?? 'chat'} · ${time}${http}${finish}${tokens}${fallback}${streamError}${body}`
    };
  }
  if (invocation.skillId === 'agent.message') {
    const source = invocation.output?.sourceRoomName ?? invocation.input?.sourceRoomName ?? 'Unknown room';
    const target = invocation.output?.roomName ?? invocation.input?.targetRoomName ?? 'Unknown room';
    const agent = invocation.input?.agentName ?? state.agents.find((item) => item.id === invocation.agentId)?.name ?? 'Agent';
    const status = invocation.status ?? 'unknown';
    const messageId = invocation.output?.messageId ? ` · message ${String(invocation.output.messageId).slice(0, 8)}` : '';
    const error = invocation.error ? ` · ${invocation.error}` : '';
    const verb = status === 'done' ? 'delivered' : status === 'failed' ? 'failed' : status;
    return {
      title: `Room message · ${status}`,
      meta: `${source} -> ${target}`,
      detail: `${agent} · ${verb} ${formatInvocationTime(invocation) || 'pending'}${messageId}${error}`
    };
  }
  if (invocation.skillId === 'api.request' || invocation.output?.url || invocation.input?.url) {
    const method = invocation.output?.method ?? invocation.input?.method ?? 'GET';
    const url = invocation.output?.url ?? invocation.input?.url ?? '';
    const host = formatUrlHost(url);
    const status = invocation.output?.status !== undefined
      ? `HTTP ${invocation.output.status}`
      : invocation.status ?? 'queued';
    const contentType = invocation.output?.contentType ? ` · ${invocation.output.contentType}` : '';
    const bytes = invocation.output?.bodyLength !== undefined ? ` · ${formatBytes(invocation.output.bodyLength)}` : '';
    const truncated = invocation.output?.truncated ? ' · truncated' : '';
    return {
      title: `${invocation.skillId} · ${invocation.status}`,
      meta: `${actor} · ${method} ${host || 'request'}`,
      detail: `${status}${contentType}${bytes}${truncated} · ${time}`
    };
  }
  if (invocation.skillId && !invocation.skillId.includes('.')) {
    const action = invocation.output?.actionId ?? invocation.input?.action ?? invocation.input?.actionId ?? 'action';
    const credential = invocation.output?.credentialName
      ?? invocation.input?.credentialName
      ?? invocation.input?.credential
      ?? '';
    const target = invocation.output?.url ?? invocation.input?.url ?? invocation.output?.path ?? invocation.input?.path ?? '';
    const status = invocation.output?.status !== undefined ? `HTTP ${invocation.output.status}` : invocation.status;
    return {
      title: `${invocation.skillId} · ${action} · ${invocation.status}`,
      meta: [actor, credential ? `credential: ${credential}` : '', target ? formatUrlHost(target) || target : ''].filter(Boolean).join(' · '),
      detail: [status, invocation.output?.contentType, time].filter(Boolean).join(' · ')
    };
  }
  const path = invocation.output?.path ?? invocation.input?.path ?? invocation.output?.roomName ?? invocation.input?.targetRoomName ?? '';
  return {
    title: `${invocation.skillId} · ${invocation.status}`,
    meta: [actor, path || invocation.input?.action || 'No target'].filter(Boolean).join(' · '),
    detail: time
  };
}

function formatApprovalActivity(approval) {
  const input = approval.input ?? {};
  const request = input.request ?? {};
  const action = input.actionId ?? request.action ?? input.action ?? '';
  const credential = input.credentialName ?? input.credential ?? '';
  const trust = input.trustScope === 'room'
    ? 'trusted in this chat'
    : input.trustRevokedAt
      ? 'trust revoked'
      : approval.status === 'pending'
        ? 'approval required'
        : approval.status;
  const created = approval.createdAt ? new Date(approval.createdAt).toLocaleTimeString() : '';
  return {
    title: `${approval.title ?? approval.skillId} · ${approval.status}`,
    meta: [
      approval.requestedBy ? `requested by ${approval.requestedBy}` : '',
      input.skillId ?? approval.skillId,
      action,
      credential ? `credential: ${credential}` : ''
    ].filter(Boolean).join(' · '),
    detail: [trust, created].filter(Boolean).join(' · '),
    extra: approval.reason || ''
  };
}

function formatInvocationActor(invocation) {
  const agent = state.agents.find((item) => item.id === invocation.agentId);
  if (agent?.name) return agent.name;
  if (invocation.actorType) return invocation.actorType;
  return 'system';
}

function formatUrlHost(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.host || url.href;
  } catch {
    return String(value ?? '').slice(0, 80);
  }
}

function formatTaskTime(task) {
  const scheduled = task.scheduleAt ? new Date(task.scheduleAt).toLocaleString() : 'No time';
  if (task.completedAt) return `${scheduled} -> ${new Date(task.completedAt).toLocaleTimeString()}`;
  if (task.cancelledAt) return `${scheduled} -> cancelled ${new Date(task.cancelledAt).toLocaleTimeString()}`;
  if (task.startedAt) return `${scheduled} -> started ${new Date(task.startedAt).toLocaleTimeString()}`;
  return scheduled;
}

function activeRoomAgents() {
  const activeAgents = state.roomAgents
    .filter((item) => item.roomId === state.activeRoomId)
    .map((item) => state.agents.find((agent) => agent.id === item.agentId) ?? item)
    .filter(Boolean);
  return activeAgents.length > 0 ? activeAgents : state.agents;
}

function resolvePlanAgent(item, agents) {
  if (!Array.isArray(agents) || agents.length === 0) return null;
  const name = normalizePlanAgentName(item.agent);
  if (!name) return agents[0] ?? null;
  return agents.find((agent) => normalizePlanAgentName(agent.name) === name)
    ?? agents.find((agent) => normalizePlanAgentName(agent.name).includes(name))
    ?? null;
}

function normalizePlanAgentName(value) {
  return String(value ?? '').trim().replace(/^@/, '').toLowerCase();
}

function resolvePlanScheduleAt(value) {
  const text = String(value ?? '').trim();
  const parsed = text ? new Date(text) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  const soon = new Date();
  soon.setMinutes(soon.getMinutes() + 5);
  return soon;
}

function normalizePlanRepeatInterval(value) {
  const repeat = String(value ?? '').trim().toLowerCase();
  return ['daily', 'weekly'].includes(repeat) ? repeat : '';
}

function normalizePlanDependsOn(value) {
  const raw = Array.isArray(value) ? value : [value];
  return [...new Set(raw
    .flatMap((item) => typeof item === 'string' && item.includes(',') ? item.split(',') : [item])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean))];
}

function resolvePlanDependencyTaskIds(plan, item, createdByPlanId = new Map()) {
  const dependencies = normalizePlanDependsOn(item.dependsOn);
  if (dependencies.length === 0) return [];
  return dependencies.map((dependency) => {
    const created = createdByPlanId.get(dependency);
    if (created?.id) return created.id;
    const planItem = plan.items.find((entry) => entry.id === dependency || entry.title === dependency);
    const createdByTitle = planItem ? createdByPlanId.get(planItem.id) : null;
    if (createdByTitle?.id) return createdByTitle.id;
    const task = state.tasks.find((entry) => entry.id === dependency || entry.title === dependency || entry.title === planItem?.title);
    return task?.id ?? '';
  }).filter(Boolean);
}

function formatPlanScheduleLabel(date, repeatInterval) {
  const base = date.toLocaleString();
  return repeatInterval ? `${base} · repeats ${repeatInterval}` : base;
}

function summarizeInline(value, maxLength = 120) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function formatProjectTaskTime(task) {
  if (task.completedAt && task.startedAt) {
    return `${new Date(task.startedAt).toLocaleTimeString()} -> ${new Date(task.completedAt).toLocaleTimeString()}`;
  }
  if (task.completedAt) return `done ${new Date(task.completedAt).toLocaleTimeString()}`;
  if (task.startedAt) return `started ${new Date(task.startedAt).toLocaleTimeString()}`;
  return task.status === 'queued' ? 'queued' : '';
}

function defaultTaskScheduleLocal() {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  date.setSeconds(0, 0);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
