import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RulesManagerHeader } from '../RulesManagerHeader';

describe('RulesManagerHeader', () => {
  it('navigates back and changes view mode', () => {
    const onBack = vi.fn();
    const onViewModeChange = vi.fn();

    render(
      <RulesManagerHeader
        groupName="Grupo 1"
        viewMode="flat"
        onBack={onBack}
        onViewModeChange={onViewModeChange}
      />
    );

    fireEvent.click(screen.getByTitle('Volver a grupos'));
    fireEvent.click(screen.getByTitle('Vista jerárquica'));

    expect(onBack).toHaveBeenCalled();
    expect(onViewModeChange).toHaveBeenCalledWith('hierarchical');
  });
});
