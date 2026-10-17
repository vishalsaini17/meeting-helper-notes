import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  Menu,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from 'electron';
import type {
  AppCommand,
  AppError,
  OperationResult,
  OpenDocument,
  SaveDocumentResult,
} from '../shared/contracts';
import { applyScreenPrivacy, applyValidatedWindowOpacity } from '../shared/window-state';
import { isValidMarkdown, MAX_DOCUMENT_BYTES, writeMarkdownAtomically } from './markdown-file';

const CHANNELS = {
  open: 'document:open',
  acceptOpen: 'document:accept-open',
  save: 'document:save',
  saveAs: 'document:save-as',
  new: 'document:new',
  closeDocument: 'document:close',
  dirty: 'document:dirty',
  alwaysOnTop: 'window:set-always-on-top',
  screenPrivacy: 'window:set-screen-privacy',
  opacity: 'window:set-opacity',
  resolveClose: 'window:resolve-close',
  closeWindow: 'window:close',
  menuCommand: 'app:menu-command',
  closeRequested: 'app:close-requested',
} as const;

interface DocumentSession {
  path: string | null;
  pendingOpen: { token: string; path: string } | null;
  dirty: boolean;
}

const documentSessions = new WeakMap<BrowserWindow, Map<string, DocumentSession>>();
const closePromptOpen = new WeakSet<BrowserWindow>();
const allowClose = new WeakSet<BrowserWindow>();

function errorResult<T>(error: AppError): OperationResult<T> {
  return { status: 'error', error };
}

function safeError(code: AppError['code'], message: string): AppError {
  return { code, message, recoverable: true };
}

function getWindow(event?: IpcMainInvokeEvent): BrowserWindow | undefined {
  return event ? BrowserWindow.fromWebContents(event.sender) ?? undefined : BrowserWindow.getFocusedWindow() ?? undefined;
}

function isValidDocumentId(documentId: unknown): documentId is string {
  return typeof documentId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(documentId);
}

function getDocumentSession(window: BrowserWindow, documentId: unknown, create = false): DocumentSession | undefined {
  if (!isValidDocumentId(documentId)) return undefined;
  let sessions = documentSessions.get(window);
  if (!sessions && create) {
    sessions = new Map();
    documentSessions.set(window, sessions);
  }
  let session = sessions?.get(documentId);
  if (!session && create) {
    session = { path: null, pendingOpen: null, dirty: false };
    sessions?.set(documentId, session);
  }
  return session;
}

async function showSaveDialog(window: BrowserWindow | undefined, activePath: string | null): Promise<string | null> {
  const options = {
    title: 'Save meeting notes',
    defaultPath: activePath ?? 'Meeting Notes.md',
    buttonLabel: 'Save',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  };
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled) return null;
  return extname(result.filePath) ? result.filePath : `${result.filePath}.md`;
}

async function saveMarkdown(
  documentId: unknown,
  markdown: unknown,
  window: BrowserWindow | undefined,
  forceSaveAs: boolean,
): Promise<OperationResult<SaveDocumentResult>> {
  if (!window) {
    return errorResult(safeError('INVALID_REQUEST', 'The document window is no longer available.'));
  }
  const session = getDocumentSession(window, documentId);
  if (!session) {
    return errorResult(safeError('INVALID_REQUEST', 'This document tab is no longer available.'));
  }
  if (!isValidMarkdown(markdown)) {
    return errorResult(
      safeError('INVALID_REQUEST', 'This document is too large or contains invalid content. Reduce its size and try again.'),
    );
  }

  let path = forceSaveAs ? null : session.path;
  if (!path) {
    try {
      path = await showSaveDialog(window, session.path);
    } catch {
      return errorResult(safeError('DIALOG_FAILED', 'The Save dialog could not be opened. Try again.'));
    }
    if (!path) return { status: 'cancelled' };
  }

  try {
    await writeMarkdownAtomically(path, markdown);
    session.path = path;
    session.pendingOpen = null;
    return { status: 'success', value: { path } };
  } catch {
    return errorResult(
      safeError('FILE_WRITE_FAILED', 'Could not save this file. Your changes are still open; check folder permissions or choose Save As.'),
    );
  }
}

function sendMenuCommand(command: AppCommand): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(CHANNELS.menuCommand, command);
}

function installApplicationMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => sendMenuCommand('new-tab') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => sendMenuCommand('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuCommand('save-as') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function registerIpc(): void {
  ipcMain.handle(CHANNELS.open, async (event, documentId: unknown): Promise<OperationResult<OpenDocument>> => {
    const window = getWindow(event);
    if (!window || !isValidDocumentId(documentId) || !getDocumentSession(window, documentId)) {
      return errorResult(safeError('INVALID_REQUEST', 'This document tab is no longer available.'));
    }
    let selection;
    try {
      const options: OpenDialogOptions = {
        title: 'Open meeting notes',
        properties: ['openFile'],
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
      };
      selection = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
    } catch {
      return errorResult(safeError('DIALOG_FAILED', 'The Open dialog could not be opened. Try again.'));
    }
    if (selection.canceled || !selection.filePaths[0]) return { status: 'cancelled' };

    const path = selection.filePaths[0];
    try {
      const file = await fs.stat(path);
      if (!file.isFile() || file.size > MAX_DOCUMENT_BYTES) {
        return errorResult(safeError('FILE_READ_FAILED', 'This file is not a supported Markdown document or exceeds the 10 MB limit.'));
      }
      const markdown = await fs.readFile(path, 'utf8');
      const token = randomUUID();
      const session = getDocumentSession(window, documentId);
      if (!session) return errorResult(safeError('INVALID_REQUEST', 'This document tab is no longer available.'));
      session.pendingOpen = { token, path };
      return { status: 'success', value: { documentId, token, path, markdown } };
    } catch {
      return errorResult(safeError('FILE_READ_FAILED', 'Could not open this file. Check that it still exists and that you have permission to read it.'));
    }
  });

  ipcMain.handle(CHANNELS.acceptOpen, (event, documentId: unknown, token: unknown) => {
    const window = getWindow(event);
    if (!window || !isValidDocumentId(documentId) || typeof token !== 'string') return false;
    const session = getDocumentSession(window, documentId);
    if (!session?.pendingOpen || session.pendingOpen.token !== token) return false;
    session.path = session.pendingOpen.path;
    session.pendingOpen = null;
    return true;
  });

  ipcMain.handle(CHANNELS.save, (event, documentId: unknown, markdown: unknown) =>
    saveMarkdown(documentId, markdown, getWindow(event), false));
  ipcMain.handle(CHANNELS.saveAs, (event, documentId: unknown, markdown: unknown) =>
    saveMarkdown(documentId, markdown, getWindow(event), true));
  ipcMain.handle(CHANNELS.new, (event, documentId: unknown) => {
    const window = getWindow(event);
    if (!window || !isValidDocumentId(documentId)) return false;
    const sessions = documentSessions.get(window) ?? new Map<string, DocumentSession>();
    documentSessions.set(window, sessions);
    if (sessions.has(documentId)) return false;
    sessions.set(documentId, { path: null, pendingOpen: null, dirty: false });
    return true;
  });
  ipcMain.on(CHANNELS.closeDocument, (event, documentId: unknown) => {
    const window = getWindow(event);
    if (!window || !isValidDocumentId(documentId)) return;
    documentSessions.get(window)?.delete(documentId);
  });
  ipcMain.on(CHANNELS.dirty, (event, documentId: unknown, isDirty: unknown) => {
    const window = getWindow(event);
    const session = window && getDocumentSession(window, documentId);
    if (session && typeof isDirty === 'boolean') {
      session.dirty = isDirty;
    }
  });
  ipcMain.handle(CHANNELS.alwaysOnTop, (event, enabled: unknown) => {
    const window = getWindow(event);
    if (!window || typeof enabled !== 'boolean') return false;
    window.setAlwaysOnTop(enabled);
    return true;
  });
  ipcMain.handle(CHANNELS.screenPrivacy, (event, enabled: unknown) => {
    const window = getWindow(event);
    if (!window || typeof enabled !== 'boolean') return false;
    return applyScreenPrivacy(enabled, process.platform, {
      setContentProtection: (state) => window.setContentProtection(state),
      setMinimizable: (state) => window.setMinimizable(state),
      setSkipTaskbar: (state) => window.setSkipTaskbar(state),
    });
  });
  ipcMain.handle(CHANNELS.opacity, (event, percent: unknown) => {
    const window = getWindow(event);
    if (!window) return false;
    return applyValidatedWindowOpacity(percent, process.platform, (opacity) => window.setOpacity(opacity));
  });
  ipcMain.on(CHANNELS.closeWindow, (event) => {
    getWindow(event)?.close();
  });
  ipcMain.on(CHANNELS.resolveClose, (event, decision: unknown) => {
    const window = getWindow(event);
    if (!window || !closePromptOpen.has(window) || !['save', 'discard', 'cancel'].includes(String(decision))) return;
    closePromptOpen.delete(window);
    if (decision === 'cancel') return;
    for (const session of documentSessions.get(window)?.values() ?? []) session.dirty = false;
    allowClose.add(window);
    window.close();
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#f7f8f6',
    title: 'Meeting Note Helper',
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.js', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  documentSessions.set(window, new Map());

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    const currentUrl = window.webContents.getURL();
    if (currentUrl && targetUrl !== currentUrl) event.preventDefault();
  });
  window.on('close', (event) => {
    if (allowClose.has(window)) return;
    event.preventDefault();
    if (closePromptOpen.has(window)) return;
    closePromptOpen.add(window);
    window.webContents.send(CHANNELS.closeRequested);
  });
  window.on('closed', () => {
    documentSessions.delete(window);
    closePromptOpen.delete(window);
    allowClose.delete(window);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)));
  }
}

app.whenReady().then(() => {
  registerIpc();
  installApplicationMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});