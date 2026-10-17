import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/newsreader/600.css';
import { commandsCtx } from '@milkdown/kit/core';
import { redoCommand, undoCommand } from '@milkdown/kit/plugin/history';
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  toggleLinkCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import { toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { callCommand } from '@milkdown/kit/utils';
import './styles.css';
import { editorFeatures } from './editor-config';
import { countCharacters, countWords, isDocumentDirty } from '../shared/document';
import {
  isValidWindowOpacity,
  MAX_WINDOW_OPACITY_PERCENT,
  MIN_WINDOW_OPACITY_PERCENT,
  nextAppearanceTheme,
  resolveOtherToolsShortcut,
  supportsScreenPrivacy,
  supportsWindowOpacity,
} from '../shared/window-state';
import type { AppCommand, CloseDecision, OperationResult } from '../shared/contracts';

const editorRoot = document.querySelector<HTMLDivElement>('#editor-root');
const statusText = document.querySelector<HTMLElement>('#status-text');
const statusIndicator = document.querySelector<HTMLElement>('#status-indicator');
const wordCount = document.querySelector<HTMLElement>('#word-count');
const characterCount = document.querySelector<HTMLElement>('#character-count');
const tabListElement = document.querySelector<HTMLDivElement>('#tab-list');
const alwaysOnTopButton = document.querySelector<HTMLButtonElement>('#always-on-top-button');
const screenPrivacyButton = document.querySelector<HTMLButtonElement>('#screen-privacy-button');
const themeToggleButton = document.querySelector<HTMLButtonElement>('#theme-toggle-button');
const opacitySlider = document.querySelector<HTMLInputElement>('#window-opacity');
const opacityValue = document.querySelector<HTMLOutputElement>('#window-opacity-value');
const dialog = document.querySelector<HTMLDivElement>('#decision-dialog');
const toast = document.querySelector<HTMLDivElement>('#toast');

if (!editorRoot || !statusText || !statusIndicator || !wordCount || !characterCount || !tabListElement || !dialog || !toast) {
  throw new Error('The application interface could not be initialized.');
}

const tabList: HTMLDivElement = tabListElement;

interface DocumentTab {
  id: string;
  markdown: string;
  savedMarkdown: string;
  path: string | null;
  lastOperationFailed: boolean;
}

let editor: Crepe | undefined;
let markdown = '';
let savedMarkdown = '';
let activePath: string | null = null;
let activeDocumentId: string | null = null;
let tabSwitchPending = false;
const tabs: DocumentTab[] = [];
const closedTabs: DocumentTab[] = [];
const savingDocumentIds = new Set<string>();
let closeRequestPending = false;
let alwaysOnTopEnabled = false;
let screenPrivacyEnabled = false;
let screenPrivacyTransitionPending = false;
let screenPrivacyPendingState: boolean | undefined;
let queuedScreenPrivacyState: boolean | undefined;
let appearanceTheme: 'light' | 'dark' = 'light';
let windowOpacityPercent = MAX_WINDOW_OPACITY_PERCENT;
let opacityRequestId = 0;
let toastTimer: number | undefined;
let dialogResolver: ((decision: CloseDecision) => void) | undefined;
let dialogOpener: HTMLElement | null = null;

function plainText(): string {
  return editorRoot?.querySelector('.editor')?.textContent ?? '';
}

function refreshCounts(): void {
  const text = plainText();
  if (wordCount) wordCount.textContent = String(countWords(text));
  if (characterCount) characterCount.textContent = String(countCharacters(text));
}

function refreshStatus(message?: string): void {
  storeActiveTab();
  const dirty = isDocumentDirty({ current: markdown, saved: savedMarkdown });
  const activeTab = getActiveTab();
  const isSaving = activeDocumentId !== null && savingDocumentIds.has(activeDocumentId);
  const operationFailed = activeTab?.lastOperationFailed ?? false;
  const status = isSaving ? 'Saving...' : message ?? (operationFailed ? 'Last operation failed' : dirty ? 'Unsaved changes' : 'All changes saved');
  if (statusText) statusText.textContent = status;
  if (statusIndicator) {
    statusIndicator.dataset.state = isSaving ? 'saving' : operationFailed ? 'error' : dirty ? 'dirty' : 'clean';
  }
  updateTabIndicators();
}

function showToast(message: string): void {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toast) toast.hidden = true;
  }, 5200);
}

function createDocumentTab(): DocumentTab {
  return { id: crypto.randomUUID(), markdown: '', savedMarkdown: '', path: null, lastOperationFailed: false };
}

function getActiveTab(): DocumentTab | undefined {
  return tabs.find((tab) => tab.id === activeDocumentId);
}

function getTabTitle(tab: DocumentTab, index: number): string {
  return tab.path?.split(/[\\/]/u).pop() ?? 'Unknown';
}

function updateTabIndicators(): void {
  for (const [index, tab] of tabs.entries()) {
    const item = Array.from(tabList.children).find(
      (child): child is HTMLElement => child instanceof HTMLElement && child.dataset.documentId === tab.id,
    );
    if (!item) continue;
    const title = getTabTitle(tab, index);
    const dirty = isDocumentDirty({ current: tab.markdown, saved: tab.savedMarkdown });
    const titleElement = item.querySelector<HTMLElement>('.tab-title');
    const dirtyElement = item.querySelector<HTMLElement>('.tab-dirty');
    if (titleElement) titleElement.textContent = title;
    if (dirtyElement) dirtyElement.hidden = !dirty;
    item.setAttribute('aria-label', `${title}${dirty ? ', unsaved changes' : ''}`);
    item.setAttribute('aria-selected', String(tab.id === activeDocumentId));
    item.tabIndex = tab.id === activeDocumentId ? 0 : -1;
    const closeButton = item.querySelector<HTMLButtonElement>('.tab-close-button');
    if (closeButton) {
      closeButton.setAttribute('aria-label', `Close ${title} tab`);
      closeButton.title = `Close ${title} tab (Ctrl+W)`;
    }
  }
}

function renderTabs(): void {
  tabList.replaceChildren();
  for (const [index, tab] of tabs.entries()) {
    const title = getTabTitle(tab, index);
    const item = document.createElement('div');
    item.className = 'document-tab';
    item.setAttribute('role', 'tab');
    item.dataset.documentId = tab.id;
    const mark = document.createElement('span');
    mark.className = 'tab-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'M';
    const titleElement = document.createElement('span');
    titleElement.className = 'tab-title';
    titleElement.textContent = title;
    const dirty = document.createElement('span');
    dirty.className = 'tab-dirty';
    dirty.setAttribute('aria-hidden', 'true');
    const closeButton = document.createElement('button');
    closeButton.className = 'tab-close-button';
    closeButton.type = 'button';
    closeButton.dataset.closeDocumentId = tab.id;
    closeButton.textContent = '×';
    item.append(mark, titleElement, dirty, closeButton);
    tabList.append(item);
  }
  updateTabIndicators();
}

function storeActiveTab(): void {
  const tab = getActiveTab();
  if (!tab) return;
  if (editor) markdown = editor.getMarkdown();
  tab.markdown = markdown;
  tab.savedMarkdown = savedMarkdown;
  tab.path = activePath;
  window.meetingNotes?.setDocumentDirty(tab.id, isDocumentDirty({ current: markdown, saved: savedMarkdown }));
}

function updateToggleButton(
  button: HTMLButtonElement | null,
  enabled: boolean,
  label: string,
  shortcut: string,
  enabledDetail?: string,
  disabledDetail?: string,
): void {
  if (!button) return;
  const state = enabled ? 'enabled' : 'disabled';
  const detail = enabled ? enabledDetail : disabledDetail;
  const accessibleDetail = detail ? `, ${detail}` : '';
  const tooltipDetail = detail ? `; ${detail}` : '';
  button.dataset.state = enabled ? 'on' : 'off';
  button.setAttribute('aria-pressed', String(enabled));
  button.setAttribute('aria-label', `${label} ${state}${accessibleDetail} (${shortcut})`);
  button.title = `${label} (${state}${tooltipDetail}; ${shortcut})`;
}

function configureWindowToggles(): void {
  const platform = navigator.platform || 'linux';
  updateToggleButton(alwaysOnTopButton, alwaysOnTopEnabled, 'Always on top', 'Ctrl+Shift+Alt+T');
  updateScreenPrivacyButton();
  if (screenPrivacyButton) {
    const isSupported = supportsScreenPrivacy(platform);
    screenPrivacyButton.disabled = !isSupported;
    if (!isSupported) {
      screenPrivacyButton.title = 'Screen privacy is not supported on this platform (Ctrl+Shift+Alt+P)';
      screenPrivacyButton.setAttribute('aria-label', 'Screen privacy unsupported on this platform (Ctrl+Shift+Alt+P)');
      screenPrivacyButton.dataset.state = 'off';
      screenPrivacyButton.setAttribute('aria-pressed', 'false');
    }
  }
}

function updateScreenPrivacyButton(): void {
  updateToggleButton(
    screenPrivacyButton,
    screenPrivacyEnabled,
    'Screen privacy',
    'Ctrl+Shift+Alt+P',
    'minimize disabled; double-click to disable',
    'single-click to enable',
  );
}

function requestedScreenPrivacyState(): boolean {
  return queuedScreenPrivacyState ?? screenPrivacyPendingState ?? screenPrivacyEnabled;
}

async function applyScreenPrivacyState(enabled: boolean): Promise<void> {
  if (!window.meetingNotes) {
    showToast('Screen privacy is available in the desktop app.');
    return;
  }
  if (!supportsScreenPrivacy(navigator.platform || 'linux')) {
    showToast('Screen privacy is not supported on this platform.');
    return;
  }
  try {
    const applied = await window.meetingNotes.setScreenPrivacy(enabled);
    if (!applied) throw new Error('toggle failed');
    screenPrivacyEnabled = enabled;
    updateScreenPrivacyButton();
    showToast(enabled ? 'Screen privacy enabled. Minimizing is disabled.' : 'Screen privacy disabled. Minimizing is restored.');
  } catch {
    showToast('This platform could not change its screen privacy mode.');
  }
}

function requestScreenPrivacyState(enabled: boolean): void {
  if (screenPrivacyTransitionPending) {
    queuedScreenPrivacyState = enabled;
    return;
  }
  if (screenPrivacyEnabled === enabled) return;

  screenPrivacyTransitionPending = true;
  screenPrivacyPendingState = enabled;
  void applyScreenPrivacyState(enabled).finally(() => {
    screenPrivacyTransitionPending = false;
    screenPrivacyPendingState = undefined;
    const queuedState = queuedScreenPrivacyState;
    queuedScreenPrivacyState = undefined;
    if (queuedState !== undefined && queuedState !== screenPrivacyEnabled) {
      requestScreenPrivacyState(queuedState);
    }
  });
}

function updateThemeToggle(): void {
  document.documentElement.dataset.theme = appearanceTheme;
  if (!themeToggleButton) return;
  themeToggleButton.textContent = appearanceTheme === 'dark' ? '☀' : '☾';
  themeToggleButton.setAttribute('aria-pressed', String(appearanceTheme === 'dark'));
  themeToggleButton.title = `Dark theme (${appearanceTheme === 'dark' ? 'enabled' : 'disabled'}; Ctrl+Shift+Alt+D)`;
}

function configureOpacitySlider(): void {
  if (!opacitySlider) return;
  opacitySlider.min = String(MIN_WINDOW_OPACITY_PERCENT);
  opacitySlider.max = String(MAX_WINDOW_OPACITY_PERCENT);
  const supported = supportsWindowOpacity(navigator.platform || 'linux');
  opacitySlider.disabled = !supported || !window.meetingNotes;
  updateOpacityReadout(windowOpacityPercent);
  if (!supported) {
    opacitySlider.title = 'Window transparency is not supported on this platform';
    opacitySlider.setAttribute('aria-label', 'Window opacity unsupported on this platform');
  } else if (!window.meetingNotes) {
    opacitySlider.title = 'Window transparency is available in the desktop app';
  } else {
    opacitySlider.title = 'Window opacity (Ctrl+Shift+Alt+O to focus; use arrow keys to adjust)';
  }
}

function updateOpacityReadout(percent: number): void {
  if (opacitySlider) {
    opacitySlider.value = String(percent);
    opacitySlider.setAttribute('aria-valuetext', `${percent}% opacity`);
  }
  if (opacityValue) opacityValue.value = `${percent}%`;
}

async function applyWindowOpacity(): Promise<void> {
  if (!opacitySlider || !isValidWindowOpacity(Number(opacitySlider.value))) return;
  const requestedPercent = Number(opacitySlider.value);
  const requestId = ++opacityRequestId;
  if (opacitySlider) {
    opacitySlider.setAttribute('aria-valuetext', `${requestedPercent}% opacity`);
    if (opacityValue) opacityValue.value = `${requestedPercent}%`;
  }
  try {
    const applied = await window.meetingNotes.setWindowOpacity(requestedPercent);
    if (requestId !== opacityRequestId) return;
    if (!applied) throw new Error('opacity update failed');
    windowOpacityPercent = requestedPercent;
    updateOpacityReadout(windowOpacityPercent);
  } catch {
    if (requestId !== opacityRequestId) return;
    updateOpacityReadout(windowOpacityPercent);
    showToast('Window opacity could not be changed. The previous setting remains active.');
  }
}

function toggleTheme(): void {
  appearanceTheme = nextAppearanceTheme(appearanceTheme);
  updateThemeToggle();
}

function bindOtherToolsShortcuts(): void {
  const controller = new AbortController();
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const action = resolveOtherToolsShortcut({
      code: event.code,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      isComposing: event.isComposing,
      altGraph: event.getModifierState('AltGraph'),
    });
    if (!action) return;
    event.preventDefault();
    if (action === 'always-on-top') alwaysOnTopButton?.click();
    if (action === 'screen-privacy') screenPrivacyButton?.click();
    if (action === 'theme') themeToggleButton?.click();
    if (action === 'opacity') opacitySlider?.focus();
  }, { signal: controller.signal });
  window.addEventListener('beforeunload', () => controller.abort(), { once: true });
}

function setupResponsiveFormatToolbar(): void {
  const toolbar = document.querySelector<HTMLElement>('.toolbar');
  const formatToolbar = document.querySelector<HTMLElement>('.format-toolbar');
  const overflow = document.querySelector<HTMLElement>('#format-overflow');
  const overflowToggle = document.querySelector<HTMLButtonElement>('#format-overflow-toggle');
  const overflowMenu = document.querySelector<HTMLDivElement>('#format-overflow-menu');
  if (!toolbar || !formatToolbar || !overflow || !overflowToggle || !overflowMenu) return;

  const groups = Array.from(formatToolbar.querySelectorAll<HTMLElement>(':scope > .format-group'));
  if (groups.length === 0) return;

  const closeMenu = (restoreFocus = false): void => {
    overflowMenu.hidden = true;
    overflowToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) overflowToggle.focus();
  };

  const updateLayout = (): void => {
    const wasOpen = !overflowMenu.hidden;
    const focusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusedGroup = groups.find((group) => focusedElement && group.contains(focusedElement));

    groups.forEach((group) => formatToolbar.append(group));
    overflowMenu.hidden = true;
    overflowToggle.hidden = true;
    overflowToggle.setAttribute('aria-expanded', 'false');

    const candidates = [...groups].sort(
      (left, right) => Number(right.dataset.overflowPriority) - Number(left.dataset.overflowPriority),
    );
    for (const group of candidates) {
      if (formatToolbar.scrollWidth <= formatToolbar.clientWidth) break;
      overflowToggle.hidden = false;
      overflowMenu.append(group);
    }

    const hasOverflow = overflowMenu.childElementCount > 0;
    overflow.hidden = !hasOverflow;
    overflowToggle.hidden = !hasOverflow;
    const keepMenuOpen = hasOverflow && (wasOpen || (focusedGroup !== undefined && overflowMenu.contains(focusedGroup)));
    overflowMenu.hidden = !keepMenuOpen;
    overflowToggle.setAttribute('aria-expanded', String(keepMenuOpen));
    if (focusedElement?.isConnected && focusedGroup) focusedElement.focus({ preventScroll: true });
  };

  let scheduledFrame = 0;
  const scheduleLayout = (): void => {
    if (scheduledFrame) return;
    scheduledFrame = window.requestAnimationFrame(() => {
      scheduledFrame = 0;
      updateLayout();
    });
  };

  overflowToggle.addEventListener('click', () => {
    const isExpanded = overflowToggle.getAttribute('aria-expanded') === 'true';
    overflowMenu.hidden = isExpanded;
    overflowToggle.setAttribute('aria-expanded', String(!isExpanded));
  });
  overflowMenu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-command]')) closeMenu(true);
  });
  overflowMenu.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement) closeMenu(true);
  });
  document.addEventListener('click', (event) => {
    if (!overflow.contains(event.target as Node)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overflowMenu.hidden) {
      event.preventDefault();
      closeMenu(true);
    }
  });

  const observer = new ResizeObserver(scheduleLayout);
  observer.observe(toolbar);
  const otherTools = document.querySelector<HTMLElement>('.other-tools');
  if (otherTools) observer.observe(otherTools);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame);
  }, { once: true });
  void document.fonts?.ready.then(scheduleLayout);
  updateLayout();
}

function focusEditor(): void {
  editorRoot?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
}

async function mountEditor(initialMarkdown: string, beforeSwap?: () => Promise<boolean>): Promise<void> {
  const candidateRoot = document.createElement('div');
  editorRoot?.append(candidateRoot);
  const candidate = new Crepe({
    root: candidateRoot,
    defaultValue: initialMarkdown,
    features: editorFeatures,
  });
  candidate.on((listener) => {
    listener.markdownUpdated((_ctx, updatedMarkdown) => {
      if (editor !== candidate) return;
      markdown = updatedMarkdown;
      refreshCounts();
      refreshStatus();
    });
  });
  try {
    await candidate.create();
    if (beforeSwap && !(await beforeSwap())) throw new Error('The selected document could not be activated.');
  } catch (error) {
    candidate.destroy();
    candidateRoot.remove();
    throw error;
  }
  editor?.destroy();
  editorRoot?.replaceChildren(candidateRoot);
  editor = candidate;
  editorRoot?.querySelector<HTMLElement>('[contenteditable="true"]')?.setAttribute('aria-label', 'Meeting notes document');
  markdown = candidate.getMarkdown();
  refreshCounts();
}

async function requestDecision(): Promise<CloseDecision> {
  if (!dialog) return 'cancel';
  if (dialogResolver) return 'cancel';
  dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.hidden = false;
  document.querySelector<HTMLButtonElement>('#cancel-decision')?.focus();
  return new Promise((resolve) => {
    dialogResolver = resolve;
  });
}

function finishDecision(decision: CloseDecision): void {
  const resolve = dialogResolver;
  dialogResolver = undefined;
  if (dialog) dialog.hidden = true;
  resolve?.(decision);
  dialogOpener?.focus();
  dialogOpener = null;
}

async function allowTransition(): Promise<boolean> {
  storeActiveTab();
  if (!isDocumentDirty({ current: markdown, saved: savedMarkdown })) return true;
  const decision = await requestDecision();
  if (decision === 'cancel') return false;
  if (decision === 'discard') return true;
  return await saveDocument(false);
}

function applySaveResult(documentId: string, result: OperationResult<{ path: string }>, snapshot: string): boolean {
  const tab = tabs.find((candidate) => candidate.id === documentId);
  if (!tab) return false;
  if (result.status === 'cancelled') {
    tab.lastOperationFailed = false;
    if (activeDocumentId === documentId) refreshStatus();
    return false;
  }
    if (result.status === 'error') {
      tab.lastOperationFailed = true;
    if (activeDocumentId === documentId) refreshStatus('Save failed');
    updateTabIndicators();
    showToast(result.error.message);
    return false;
  }
  tab.path = result.value.path;
  tab.savedMarkdown = snapshot;
  tab.lastOperationFailed = false;
  if (activeDocumentId === documentId) {
    activePath = result.value.path;
    savedMarkdown = snapshot;
    refreshStatus();
  } else {
    updateTabIndicators();
  }
  return true;
}

async function saveDocument(forceSaveAs: boolean): Promise<boolean> {
  const tab = getActiveTab();
  if (!tab || savingDocumentIds.has(tab.id)) return false;
  storeActiveTab();
  const documentId = tab.id;
  const snapshot = tab.markdown;
  savingDocumentIds.add(documentId);
  refreshStatus();
  try {
    const result = forceSaveAs
      ? await window.meetingNotes.saveDocumentAs(documentId, snapshot)
      : await window.meetingNotes.saveDocument(documentId, snapshot);
    const saved = applySaveResult(documentId, result, snapshot);
    const savedTab = tabs.find((candidate) => candidate.id === documentId);
    return saved && savedTab !== undefined && !isDocumentDirty({ current: savedTab.markdown, saved: savedTab.savedMarkdown });
  } catch {
    tab.lastOperationFailed = true;
    if (activeDocumentId === documentId) refreshStatus('Save failed');
    showToast('Could not save this file. Your changes are still open; try again or choose Save As.');
    return false;
  } finally {
    savingDocumentIds.delete(documentId);
    if (activeDocumentId === documentId) refreshStatus();
  }
}

async function openDocument(): Promise<void> {
  if (!activeDocumentId || !(await allowTransition())) return;
  const documentId = activeDocumentId;
  const markdownBeforeOpen = markdown;
  let result: OperationResult<{ documentId: string; token: string; path: string; markdown: string }>;
  try {
    result = await window.meetingNotes.openDocument(documentId);
  } catch {
    showToast('Could not open a file. Try again.');
    return;
  }
  if (result.status === 'cancelled') return;
  if (result.status === 'error') {
    const tab = getActiveTab();
    if (tab) tab.lastOperationFailed = true;
    refreshStatus();
    showToast(result.error.message);
    return;
  }
  if (markdown !== markdownBeforeOpen) {
    showToast('This note changed while the Open dialog was active. Save it before opening another file.');
    return;
  }
  try {
    await mountEditor(result.value.markdown, async () => {
      if (markdown !== markdownBeforeOpen) return false;
      return await window.meetingNotes.acceptOpenedDocument(documentId, result.value.token);
    });
    const tab = getActiveTab();
    if (tab) {
      tab.path = result.value.path;
      tab.markdown = result.value.markdown;
      tab.savedMarkdown = result.value.markdown;
      tab.lastOperationFailed = false;
    }
    activePath = result.value.path;
    savedMarkdown = result.value.markdown;
    refreshStatus();
    focusEditor();
  } catch {
    const tab = getActiveTab();
    if (tab) tab.lastOperationFailed = true;
    refreshStatus('Open failed');
    showToast('The file could not be loaded into the editor. Your current note is still available.');
  }
}

async function createNewTab(preserveActiveEditor = true): Promise<void> {
  if (tabSwitchPending || closeRequestPending) return;
  if (preserveActiveEditor) storeActiveTab();
  const previousDocumentId = activeDocumentId;
  const tab = createDocumentTab();
  try {
    const registered = await window.meetingNotes.startNewDocument(tab.id);
    if (!registered) throw new Error('tab registration failed');
  } catch {
    showToast('A new tab could not be created. Your current tabs are still open.');
    return;
  }

  tabs.push(tab);
  activeDocumentId = tab.id;
  markdown = tab.markdown;
  savedMarkdown = tab.savedMarkdown;
  activePath = tab.path;
  renderTabs();

  try {
    await mountEditor('');
  } catch {
    tabs.pop();
    activeDocumentId = previousDocumentId;
    const previousTab = getActiveTab();
    markdown = previousTab?.markdown ?? '';
    savedMarkdown = previousTab?.savedMarkdown ?? '';
    activePath = previousTab?.path ?? null;
    renderTabs();
    if (previousTab) await mountEditor(previousTab.markdown);
    window.meetingNotes.closeDocument(tab.id);
    showToast('The new tab could not be initialized. Existing tabs are unchanged.');
    return;
  }

  tab.lastOperationFailed = false;
  renderTabs();
  refreshStatus();
  focusEditor();
}

async function activateTab(documentId: string): Promise<void> {
  const tab = tabs.find((candidate) => candidate.id === documentId);
  if (!tab) return;
  if (activeDocumentId === documentId) {
    focusEditor();
    return;
  }
  if (tabSwitchPending) return;

  storeActiveTab();
  const previousDocumentId = activeDocumentId;
  tabSwitchPending = true;
  activeDocumentId = tab.id;
  markdown = tab.markdown;
  savedMarkdown = tab.savedMarkdown;
  activePath = tab.path;
  try {
    await mountEditor(tab.markdown);
    tab.lastOperationFailed = false;
    renderTabs();
    refreshStatus();
    focusEditor();
  } catch {
    activeDocumentId = previousDocumentId;
    const previousTab = getActiveTab();
    markdown = previousTab?.markdown ?? '';
    savedMarkdown = previousTab?.savedMarkdown ?? '';
    activePath = previousTab?.path ?? null;
    renderTabs();
    refreshStatus();
    tabSwitchPending = false;
    showToast('This tab could not be loaded. Its saved content remains available.');
    return;
  }
  tabSwitchPending = false;
}

async function closeTab(documentId: string): Promise<void> {
  if (tabSwitchPending || closeRequestPending) return;
  if (documentId !== activeDocumentId) await activateTab(documentId);
  storeActiveTab();
  const tab = tabs.find((candidate) => candidate.id === documentId);
  if (!tab || documentId !== activeDocumentId) return;

  if (isDocumentDirty({ current: markdown, saved: savedMarkdown })) {
    const decision = await requestDecision();
    if (decision === 'cancel') return;
    if (decision === 'save' && !(await saveDocument(false))) return;
    if (decision === 'discard') {
      tab.markdown = tab.savedMarkdown;
      window.meetingNotes.setDocumentDirty(tab.id, false);
    }
  }

  const tabIndex = tabs.indexOf(tab);
  if (tabs.length === 1) {
    await createNewTab(false);
    if (tabs.length === 1) return;
  }

  closedTabs.push({ ...tab });
  if (closedTabs.length > 20) {
    const expired = closedTabs.shift();
    if (expired && !tabs.some((candidate) => candidate.id === expired.id)) {
      window.meetingNotes.closeDocument(expired.id);
    }
  }
  tabs.splice(tabIndex, 1);
  window.meetingNotes.setDocumentDirty(tab.id, false);

  renderTabs();
  const nextTab = tabs[Math.min(tabIndex, tabs.length - 1)];
  await activateTab(nextTab.id);
}

async function reopenClosedTab(): Promise<void> {
  if (tabSwitchPending || closeRequestPending) return;
  const tab = closedTabs.pop();
  if (!tab) return;
  tabs.push(tab);
  renderTabs();
  await activateTab(tab.id);
}

function cycleTab(direction: -1 | 1): void {
  if (tabs.length < 2 || !activeDocumentId) return;
  const index = tabs.findIndex((tab) => tab.id === activeDocumentId);
  const nextIndex = (index + direction + tabs.length) % tabs.length;
  void activateTab(tabs[nextIndex].id);
}

function bindTabActions(): void {
  tabList?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const closeButton = target?.closest<HTMLButtonElement>('[data-close-document-id]');
    if (closeButton) {
      event.stopPropagation();
      void closeTab(closeButton.dataset.closeDocumentId ?? '');
      return;
    }
    const tab = target?.closest<HTMLElement>('[data-document-id]');
    if (tab?.dataset.documentId) void activateTab(tab.dataset.documentId);
  });

  tabList?.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const tabElement = target?.closest<HTMLElement>('[role="tab"][data-document-id]');
    if (!tabElement || target?.closest('[data-close-document-id]')) return;
    const index = tabs.findIndex((tab) => tab.id === tabElement.dataset.documentId);
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (event.key === 'Delete' && tabElement.dataset.documentId) {
      event.preventDefault();
      void closeTab(tabElement.dataset.documentId);
      return;
    }
    if (nextIndex !== undefined && tabs[nextIndex]) {
      event.preventDefault();
      void activateTab(tabs[nextIndex].id);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.code === 'KeyT' && event.shiftKey) {
      event.preventDefault();
      void reopenClosedTab();
    } else if (event.code === 'KeyT') {
      event.preventDefault();
      void createNewTab();
    } else if (event.code === 'KeyW' && !event.shiftKey) {
      event.preventDefault();
      if (activeDocumentId) void closeTab(activeDocumentId);
    } else if (event.code === 'Tab') {
      event.preventDefault();
      cycleTab(event.shiftKey ? -1 : 1);
    }
  });
}

async function runCommand(command: AppCommand): Promise<void> {
  if (command === 'new-tab') await createNewTab();
  if (command === 'open') await openDocument();
  if (command === 'save') await saveDocument(false);
  if (command === 'save-as') await saveDocument(true);
}

function runEditorCommand(command: Parameters<typeof callCommand>[0], payload?: unknown): void {
  if (!editor) return;
  editor.editor.action((ctx) => {
    const commandManager = ctx.get(commandsCtx);
    commandManager.call(command, payload);
  });
}

function bindShortcuts(): void {
  editorRoot?.addEventListener('keydown', (event) => {
    if (event.isComposing || !(event.ctrlKey || event.metaKey)) return;

    if (event.altKey && ['Digit1', 'Digit2', 'Digit3'].includes(event.code)) {
      event.preventDefault();
      runEditorCommand(wrapInHeadingCommand.key, Number(event.code.slice(-1)));
      return;
    }
    if (!event.shiftKey) return;

    const actions: Record<string, () => void> = {
      Digit7: () => runEditorCommand(wrapInOrderedListCommand.key),
      Digit8: () => runEditorCommand(wrapInBulletListCommand.key),
      Period: () => runEditorCommand(wrapInBlockquoteCommand.key),
      KeyC: () => runEditorCommand(toggleInlineCodeCommand.key),
      KeyH: () => runEditorCommand(insertHrCommand.key),
      KeyB: () => runEditorCommand(createCodeBlockCommand.key),
    };
    const action = actions[event.code];
    if (action) {
      event.preventDefault();
      action();
    }
  });
  editorRoot?.addEventListener('keydown', (event) => {
    if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
    if (event.code !== 'KeyK') return;
    event.preventDefault();
    const href = window.prompt('Enter a link URL');
    if (href?.trim()) runEditorCommand(toggleLinkCommand.key, { href: href.trim() });
  });
}

function bindToolbarActions(): void {
  document.querySelector('#new-button')?.addEventListener('click', () => void createNewTab());
  document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const commands: Record<string, () => void> = {
        undo: () => runEditorCommand(undoCommand.key),
        redo: () => runEditorCommand(redoCommand.key),
        bold: () => runEditorCommand(toggleStrongCommand.key),
        italic: () => runEditorCommand(toggleEmphasisCommand.key),
        strike: () => runEditorCommand(toggleStrikethroughCommand.key),
        'bullet-list': () => runEditorCommand(wrapInBulletListCommand.key),
        'ordered-list': () => runEditorCommand(wrapInOrderedListCommand.key),
        quote: () => runEditorCommand(wrapInBlockquoteCommand.key),
        'inline-code': () => runEditorCommand(toggleInlineCodeCommand.key),
        'code-block': () => runEditorCommand(createCodeBlockCommand.key),
        link: insertLink,
        rule: () => runEditorCommand(insertHrCommand.key),
      };
      const command = button.dataset.command;
      if (command) commands[command]?.();
    });
  });
  document.querySelector<HTMLSelectElement>('#heading-style')?.addEventListener('change', (event) => {
    const level = (event.currentTarget as HTMLSelectElement).value;
    if (level === 'paragraph') runEditorCommand(turnIntoTextCommand.key);
    else runEditorCommand(wrapInHeadingCommand.key, Number(level));
    focusEditor();
  });
  themeToggleButton?.addEventListener('click', toggleTheme);
  opacitySlider?.addEventListener('input', () => void applyWindowOpacity());
  document.querySelector('#cancel-decision')?.addEventListener('click', () => finishDecision('cancel'));
  document.querySelector('#discard-decision')?.addEventListener('click', () => finishDecision('discard'));
  document.querySelector('#save-decision')?.addEventListener('click', () => finishDecision('save'));
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) finishDecision('cancel');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dialog && !dialog.hidden) finishDecision('cancel');
  });
  dialog?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  alwaysOnTopButton?.addEventListener('click', async () => {
    if (!window.meetingNotes) {
      showToast('Always-on-top is available in the desktop app.');
      return;
    }
    const nextState = !alwaysOnTopEnabled;
    try {
      const applied = await window.meetingNotes.setAlwaysOnTop(nextState);
      if (!applied) throw new Error('toggle failed');
      alwaysOnTopEnabled = nextState;
      updateToggleButton(alwaysOnTopButton, alwaysOnTopEnabled, 'Always on top', 'Ctrl+Shift+Alt+T');
      showToast(nextState ? 'Window pinned above other apps.' : 'Always-on-top turned off.');
    } catch {
      showToast('The window could not change its always-on-top state.');
    }
  });

  const platform = navigator.platform || 'linux';
  if (screenPrivacyButton) {
    const supportsPrivacy = supportsScreenPrivacy(platform);
    screenPrivacyButton.disabled = !supportsPrivacy;
    if (!supportsPrivacy) {
      screenPrivacyButton.title = 'Screen privacy is not supported on this platform (Ctrl+Shift+Alt+P)';
      screenPrivacyButton.setAttribute('aria-label', 'Screen privacy unsupported on this platform (Ctrl+Shift+Alt+P)');
      screenPrivacyButton.dataset.state = 'off';
      screenPrivacyButton.setAttribute('aria-pressed', 'false');
    }
    screenPrivacyButton.addEventListener('click', (event) => {
      if (event.detail === 0) {
        requestScreenPrivacyState(!requestedScreenPrivacyState());
      } else if (!screenPrivacyEnabled && !screenPrivacyTransitionPending) {
        requestScreenPrivacyState(true);
      }
    });
    screenPrivacyButton.addEventListener('dblclick', () => {
      requestScreenPrivacyState(false);
    });
  }
}

function insertLink(): void {
  const href = window.prompt('Enter a link URL');
  if (href?.trim()) runEditorCommand(toggleLinkCommand.key, { href: href.trim() });
  focusEditor();
}

async function handleCloseRequest(): Promise<void> {
  if (closeRequestPending) return;
  closeRequestPending = true;
  storeActiveTab();
  const originalDocumentId = activeDocumentId;
  const dirtyDocumentIds = tabs
    .filter((tab) => isDocumentDirty({ current: tab.markdown, saved: tab.savedMarkdown }))
    .map((tab) => tab.id);

  for (const documentId of dirtyDocumentIds) {
    await activateTab(documentId);
    if (activeDocumentId !== documentId) {
      closeRequestPending = false;
      window.meetingNotes.resolveClose('cancel');
      return;
    }
    const decision = await requestDecision();
    if (decision === 'cancel') {
      if (originalDocumentId) await activateTab(originalDocumentId);
      closeRequestPending = false;
      window.meetingNotes.resolveClose('cancel');
      return;
    }
    if (decision === 'save' && !(await saveDocument(false))) {
      if (originalDocumentId) await activateTab(originalDocumentId);
      closeRequestPending = false;
      window.meetingNotes.resolveClose('cancel');
      return;
    }
    if (decision === 'discard') {
      markdown = savedMarkdown;
      const tab = getActiveTab();
      if (tab) tab.markdown = savedMarkdown;
      refreshStatus();
    }
  }
  window.meetingNotes.resolveClose('discard');
}

async function initialize(): Promise<void> {
  setupResponsiveFormatToolbar();
  bindToolbarActions();
  bindTabActions();
  bindShortcuts();
  configureWindowToggles();
  updateThemeToggle();
  configureOpacitySlider();
  bindOtherToolsShortcuts();
  window.meetingNotes?.onMenuCommand((command) => void runCommand(command));
  window.meetingNotes?.onCloseRequested(() => void handleCloseRequest());
  if (!window.meetingNotes) showToast('File actions are available in the desktop application.');
  const firstTab = createDocumentTab();
  try {
    const registered = await window.meetingNotes?.startNewDocument(firstTab.id);
    if (window.meetingNotes && !registered) throw new Error('tab registration failed');
    tabs.push(firstTab);
    activeDocumentId = firstTab.id;
    renderTabs();
    await mountEditor('');
  } catch {
    if (!tabs.includes(firstTab)) tabs.push(firstTab);
    activeDocumentId = firstTab.id;
    firstTab.lastOperationFailed = true;
    renderTabs();
    if (statusText) statusText.textContent = 'Editor could not start';
    if (statusIndicator) statusIndicator.dataset.state = 'error';
    showToast('A new document tab could not be initialized.');
    return;
  }
  savedMarkdown = markdown;
  refreshStatus();
}

void initialize();
