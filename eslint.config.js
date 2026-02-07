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
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      'no-console': 'off',
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
    },
  },
  // Test anti-pattern rules for all test files
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    plugins: {
      'no-only-tests': noOnlyTests,
    },
    rules: {
      // Prevent .only() which would skip other tests
      'no-only-tests/no-only-tests': 'error',
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'api/tests/load/**',
      'spa/sw.ts',
      'spa/lighthouserc.cjs',
      'eslint.config.js',
      '**/*.config.js',
      '**/*.config.ts',
      '**/*.config.mjs',
      'shared/tests/**',
      'spa/js/**',
      'react-spa/e2e/**',
      'tests/selenium/**',
      'scripts/**',
    ],
  }
);
