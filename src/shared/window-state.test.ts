import { describe, expect, it } from 'vitest';
import {
  applyValidatedWindowOpacity,
  applyScreenPrivacy,
  buildWindowToggleState,
  isValidWindowOpacity,
  MAX_WINDOW_OPACITY_PERCENT,
  MIN_WINDOW_OPACITY_PERCENT,
  nextAppearanceTheme,
  resolveOtherToolsShortcut,
  supportsScreenPrivacy,
  supportsWindowOpacity,
} from './window-state';

describe('window state toggles', () => {
  it('marks Windows and macOS as supporting screen privacy protection', () => {
    expect(supportsScreenPrivacy('win32')).toBe(true);
    expect(supportsScreenPrivacy('darwin')).toBe(true);
  });

  it('gracefully degrades unsupported platforms', () => {
    expect(supportsScreenPrivacy('linux')).toBe(false);
    expect(buildWindowToggleState(false, false, 'Not supported on this platform')).toMatchObject({
      enabled: false,
      available: false,
      reason: 'Not supported on this platform',
    });
  });

  it('accepts only integer opacity percentages from the positive minimum through fully opaque', () => {
    expect(MIN_WINDOW_OPACITY_PERCENT).toBeGreaterThan(0);
    expect(MAX_WINDOW_OPACITY_PERCENT).toBe(100);
    expect(isValidWindowOpacity(25)).toBe(true);
    expect(isValidWindowOpacity(100)).toBe(true);
    expect(isValidWindowOpacity(0)).toBe(false);
    expect(isValidWindowOpacity(24)).toBe(false);
    expect(isValidWindowOpacity(101)).toBe(false);
    expect(isValidWindowOpacity(50.5)).toBe(false);
    expect(isValidWindowOpacity(Number.NaN)).toBe(false);
  });

  it('limits native opacity to supported desktop platforms', () => {
    expect(supportsWindowOpacity('win32')).toBe(true);
    expect(supportsWindowOpacity('darwin')).toBe(true);
    expect(supportsWindowOpacity('linux')).toBe(false);
  });

  it('converts bounded percentages to native opacity and handles unsupported or failed updates', () => {
    const applied: number[] = [];
    expect(applyValidatedWindowOpacity(25, 'win32', (opacity) => applied.push(opacity))).toBe(true);
    expect(applyValidatedWindowOpacity(100, 'win32', (opacity) => applied.push(opacity))).toBe(true);
    expect(applied).toEqual([0.25, 1]);

    const invalidValues: unknown[] = [0, 24, 101, 50.5, Number.NaN, '50'];
    for (const value of invalidValues) {
      expect(applyValidatedWindowOpacity(value, 'win32', () => { throw new Error('must not apply'); })).toBe(false);
    }
    expect(applyValidatedWindowOpacity(50, 'linux', () => { throw new Error('must not apply'); })).toBe(false);
    expect(applyValidatedWindowOpacity(50, 'win32', () => { throw new Error('native failure'); })).toBe(false);
  });

  it('toggles the session theme while defaulting to light', () => {
    expect(nextAppearanceTheme('light')).toBe('dark');
    expect(nextAppearanceTheme('dark')).toBe('light');
  });

  it('disables minimizing while screen privacy is enabled and restores it when disabled', () => {
    const calls: string[] = [];
    const controls = {
      setContentProtection: (enabled: boolean) => calls.push(`protection:${enabled}`),
      setSkipTaskbar: (enabled: boolean) => calls.push(`taskbar:${enabled}`),
      setMinimizable: (enabled: boolean) => calls.push(`minimizable:${enabled}`),
    };

    expect(applyScreenPrivacy(true, 'win32', controls)).toBe(true);
    expect(applyScreenPrivacy(false, 'win32', controls)).toBe(true);
    expect(calls).toEqual([
      'protection:true', 'taskbar:true', 'minimizable:false',
      'protection:false', 'taskbar:false', 'minimizable:true',
    ]);
  });

  it('disables minimizing on macOS without taskbar changes and rejects unsupported platforms', () => {
    const calls: string[] = [];
    const controls = {
      setContentProtection: (enabled: boolean) => calls.push(`protection:${enabled}`),
      setMinimizable: (enabled: boolean) => calls.push(`minimizable:${enabled}`),
    };

    expect(applyScreenPrivacy(true, 'darwin', controls)).toBe(true);
    expect(calls).toEqual(['protection:true', 'minimizable:false']);
    calls.length = 0;
    expect(applyScreenPrivacy(true, 'linux', controls)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('best-effort restores privacy, taskbar, and minimizing after a partial native failure', () => {
    const calls: string[] = [];
    let failDisableMinimize = true;
    const controls = {
      setContentProtection: (enabled: boolean) => calls.push(`protection:${enabled}`),
      setSkipTaskbar: (enabled: boolean) => calls.push(`taskbar:${enabled}`),
      setMinimizable: (enabled: boolean) => {
        calls.push(`minimizable:${enabled}`);
        if (!enabled && failDisableMinimize) {
          failDisableMinimize = false;
          throw new Error('native failure');
        }
      },
    };

    expect(applyScreenPrivacy(true, 'win32', controls)).toBe(false);
    expect(calls).toEqual([
      'protection:true', 'taskbar:true', 'minimizable:false',
      'minimizable:true', 'taskbar:false', 'protection:false',
    ]);
  });

  it('resolves utility shortcuts without capturing editing, AltGraph, or IME input', () => {
    const modifiers = {
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
      metaKey: false,
      isComposing: false,
      altGraph: false,
    };

    expect(resolveOtherToolsShortcut({ ...modifiers, code: 'KeyT' })).toBe('always-on-top');
    expect(resolveOtherToolsShortcut({ ...modifiers, code: 'KeyP' })).toBe('screen-privacy');
    expect(resolveOtherToolsShortcut({ ...modifiers, code: 'KeyD' })).toBe('theme');
    expect(resolveOtherToolsShortcut({ ...modifiers, code: 'KeyO' })).toBe('opacity');
    expect(resolveOtherToolsShortcut({ ...modifiers, code: 'KeyZ' })).toBeNull();
    expect(resolveOtherToolsShortcut({ ...modifiers, shiftKey: false, code: 'KeyD' })).toBeNull();
    expect(resolveOtherToolsShortcut({ ...modifiers, altGraph: true, code: 'KeyD' })).toBeNull();
    expect(resolveOtherToolsShortcut({ ...modifiers, isComposing: true, code: 'KeyD' })).toBeNull();
  });
});
