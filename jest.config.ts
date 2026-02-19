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
  // Locally, use up to 2 workers and recycle when heap exceeds 512 MB.
  // CI auto-detects workers (GitHub Actions sets CI=true).
  ...(isCI ? {} : { maxWorkers: 2, workerIdleMemoryLimit: '512M' }),
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
      // Define webpack globals so tests don't need the webpack build pipeline
      globals: {
        __APP_VERSION__: '0.0.0-test',
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
