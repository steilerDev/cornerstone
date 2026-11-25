/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { ESLint } from 'eslint';

/**
 * Probes the #2260 selectors in eslint.config.js. Hits are counted by message, not rule id,
 * because the #2129 selectors share `no-restricted-syntax`.
 * Mutation check: deleting any one selector from the config must fail at least one case here;
 * each describe below names one selector group.
 */
const eslint = new ESLint({ cwd: process.cwd().replace(/\/client$/, '') });

async function hits(code: string, filePath = 'client/src/__probe.tsx'): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter(
    (m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('#2260'),
  ).length;
}

const comp = (jsx: string) => `export const C = ({ x }: { x: string }) => ${jsx};`;

describe('JSXText selector', () => {
  it.each([
    ['plain text', '<p>Save</p>', 1],
    ['German letter', '<p>Ä</p>', 1],
  ])('flags %s', async (_n, jsx, count) => {
    expect(await hits(comp(jsx))).toBe(count);
  });
});

describe('JSX child literal selectors', () => {
  it.each([
    ['string child', "<p>{'Save'}</p>", 1],
    ['template child', '<p>{`Saved ${x}`}</p>', 1],
    ['conditional child', "<p>{x ? 'Yes' : 'No'}</p>", 2],
    ['logical child', "<p>{x || 'None'}</p>", 1],
  ])('flags %s', async (_n, jsx, count) => {
    expect(await hits(comp(jsx))).toBe(count);
  });
});

describe('text attribute selectors', () => {
  it.each([
    ['aria-label', '<button aria-label="Close" />', 1],
    ['placeholder', '<input placeholder="Search" />', 1],
    ['alt', '<img alt="Logo" />', 1],
    ['title', '<abbr title="Hello" />', 1],
    ['expression literal prop', "<Foo label={'Name'} />", 1],
    ['expression template prop', '<Foo emptyMessage={`No ${x}`} />', 1],
    ['conditional prop', "<Foo confirmLabel={x ? 'Delete' : 'Remove'} />", 2],
    ['logical prop', "<Foo confirmLabel={x || 'Remove'} />", 1],
    ['heading prop', '<Foo heading="Title" />', 1],
  ])('flags %s', async (_n, jsx, count) => {
    expect(await hits(comp(jsx))).toBe(count);
  });
});

describe('template-literal / concatenated key selectors', () => {
  it.each([
    ['t template', 'export const k = (x: string) => t(`a.${x}`);', 'client/src/__probe.ts'],
    [
      'tErrors template',
      'export const k = (x: string) => tErrors(`a.${x}`);',
      'client/src/__probe.ts',
    ],
    ['dt template', 'export const k = (x: string) => dt(`a.${x}`);', 'client/src/__probe.ts'],
    [
      'i18n.t template',
      'export const k = (x: string) => i18n.t(`a.${x}`);',
      'client/src/__probe.ts',
    ],
    ['t concatenation', "export const k = (x: string) => t('a.' + x);", 'client/src/__probe.ts'],
    ['Trans i18nKey', comp('<Trans i18nKey={`a.${x}`} />'), 'client/src/__probe.tsx'],
  ])('flags %s', async (_n, code, filePath) => {
    expect(await hits(code, filePath)).toBe(1);
  });
});

describe('legal code is not flagged', () => {
  it.each([
    ['t call child', "<p>{t('a.b')}</p>"],
    ['em dash', '<p>—</p>'],
    ['times sign', '<p>{x} ×</p>'],
    ['middot string', "<p>{' · '}</p>"],
    ['ellipsis', '<p>…</p>'],
    [
      'non-text attributes',
      '<div className="card" data-testid="row-1" role="dialog" aria-hidden="true" aria-labelledby="h1" />',
    ],
    ['input attrs', '<input type="text" name="title" autoComplete="off" />'],
    ['className conditional', "<div className={x ? 'a' : 'b'} />"],
    ['labelledby template', '<section aria-labelledby={`${x}-heading`} />'],
  ])('%s', async (_n, jsx) => {
    expect(await hits(comp(jsx))).toBe(0);
  });

  it.each([
    ['t with options', "export const k = t('a.b', { count: 1 });"],
    ['t with constant', 'export const k = t(KEY);'],
    ['t static template', 'export const k = t(`a.b`);'],
    ['union key', 'export const k = t(I18N_UNION_KEYS.x.key(m));'],
    ['non-t helper', 'export const k = format(`${a}.${b}`);'],
    ['key variable', 'export const k = `table.${id}.columns`;'],
  ])('%s', async (_n, code) => {
    expect(await hits(code, 'client/src/__probe.ts')).toBe(0);
  });

  it('allows a named constant child (sanctioned escape for non-language text)', async () => {
    expect(await hits("const BRAND = 'Cornerstone';\nexport const C = () => <p>{BRAND}</p>;")).toBe(
      0,
    );
  });
});

describe('scope', () => {
  it.each([
    ['test file', 'client/src/__probe.test.tsx'],
    ['test helper dir', 'client/src/test/__probe.tsx'],
  ])('does not apply to %s', async (_n, filePath) => {
    expect(await hits(comp('<p>Save</p>'), filePath)).toBe(0);
  });
});
