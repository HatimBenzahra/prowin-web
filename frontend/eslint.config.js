import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', '.vite']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
      prettierConfig,
    ],
    plugins: {
      prettier,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
      'prettier/prettier': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true, allowExportNames: ['loader', 'action'] },
      ],
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Les tests e2e et les fichiers de configuration tournent sous Node, pas dans le
    // navigateur : avec les seules globales navigateur, `process` était signalé comme
    // indéfini partout dans `e2e/`.
    files: ['e2e/**/*.{js,mjs}', '*.config.js', 'serve.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Fixtures Playwright : le `use` de `base.extend` n'est pas un hook React.
    files: ['e2e/**/*.{js,mjs}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    // Vitest tourne avec `test.globals: true` (cf. vite.config.js).
    files: ['src/**/*.test.{js,jsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
      },
    },
  },
])
