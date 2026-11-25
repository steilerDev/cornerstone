import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintReact from '@eslint-react/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';

// #2260: user-facing text in JSX must come from t(). A literal counts when it has a letter
// (A–Z, Latin-1 letters; the class skips × and ÷), so symbols such as —, ·, ×, … stay legal.
const LETTER = '/[A-Za-zÀ-ÖØ-öø-ÿ]/';
const TEXT_ATTR =
  '/^(aria-(label|description|roledescription|valuetext|placeholder|braillelabel|brailleroledescription)|title|placeholder|alt|label|heading|message|description|tooltip|caption|subtitle|[a-z][a-zA-Z]*(Label|Title|Message|Heading|Description|Placeholder|Tooltip|Caption))$/';
const JSX_CHILD = ':matches(JSXElement, JSXFragment) > JSXExpressionContainer';
const TEXT_ATTR_NODE = `JSXAttribute[name.name=${TEXT_ATTR}]`;
const OPERAND =
  ":matches(ConditionalExpression, LogicalExpression, BinaryExpression[operator='+'])";
const T_CALL =
  "CallExpression:matches([callee.name=/^(t|dt|t[A-Z][A-Za-z]*)$/], [callee.property.name='t'])";
const HARDCODED_TEXT_MESSAGE =
  'Hard-coded user-facing text: wrap it in t() with an en key (#2260). Non-language text (brand name, language endonym, glyph) comes from an existing key or a named module constant.';
const TEMPLATE_KEY_MESSAGE =
  'Do not build an i18n key from a template literal or concatenation (#2260). For a union member use I18N_UNION_KEYS.<set>.key(member) (client/src/i18n/unionKeys.ts); for a count use i18next plurals (t(key, { count })).';

export default tseslint.config(
  // Global ignores
  {
    // .claude/ holds agent/harness config (workflow scripts use runtime-injected
    // globals like `args`/`agent`/`parallel` that ESLint cannot resolve)
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      'coverage/**',
      'docs/**',
      '.claude/**',
    ],
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
    files: ['scripts/**/*.{mjs,js,cjs}', 'plan/**/*.{mjs,js,cjs}'],
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

  // #2129: the server's error.message is untranslated English developer text. UI code must
  // translate by code via translateApiError(err.error.code, tErrors) or a code-specific t() key.
  //
  // #2260: User-facing text in JSX must come from t(). Text in JSX children and in text
  // attributes (aria-label, title, placeholder, alt, label, ...Label, ...Message ...) with a
  // letter in it fails; template-literal or concatenated keys passed to t() fail (use
  // I18N_UNION_KEYS). Non-language text (brand name, language endonyms, glyphs) comes from an
  // existing key or a named module constant. Operands of ?:, &&/||/?? and + are checked one level
  // deep; nested ternaries and operands two or more levels deep are not checked. These selectors live in the same array as #2129:
  // a later block setting no-restricted-syntax for the same files would replace, not merge.
  {
    files: ['client/src/**/*.{ts,tsx}'],
    ignores: ['client/src/**/*.test.{ts,tsx}', 'client/src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='message'][object.type='MemberExpression'][object.property.name='error']",
          message:
            'Do not read `.error.message` from an API error response: it is untranslated server text. Use translateApiError(err.error.code, tErrors) from lib/errorTranslation.js or a code-specific t() key (#2129).',
        },
        {
          selector:
            "VariableDeclarator[init.type='MemberExpression'][init.property.name='error'] > ObjectPattern > Property[key.name='message']",
          message:
            'Do not destructure `message` from an API error response: it is untranslated server text. Use translateApiError(err.error.code, tErrors) (#2129).',
        },
        {
          selector: "Property[key.name='error'] > ObjectPattern > Property[key.name='message']",
          message:
            'Do not destructure `message` from an API error body: it is untranslated server text. Use translateApiError(err.error.code, tErrors) (#2129).',
        },
        // #2260 — hard-coded user-facing text in JSX
        { selector: `JSXText[value=${LETTER}]`, message: HARDCODED_TEXT_MESSAGE },
        { selector: `${JSX_CHILD} > Literal[value=${LETTER}]`, message: HARDCODED_TEXT_MESSAGE },
        {
          selector: `${JSX_CHILD} > TemplateLiteral > TemplateElement[value.raw=${LETTER}]`,
          message: HARDCODED_TEXT_MESSAGE,
        },
        {
          selector: `${JSX_CHILD} > ${OPERAND} > Literal[value=${LETTER}]`,
          message: HARDCODED_TEXT_MESSAGE,
        },
        {
          selector: `${JSX_CHILD} > ${OPERAND} > TemplateLiteral > TemplateElement[value.raw=${LETTER}]`,
          message: HARDCODED_TEXT_MESSAGE,
        },
        {
          selector: `${TEXT_ATTR_NODE} > Literal[value=${LETTER}]`,
          message: HARDCODED_TEXT_MESSAGE,
        },
        {
          selector: `${TEXT_ATTR_NODE} > JSXExpressionContainer > Literal[value=${LETTER}]`,
          message: HARDCODED_TEXT_MESSAGE,
        },
        {
          selector: `${TEXT_ATTR_NODE} > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=${LETTER}]`,
          message: HARDCODED_TEXT_MESSAGE,
        },
        {
          selector: `${TEXT_ATTR_NODE} > JSXExpressionContainer > ${OPERAND} > Literal[value=${LETTER}]`,
          message: HARDCODED_TEXT_MESSAGE,
        },
        {
          selector: `${TEXT_ATTR_NODE} > JSXExpressionContainer > ${OPERAND} > TemplateLiteral > TemplateElement[value.raw=${LETTER}]`,
          message: HARDCODED_TEXT_MESSAGE,
        },
        // #2260 — template-literal / concatenated i18n keys
        {
          selector: `${T_CALL} > TemplateLiteral[expressions.length>0]:first-child`,
          message: TEMPLATE_KEY_MESSAGE,
        },
        {
          selector: `${T_CALL} > BinaryExpression[operator='+']:first-child`,
          message: TEMPLATE_KEY_MESSAGE,
        },
        {
          selector:
            "JSXAttribute[name.name='i18nKey'] > JSXExpressionContainer > :matches(TemplateLiteral[expressions.length>0], BinaryExpression)",
          message: TEMPLATE_KEY_MESSAGE,
        },
      ],
    },
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
