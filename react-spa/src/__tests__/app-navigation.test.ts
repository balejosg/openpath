import { describe, expect, it } from 'vitest';
import {
  getAuthViewFromPathname,
  getPathForAuthView,
  getPathForTab,
  getTabFromPathname,
  isAuthPath,
  normalizePathname,
} from '../app-navigation';

describe('app-navigation', () => {
  it('normalizes trailing slashes without collapsing root', () => {
    expect(normalizePathname('/aulas///')).toBe('/aulas');
    expect(normalizePathname('/')).toBe('/');
    expect(normalizePathname('')).toBe('/');
  });

  it('maps pathnames to tabs', () => {
    expect(getTabFromPathname('/')).toBe('dashboard');
    expect(getTabFromPathname('/dashboard/')).toBe('dashboard');
    expect(getTabFromPathname('/aulas/1')).toBe('classrooms');
    expect(getTabFromPathname('/politicas')).toBe('groups');
    expect(getTabFromPathname('/reglas')).toBe('rules');
    expect(getTabFromPathname('/usuarios')).toBe('users');
    expect(getTabFromPathname('/dominios')).toBe('domains');
    expect(getTabFromPathname('/settings')).toBe('settings');
    expect(getTabFromPathname('/desconocido')).toBe('dashboard');
  });

  it('maps auth pathnames and explicit auth routes', () => {
    expect(getAuthViewFromPathname('/')).toBe('login');
    expect(getAuthViewFromPathname('/login')).toBe('login');
    expect(getAuthViewFromPathname('/register')).toBe('register');
    expect(getAuthViewFromPathname('/forgot-password')).toBe('forgot-password');
    expect(getAuthViewFromPathname('/reset-password')).toBe('reset-password');

    expect(isAuthPath('/')).toBe(true);
    expect(isAuthPath('/login')).toBe(true);
    expect(isAuthPath('/register')).toBe(true);
    expect(isAuthPath('/forgot-password')).toBe(true);
    expect(isAuthPath('/reset-password')).toBe(true);
    expect(isAuthPath('/aulas')).toBe(false);
  });

  it('maps tabs and auth views back to route paths', () => {
    expect(getPathForTab('dashboard')).toBe('/');
    expect(getPathForTab('classrooms')).toBe('/aulas');
    expect(getPathForTab('groups')).toBe('/politicas');
    expect(getPathForTab('rules')).toBe('/reglas');
    expect(getPathForTab('users')).toBe('/usuarios');
    expect(getPathForTab('domains')).toBe('/dominios');
    expect(getPathForTab('settings')).toBe('/configuracion');
    expect(getPathForTab('unknown')).toBe('/');

    expect(getPathForAuthView('login')).toBe('/login');
    expect(getPathForAuthView('register')).toBe('/register');
    expect(getPathForAuthView('forgot-password')).toBe('/forgot-password');
    expect(getPathForAuthView('reset-password')).toBe('/reset-password');
  });
});
