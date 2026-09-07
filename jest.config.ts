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
  // legitimately slow under CI/sandbox CPU contention. CORRECTED diagnosis (#2076,
  // supersedes the original #2070 framing below): the failure population is real-timer
  // `userEvent` call sites, not any dependency's behaviour. Ruled out twice — a
  // pre-dependency-bump jest/testing-library bisection on #2070 reproduced identical
  // failures on the OLD versions, and a binary diff of the two `user-event` tarballs on
  // #2076 found no hot-path change (utils/misc/wait.js byte-identical, delay:0 unchanged).
  // #2076 converted SearchPicker.test.tsx and HouseholdItemPicker.breadcrumb.test.tsx (57
  // call sites) to the fake-timer `userEvent.setup({ advanceTimers })` idiom, which removes
  // real-timer macrotask scheduling from those tests. WHETHER THAT IS WHAT FAILS IN CI IS
  // UNPROVEN: a local unloaded --maxWorkers=1 A/B on the full SearchPicker file found no
  // difference between the converted and unconverted versions (both ~1290-1352s, both
  // 60/60 green) — the earlier "in-file control group proves immunity" inference is
  // withdrawn; see the agent-memory writeup for the full measurement and the still-open
  // per-test ~21s CPU cost. Applied as safe and plausibly sufficient, not as a proven fix.
  // This pattern is systemic across every SearchPicker-family component (WorkItemPicker,
  // DependencySentenceBuilder, etc.) — ~592 real-timer `userEvent.setup()` call sites remain
  // across the client suite; #2077 is scoped to profile the CPU cost first, not to convert
  // them mechanically. This default stays raised until that work lands. See PR #2070 /
  // issue #2076 / qa-integration-tester agent memory (pr2070-searchpicker-dropdown-timeout.md).
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
