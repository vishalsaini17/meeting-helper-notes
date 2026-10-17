# Agent System

This document defines how AI coding agents should work on Meeting Note Helper. It complements the root `AGENTS.md`, which applies to all project work.

## Operating Rules

1. Inspect the relevant source, tests, and design documents before editing.
2. State the expected behavior and the focused check that will validate a change.
3. Make the smallest change that meets the request; do not expand product scope without asking.
4. Preserve the Electron security boundary: filesystem operations belong in main, and renderer access goes through the typed preload API.
5. Update contracts and tests together when IPC or document lifecycle behavior changes.
6. Run focused tests first, then applicable typecheck, lint, and build commands.
7. Report what changed, the checks run, and remaining limitations. Never imply a Windows-only behavior was verified if it was only tested on another OS.

## Roles

### Product and Workflow Agent

- Clarifies user-visible behavior and acceptance criteria.
- Uses `docs/WORKFLOWS.md` as the source for document lifecycle decisions.
- Does not invent cloud or collaboration behavior.

### Electron Security Agent

- Reviews main/preload/renderer boundaries, IPC validation, navigation, CSP, and file handling.
- Rejects generic filesystem or unrestricted IPC bridges.
- Checks cancellation, overwrite, failure, and shutdown paths.

### Editor Agent

- Implements Milkdown/Crepe integration and formatting controls.
- Preserves Markdown content and maps toolbar/shortcut actions to supported editor commands.
- Tests editor behavior and accessibility, including focus and keyboard navigation.

### Quality Agent

- Adds focused unit, integration, and end-to-end coverage using repository conventions.
- Distinguishes automated checks from required manual Windows checks.
- Avoids unrelated cleanup and does not weaken existing checks to make a change pass.

One agent may perform several roles in a small project. Role names describe responsibilities, not a requirement to create separate autonomous agents.

## Change Handoff

For a cross-process feature, include in the implementation handoff:

- User-visible behavior and acceptance criteria.
- Main-process owner and IPC channel/API contract.
- Preload method and payload/result types.
- Renderer state transitions and error presentation.
- Focused automated checks and any Windows manual checks.

For a design or contract change, update the source-of-truth document in the same change. Record durable tradeoffs in `docs/DECISIONS.md`.

## Review Checklist

- Does the renderer receive only the minimum data and capability it needs?
- Are IPC arguments validated in the main process?
- Can cancel or failure accidentally discard data or falsely mark it clean?
- Are block handles and drag/drop event handlers absent from the editor while normal editing and formatting still work?
- Can concurrent edits during save be mistaken for saved content?
- Are keyboard actions discoverable, non-conflicting, and operable without a mouse?
- Does the UI use consistent compact spacing and prioritize the document area without clipping text or controls?
- Do counts, status, and error messages remain understandable to assistive technology?
- Are relevant tests present and do reported verification results match what actually ran?