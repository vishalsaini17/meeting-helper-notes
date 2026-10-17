import { readFileSync } from 'node:fs';
import postcss, { type Container, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const stylesheet = postcss.parse(readFileSync(new URL('./styles.css', import.meta.url), 'utf8'));
const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function findRule(container: Container, selector: string): Rule | undefined {
  let matchingRule: Rule | undefined;
  for (const node of container.nodes ?? []) {
    if (node.type === 'rule' && node.selector === selector) matchingRule = node;
  }
  return matchingRule;
}

function declaration(rule: Rule | undefined, property: string): string | undefined {
  for (const node of rule?.nodes ?? []) {
    if (node.type === 'decl' && node.prop === property) return node.value;
  }
  return undefined;
}

describe('compact editor layout', () => {
  it('keeps desktop chrome compact and gives the editor a wide canvas', () => {
    expect(declaration(findRule(stylesheet, '.title-strip'), 'min-height')).toBe('34px');
    expect(declaration(findRule(stylesheet, '.workspace'), 'width')).toBe('100%');
    expect(declaration(findRule(stylesheet, '.toolbar'), 'min-height')).toBe('36px');
    expect(declaration(findRule(stylesheet, '.toolbar'), 'align-items')).toBe('flex-start');
    expect(declaration(findRule(stylesheet, '.toolbar'), 'justify-content')).toBe('space-between');
    expect(declaration(findRule(stylesheet, '.format-toolbar'), 'flex')).toBe('1');
    expect(declaration(findRule(stylesheet, '.format-toolbar'), 'flex-wrap')).toBe('nowrap');
    expect(declaration(findRule(stylesheet, '.visually-hidden'), 'position')).toBe('absolute');
    expect(declaration(findRule(stylesheet, '.other-tools'), 'margin-left')).toBe('auto');
    expect(declaration(findRule(stylesheet, '.format-button'), 'width')).toBe('28px');
    expect(declaration(findRule(stylesheet, '.editor-canvas'), 'width')).toBe('100%');
    expect(declaration(findRule(stylesheet, '.editor-canvas'), 'margin')).toBe('0');
    expect(declaration(findRule(stylesheet, '.editor-canvas'), 'padding')).toBe('12px 16px 16px');
    expect(declaration(findRule(stylesheet, '.status-bar'), 'min-height')).toBe('26px');
    expect(declaration(findRule(stylesheet, '.decision-panel'), 'padding')).toBe('20px');
    expect(declaration(findRule(stylesheet, '.dialog-actions button'), 'min-height')).toBe('32px');
    expect(declaration(findRule(stylesheet, '.milkdown .editor li.list-item .content-dom > p'), 'margin')).toBe('0');
    expect(declaration(findRule(stylesheet, '.milkdown .editor li.list-item .content-dom > p'), 'padding')).toBe('2px 0');
    expect(declaration(findRule(stylesheet, '.milkdown .editor li.list-item .label-wrapper'), 'height')).toBe('24px');
  });

  it('reduces canvas padding at the narrow breakpoint', () => {
    const narrow = stylesheet.nodes.find(
      (node) => node.type === 'atrule' && node.params === '(max-width: 700px)',
    );
    if (!narrow || narrow.type !== 'atrule') throw new Error('Narrow layout media rule is missing.');

    expect(declaration(findRule(narrow, '.editor-canvas'), 'padding')).toBe('8px 10px 12px');
    expect(declaration(findRule(narrow, '.format-button'), 'width')).toBe('26px');
  });

  it('places accessible window controls and a nonzero opacity slider in other-tools', () => {
    const toolbarStart = markup.indexOf('<div class="toolbar">');
    const formatStart = markup.indexOf('class="format-toolbar"', toolbarStart);
    const toolsStart = markup.indexOf('class="other-tools"', formatStart);
    const workspaceStart = markup.indexOf('<main class="workspace"', toolsStart);
    const toolsMarkup = markup.slice(toolsStart, workspaceStart);

    expect(toolbarStart).toBeGreaterThanOrEqual(0);
    expect(formatStart).toBeGreaterThan(toolbarStart);
    expect(toolsStart).toBeGreaterThan(formatStart);
    expect(workspaceStart).toBeGreaterThan(toolsStart);
    expect(toolsMarkup).toContain('id="always-on-top-button"');
    expect(toolsMarkup).toContain('id="screen-privacy-button"');
    expect(toolsMarkup).toContain('id="theme-toggle-button"');
    expect(toolsMarkup).toContain('id="window-opacity" type="range" min="25" max="100"');
    expect(toolsMarkup).toContain('Ctrl+Shift+Alt+O');
    expect(findRule(stylesheet, ":root[data-theme='dark']")).toBeDefined();
  });

  it('defines prioritized formatting groups and an accessible overflow disclosure', () => {
    const groups = [...markup.matchAll(/<div class="format-group" data-overflow-priority="(\d+)" data-format-group="([^"]+)">/g)];
    expect(groups.map(([, priority, name]) => [priority, name])).toEqual([
      ['0', 'history'],
      ['1', 'heading'],
      ['2', 'inline'],
      ['3', 'lists'],
      ['4', 'quote'],
      ['5', 'code'],
      ['6', 'link'],
      ['7', 'rule'],
    ]);
    expect(markup).toContain('id="format-overflow-toggle" type="button" aria-label="More formatting" aria-controls="format-overflow-menu" aria-expanded="false"');
    expect(markup).toContain('id="format-overflow-menu" role="group" aria-label="More formatting" hidden');
    expect(declaration(findRule(stylesheet, '.toolbar-overflow[hidden]'), 'display')).toBe('none');
    expect(declaration(findRule(stylesheet, '.format-overflow-menu'), 'position')).toBe('absolute');
  });

  it('retains the full documented formatting command set', () => {
    const commands = [...markup.matchAll(/data-command="([^"]+)"/g)].map(([, command]) => command).sort();
    expect(commands).toEqual([
      'bold',
      'bullet-list',
      'code-block',
      'inline-code',
      'italic',
      'link',
      'ordered-list',
      'quote',
      'redo',
      'rule',
      'strike',
      'undo',
    ]);
  });
});