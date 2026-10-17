# User and Execution Workflows

## Document States

- **Untitled, clean:** no file path; current content matches the initial empty baseline.
- **Saved, clean:** active path exists; current content matches the last successfully loaded/saved content.
- **Dirty:** current editor content differs from the persisted baseline.
- **Saving:** a write is in progress; edits remain possible or are deliberately gated, but must not be lost.
- **Error:** the last requested operation failed. Preserve the current editor contents and allow retry.

Cancellation is a result of an operation, not a document state. It must not change the baseline, active path, or content.

## Tabs and Windows

### Startup

1. Each new window initializes one independent, empty untitled tab before exposing an editable workspace.
2. The tab is labeled `Unknown` until a file is saved or opened. The editor, tab strip, and status area initialize together; startup failure is reported and does not present a partially initialized tab as ready.
3. Opening a file after startup loads it into the active tab. Startup does not automatically open a file unless a future approved file-association/command-line workflow is added.

### New Tab

1. User selects New Tab or presses `Ctrl+T`.
2. Create an independent empty untitled tab; keep every existing tab's content, path, and dirty state unchanged.
3. Complete the active editor's serialization and any in-progress tab switch before changing the active tab. If a tab transition is already in progress, defer or ignore another tab-management action rather than applying it to stale editor state.

### New Window

1. User presses `Ctrl+N` or chooses File > New Window.
2. Create a separate application window with one empty untitled tab. Do not share tabs or document identity across windows.
3. Each window owns its own tab registry and closed-tab history; closing or reopening a tab never affects another window.

### Switch Tabs

- Click a tab or use `Ctrl+Tab` / `Ctrl+Shift+Tab` for next / previous.
- Preserve the tab's editor content, saved baseline, path, and dirty status when switching.

### Close Tab

1. User closes the current tab with its close button or `Ctrl+W`.
2. If dirty, show Save / Don't Save / Cancel for that tab only. A cancelled or failed save leaves it open.
3. Save closes only after success. Don't Save discards unsaved edits for that tab. Cancel keeps it open.
4. Select the adjacent tab after close. Closing the last tab creates and activates a new blank `Unknown` tab in the same window, keeping the workspace available.
5. `Ctrl+Shift+T` reopens the most recently closed tab in the current window session; changes explicitly discarded during close are not restored.

## Open a Markdown File

1. User chooses Open or presses the Open shortcut.
2. Resolve any dirty current document using Save / Don't Save / Cancel.
3. On Save, proceed only after a successful save. A cancelled/failed save aborts opening.
4. Show a native open dialog filtered to `.md` and Markdown text files where supported.
5. If the dialog is cancelled, leave the current document unchanged.
6. Main reads the selected file as UTF-8 and returns its path and contents.
7. On read failure, keep the current document intact and show a helpful message with retry guidance.
8. On success, load the editor and set the loaded contents as the clean baseline.

## Edit and Format

1. User types or applies a toolbar/keyboard formatting command in Crepe.
2. The editor's Markdown representation updates the current document value.
3. Compare the current value to the persisted baseline and update clean/dirty status.
4. Recompute word and character counts from the current Markdown text using the documented counting rules.
5. Keep focus visible and keyboard navigation predictable across toolbar and editor.

Block drag-and-drop reordering is intentionally unavailable. Use the editor and formatting toolbar for supported document edits; do not expose draggable block handles.

## Save and Save As

### Save Existing Document

1. Save uses the current active path; Save on an untitled document follows Save As.
2. Submit a snapshot of the current Markdown to main.
3. Main validates and writes UTF-8 content. A failure must not falsely report success; use a write strategy that avoids truncation on failure where practical.
4. On success, update the active path if applicable and mark the saved snapshot as the baseline.
5. If the user edited during the write, compare the current text with the submitted snapshot and leave the document dirty.
6. On failure, preserve content and dirty status and show a useful error.

### Save As

1. Show a native save dialog with a `.md` default extension and sensible Markdown filters.
2. Cancellation leaves the path and dirty state unchanged.
3. Confirm overwrite through native dialog behavior or an explicit confirmation where needed.
4. Write the snapshot and assign the new active path only after success.

## Close or Quit

1. Before closing any window, main asks the renderer to snapshot and inspect every tab.
2. For each dirty tab, request Save / Don't Save / Cancel; Save follows the regular Save/Save As workflow.
3. Don't Save permits that tab to close; Cancel keeps the window open.
4. A cancelled or failed save keeps the window open and content available. Main only permits window close after all dirty tabs have been resolved.

## Error Messages

Messages should say what failed and what the user can do next, for example: “Could not save this file. Your changes are still open; check the folder permissions or choose Save As.” Avoid raw exception text as the only feedback. Do not show an error for a user-cancelled native dialog.

## Shortcuts

Shortcuts below are the initial Windows bindings. They are implemented in the Electron menu or editor; verify conflicts in the packaged Windows app before release. Toolbar and native menu alternatives remain available.

### Basic

| Action | Shortcut |
| --- | --- |
| New window | `Ctrl+N` |
| New tab | `Ctrl+T` |
| Close current tab | `Ctrl+W` |
| Reopen closed tab | `Ctrl+Shift+T` |
| Next tab | `Ctrl+Tab` |
| Previous tab | `Ctrl+Shift+Tab` |
| Open | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` |
| Bold | `Ctrl+B` |
| Italic | `Ctrl+I` |
| Insert link | `Ctrl+K` |
| Toggle always-on-top | `Ctrl+Shift+Alt+T` |
| Toggle screen privacy | `Ctrl+Shift+Alt+P` |
| Toggle light/dark theme | `Ctrl+Shift+Alt+D` |
| Focus window-opacity slider | `Ctrl+Shift+Alt+O` |

### Advanced Formatting

| Action | Shortcut |
| --- | --- |
| Heading level 1 | `Ctrl+Alt+1` |
| Heading level 2 | `Ctrl+Alt+2` |
| Heading level 3 | `Ctrl+Alt+3` |
| Toggle bullet list | `Ctrl+Shift+8` |
| Toggle numbered list | `Ctrl+Shift+7` |
| Toggle block quote | `Ctrl+Shift+.` |
| Toggle inline code | `Ctrl+Shift+C` |
| Insert code block | `Ctrl+Shift+B` |
| Insert horizontal rule | `Ctrl+Shift+H` |

Shortcut overlap is possible with browser conventions and editor bindings. Provide accessible toolbar/menu alternatives for every command. Do not intercept a shortcut while the user is composing text through an IME or when it conflicts with a platform command.

## Toolbar Scope

Provide clear, keyboard-accessible actions for:

- Undo and redo.
- Paragraph and heading levels 1-3.
- Bold, italic, and strikethrough.
- Bulleted and numbered lists.
- Block quote.
- Inline code and code block.
- Link insertion/editing.
- Horizontal rule.
- Always-on-top toggle.
- Screen-privacy toggle.
- Light/dark theme toggle.
- Window-opacity slider (25%-100%); use the slider's arrow keys to adjust it after focusing.

Use accessible names and tooltips, visible focus, and an active/pressed state for toggled formatting where the editor can report it. Keep toolbar controls compact and aligned. Keep undo/redo, heading, inline-style, and list groups visible at higher priority; move quote, code, link, and horizontal-rule groups into an accessible “More formatting” disclosure when the available width is insufficient. Recalculate on resize and restore groups to the main toolbar as space becomes available; do not lose or duplicate controls during a move.

## Window-State Toggles

### Always-on-Top

1. User clicks the always-on-top toggle icon in the toolbar.
2. The app asks the Electron window to enable or disable the native always-on-top behavior with `BrowserWindow.setAlwaysOnTop(...)`.
3. The button state updates immediately and communicates the enabled/disabled status through an accessible pressed state and tooltip.
4. If the window cannot be pinned for any reason, the app should show a brief explanatory message and leave the window in its prior state.
5. The toggle does not change the active document, file state, or dirty tracking.

### Screen Privacy

1. A single mouse click enables screen privacy; double-clicking the enabled control disables it. Keyboard activation and `Ctrl+Shift+Alt+P` remain a standard toggle in either direction.
2. The app requests native content protection for the current window when supported by the current desktop platform.
3. When enabled on Windows, the app also calls `BrowserWindow.setSkipTaskbar(true)` to hide the window from the taskbar and taskbar preview, reducing capture visibility while leaving the window accessible to the user.
4. While enabled, the app calls `BrowserWindow.setMinimizable(false)` so the protected window cannot be minimized. When disabled, it restores the minimize control with `setMinimizable(true)` along with normal taskbar presence and recording behavior.
5. If a native privacy update fails partway through, the app best-effort restores the previous privacy, taskbar, and minimize settings and reports failure without marking the toggle enabled.
6. Unsupported platforms leave the toggle disabled and show a clear “not supported on this platform” status instead of failing silently.
7. The toggle is independent of always-on-top mode and does not affect saved file or document workflows.
8. The tooltip and accessible name describe the current mouse gesture and retain the keyboard shortcut hint.

### Theme and Window Opacity

- The theme toggle immediately switches between light and dark palettes for the current session. Each new launch starts in light mode; changing theme does not change or save document content.
- The opacity slider starts at 100%. Changes are applied to the current native window immediately through main-process IPC. The allowed range is 25%-100%; Home selects 25% and End selects 100%. Values below 25% and fully transparent windows are never accepted.
- Windows and macOS support native opacity. On other platforms, keep the control visible but disabled and provide a clear accessible explanation. If an update fails, retain the last successfully applied value.
- Utility shortcuts use `Ctrl+Shift+Alt` combinations to avoid document editing bindings. They remain available while focus is in the editor; skip handling during IME composition and AltGraph input. The opacity shortcut focuses the slider, whose native arrow-key controls adjust its value.

## Status Bar and Counting Rules

- Word count: count non-empty groups of text separated by whitespace in the editor's plain-text representation; do not count Markdown syntax markers.
- Character count: count Unicode code points in the same plain-text representation, excluding editor-only UI and Markdown syntax markers. Confirm the implementation's Unicode handling in tests.
- Status: show `Untitled`, the active filename when available, and a clear clean/unsaved/saving/error indication. Do not rely on color alone.
- Update counts after edits and editor transactions without moving focus or causing noticeable typing lag.
