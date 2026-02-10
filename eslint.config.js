const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const prettier = require('eslint-plugin-prettier');
const typescriptParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      prettier: prettier
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules,
      ...prettier.configs.recommended.rules
    }
  }
];
