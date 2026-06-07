// DataAutomated.io — commit message linting (CLAUDE.md §17).
// Enforces conventional commits: `type(scope): description`.
// Scopes map to the architecture/folders (PROJECT_STRUCTURE.md §7).

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'build', 'ci'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'db',
        'auth',
        'fastapi',
        'voc-agent',
        'comp-signal-agent',
        'journey-agent',
        'mcp',
        'rag',
        'frontend',
        'n8n',
        'docker',
        'aws',
        'deps',
        'repo',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'subject-case': [0],
  },
};
