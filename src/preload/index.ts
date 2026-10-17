import { contextBridge, ipcRenderer } from 'electron';
import type { AppCommand, CloseDecision, MeetingNotesApi } from '../shared/contracts';

const api: MeetingNotesApi = {
  openDocument: (documentId) => ipcRenderer.invoke('document:open', documentId),
  acceptOpenedDocument: (documentId, token) => ipcRenderer.invoke('document:accept-open', documentId, token),
  saveDocument: (documentId, markdown) => ipcRenderer.invoke('document:save', documentId, markdown),
  saveDocumentAs: (documentId, markdown) => ipcRenderer.invoke('document:save-as', documentId, markdown),
  startNewDocument: (documentId) => ipcRenderer.invoke('document:new', documentId),
  closeDocument: (documentId) => ipcRenderer.send('document:close', documentId),
  setDocumentDirty: (documentId, isDirty) => ipcRenderer.send('document:dirty', documentId, isDirty),
  closeWindow: () => ipcRenderer.send('window:close'),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('window:set-always-on-top', enabled),
  setScreenPrivacy: (enabled) => ipcRenderer.invoke('window:set-screen-privacy', enabled),
  setWindowOpacity: (percent) => ipcRenderer.invoke('window:set-opacity', percent),
  resolveClose: (decision: CloseDecision) => ipcRenderer.send('window:resolve-close', decision),
  onMenuCommand: (listener: (command: AppCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: AppCommand) => listener(command);
    ipcRenderer.on('app:menu-command', handler);
    return () => ipcRenderer.removeListener('app:menu-command', handler);
  },
  onCloseRequested: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('app:close-requested', handler);
    return () => ipcRenderer.removeListener('app:close-requested', handler);
  },
};

contextBridge.exposeInMainWorld('meetingNotes', api);