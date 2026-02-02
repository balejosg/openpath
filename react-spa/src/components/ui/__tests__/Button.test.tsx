import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button Component', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows loading spinner and is disabled when isLoading is true', () => {
    render(<Button isLoading>Loading</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('applies variant and size classes', () => {
    const { rerender } = render(
      <Button variant="danger" size="lg">
        Danger Large
      </Button>
    );
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-red-600');
    expect(button).toHaveClass('h-12');

    rerender(
      <Button variant="outline" size="sm">
        Outline Small
      </Button>
    );
    expect(button).toHaveClass('border-slate-200');
    expect(button).toHaveClass('h-8');
  });
});
