import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintReact from '@eslint-react/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['**/dist/**', '**/build/**', '**/node_modules/**', 'coverage/**', 'docs/**'],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules for all TS files
  ...tseslint.configs.recommended,

  // CommonJS files (e.g., webpack config)
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // React rules for client files
  {
    files: ['client/src/**/*.{ts,tsx}'],
    ...eslintReact.configs['recommended-typescript'],
  },

  // General rules
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // E2E test files - allow console.log for test visibility
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Node scripts (build/diagnostic tooling)
  {
    files: ['scripts/**/*.{mjs,js,cjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        setImmediate: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        clearImmediate: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        structuredClone: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },

  // Test files (unit + integration) — relax React-Compiler-focused rules
  // that don't apply to mocks and test scaffolding. These rules optimize
  // production rendering; test code never ships.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/__mocks__/**/*.{ts,tsx}'],
    rules: {
      '@eslint-react/component-hook-factories': 'off',
      '@eslint-react/no-unnecessary-use-prefix': 'off',
      '@eslint-react/no-array-index-key': 'off',
      '@eslint-react/use-state': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/set-state-in-effect': 'off',
    },
  },

  // Disable formatting rules that conflict with Prettier
  prettierConfig,
);
