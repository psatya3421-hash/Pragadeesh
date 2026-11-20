export type ShortcutPresetId = 'ctrl_k' | 'ctrl_j' | 'alt_k';

export interface ShortcutPreset {
  id: ShortcutPresetId;
  key: 'k' | 'j';
  modifier: 'primary' | 'alt';
  label: string;
}

export const DEFAULT_SHORTCUT_PRESET_ID: ShortcutPresetId = 'ctrl_k';
export const SHORTCUT_STORAGE_KEY = 'primex_ai_shortcut_preset';

export const SHORTCUT_PRESETS: readonly ShortcutPreset[] = [
  { id: 'ctrl_k', key: 'k', modifier: 'primary', label: 'Primary (K)' },
  { id: 'ctrl_j', key: 'j', modifier: 'primary', label: 'Quick (J)' },
  { id: 'alt_k', key: 'k', modifier: 'alt', label: 'Alt + K' },
];

export function getShortcutPreset(id?: string | null): ShortcutPreset {
  return (
    SHORTCUT_PRESETS.find((preset) => preset.id === id) ??
    SHORTCUT_PRESETS[0]
  );
}

export function detectApplePlatform(platformOrUa?: string): boolean {
  if (!platformOrUa) return false;
  return /mac|iphone|ipad|ipod/i.test(platformOrUa);
}

export function formatShortcutBadge(
  presetId: ShortcutPresetId,
  isApple: boolean,
): string {
  const preset = getShortcutPreset(presetId);
  const keyUpper = preset.key.toUpperCase();
  if (preset.modifier === 'alt') {
    return isApple ? `⌥${keyUpper}` : `Alt+${keyUpper}`;
  }
  return isApple ? `⌘${keyUpper}` : `Ctrl+${keyUpper}`;
}

export function getAriaKeyShortcuts(presetId: ShortcutPresetId): string {
  const preset = getShortcutPreset(presetId);
  const keyUpper = preset.key.toUpperCase();
  if (preset.modifier === 'alt') {
    return `Alt+${keyUpper}`;
  }
  return `Control+${keyUpper} Meta+${keyUpper}`;
}

export function isEditableTarget(
  tagName?: string | null,
  isContentEditable?: boolean,
): boolean {
  if (isContentEditable) return true;
  if (!tagName) return false;
  const normalized = tagName.toLowerCase();
  return normalized === 'input' || normalized === 'textarea' || normalized === 'select';
}

export interface ShortcutKeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
}

export interface AssistantShortcutState {
  open: boolean;
  isInputFocused: boolean;
}

export type AssistantShortcutAction =
  | 'open'
  | 'focus_input'
  | 'close'
  | 'toggle_voice'
  | 'toggle_hud'
  | 'toggle_shortcuts_help';

export function matchAssistantShortcutAction(
  event: ShortcutKeyEventLike,
  state: AssistantShortcutState,
  presetId: ShortcutPresetId = DEFAULT_SHORTCUT_PRESET_ID,
): AssistantShortcutAction | null {
  if (event.repeat) return null;

  const key = (event.key || '').toLowerCase();
  const preset = getShortcutPreset(presetId);
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;

  const isPrimaryTrigger =
    preset.modifier === 'primary'
      ? hasPrimaryModifier && !event.altKey && !event.shiftKey && key === preset.key
      : event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && key === preset.key;

  if (isPrimaryTrigger) {
    if (!state.open) return 'open';
    if (!state.isInputFocused) return 'focus_input';
    return 'close';
  }

  if (key === 'escape' && !event.ctrlKey && !event.metaKey && !event.altKey && state.open) {
    return 'close';
  }

  if (state.open && hasPrimaryModifier && event.shiftKey && !event.altKey) {
    if (key === 'v') return 'toggle_voice';
    if (key === 'h') return 'toggle_hud';
  }

  if (state.open && hasPrimaryModifier && !event.altKey && key === '/') {
    return 'toggle_shortcuts_help';
  }

  return null;
}

export interface ShortcutHintItem {
  id: string;
  action: string;
  keys: string;
}

export function getAssistantShortcutHints(
  presetId: ShortcutPresetId,
  isApple: boolean,
): ShortcutHintItem[] {
  const modPrefix = isApple ? '⌘⇧' : 'Ctrl+Shift+';
  const slashShortcut = isApple ? '⌘/' : 'Ctrl+/';
  return [
    {
      id: 'primary',
      action: 'Open / Focus AI',
      keys: formatShortcutBadge(presetId, isApple),
    },
    {
      id: 'voice',
      action: 'Voice Mic',
      keys: `${modPrefix}V`,
    },
    {
      id: 'hud',
      action: 'Live View HUD',
      keys: `${modPrefix}H`,
    },
    {
      id: 'help',
      action: 'Shortcuts Bar',
      keys: slashShortcut,
    },
    {
      id: 'close',
      action: 'Close Drawer',
      keys: 'Esc',
    },
  ];
}
