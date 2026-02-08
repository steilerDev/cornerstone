import type { Config } from 'jest';

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
  projects: [
    {
      ...baseConfig,
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/server/src/**/*.test.ts'],
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
