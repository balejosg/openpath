import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RulesManagerToolbar } from '../RulesManagerToolbar';

describe('RulesManagerToolbar', () => {
  it('forwards search and add-rule actions and renders type guidance', () => {
    const onSearchChange = vi.fn();
    const onInputChange = vi.fn();
    const onAddRule = vi.fn();
    const onOpenImport = vi.fn();
    const onExport = vi.fn();

    render(
      <RulesManagerToolbar
        readOnly={false}
        search=""
        countsAll={3}
        newValue="example.com"
        adding={false}
        loading={false}
        inputError=""
        validationError=""
        rulesCount={3}
        detectedType={{ type: 'whitelist', confidence: 'high' }}
        onSearchChange={onSearchChange}
        onInputChange={onInputChange}
        onAddRule={onAddRule}
        onAddKeyDown={vi.fn()}
        onOpenImport={onOpenImport}
        onExport={onExport}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Buscar en 3 reglas...'), {
      target: { value: 'google' },
    });
    fireEvent.change(screen.getByPlaceholderText('Añadir dominio, subdominio o ruta...'), {
      target: { value: 'docs.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /añadir/i }));
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    expect(onSearchChange).toHaveBeenCalledWith('google');
    expect(onInputChange).toHaveBeenCalledWith('docs.example.com');
    expect(onAddRule).toHaveBeenCalled();
    expect(onOpenImport).toHaveBeenCalled();
    expect(screen.getByText(/se añadirá como/i)).toBeInTheDocument();
  });
});
