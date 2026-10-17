# Quality and Verification

## Quality Goals

- User edits are not lost through cancellation, failed operations, close prompts, or overlapping saves.
- Renderer privilege remains restricted; filesystem operations stay in main.
- Markdown formatting and serialization behave predictably for supported content.
- Toolbar, shortcuts, status, and file workflows remain usable with keyboard and assistive technology.
- Windows 10 and Windows 11 behavior is verified in packaged application builds.

## Test Layers

### Unit Tests

- Dirty-state transitions for new, loaded, edited, saved, failed, and cancelled operations.
- Save snapshot race: edits made during an in-flight save remain dirty.
- Word and character counting, including whitespace, punctuation, non-Latin text, emoji, and empty documents.
- IPC payload validation and error/result mapping.
- Shortcut-to-command mapping where not owned entirely by the editor library.

### Integration Tests

- Preload API exposes only approved methods and returns unsubscribe functions for listeners.
- Main-process file service handles open, save, Save As, cancellation, malformed requests, and filesystem errors.
- Window-state controls are exposed to the renderer and update the BrowserWindow configuration without affecting file operations or dirty tracking.
- Editor initializes with Markdown, applies representative formatting, and serializes content back to Markdown.
- Verify Crepe block handles and drag/drop affordances are absent while text editing and toolbar formatting remain functional.
- Dirty-document decisions correctly gate New, Open, and Close.
- Create, switch, close, and reopen tabs; verify each tab retains independent content, path, baseline, and dirty state.
- Verify `Ctrl+T`, `Ctrl+W`, `Ctrl+Shift+T`, `Ctrl+Tab`, and `Ctrl+Shift+Tab`, and confirm `Ctrl+N` opens a separate window.
- Close dirty tabs and windows using Save / Don't Save / Cancel; failed or cancelled saves must not discard content.
- Open the same path in two tabs and verify saving one does not alter the other tab's editor state or path.

### End-to-End Tests

- Create a note, format text, save as `.md`, close, reopen, and verify content.
- Open an existing Markdown document, edit, save, and verify the updated file.
- Cancel Open and Save As and verify the active document/path/state remain unchanged.
- Trigger a save failure and verify text remains available, status is not falsely clean, and recovery guidance is shown.
- Exercise dirty close/quit choices: save, discard, and cancel.
- Toggle always-on-top on and off and confirm the window stays above other windows when enabled, then returns to normal behavior when disabled.
- Toggle light/dark theme and verify the palette updates immediately, the pressed state and shortcut hint are accessible, and each new launch starts in light mode without changing document dirty state.
- Adjust window opacity at 25%, an intermediate value, and 100%; verify native opacity changes dynamically and the window never reaches 0% or accepts out-of-range IPC values.
- Verify unsupported platforms keep the opacity slider visible but disabled with an accessible explanation; verify native failures preserve the last confirmed value.
- Exercise `Ctrl+Shift+Alt+T`, `Ctrl+Shift+Alt+P`, `Ctrl+Shift+Alt+D`, and `Ctrl+Shift+Alt+O` outside IME composition and confirm the opacity shortcut focuses a slider that responds to arrow keys, Home, and End.
- Toggle screen privacy on and off on Windows and macOS and confirm the application enables or disables content protection without breaking notes editing.
- Verify one mouse click enables Screen Privacy, double-click disables it, and keyboard activation plus `Ctrl+Shift+Alt+P` still toggle it in either direction.
- While screen privacy is enabled, verify the native minimize control is disabled; when privacy is disabled, verify minimizing is restored.
- Simulate a native privacy-setting failure and verify the main process returns failure, rolls back already-applied privacy/taskbar/minimize settings where possible, and the renderer leaves the toggle off.
- On Windows, verify privacy mode hides the window from the taskbar and taskbar preview while active and restores normal window visibility when disabled.
- Verify unsupported platforms such as Linux keep the screen-privacy button disabled with a clear label instead of silently failing.
- Resize the window and confirm editor and toolbar controls remain usable.
- At wide, intermediate, and minimum window widths, verify the high-priority formatting groups remain visible, lower-priority groups move into “More formatting” without overflow, every overflow action works, and groups return automatically when width increases.
- Verify the overflow disclosure is keyboard reachable, announces expanded/collapsed state, supports Escape to close and restore focus, and preserves formatting keyboard shortcuts.
- Complete a keyboard-only workflow and verify focus indicators and toolbar/menu alternatives.

Use temporary files/directories for automated filesystem tests. Never depend on or overwrite a developer's real notes.

## Security Checks

- Assert `contextIsolation` is enabled and `nodeIntegration` is disabled in the production window configuration.
- Verify renderer cannot import Node.js modules or access filesystem APIs.
- Verify preload exposes only allowlisted methods and no generic IPC primitive.
- Test malformed IPC values and path manipulation attempts are rejected.
- Verify renderer navigation and content security policy prevent unintended remote content/code.
- Run `npm audit` and resolve known vulnerable dependency versions before release.
- Confirm errors displayed to users do not require exposing stack traces or secrets.

## Accessibility and Responsive Checks

- Keyboard tab order reaches menus/toolbar/editor/status-relevant controls without traps.
- Every icon-only toolbar action has an accessible name and tooltip; toggles expose state.
- Focus is visible and is not obscured by the toolbar or window chrome.
- Error and unsaved-state changes are available to assistive technology and not conveyed by color alone.
- Check 640x480 and a standard desktop viewport; verify the title, file, and formatting rows stay compact, the editor takes the remaining height, canvas padding stays at or below 16px, and no horizontal overflow or control overlap occurs.
- Check bulleted, numbered, task, and nested lists for compact line spacing, aligned markers, and readable multiline entries.

## Windows Release Verification

Run on Windows 10 and Windows 11 using the packaged build, not only the development server:

- Run `npm run package:win` and confirm it produces both the NSIS setup `.exe` and portable `.exe` under `release/`. On Linux, use `npm run package:win:portable` to build only the portable artifact.
- Install using the NSIS setup, launch from the Start Menu and desktop shortcuts, confirm operation without Node.js or developer tools, then uninstall and verify the app and shortcuts are removed without deleting user-created Markdown files.
- Run the portable executable on a clean Windows machine without a Node.js installation and confirm normal startup and document editing.
- Verify the installer can be run for an existing installation and that existing user Markdown files are untouched.

- Native Open and Save As dialogs, file filters, default extension, and cancellation.
- Read-only, missing, locked, permission-denied, and overwrite cases.
- Shortcut behavior and menu accelerators, including conflicts with Crepe/browser defaults.
- Dirty prompts during window close and application quit.
- Always-on-top behavior while other windows overlap the app and while switching applications.
- Screen privacy behavior with a local screen-sharing or recording session, including graceful fallback on unsupported configurations.
- Installer launch, app startup, file association behavior if configured, and clean uninstall.
- High-DPI scaling, window resizing, and light-theme contrast/focus visibility.

Record OS version, app build, and results for manual checks. Do not claim Windows compatibility from Linux-only tests.

The portable Windows executable may be generated from Linux when electron-builder tooling is available. The NSIS installer build also requires Wine on Linux; building on Windows avoids that host prerequisite. Successful cross-packaging does not replace installing and running the artifacts on Windows 10 and Windows 11.

## Completion Gate

For a behavior change, run the focused test first. Before merge/release, run the repository's available test suite, typecheck, lint, and production build. Run packaged Windows verification for release candidates. Document unavailable checks and environment limitations explicitly.