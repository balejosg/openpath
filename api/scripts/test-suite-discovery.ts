import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const TEST_GLOB = '**/*.{test,spec}.{ts,tsx}';
const GLOB_CHARS = /[*?[\]{}]/u;

function toPosixPath(value: string): string {
  return value.replaceAll(sep, '/');
}

function isTestFile(pathname: string): boolean {
  return /\.(test|spec)\.(ts|tsx)$/u.test(pathname);
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|[\]]/gu, '\\$&');
}

function expandBraces(pattern: string): string[] {
  const match = /\{([^{}]+)\}/u.exec(pattern);
  if (match == null) {
    return [pattern];
  }

  const [placeholder, options = ''] = match;
  const prefix = pattern.slice(0, match.index);
  const suffix = pattern.slice(match.index + placeholder.length);

  return options.split(',').flatMap((option) => expandBraces(`${prefix}${option}${suffix}`));
}

function globToRegExp(pattern: string): RegExp {
  let source = '^';
  const normalized = toPosixPath(pattern);

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? '';
    const next = normalized[index + 1];

    if (char === '*') {
      if (next === '*') {
        if (normalized[index + 2] === '/') {
          source += '(?:[^/]+/)*';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
        continue;
      }

      source += '[^/]*';
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegExp(char);
  }

  return new RegExp(`${source}$`, 'u');
}

function getGlobSearchRoot(input: string): string {
  const parts = toPosixPath(input).split('/');
  const rootParts: string[] = [];

  for (const part of parts) {
    if (GLOB_CHARS.test(part)) {
      break;
    }

    rootParts.push(part);
  }

  return rootParts.length > 0 ? rootParts.join('/') : '.';
}

function collectFiles(root: string, cwd: string): string[] {
  const absoluteRoot = join(cwd, root);
  if (!existsSync(absoluteRoot)) {
    return [];
  }

  const stats = statSync(absoluteRoot);
  if (!stats.isDirectory()) {
    return stats.isFile() ? [toPosixPath(relative(cwd, absoluteRoot))] : [];
  }

  const files: string[] = [];
  const entries = readdirSync(absoluteRoot, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(relativePath, cwd));
      continue;
    }

    if (entry.isFile()) {
      files.push(toPosixPath(relativePath));
    }
  }

  return files;
}

function collectGlobMatches(input: string, cwd: string): string[] {
  const root = getGlobSearchRoot(input);
  const matchers = expandBraces(input).map(globToRegExp);

  return collectFiles(root, cwd)
    .map(toPosixPath)
    .filter((candidate) => matchers.some((matcher) => matcher.test(candidate)))
    .sort();
}

function collectDirectoryTests(input: string, cwd: string): string[] {
  const pattern = `${toPosixPath(input).replace(/\/$/u, '')}/${TEST_GLOB}`;
  return collectGlobMatches(pattern, cwd);
}

function resolveSingleInput(input: string, cwd: string): string[] {
  const absolutePath = join(cwd, input);

  if (existsSync(absolutePath)) {
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      return collectDirectoryTests(input, cwd);
    }

    return [toPosixPath(relative(cwd, absolutePath))];
  }

  if (GLOB_CHARS.test(input)) {
    const matches = collectGlobMatches(input, cwd);
    return matches.length > 0 ? matches.filter(isTestFile) : [toPosixPath(input)];
  }

  return [toPosixPath(input)];
}

export function resolveTestInputs(inputs: string[], options?: { cwd?: string }): string[] {
  const cwd = options?.cwd ?? process.cwd();
  const resolved = new Set<string>();

  for (const input of inputs) {
    for (const candidate of resolveSingleInput(input, cwd)) {
      if (!isTestFile(candidate) && candidate !== toPosixPath(input)) {
        continue;
      }

      resolved.add(candidate);
    }
  }

  return [...resolved].sort();
}
