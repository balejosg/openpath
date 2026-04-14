import { loadConfig, type LoadedConfig } from './config-loader.js';

export let config = loadConfig();

export function reloadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env
): LoadedConfig {
  config = loadConfig(env);
  return config;
}

export function setConfigForTests(nextConfig: LoadedConfig): void {
  config = nextConfig;
}
