# Data Model and Contracts

This document defines the initial in-memory document model and the renderer-to-main capability boundary. Types are illustrative contracts to implement and refine in the source tree; they are not claims that code already exists.

## Document Model

```ts
export type DocumentStatus = "clean" | "dirty" | "saving" | "error";

export interface ActiveDocument {
  id: string;
  path: string | null;
  markdown: string;
  savedMarkdown: string;
  status: DocumentStatus;
}
```

`id` identifies one tab's in-memory document session, not a filesystem identity. Each tab has its own `path`, `markdown`, `savedMarkdown`, and status. `path` is null for an untitled tab. Dirty is determined by comparing that tab's current serialization with its saved snapshot.

The renderer owns tab order, active tab, editor serialization, and closed-tab history. Each window starts with one empty untitled tab and must retain at least one tab; closing its last tab replaces it with a new empty untitled tab. Untitled tabs are presented as `Unknown`. Main owns selected paths and dirty metadata keyed by document ID within each BrowserWindow. Never key documents by path because the same file may be opened in multiple tabs. Each BrowserWindow owns an independent document registry.

## File Types

```ts
export interface OpenDocument {
  documentId: string;
  token: string;
  path: string;
  markdown: string;
}

export interface SaveDocumentResult {
  path: string;
}
```

File contents are UTF-8 Markdown text. Preserve line endings/content as far as the editor serialization allows; do not add front matter or application metadata to user documents without an approved decision.

## Result and Error Contracts

Represent expected outcomes explicitly. The exact implementation may use a discriminated union, but cancellation must remain distinguishable from failure.

```ts
export type OperationResult<T> =
  | { status: "success"; value: T }
  | { status: "cancelled" }
  | { status: "error"; error: AppError };

export interface AppError {
  code:
    | "DIALOG_FAILED"
    | "FILE_READ_FAILED"
    | "FILE_WRITE_FAILED"
    | "INVALID_REQUEST"
    | "IPC_FAILED"
    | "UNKNOWN";
  message: string;
  recoverable: boolean;
}
```

`message` is safe for user-facing display. Detailed diagnostics may be logged locally by main process, but must not expose sensitive paths or stack traces unnecessarily. The renderer should not infer cancellation from an error message.

## Preload API

Expose a narrow API. Names may adapt to repository conventions; capabilities should not broaden.

```ts
export interface MeetingNotesApi {
  openDocument(documentId: string): Promise<OperationResult<OpenDocument>>;
  acceptOpenedDocument(documentId: string, token: string): Promise<boolean>;
  saveDocument(documentId: string, markdown: string): Promise<OperationResult<SaveDocumentResult>>;
  saveDocumentAs(documentId: string, markdown: string): Promise<OperationResult<SaveDocumentResult>>;
  startNewDocument(documentId: string): Promise<boolean>;
  closeDocument(documentId: string): void;
  setDocumentDirty(documentId: string, isDirty: boolean): void;
  closeWindow(): void;
  setAlwaysOnTop(enabled: boolean): Promise<boolean>;
  setScreenPrivacy(enabled: boolean): Promise<boolean>;
  setWindowOpacity(percent: number): Promise<boolean>;
  resolveClose(decision: "save" | "discard" | "cancel"): void;
  onCloseRequested(
    listener: () => void,
  ): () => void;
}
```

The close API may be shaped differently to match Electron lifecycle needs. Any event subscription must return an unsubscribe function and must not leak listeners. New-document behavior can be renderer-owned if it only changes in-memory state; it must still resolve dirty-document decisions first.

## IPC Rules

- Use named channels with one purpose each; keep channel names private to main/preload where practical.
- Validate request objects at runtime in main, even when TypeScript types exist.
- Validate document IDs and scope paths, pending-open tokens, and dirty state to the invoking window and document ID.
- Validate window-opacity requests as finite integer percentages in the inclusive range 25-100 before calling Electron; renderer constraints are not a security boundary.
- Keep theme state in the renderer because it only changes presentation. Do not expose generic IPC or renderer-controlled native window objects.
- Bound content size to a documented, reasonable limit or otherwise handle unusually large files without freezing the UI.
- Permit file reads only after native selection; permit writes only to the selected/active path or a path returned by native Save As.
- Closing a tab removes only that tab's main-process state; window close checks every tab owned by that window.
- Return plain serializable values. Never transfer Electron handles, Node objects, exceptions, or editor instances.
- Handle rejected IPC calls as operation failures while preserving the user's current content.

## Window Appearance

- Light mode is selected on each launch. The renderer may switch the current session between light and dark without affecting document state.
- Window opacity is a numeric percentage from 25% (minimum usable opacity) to 100% (fully opaque). Main converts the validated value to Electron's 0-1 `BrowserWindow.setOpacity` argument.
- The opacity IPC method returns `false` on unsupported platforms or native failures. The renderer retains the last confirmed slider value and exposes the unsupported state accessibly.

## Derived Status and Counts

- `dirty` means current Markdown differs from the last successful baseline.
- A successful write records the exact submitted snapshot as saved content.
- If the current editor value has changed since that snapshot, status remains dirty after the write.
- Word and character counts are derived from editor plain text, not Markdown source markers. See `docs/WORKFLOWS.md` for counting semantics.
- Error status is transient operation feedback; it must not erase whether content is unsaved.

## Contract Change Checklist

When changing a contract, update its TypeScript definition, main validation, preload bridge, renderer call sites, focused tests, and this document together. Consider cancellation, malformed IPC, file errors, and edits made while a save is in flight.
