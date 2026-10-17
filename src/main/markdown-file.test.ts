import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isValidMarkdown, MAX_DOCUMENT_BYTES, writeMarkdownAtomically } from './markdown-file';

let directory: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), 'meeting-note-helper-'));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe('Markdown file service', () => {
  it('accepts only strings within the document size limit', () => {
    expect(isValidMarkdown('# Meeting notes')).toBe(true);
    expect(isValidMarkdown(12)).toBe(false);
    expect(isValidMarkdown('x'.repeat(MAX_DOCUMENT_BYTES + 1))).toBe(false);
  });

  it('writes a complete snapshot and atomically replaces an existing file', async () => {
    const path = join(directory, 'notes.md');
    await fs.writeFile(path, 'old content', 'utf8');

    await writeMarkdownAtomically(path, '# Updated notes\n\n- Decision\n');

    expect(await fs.readFile(path, 'utf8')).toBe('# Updated notes\n\n- Decision\n');
    expect(await fs.readdir(directory)).toEqual(['notes.md']);
  });

  it('does not leave a temporary file when the destination cannot be replaced', async () => {
    const destinationDirectory = join(directory, 'notes.md');
    await fs.mkdir(destinationDirectory);

    await expect(writeMarkdownAtomically(destinationDirectory, 'content')).rejects.toBeDefined();
    expect(await fs.readdir(directory)).toEqual(['notes.md']);
    expect(await fs.readdir(destinationDirectory)).toEqual([]);
  });
});