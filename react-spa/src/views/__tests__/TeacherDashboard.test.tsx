import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TeacherDashboard from '../TeacherDashboard';

vi.mock('../../lib/trpc', () => ({
  trpc: {
    classrooms: {
      list: { query: vi.fn().mockResolvedValue([]) },
      setActiveGroup: { mutate: vi.fn() },
    },
    groups: {
      list: { query: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('../../lib/auth', () => ({
  getTeacherGroups: () => ['group-1'],
}));

describe('TeacherDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the teacher dashboard greeting', async () => {
    render(<TeacherDashboard />);
    await waitFor(() => {
      expect(screen.getByText('¡Hola, Profesor!')).toBeInTheDocument();
    });
  });
});
