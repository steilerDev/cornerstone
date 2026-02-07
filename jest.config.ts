import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          verbatimModuleSyntax: true,
        },
      },
    ],
  },
  testMatch: [
    '<rootDir>/server/src/**/*.test.ts',
    '<rootDir>/client/src/**/*.test.{ts,tsx}',
    '<rootDir>/shared/src/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'server/src/**/*.ts',
    'client/src/**/*.{ts,tsx}',
    'shared/src/**/*.ts',
    '!**/*.test.ts',
    '!**/*.test.tsx',
    '!**/types/**',
    '!**/dist/**',
  ],
};

export default config;
