import { describe, expect, it } from 'vitest';
import { Crepe } from '@milkdown/crepe';
import { editorFeatures } from './editor-config';

describe('Crepe feature configuration', () => {
  it('keeps block handles and block drag/drop disabled', () => {
    expect(editorFeatures[Crepe.Feature.BlockEdit]).toBe(false);
  });
});