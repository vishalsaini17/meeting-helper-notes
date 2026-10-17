import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function isValidMarkdown(markdown: unknown): markdown is string {
  return typeof markdown === 'string' && Buffer.byteLength(markdown, 'utf8') <= MAX_DOCUMENT_BYTES;
}

export async function writeMarkdownAtomically(path: string, markdown: string): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryPath, markdown, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporaryPath, path);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}