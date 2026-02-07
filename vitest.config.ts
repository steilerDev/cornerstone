import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: [
      'server/src/**/*.test.ts',
      'client/src/**/*.test.{ts,tsx}',
      'shared/src/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['server/src/**/*.ts', 'client/src/**/*.{ts,tsx}', 'shared/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/types/**', '**/dist/**'],
    },
  },
});
