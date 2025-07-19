import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    // Global ignores
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      '*.vsix',
      '.vscode-test/**',
      '.eslintcache',
      '**/*.min.js',
      '**/*.map',
      'webview-ui/dist/**',
      'packages/*/dist/**',
      'packages/*/lib/**',
    ],
  },
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // TypeScript-specific rules
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],

      // Code quality rules
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      'no-unused-vars': 'off', // Use TypeScript's version instead
      '@typescript-eslint/no-unused-vars': [
        'warn', 
        { 
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        }
      ],

      // Formatting rules (simplified and fixed)
      semi: ['warn', 'always'],
      quotes: ['warn', 'single'],
      curly: ['warn', 'all'], // Always require braces (fixes your error)
      'brace-style': ['warn', '1tbs'],
      'comma-dangle': ['warn', 'always-multiline'],
      indent: ['warn', 2],
      'no-trailing-spaces': 'warn',
      'eol-last': 'warn',
    },
  },
];
