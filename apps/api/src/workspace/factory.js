import { LocalWorkspaceStorage } from './local-workspace-storage.js';

let localWorkspaceStorage = null;

export function createWorkspaceStorage() {
  localWorkspaceStorage ??= new LocalWorkspaceStorage();
  return localWorkspaceStorage;
}
