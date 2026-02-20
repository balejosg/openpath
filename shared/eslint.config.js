import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import noOnlyTests from 'eslint-plugin-no-only-tests';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['tests/*.ts'],
          defaultProject: 'tsconfig.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/strict-boolean-expressions': 'error',
      'no-console': 'error',
    },
  },
  // Test anti-pattern rules
  {
    files: ['tests/**/*.ts'],
    plugins: {
      'no-only-tests': noOnlyTests,
    },
    rules: {
      'no-only-tests/no-only-tests': 'error',
      // Tests use node:test's describe/it which are typed as promises.
      // Avoid enforcing strict async/predicate rules on test scaffolding.
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
    },
  },
  {
    ignores: ['coverage/**', 'dist/', 'node_modules/', 'eslint.config.js'],
  }
);
