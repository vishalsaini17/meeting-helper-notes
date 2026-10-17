# Project Instructions

## Product

Build Meeting Note Helper, a Windows desktop Markdown editor for creating, editing, formatting, and saving meeting notes without requiring users to write Markdown syntax by hand.

## Approved Stack

- Electron.js, TypeScript, HTML, and CSS.
- Milkdown with Crepe for the WYSIWYG Markdown editor.
- Markdown files with the `.md` extension.
- Windows 10 and Windows 11 are the supported platforms.
- Light mode is the initial and default theme.

Do not introduce a backend, account system, cloud sync, telemetry, or a different editor unless the product owner asks for it. Keep package and framework choices consistent with the eventual repository and document any necessary deviations.

## Architecture and Security

- Keep operating-system and filesystem capabilities in Electron's main process.
- Use a preload script and `contextBridge` to expose a small, typed, allowlisted API to the renderer.
- Keep `contextIsolation` enabled, `nodeIntegration` disabled, and renderer sandboxing enabled where supported by the chosen Electron configuration.
- Do not expose generic filesystem methods, raw IPC, Node.js objects, or arbitrary path access to the renderer.
- Validate IPC payloads and main-process results. Treat file paths and document contents as untrusted input.
- Use native Windows open and save dialogs. The main process performs file reads and writes.
- Do not silently overwrite, discard, or claim to save changes after a failed operation.
- Follow the contracts and security boundaries in `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md`.

## Product Behavior

- Detect unsaved changes and distinguish clean, dirty, saving, and error states.
- Provide helpful, actionable feedback for open and save failures.
- Show word count, character count, and document status in the status bar.
- Make toolbar actions, keyboard shortcuts, keyboard navigation, and visible focus indicators available for common editing tasks.
- Keep the editor and toolbar usable as the window is resized.
- Use compact, consistent spacing and control sizes; minimize decorative whitespace so the editor and its content occupy the available window without hurting readability or focus visibility.
- Do not expose block drag handles or implement drag-and-drop reordering. Preserve the existing toolbar, keyboard editing, and Markdown semantics.
- Preserve Markdown semantics when editing and saving; do not silently discard unsupported content.

## Implementation Practices

- Read the relevant design document before changing its behavior.
- Prefer small changes that preserve established project patterns and public contracts.
- Keep renderer UI state separate from main-process filesystem state.
- Use explicit TypeScript types for the preload API, IPC contracts, and document lifecycle.
- Handle asynchronous operations, cancellation, and errors explicitly.
- Keep user-facing text clear and specific; never expose raw stack traces as the only error message.
- Add or update focused tests for behavior changes and document any platform-only manual verification.
- Do not mark planned features as implemented in documentation or release notes.

## Verification

Before calling a change complete, run the narrowest relevant tests, then the repository's configured typecheck, lint, and build checks when available. Follow `docs/TESTING.md` for Windows-specific verification. Report checks that could not be run and why.

## Source of Truth

- System boundaries: `docs/ARCHITECTURE.md`
- Agent roles and rules: `docs/AGENTS.md`
- User and developer workflows: `docs/WORKFLOWS.md`
- Types and IPC contracts: `docs/DATA_MODEL.md`
- Technical rationale and open decisions: `docs/DECISIONS.md`
- Quality gates: `docs/TESTING.md`
- Implementation prompt sequence: `docs/AI_PROMPTS.md`

If documents conflict, call out the conflict and prefer the most specific approved product requirement. Update the relevant document when an approved decision changes.