export default {
  '*.{ts,tsx,js,jsx,cjs}': ['eslint --fix'],
  '*.{ts,tsx,js,jsx,cjs,json,css,md}': ['prettier --write'],
  '**/package.json': ['bash scripts/check-dep-pinning.sh'],
  '*.{ts,tsx}': (stagedFiles) => {
    const sourceFiles = stagedFiles.filter(
      (f) =>
        !f.endsWith('.test.ts') &&
        !f.endsWith('.test.tsx') &&
        !f.includes('/types/') &&
        !f.includes('/test/') &&
        (f.startsWith('server/src/') || f.startsWith('client/src/') || f.startsWith('shared/src/')),
    );
    if (sourceFiles.length === 0) return [];
    return [
      `node --experimental-vm-modules node_modules/.bin/jest --bail --findRelatedTests ${sourceFiles.join(' ')}`,
    ];
  },
};
