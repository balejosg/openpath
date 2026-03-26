export interface BuildWebExtSignArgsOptions {
  apiKey: string;
  apiSecret: string;
  artifactsDir: string;
  sourceDir?: string;
}

export function buildWebExtSignArgs(options: BuildWebExtSignArgsOptions): string[];

export function findSignedXpiArtifact(artifactsDir: string): string;
