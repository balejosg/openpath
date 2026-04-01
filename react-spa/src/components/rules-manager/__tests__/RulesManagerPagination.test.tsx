import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RulesManagerPagination } from '../RulesManagerPagination';

describe('RulesManagerPagination', () => {
  it('renders pagination summary and advances to the next page', () => {
    const onPageChange = vi.fn();

    render(
      <RulesManagerPagination
        viewMode="flat"
        loading={false}
        error={null}
        page={1}
        totalPages={3}
        total={120}
        totalGroups={0}
        visibleGroups={0}
        onPageChange={onPageChange}
      />
    );

    fireEvent.click(screen.getAllByRole('button')[1]);

    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1-50 de 120 reglas')).toBeInTheDocument();
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
