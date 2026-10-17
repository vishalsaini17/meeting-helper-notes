export interface WindowToggleState {
  enabled: boolean;
  available: boolean;
  reason?: string;
}

export const MIN_WINDOW_OPACITY_PERCENT = 25;
export const MAX_WINDOW_OPACITY_PERCENT = 100;
export type AppearanceTheme = 'light' | 'dark';

export function nextAppearanceTheme(theme: AppearanceTheme): AppearanceTheme {
  return theme === 'light' ? 'dark' : 'light';
}

export type OtherToolsShortcutAction = 'always-on-top' | 'screen-privacy' | 'theme' | 'opacity';

export interface OtherToolsShortcutInput {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  altGraph: boolean;
}

export function isValidWindowOpacity(percent: unknown): percent is number {
  return (
    typeof percent === 'number' &&
    Number.isInteger(percent) &&
    percent >= MIN_WINDOW_OPACITY_PERCENT &&
    percent <= MAX_WINDOW_OPACITY_PERCENT
  );
}

export function supportsWindowOpacity(platform: string): boolean {
  const normalized = platform.toLowerCase();
  return normalized.includes('win') || normalized.includes('mac');
}

export function applyValidatedWindowOpacity(
  percent: unknown,
  platform: string,
  setOpacity: (opacity: number) => void,
): boolean {
  if (!isValidWindowOpacity(percent) || !supportsWindowOpacity(platform)) return false;
  try {
    setOpacity(percent / 100);
    return true;
  } catch {
    return false;
  }
}

export interface ScreenPrivacyWindowControls {
  setContentProtection(enabled: boolean): void;
  setMinimizable(enabled: boolean): void;
  setSkipTaskbar?(enabled: boolean): void;
}

export function applyScreenPrivacy(
  enabled: boolean,
  platform: string,
  controls: ScreenPrivacyWindowControls,
): boolean {
  if (!supportsScreenPrivacy(platform)) return false;

  const isWindows = platform.toLowerCase().includes('win');
  try {
    controls.setContentProtection(enabled);
    if (isWindows) controls.setSkipTaskbar?.(enabled);
    controls.setMinimizable(!enabled);
    return true;
  } catch {
    const rollback = [
      () => controls.setMinimizable(enabled),
      ...(isWindows && controls.setSkipTaskbar ? [() => controls.setSkipTaskbar?.(!enabled)] : []),
      () => controls.setContentProtection(!enabled),
    ];
    for (const restore of rollback) {
      try {
        restore();
      } catch {
        continue;
      }
    }
    return false;
  }
}

export function resolveOtherToolsShortcut(input: OtherToolsShortcutInput): OtherToolsShortcutAction | null {
  if (
    input.isComposing ||
    input.altGraph ||
    !input.ctrlKey ||
    !input.shiftKey ||
    !input.altKey ||
    input.metaKey
  ) {
    return null;
  }

  const actions: Record<string, OtherToolsShortcutAction> = {
    KeyT: 'always-on-top',
    KeyP: 'screen-privacy',
    KeyD: 'theme',
    KeyO: 'opacity',
  };
  return actions[input.code] ?? null;
}

export function supportsScreenPrivacy(platform: string): boolean {
  const normalized = platform.toLowerCase();
  return normalized.includes('win') || normalized.includes('mac');
}

export function buildWindowToggleState(enabled: boolean, available = true, reason?: string): WindowToggleState {
  return {
    enabled,
    available,
    ...(reason ? { reason } : {}),
  };
}

export function getScreenPrivacyToggleState(platform: string, enabled: boolean): WindowToggleState {
  const available = supportsScreenPrivacy(platform);
  if (available) return buildWindowToggleState(enabled, true);
  return buildWindowToggleState(enabled, false, 'Screen privacy is not supported on this platform.');
}
