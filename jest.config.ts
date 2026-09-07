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
  // Give workers 2 s to release file-watchers and jsdom handles after tests
  // complete before force-killing. The 500 ms default is too tight in the
  // resource-constrained sandbox and produces spurious "worker failed to exit
  // gracefully" warnings; 2000 ms lets legitimate cleanup finish while still
  // bounding true hangs.
  workerGracefulExitTimeout: 2000,
  // Tests that open the shared SearchPicker's dropdown for the first time (mounting
  // @floating-ui/react's FloatingPortal + userEvent's real-timer event sequencing) are
  // legitimately slow under CI/sandbox CPU contention — confirmed via bisection against
  // pre-dependency-bump jest/testing-library versions (identical timing, so not a
  // regression) and via raised-timeout runs (tests pass reliably given enough wall time,
  // so this is not a hang). This pattern is systemic across every SearchPicker-family
  // component (WorkItemPicker, HouseholdItemPicker, DependencySentenceBuilder, etc.), so
  // the default is raised rather than patched file-by-file as CI shards happen to reveal
  // fresh instances. See PR #2070 / qa-integration-tester agent memory.
  //
  // MUST be set here, at the top level — jest-circus only reads `testTimeout` from
  // globalConfig (see node_modules/jest-circus/build/jestAdapterInit.js's
  // `if (globalConfig.testTimeout) { getState().testTimeout = globalConfig.testTimeout; }`).
  // A `projects[].testTimeout` entry is silently ignored at runtime despite being a
  // documented ProjectConfig field and showing up correctly in `--showConfig` output.
  // This therefore applies to server/shared too, not just client; that's an accepted
  // trade-off since raising the ceiling cannot slow down tests that already finish well
  // within it, and per-project scoping isn't achievable given jest-circus's behavior.
  testTimeout: 60000,
  projects: [
    {
      ...baseConfig,
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/server/src/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/server/src/test/setupTests.ts'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            useESM: true,
            diagnostics: { ignoreCodes: [151002] },
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
      moduleNameMapper: {
        ...baseConfig.moduleNameMapper,
        '^@cornerstone/shared$': '<rootDir>/shared/src/index.ts',
        '^nanoid$': '<rootDir>/client/src/test/nanoidMock.cjs',
        // Konva requires node-canvas (native binary, project policy forbids it).
        // Stub both for tests; real Konva loads in the browser build.
        '^konva$': '<rootDir>/__mocks__/konva.ts',
        '^react-konva$': '<rootDir>/__mocks__/react-konva.ts',
      },
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
              resolveJsonModule: true,
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
