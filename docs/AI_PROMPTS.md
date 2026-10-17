# AI Development Prompt Sequence

Run these prompts in order. Each phase should finish and pass its stated checks before moving to the next. Give the agent the repository root as its workspace and require it to follow `AGENTS.md` plus the relevant document in `docs/`.

## Prompt 1: Inspect and Scaffold

```text
You are implementing Meeting Note Helper in this repository. Read AGENTS.md and docs/ARCHITECTURE.md, docs/DATA_MODEL.md, docs/DECISIONS.md, and docs/TESTING.md first.

Inspect the existing workspace and report its current files and relevant tooling. Then scaffold only the minimum runnable Electron + TypeScript application structure needed for this product, using the repository's existing conventions if any. The target is Windows 10/11; the UI is HTML/CSS and defaults to a light theme. Do not add backend, cloud, accounts, telemetry, or unrelated features. Choose package manager, bundler, and any UI framework conservatively; record material choices in docs/DECISIONS.md.

Establish development, typecheck, test, and production build commands. Keep contextIsolation enabled, nodeIntegration disabled, renderer sandboxing enabled where compatible, and set a restrictive development/production content security policy. Do not implement file access in the renderer. Add the smallest smoke test and run the focused checks. Report files changed, commands/results, and any Windows-only checks still needed.
```

## Prompt 2: Secure Electron Bridge and File Service

```text
Implement the file-operation foundation for Meeting Note Helper. Read AGENTS.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md, docs/WORKFLOWS.md, and docs/TESTING.md.

Add a typed, narrow preload API for opening a Markdown file and saving the current Markdown. Keep native dialogs and all filesystem access in the Electron main process. Validate IPC payloads at runtime; expose no generic IPC or filesystem API. Use native open/save dialogs with Markdown filters and a .md default extension. Make cancellation distinct from errors. Preserve existing files and return structured, user-safe errors on read/write failure. Use a failure-aware write approach where practical.

Add focused tests for success, cancellation, invalid requests, read/write failures, and Save As path assignment. Do not build the editor UI yet. Run the focused tests and relevant typecheck, then report security boundaries and unverified Windows-specific behavior.
```

## Prompt 3: Editor and Markdown Toolbar

```text
Implement the Meeting Note Helper editing surface using Milkdown with Crepe, following AGENTS.md, docs/ARCHITECTURE.md, docs/WORKFLOWS.md, and docs/DECISIONS.md.

Build a compact, responsive light-theme window with an accessible formatting toolbar and one Markdown editor. Minimize chrome, margins, padding, and gaps so the editor gets priority at standard and narrow sizes. Include undo/redo, paragraph and heading levels 1-3, bold, italic, strikethrough, bulleted/numbered lists, quote, inline code, code block, link, and horizontal rule, limited to commands supported by the chosen Crepe version. Use accessible names, tooltips, visible focus, and active state when available. Keep editor focus and selection behavior intact when toolbar commands run. Do not add filesystem access to renderer; connect no file operations beyond the existing preload API.

Add focused tests for representative formatting and Markdown serialization/round-trip behavior. Run the tests and typecheck. Report any unsupported formatting command rather than silently substituting behavior.
```

## Prompt 4: Document Lifecycle and Status

```text
Implement document lifecycle workflows in accordance with AGENTS.md, docs/WORKFLOWS.md, docs/DATA_MODEL.md, and docs/TESTING.md.

Add New, Open, Save, Save As, and dirty-document protection for New/Open/Close/Quit. Support Save, Don't Save, and Cancel decisions. A cancelled or failed save must preserve the current document and prevent a destructive transition. Track the exact saved Markdown snapshot so edits made during an in-flight save remain dirty. Add a status bar showing word count, character count, filename/Untitled, and clean/unsaved/saving/error state. Counts must use the documented plain-text rules, not Markdown syntax.

Keep all file operations behind the typed preload API. Provide concise, actionable errors and do not show errors for normal dialog cancellation. Add focused tests for state transitions, save races, counts (including Unicode), and dirty prompts. Run tests and typecheck; report any lifecycle behavior that remains unverified on Windows.
```

## Prompt 5: Shortcuts, Accessibility, and Resizing

```text
Finish interaction quality for Meeting Note Helper. Read AGENTS.md, docs/WORKFLOWS.md, and docs/TESTING.md.

Implement and document the proposed basic and advanced Windows shortcuts from docs/WORKFLOWS.md. First check for Electron, browser, and Crepe conflicts; adjust conflicts and record final bindings in the docs. Keep toolbar/menu alternatives for every formatting action. Avoid intercepting shortcuts during IME composition. Verify keyboard-only navigation, visible focus, accessible toggle state and error/status announcements, and responsive behavior at narrow and standard window sizes. Do not make unrelated visual or product changes.

Add focused automated coverage for command mapping where possible, run relevant tests/typecheck/lint, and report manual accessibility and Windows checks that still need a real packaged build.
```

## Prompt 6: Release Readiness

```text
Perform a release-readiness pass for Meeting Note Helper using AGENTS.md and docs/TESTING.md as the acceptance criteria.

Review the app against the required workflows, Electron security boundary, Markdown preservation, dirty-state behavior, errors, keyboard access, and responsive layout. Run the complete available test suite, typecheck, lint, and production build. Fix only defects directly blocking these requirements; do not perform unrelated refactors. Add or update focused tests for any fix and rerun them.

Check packaging configuration for Windows 10/11 and produce a concise verification report separating automated results from manual Windows checks. Do not claim a Windows packaged-build check passed unless it was actually run on Windows. List known gaps and the exact next verification steps.
```

## How to Run the Sequence

1. Run Prompt 1 against the empty workspace and review the stack and security setup.
2. Run Prompts 2 through 5 in order, reviewing the diff and verification report after each phase.
3. Run Prompt 6 after the feature work is complete and before packaging/release.
4. If a phase changes a documented contract or decision, update the relevant document in the same phase before continuing.
5. If the agent discovers a requirement conflict or a Windows-only check it cannot execute, have it stop that specific claim, explain the blocker, and continue with unrelated verifiable work.