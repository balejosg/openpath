#!/usr/bin/env node

import { computeFirefoxReleasePayloadHash } from './sign-firefox-release.mjs';

try {
  process.stdout.write(computeFirefoxReleasePayloadHash());
} catch (error) {
  console.error(
    `[firefox-release-payload-hash] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
}
