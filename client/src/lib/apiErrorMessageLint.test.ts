/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { ESLint } from 'eslint';

const RULE = 'no-restricted-syntax';
const eslint = new ESLint({ cwd: process.cwd().replace(/\/client$/, '') });

async function ruleHits(code: string, filePath = 'client/src/__probe.tsx'): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE).length;
}

describe('no-restricted-syntax: raw API error message (#2129)', () => {
  it.each([
    ['err.error.message', 'const x = err.error.message;\nexport { x };'],
    ['err.error?.message', 'const x = err.error?.message;\nexport { x };'],
    ['body.error?.message', 'const x = body.error?.message;\nexport { x };'],
    ['destructured message', 'const { message } = err.error;\nexport { message };'],
  ])('flags %s', async (_name, code) => {
    expect(await ruleHits(code)).toBe(1);
  });

  it.each([
    ['err.message', 'const x = err.message;\nexport { x };'],
    ['toast.message', 'const x = toast.message;\nexport { x };'],
    ['styles.message', 'const x = styles.message;\nexport { x };'],
    ['error.message', 'const x = error.message;\nexport { x };'],
    ["t('a.message')", "const x = t('a.message');\nexport { x };"],
  ])('does not flag %s', async (_name, code) => {
    expect(await ruleHits(code)).toBe(0);
  });

  it('does not apply to test files', async () => {
    expect(
      await ruleHits('const x = err.error.message;\nexport { x };', 'client/src/__probe.test.tsx'),
    ).toBe(0);
  });
});
