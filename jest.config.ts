import type { Config } from 'jest';

const isCI = process.env.CI === 'true';

const baseConfig = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '\\.module\\.css$': 'identity-obj-proxy',
    '\\.css$': '<rootDir>/client/src/test/styleMock.js',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          esModuleInterop: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  collectCoverageFrom: [
    'server/src/**/*.ts',
    'client/src/**/*.{ts,tsx}',
    'shared/src/**/*.ts',
    '!**/*.test.ts',
    '!**/*.test.tsx',
    '!**/types/**',
    '!**/dist/**',
    '!**/test/**',
  ],
};

const config: Config = {
  // In CI (GitHub Actions sets CI=true) use defaults (auto-detect workers).
  // Locally (sandbox VM with limited memory) restrict to 1 worker and recycle
  // it when heap exceeds 200 MB to avoid OOM kills.
  ...(isCI ? {} : { maxWorkers: 1, workerIdleMemoryLimit: '200M' }),
  projects: [
    {
      ...baseConfig,
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/server/src/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: {
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              esModuleInterop: true,
            },
          },
        ],
      },
    },
    {
      ...baseConfig,
      displayName: 'client',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/client/src/**/*.test.{ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/client/src/test/setupTests.ts'],
      transformIgnorePatterns: ['node_modules/(?!@testing-library)'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            useESM: true,
            tsconfig: {
              module: 'ESNext',
              moduleResolution: 'bundler',
              esModuleInterop: true,
              jsx: 'react-jsx',
              types: ['jest', '@testing-library/jest-dom'],
            },
          },
        ],
      },
    },
    {
      ...baseConfig,
      displayName: 'shared',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/shared/src/**/*.test.ts'],
    },
  ],
};

export default config;
