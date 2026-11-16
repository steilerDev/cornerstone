import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';
import enCommon from '../../i18n/en/common.json';
import type { RegisteredShortcut, ShortcutGroup } from '../../hooks/shortcutRegistry.js';
import { GLOBAL_SHORTCUT_ORDER, groupShortcuts, keyCapsFor } from './keyCaps.js';

/** Resolves flat-dotted keys from the en common namespace so wording is never guessed. */
const t = ((key: string) => {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      enCommon,
    );
  if (typeof value !== 'string') throw new Error(`missing en key ${key}`);
  return value;
}) as unknown as TFunction;

const row = (key: string, group: ShortcutGroup, description = `do ${key}`): RegisteredShortcut => ({
  key,
  group,
  description,
  handler: () => {},
});

describe('groupShortcuts', () => {
  it('splits rows by group, preserving registration order for page and goTo', () => {
    const groups = groupShortcuts([
      row('x', 'page'),
      row('g t', 'goTo'),
      row('e', 'page'),
      row('g h', 'goTo'),
    ]);
    expect(groups.page.map((s) => s.key)).toEqual(['x', 'e']);
    expect(groups.goTo.map((s) => s.key)).toEqual(['g t', 'g h']);
    expect(groups.global).toEqual([]);
  });

  it('sorts global rows by GLOBAL_SHORTCUT_ORDER', () => {
    const reversed = [...GLOBAL_SHORTCUT_ORDER].reverse().map((k) => row(k, 'global'));
    expect(groupShortcuts(reversed).global.map((s) => s.key)).toEqual([...GLOBAL_SHORTCUT_ORDER]);
  });

  it('keeps the documented order Mod+k, /, n, ?, Escape, Mod+z', () => {
    expect(GLOBAL_SHORTCUT_ORDER).toEqual(['Mod+k', '/', 'n', '?', 'Escape', 'Mod+z']);
  });

  it('puts unknown global keys after the known ones, in registration order', () => {
    const groups = groupShortcuts([
      row('zz', 'global'),
      row('Mod+z', 'global'),
      row('yy', 'global'),
      row('Mod+k', 'global'),
    ]);
    expect(groups.global.map((s) => s.key)).toEqual(['Mod+k', 'Mod+z', 'zz', 'yy']);
  });

  it('drops rows with an empty description in every group', () => {
    const groups = groupShortcuts([
      row('Backspace', 'page', ''),
      row('e', 'page'),
      row('n', 'global', ''),
      row('g h', 'goTo', ''),
    ]);
    expect(groups.page.map((s) => s.key)).toEqual(['e']);
    expect(groups.global).toEqual([]);
    expect(groups.goTo).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input = [row('Mod+z', 'global'), row('Mod+k', 'global')];
    groupShortcuts(input);
    expect(input.map((s) => s.key)).toEqual(['Mod+z', 'Mod+k']);
  });
});

describe('keyCapsFor', () => {
  it('uses Command symbols with spoken names on Apple', () => {
    expect(keyCapsFor('Mod+k', t, true)).toEqual([{ text: '⌘K', spoken: 'Command K' }]);
    expect(keyCapsFor('Mod+z', t, true)).toEqual([{ text: '⌘Z', spoken: 'Command Z' }]);
  });

  it('uses Ctrl caps without spoken names elsewhere', () => {
    expect(keyCapsFor('Mod+k', t, false)).toEqual([{ text: 'Ctrl K' }]);
    expect(keyCapsFor('Mod+z', t, false)).toEqual([{ text: 'Ctrl Z' }]);
  });

  it('names Escape, ?, / for screen readers', () => {
    expect(keyCapsFor('Escape', t, false)).toEqual([{ text: 'Esc', spoken: 'Escape' }]);
    expect(keyCapsFor('?', t, false)).toEqual([{ text: '?', spoken: 'Question mark' }]);
    expect(keyCapsFor('/', t, true)).toEqual([{ text: '/', spoken: 'Slash' }]);
  });

  it('shows Delete as a cap with no spoken name', () => {
    expect(keyCapsFor('Delete', t, false)).toEqual([{ text: 'Delete' }]);
  });

  it('passes letters through and renders one cap per sequence step', () => {
    expect(keyCapsFor('n', t, false)).toEqual([{ text: 'n' }]);
    expect(keyCapsFor('g s', t, false)).toEqual([{ text: 'g' }, { text: 's' }]);
  });
});
