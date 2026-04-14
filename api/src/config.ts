export { loadConfig, type LoadedConfig } from './config-loader.js';
export { config, reloadConfig, setConfigForTests } from './config-state.js';
export type Config = import('./config-loader.js').LoadedConfig;
