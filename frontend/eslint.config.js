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
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
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
    files: ['e2e/**/*.{js,mjs}', '*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
