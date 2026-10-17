# Technical Decisions

This log records approved decisions and unresolved choices. Proposed decisions should be verified against the actual scaffold and user requirements before being treated as final.

## Accepted Product Constraints

### DEC-001: Windows Desktop Application

- **Status:** Accepted
- **Decision:** Target Windows 10 and Windows 11 using Electron.
- **Reason:** This is the specified application and platform.
- **Consequence:** Package and test on Windows; Linux development alone does not verify Windows dialogs, shortcuts, installers, or shutdown behavior.

### DEC-002: Markdown Files and WYSIWYG Editing

- **Status:** Accepted
- **Decision:** Use `.md` files and Milkdown with Crepe as the editing surface.
- **Reason:** Users should create formatted Markdown without manually writing syntax.
- **Consequence:** Test round-trip behavior for supported Markdown constructs and preserve unsupported content where possible.

### DEC-003: Main-Process Filesystem Boundary

- **Status:** Accepted
- **Decision:** Keep filesystem access in main and expose only narrow capabilities to renderer through a typed preload bridge.
- **Reason:** Minimize renderer privilege and keep file operations under application control.
- **Consequence:** All file operations and native dialogs require validated IPC contracts.

### DEC-004: Local-First Multi-Tab and Multi-Window Scope

- **Status:** Accepted; supersedes initial single-document scope
- **Decision:** Support multiple independent document tabs per window and multiple application windows, all using local files.
- **Reason:** Match familiar Windows Notepad behavior for New Tab, Close Tab, and New Window while preserving independent unsaved content.
- **Consequence:** Key main-process paths and dirty state by window and validated document ID. Resolve dirty state before closing tabs or windows; never share document state between windows.

### DEC-005: Light Theme Default

- **Status:** Accepted
- **Decision:** Launch in light mode and keep the theme toggle session-only; do not persist dark mode across launches.
- **Reason:** Specified default.
- **Consequence:** Ensure contrast and focus visibility in both palettes. Every launch starts in light mode, while users can switch palettes immediately during that session.

## Proposed Defaults to Confirm During Implementation

### DEC-006: Dirty Detection by Markdown Snapshot

- **Status:** Proposed
- **Decision:** Compare current editor Markdown serialization against the last successfully loaded/saved serialization.
- **Reason:** Simple and deterministic for each tab independently.
- **Consequence:** Save completion must record the exact written snapshot; later edits remain dirty. Verify Crepe serialization stability to avoid false dirty states.

### DEC-007: UTF-8 Text Files

- **Status:** Proposed
- **Decision:** Read and write Markdown as UTF-8 text and do not add app-specific metadata by default.
- **Reason:** Interoperable plain Markdown files.
- **Consequence:** Verify behavior for BOMs, line endings, and malformed UTF-8 according to selected APIs and document policy.

### DEC-008: Proposed Windows Shortcuts

- **Status:** Implemented; Windows verification pending
- **Decision:** Use the shortcut table in `docs/WORKFLOWS.md`; application commands are registered in the Electron menu and advanced formatting commands are handled in the editor.
- **Reason:** Provide direct access to common and advanced formatting.
- **Consequence:** Keep toolbar and menu alternatives, document final bindings, and verify in the packaged Windows app.

### DEC-009: Electron-Vite Scaffold

- **Status:** Accepted for initial implementation
- **Decision:** Use npm, Electron 44, Electron-Vite 6, TypeScript 5, and a vanilla HTML/CSS renderer. Use Milkdown Crepe 7.22 and bundle DM Sans and Newsreader fonts locally.
- **Reason:** This keeps the initial project small while matching the approved stack and avoiding remote font dependencies.
- **Consequence:** Windows packaging and behavior still require verification on Windows 10 and 11.

### DEC-010: Main-Owned Path and Open Handshake

- **Status:** Accepted
- **Decision:** Renderer save calls contain document text only. Main owns the active path. Open returns a one-time token and commits the selected path only after Crepe has initialized successfully.
- **Reason:** Keep arbitrary path access out of renderer and avoid replacing the active document before the new editor is ready.
- **Consequence:** Update the typed preload API and IPC validation together if document lifecycle behavior changes.

### DEC-011: Patched KaTeX Dependency

- **Status:** Accepted
- **Decision:** Override transitive KaTeX dependencies to the patched `0.19.x` line.
- **Reason:** npm audit identified a prototype-pollution advisory in the version initially pulled in by Crepe's math support.
- **Consequence:** Recheck the override when upgrading Milkdown and keep `npm audit` in release verification.

### DEC-012: No Block Drag-and-Drop

- **Status:** Accepted
- **Decision:** Disable Crepe's `BlockEdit` feature and do not implement custom block drag-and-drop behavior.
- **Reason:** Block reordering is not part of the requested editing workflow.
- **Consequence:** Crepe contains the BlockEdit implementation as an internal feature, so its transitive package cannot be removed without replacing the approved editor. Keep it disabled and expose no drag handles or event handlers.

### DEC-013: Compact Editing Layout

- **Status:** Accepted
- **Decision:** Use compact, consistent spacing across the title strip, file actions, formatting toolbar, editor canvas, dialogs, and status bar; let the document editor take priority over decorative margins and unused side regions.
- **Reason:** Maximize usable note-taking area while retaining readable typography and accessible controls.
- **Consequence:** Keep all regions responsive and verify the minimum supported window size as well as standard desktop layouts.

## Open Decisions

Resolve these during scaffold/implementation and update this log with the chosen option and rationale:

- Code-signing requirements for release distribution.
- Production CSP and navigation policy should be reviewed for each packaging/build configuration.
- Whether Save As should append `.md` automatically and how overwrite confirmation is presented.
- Behavior for UTF-8 BOMs, line endings, malformed input, and very large Markdown files.
- Final shortcut bindings after testing editor and platform conflicts in packaged Windows builds.
- Whether formatting actions with no selection wrap future typing or only apply to selected text.
- Whether counts include hidden/collapsed or non-text editor content; initial proposal is plain-text content only.
- Whether unsaved recovery/autosave is needed. It is not part of initial scope and must not be silently implemented as a replacement for explicit save behavior.

### DEC-014: Windows Distribution Packages

- **Status:** Accepted; packaged runtime verification pending
- **Decision:** Use electron-builder to produce Windows x64 NSIS installer and portable `.exe` artifacts. The NSIS installer will offer per-user installation location selection and create Start Menu and desktop shortcuts; its standard uninstaller removes the installed application and shortcuts.
- **Reason:** Provide both a conventional install/uninstall workflow and a standalone executable without requiring Node.js or development tools on target machines.
- **Consequence:** Build release artifacts with the Windows target and run install, launch, shortcut, update/overwrite, and uninstall checks on Windows 10 and Windows 11. Code signing remains an open release/distribution requirement.

### DEC-017: Windows-Style Tab and Window Shortcuts

- **Status:** Accepted
- **Decision:** Use `Ctrl+T` for a new tab, `Ctrl+W` to close the current tab, `Ctrl+Shift+T` to reopen the last closed tab in the current session, `Ctrl+Tab` / `Ctrl+Shift+Tab` to switch tabs, and `Ctrl+N` to create a new window.
- **Reason:** Follow familiar Windows Notepad tab and window conventions.
- **Consequence:** Test renderer tab shortcuts alongside native Electron menu accelerators and preserve independent unsaved state per tab/window.

### DEC-015: Window Appearance Controls

- **Status:** Accepted
- **Decision:** Add a session-only light/dark theme toggle and native window opacity control from 25% to 100%. Start every launch in light mode at 100% opacity. Use `BrowserWindow.setOpacity` through a validated preload IPC method on Windows and macOS; disable the slider accessibly elsewhere.
- **Reason:** Provide immediate appearance controls without changing document content or expanding persistence requirements.
- **Consequence:** Verify both theme palettes, opacity bounds, native failure handling, and unsupported-platform behavior. The 25% minimum prevents a fully transparent, inaccessible window.

### DEC-016: Prevent Minimizing During Screen Privacy

- **Status:** Accepted
- **Decision:** Disable the native minimize control while screen privacy is enabled and restore it when privacy is disabled. If applying the privacy state fails, best-effort restore the inverse native settings and keep the renderer toggle unchanged.
- **Reason:** Keep the protected window visible and reachable while taskbar access and screen capture are suppressed.
- **Consequence:** Verify minimize state transitions and rollback behavior on supported desktop platforms.

## Decision Update Template

For material changes, add an entry with an identifier, status, context, decision, consequences, and any migration/testing impact. Supersede old entries rather than silently rewriting an accepted rationale.