export interface DocumentSnapshot {
  current: string;
  saved: string;
}

export function isDocumentDirty(document: DocumentSnapshot): boolean {
  return document.current !== document.saved;
}

export function countWords(plainText: string): number {
  const words = plainText.match(/\S+/gu);
  return words?.length ?? 0;
}

export function countCharacters(plainText: string): number {
  return Array.from(plainText).length;
}