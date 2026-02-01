export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Enforce conventional commit types
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only
        'style', // Code style (formatting, semicolons, etc)
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'perf', // Performance improvement
        'test', // Adding or correcting tests
        'build', // Build system or external dependencies
        'ci', // CI configuration
        'chore', // Maintenance tasks
        'revert', // Revert a previous commit
      ],
    ],
    // Subject should not be empty
    'subject-empty': [2, 'never'],
    // Type should not be empty
    'type-empty': [2, 'never'],
    // Subject max length
    'subject-max-length': [2, 'always', 100],
  },
};
