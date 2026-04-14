import fs from 'node:fs';

import { getErrorMessage } from '@openpath/shared';

import {
  getChromiumManagedCrxFile,
  getChromiumManagedMetadataFile,
  getFirefoxReleaseMetadataFile,
  getFirefoxReleaseXpiFile,
  type ChromiumManagedMetadata,
  type FirefoxReleaseMetadata,
} from './server-asset-roots.js';
import { logger } from './logger.js';

export function readChromiumManagedMetadata(): ChromiumManagedMetadata | null {
  const metadataFile = getChromiumManagedMetadataFile();
  const crxFile = getChromiumManagedCrxFile();
  if (!fs.existsSync(metadataFile) || !fs.existsSync(crxFile)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(metadataFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ChromiumManagedMetadata>;
    if (!parsed.extensionId || !parsed.version) {
      return null;
    }

    return {
      extensionId: parsed.extensionId,
      version: parsed.version,
    };
  } catch (error) {
    logger.warn('Failed to read Chromium managed extension metadata', {
      error: getErrorMessage(error),
      path: metadataFile,
    });
    return null;
  }
}

export function readFirefoxReleaseMetadata(): FirefoxReleaseMetadata | null {
  const metadataFile = getFirefoxReleaseMetadataFile();
  const xpiFile = getFirefoxReleaseXpiFile();
  if (!fs.existsSync(metadataFile) || !fs.existsSync(xpiFile)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(metadataFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<FirefoxReleaseMetadata>;
    if (!parsed.extensionId || !parsed.version) {
      return null;
    }

    return {
      extensionId: parsed.extensionId,
      version: parsed.version,
    };
  } catch (error) {
    logger.warn('Failed to read Firefox release extension metadata', {
      error: getErrorMessage(error),
      path: metadataFile,
    });
    return null;
  }
}
