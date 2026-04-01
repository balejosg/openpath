import { describe, expect, it } from 'vitest';

import * as publicShell from '../shell';

describe('public shell surface', () => {
  it('exports stable shell views and components', () => {
    expect(typeof publicShell.Sidebar).toBe('function');
    expect(typeof publicShell.Header).toBe('function');
    expect(typeof publicShell.Dashboard).toBe('function');
    expect(typeof publicShell.TeacherDashboard).toBe('function');
    expect(typeof publicShell.Classrooms).toBe('function');
    expect(typeof publicShell.Groups).toBe('function');
    expect(typeof publicShell.RulesManager).toBe('function');
    expect(typeof publicShell.DomainRequests).toBe('function');
    expect(typeof publicShell.Settings).toBe('function');
  });
});
