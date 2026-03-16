import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/incompatible-library': 'off',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-unused-vars': ['error', {
        args: 'all',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/stores/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '@/services/api/responseAdapter',
            importNames: ['getApiPayload'],
            message: 'Use payload-first service methods from services/api/* instead of page-level payload parsing.',
          },
        ],
      }],
    },
  },
  {
    files: [
      'src/App.tsx',
      'src/components/**/*.{ts,tsx}',
      'src/stores/**/*.{ts,tsx}',
      'src/pages/admins/**/*.{ts,tsx}',
      'src/pages/logs/**/*.{ts,tsx}',
      'src/pages/settings/SettingsHomePage.tsx',
    ],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/modules/*/*'],
            message: 'Import module surfaces from `@/modules/<domain>` only; do not reach into module internals from outside the module.',
          },
          {
            group: ['@/pages/auth/*', '@/pages/users/*', '@/pages/roles/*'],
            message: 'Use `@/modules/identity` instead of importing identity pages directly.',
          },
          {
            group: ['@/pages/reports/*', '@/pages/feedback/*', '@/pages/settings/VersionPage', '@/pages/settings/DDLPage'],
            message: 'Use `@/modules/ops_governance` instead of importing governance pages directly.',
          },
          {
            group: ['@/pages/channels/*'],
            message: 'Use `@/modules/channels` instead of importing channel pages directly.',
          },
          {
            group: ['@/pages/messages/*'],
            message: 'Use `@/modules/messages` instead of importing messaging pages directly.',
          },
          {
            group: ['@/pages/moments/*'],
            message: 'Use `@/modules/moments` instead of importing moment pages directly.',
          },
          {
            group: ['@/pages/groups/*'],
            message: 'Use `@/modules/groups` instead of importing group pages directly.',
          },
          {
            group: ['@/services/api/auth', '@/services/api/users', '@/services/api/roles'],
            message: 'Use `@/modules/identity` instead of bypassing the identity module boundary.',
          },
          {
            group: ['@/services/api/reports', '@/services/api/feedback', '@/services/api/versions', '@/services/api/ddl'],
            message: 'Use `@/modules/ops_governance` instead of bypassing the governance module boundary.',
          },
          {
            group: ['@/services/api/channels'],
            message: 'Use `@/modules/channels` instead of bypassing the channels module boundary.',
          },
          {
            group: ['@/services/api/messages'],
            message: 'Use `@/modules/messages` instead of bypassing the messaging module boundary.',
          },
          {
            group: ['@/services/api/moments'],
            message: 'Use `@/modules/moments` instead of bypassing the moments module boundary.',
          },
          {
            group: ['@/services/api/groups', '@/services/api/groupEnhancements'],
            message: 'Use `@/modules/groups` instead of bypassing the groups module boundary.',
          },
        ],
      }],
    },
  },
])
