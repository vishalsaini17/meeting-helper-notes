import { describe, expect, it } from 'vitest';
import { countCharacters, countWords, isDocumentDirty } from './document';

describe('document helpers', () => {
  it('compares the current content with the last saved snapshot', () => {
    expect(isDocumentDirty({ current: '# Notes', saved: '# Notes' })).toBe(false);
    expect(isDocumentDirty({ current: '# Notes\n', saved: '# Notes' })).toBe(true);
  });

  it('counts non-empty whitespace-separated words', () => {
    expect(countWords('  Kickoff\twith\nteam  ')).toBe(3);
    expect(countWords(' \n\t')).toBe(0);
  });

  it('counts Unicode code points rather than UTF-16 units', () => {
    expect(countCharacters('A🙂é')).toBe(4);
    expect(countCharacters('')).toBe(0);
  });
});