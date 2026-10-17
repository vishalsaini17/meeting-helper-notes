# System Architecture

## Purpose and Scope

Meeting Note Helper is a Windows desktop application for editing meeting notes as Markdown through a WYSIWYG interface. It is an offline-first local document editor. The first release supports multiple independent document tabs per window and multiple windows, local `.md` files, a light theme, native file dialogs, an editing toolbar, keyboard shortcuts, and document status in the status bar.

Out of scope unless explicitly approved: cloud sync, accounts, collaboration, databases, remote services, and plugins.

## Technology

- Electron for the desktop shell and Windows packaging.
- TypeScript for main, preload, shared contracts, and renderer application code.
- HTML and CSS for the interface.
- Milkdown with Crepe as the Markdown editing surface.
- `.md` as the native document format.

Exact framework versions, bundler, package manager, and installer technology are implementation choices to record once the repository is scaffolded.

## Process Responsibilities

### Main Process

- Own filesystem access and native open/save dialogs.
- Read and write UTF-8 Markdown files.
- Track document sessions by BrowserWindow and validated document ID so paths, dirty state, and close decisions remain independent across tabs and windows.
- Validate IPC requests, constrain operations to the selected document path, and return structured results.
- Handle operating-system window lifecycle and menu-level shortcuts where appropriate.

### Preload

- Expose only named, typed application capabilities through `contextBridge`.
- Translate renderer calls to narrowly scoped IPC channels and validate response shapes.
- Never expose `ipcRenderer`, `fs`, `path`, `process`, or a generic `send`/`invoke` bridge.

### Renderer

- Render the toolbar, editor, status bar, dialogs/messages, and accessible focus states.
- Host Milkdown/Crepe and maintain the current editable Markdown value.
- Calculate presentation-level counts and reflect document state returned by the document workflow.
- Request file operations only through the preload API.
- Expose window-level utility toggles for the current app state, such as always-on-top and screen-privacy mode.
- Have no direct Node.js or filesystem access.

### Shared Contracts

- Define the bridge API, request/response types, document status, and error codes in a shared TypeScript module that can be safely imported by preload and renderer.
- Keep contracts serializable across IPC; do not send class instances, editor objects, or Electron objects.

## Security Defaults

- `contextIsolation: true`.
- `nodeIntegration: false`.
- Renderer sandbox enabled where compatible with the selected Electron setup.
- A restrictive Content Security Policy; avoid `unsafe-eval` and remote code. Fonts are bundled locally; development permits the Vite server at `localhost:5173`.
- Register only the app's own trusted renderer content.
- Validate every IPC payload at the main-process boundary, including strings, paths, and operation state.
- Do not allow renderer-provided paths to bypass native selection. Save operations target the active document or a path returned by a native Save As dialog.
- Use atomic or otherwise failure-aware writes where practical, so a failed save does not truncate the user's existing document.
- Treat Markdown as text. Do not render arbitrary raw HTML as trusted executable UI.
- For Windows-specific privacy mode, use Electron's native window APIs instead of CSS-only overlays; call `BrowserWindow.setSkipTaskbar(true|false)` while the privacy mode is active to hide and restore taskbar visibility, and rely on `BrowserWindow.setContentProtection(true|false)` for the capture-protection behavior.

## Document State and Dirty Detection

The renderer owns each tab's latest editor text and persisted baseline. Main owns file paths and dirty metadata keyed by document ID within its BrowserWindow. A document is dirty when its current Markdown differs from the last successfully loaded or saved baseline. A successful save advances only that tab's baseline; a failed or cancelled save does not. New tabs begin with an empty baseline and no file path. Save As assigns a path only after the dialog returns a path and the write succeeds.

Represent operation states explicitly (for example `clean`, `dirty`, `saving`, and `error`) rather than deriving all status from a single Boolean. Serialize saves or prevent overlapping saves so an older write cannot incorrectly mark newer edits as saved.

## Data Flow

### Open

1. Renderer requests Open through preload.
2. Main process checks whether the current document needs a save/discard decision.
3. Main process displays the native open dialog filtered to Markdown files.
4. Main process reads the selected file and returns a one-time token, selected path, and UTF-8 contents, or a typed cancellation/error result. The path remains pending in main.
5. Renderer initializes Crepe with the contents. Only after successful initialization does it send the token back to main to commit the selected path, then establish the clean baseline.

### Save

1. Renderer submits the current Markdown and document ID through preload.
2. Main process validates the payload and writes to that tab's path, or displays the native Save As dialog if no path exists.
3. Main process returns the saved path on success, cancellation distinctly, or a structured error.
4. Renderer marks only the submitted tab clean if it still matches that tab's current content; edits made during the write remain dirty.

### Close or Quit

1. Main process asks the renderer to snapshot and inspect every tab before closing a window, avoiding reliance on a potentially stale dirty notification.
2. The user can save, discard, or cancel for each dirty tab.
3. A failed or cancelled save must not close the window as though it succeeded.

## User Interface Regions

- Application/menu actions: New, Open, Save, Save As, and Quit.
- Tab strip: create, select, and close tabs; each tab has independent editor content, file identity, and dirty state. Every window always has at least one tab. A blank untitled tab is labeled `Unknown`; closing the last tab replaces it with a new blank tab after unsaved-change decisions.
- Windows: `Ctrl+N` creates a separate window with its own initial blank `Unknown` tab. Windows do not share tab or document state.
- Toolbar: a single row with the formatting toolbar aligned left and an `other-tools` group aligned right.
- Formatting toolbar: app-owned heading, inline/block formatting, list, link, undo, and redo controls invoking Crepe/Milkdown commands. Keep frequent history, heading, inline-style, and list groups visible longest; move lower-priority formatting groups into an accessible overflow disclosure as space requires, and restore them when space returns.
- Other tools: always-on-top, screen-privacy, and theme toggles plus a window-opacity slider. Icon controls have accessible names, shortcut hints, and clear enabled/disabled states.
- Block reordering is not supported. Do not enable Crepe's BlockEdit feature or add custom drag-and-drop handlers.
- Editor: one responsive, keyboard-accessible Markdown WYSIWYG surface.
- Status bar: word count, character count, and current document status; include the active filename when space permits.
- Feedback: concise, accessible messages for cancellation-independent errors and unsaved-change decisions.

The light theme is the default at launch; the theme toggle changes the current session immediately and does not persist across launches. Window opacity starts at 100% and is adjustable from 25% through 100%, inclusive. Use a compact, information-dense layout: minimize outer margins, padding, gaps, and oversized controls; prioritize the editor area while preserving readable text, visible focus, and reachable controls at supported window sizes.

## Window Privacy and Focus Controls

The application includes two independent top-level window toggles:

- Always-on-top mode uses the native Electron `BrowserWindow.setAlwaysOnTop(true|false)` path so the window remains above other overlapping windows without relying on CSS stacking alone.
- Screen-privacy mode uses `BrowserWindow.setContentProtection(true|false)` on supported desktop platforms such as Windows and macOS to help prevent the window from appearing in screen-sharing and recording sessions. While enabled, it disables native minimizing; disabling privacy restores minimizing. On Windows, privacy mode also hides the window from the taskbar and taskbar preview while active. On unsupported platforms such as Linux, the toggle stays visible but is explicitly disabled and labeled as unsupported so the app remains in a clear, non-breaking state.

These settings remain independent from document state and do not interfere with editing, file operations, or the dirty-state workflow. Their state persists while the window is open, and the UI exposes the active/inactive state through accessible pressed states and tooltips.

## Theme and Window Opacity

- The renderer owns the light/dark theme presentation state. Launch in light mode; a toggle applies the selected palette immediately without changing document content or dirty state.
- The renderer requests window opacity through a named preload capability. Main validates integer percentages from 25 through 100 and applies them with `BrowserWindow.setOpacity(percent / 100)`.
- Opacity is available on Windows and macOS. On unsupported platforms, keep the slider visible but disabled with an accessible explanation. Failed native updates leave the last confirmed value in effect and show actionable feedback.
- Opacity resets to 100% on launch; do not persist window appearance settings unless separately approved.

## Failure Boundaries

- Dialog cancellation is a normal outcome, not an error.
- File read/write errors are returned as structured results and shown with a useful action or explanation.
- Screen-share privacy controls degrade gracefully on unsupported platforms and do not break the app.
- Editor initialization failures must not be reported as successful document loads.
- IPC failures leave the current document content and dirty state intact.
- Application shutdown can be cancelled if saving fails or the user chooses to continue editing.

## Architecture Acceptance Checks

- Renderer has no direct filesystem or Node.js access.
- Every exposed preload operation has a narrow purpose and a shared type contract.
- Opening, saving, Save As, cancellation, per-tab dirty tracking, tab close, and window close confirmation follow `docs/WORKFLOWS.md`.
- Counts and status are testable independently of visual presentation.
- Resizing and keyboard-only operation preserve access to editor and toolbar actions.
