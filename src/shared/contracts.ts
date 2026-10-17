export type DocumentStatus = 'clean' | 'dirty' | 'saving' | 'error';

export type AppCommand = 'new-tab' | 'open' | 'save' | 'save-as';

export type CloseDecision = 'save' | 'discard' | 'cancel';

export interface OpenDocument {
  documentId: string;
  token: string;
  path: string;
  markdown: string;
}

export interface SaveDocumentResult {
  path: string;
}

export interface AppError {
  code:
    | 'DIALOG_FAILED'
    | 'FILE_READ_FAILED'
    | 'FILE_WRITE_FAILED'
    | 'INVALID_REQUEST'
    | 'UNKNOWN';
  message: string;
  recoverable: boolean;
}

export type OperationResult<T> =
  | { status: 'success'; value: T }
  | { status: 'cancelled' }
  | { status: 'error'; error: AppError };

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
  resolveClose(decision: CloseDecision): void;
  onMenuCommand(listener: (command: AppCommand) => void): () => void;
  onCloseRequested(listener: () => void): () => void;
}

declare global {
  interface Window {
    meetingNotes: MeetingNotesApi;
  }
}