import type { WebDriver } from 'selenium-webdriver';

export interface StudentPolicyDriverState {
  diagnosticsDir: string;
  getDriver(): WebDriver;
  getExtensionUuid(): string;
}
