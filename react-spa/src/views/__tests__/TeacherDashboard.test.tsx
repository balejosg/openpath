import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeacherDashboard from '../TeacherDashboard';

let queryClient: QueryClient | null = null;

function renderTeacherDashboard() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TeacherDashboard />
    </QueryClientProvider>
  );
}

afterEach(() => {
  queryClient?.clear();
  queryClient = null;
});

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

describe('TeacherDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the teacher dashboard greeting', async () => {
    renderTeacherDashboard();
    await waitFor(() => {
      expect(screen.getByText('¡Hola, Profesor!')).toBeInTheDocument();
    });
  });
});
