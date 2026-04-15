import { existsSync, globSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const TEST_GLOB = '**/*.{test,spec}.{ts,tsx}';
const GLOB_CHARS = /[*?[\]{}]/u;

function toPosixPath(value: string): string {
  return value.replaceAll(sep, '/');
}

function isTestFile(pathname: string): boolean {
  return /\.(test|spec)\.(ts|tsx)$/u.test(pathname);
}

function collectDirectoryTests(input: string, cwd: string): string[] {
  const pattern = `${toPosixPath(input).replace(/\/$/u, '')}/${TEST_GLOB}`;
  return globSync(pattern, { cwd }).map(toPosixPath).sort();
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
    const matches = globSync(input, { cwd }).map(toPosixPath).sort();
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
