#!/usr/bin/env node
/**
 * affected-workspaces.js
 *
 * Detects which workspaces are affected by current changes and optionally runs their tests.
 *
 * Usage:
 *   node scripts/affected-workspaces.js              # List affected workspaces (working tree)
 *   node scripts/affected-workspaces.js --staged     # List affected workspaces (staged files)
 *   node scripts/affected-workspaces.js --run-tests  # Run tests for affected workspaces
 *   node scripts/affected-workspaces.js --json       # Output as JSON
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Workspace definitions: path prefix -> workspace name
const WORKSPACE_MAP = {
  'api/': '@openpath/api',
  'react-spa/': '@openpath/react-spa',
  'shared/': '@openpath/shared',
  'dashboard/': '@openpath/dashboard',
  'firefox-extension/': '@openpath/firefox-extension',
};

// Dependency graph: workspace -> workspaces that depend on it
const DEPENDENTS = {
  '@openpath/shared': ['@openpath/api', '@openpath/react-spa', '@openpath/dashboard'],
};

// Files that affect all workspaces
const GLOBAL_PATTERNS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^tsconfig\.base\.json$/,
  /^eslint\.config\.js$/,
  /^\.prettierrc/,
];

function getChangedFiles(staged = false) {
  try {
    const cmd = staged
      ? 'git diff --cached --name-only --diff-filter=ACM'
      : 'git diff --name-only HEAD';
    const output = execSync(cmd, { cwd: ROOT, encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    // Fallback: try unstaged changes
    try {
      const output = execSync('git diff --name-only', {
        cwd: ROOT,
        encoding: 'utf-8',
      });
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}

function detectAffectedWorkspaces(files) {
  const affected = new Set();

  // Check for global changes that affect everything
  const hasGlobalChange = files.some((file) =>
    GLOBAL_PATTERNS.some((pattern) => pattern.test(file))
  );

  if (hasGlobalChange) {
    // All workspaces are affected
    Object.values(WORKSPACE_MAP).forEach((ws) => affected.add(ws));
    return Array.from(affected);
  }

  // Map files to workspaces
  for (const file of files) {
    for (const [prefix, workspace] of Object.entries(WORKSPACE_MAP)) {
      if (file.startsWith(prefix)) {
        affected.add(workspace);

        // Add dependents
        const deps = DEPENDENTS[workspace];
        if (deps) {
          deps.forEach((dep) => affected.add(dep));
        }
        break;
      }
    }
  }

  return Array.from(affected);
}

function hasTestScript(workspace) {
  const wsPath = workspace.replace('@openpath/', '');
  const pkgPath = join(ROOT, wsPath, 'package.json');

  if (!existsSync(pkgPath)) return false;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return Boolean(pkg.scripts?.test);
  } catch {
    return false;
  }
}

function runTests(workspaces) {
  const testable = workspaces.filter(hasTestScript);

  if (testable.length === 0) {
    console.log('No affected workspaces with test scripts found.');
    return 0;
  }

  console.log(`Running tests for: ${testable.join(', ')}\n`);

  let failed = false;
  for (const ws of testable) {
    console.log(`\n--- Testing ${ws} ---\n`);
    try {
      execSync(`npm test --workspace=${ws}`, {
        cwd: ROOT,
        stdio: 'inherit',
      });
    } catch {
      failed = true;
      console.error(`\nTests failed for ${ws}`);
    }
  }

  return failed ? 1 : 0;
}

// Main
const args = process.argv.slice(2);
const staged = args.includes('--staged');
const runTestsFlag = args.includes('--run-tests');
const jsonOutput = args.includes('--json');

const files = getChangedFiles(staged);
const affected = detectAffectedWorkspaces(files);

if (jsonOutput) {
  console.log(JSON.stringify({ files, affected }, null, 2));
} else if (runTestsFlag) {
  if (affected.length === 0) {
    console.log('No workspaces affected by current changes.');
    process.exit(0);
  }
  process.exit(runTests(affected));
} else {
  if (affected.length === 0) {
    console.log('No workspaces affected by current changes.');
  } else {
    affected.forEach((ws) => console.log(ws));
  }
}
