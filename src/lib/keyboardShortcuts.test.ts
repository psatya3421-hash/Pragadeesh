import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHORTCUT_PRESET_ID,
  detectApplePlatform,
  formatShortcutBadge,
  getAriaKeyShortcuts,
  getAssistantShortcutHints,
  getShortcutPreset,
  isEditableTarget,
  matchAssistantShortcutAction,
} from './keyboardShortcuts';

describe('keyboardShortcuts', () => {
  it('resolves valid and fallback presets safely', () => {
    assert.equal(getShortcutPreset('ctrl_k').id, 'ctrl_k');
    assert.equal(getShortcutPreset('ctrl_j').key, 'j');
    assert.equal(getShortcutPreset('alt_k').modifier, 'alt');
    assert.equal(getShortcutPreset('unknown_preset').id, DEFAULT_SHORTCUT_PRESET_ID);
    assert.equal(getShortcutPreset(null).id, DEFAULT_SHORTCUT_PRESET_ID);
  });

  it('detects Apple platforms and formats OS-appropriate shortcut badges', () => {
    assert.equal(detectApplePlatform('MacIntel'), true);
    assert.equal(detectApplePlatform('Win32'), false);
    assert.equal(detectApplePlatform('Linux x86_64'), false);

    assert.equal(formatShortcutBadge('ctrl_k', false), 'Ctrl+K');
    assert.equal(formatShortcutBadge('ctrl_k', true), '⌘K');
    assert.equal(formatShortcutBadge('ctrl_j', false), 'Ctrl+J');
    assert.equal(formatShortcutBadge('alt_k', false), 'Alt+K');
    assert.equal(formatShortcutBadge('alt_k', true), '⌥K');

    assert.equal(getAriaKeyShortcuts('ctrl_k'), 'Control+K Meta+K');
    assert.equal(getAriaKeyShortcuts('alt_k'), 'Alt+K');
  });

  it('opens, focuses input, and closes on Ctrl+K / Cmd+K', () => {
    const ctrlK = {
      key: 'k',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    };
    const cmdK = {
      key: 'K',
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
    };

    assert.equal(
      matchAssistantShortcutAction(ctrlK, { open: false, isInputFocused: false }, 'ctrl_k'),
      'open',
    );
    assert.equal(
      matchAssistantShortcutAction(cmdK, { open: false, isInputFocused: false }, 'ctrl_k'),
      'open',
    );
    assert.equal(
      matchAssistantShortcutAction(ctrlK, { open: true, isInputFocused: false }, 'ctrl_k'),
      'focus_input',
    );
    assert.equal(
      matchAssistantShortcutAction(ctrlK, { open: true, isInputFocused: true }, 'ctrl_k'),
      'close',
    );
  });

  it('ignores key repeats and mismatched modifiers', () => {
    assert.equal(
      matchAssistantShortcutAction(
        {
          key: 'k',
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          repeat: true,
        },
        { open: false, isInputFocused: false },
        'ctrl_k',
      ),
      null,
    );

    assert.equal(
      matchAssistantShortcutAction(
        {
          key: 'k',
          ctrlKey: true,
          metaKey: false,
          altKey: true,
          shiftKey: false,
        },
        { open: false, isInputFocused: false },
        'ctrl_k',
      ),
      null,
    );
  });

  it('supports customizable presets (Ctrl+J, Alt+K)', () => {
    assert.equal(
      matchAssistantShortcutAction(
        {
          key: 'j',
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
        },
        { open: false, isInputFocused: false },
        'ctrl_j',
      ),
      'open',
    );
    assert.equal(
      matchAssistantShortcutAction(
        {
          key: 'k',
          ctrlKey: false,
          metaKey: false,
          altKey: true,
          shiftKey: false,
        },
        { open: false, isInputFocused: false },
        'alt_k',
      ),
      'open',
    );
  });

  it('matches Escape, Shift+Voice, Shift+HUD, and Help shortcuts only when open', () => {
    const esc = { key: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    assert.equal(matchAssistantShortcutAction(esc, { open: false, isInputFocused: false }), null);
    assert.equal(matchAssistantShortcutAction(esc, { open: true, isInputFocused: true }), 'close');

    const voice = { key: 'V', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true };
    assert.equal(matchAssistantShortcutAction(voice, { open: false, isInputFocused: false }), null);
    assert.equal(matchAssistantShortcutAction(voice, { open: true, isInputFocused: false }), 'toggle_voice');

    const hud = { key: 'h', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true };
    assert.equal(matchAssistantShortcutAction(hud, { open: true, isInputFocused: false }), 'toggle_hud');

    const help = { key: '/', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
    assert.equal(matchAssistantShortcutAction(help, { open: true, isInputFocused: false }), 'toggle_shortcuts_help');
  });

  it('identifies editable DOM targets and builds shortcut hint lists', () => {
    assert.equal(isEditableTarget('INPUT', false), true);
    assert.equal(isEditableTarget('textarea', false), true);
    assert.equal(isEditableTarget('div', true), true);
    assert.equal(isEditableTarget('button', false), false);

    const hints = getAssistantShortcutHints('ctrl_k', false);
    assert.equal(hints.length, 5);
    assert.equal(hints[0].keys, 'Ctrl+K');
    assert.equal(hints[4].keys, 'Esc');
  });
});
