// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SearchInput from '../SearchInput';

afterEach(() => {
  cleanup();
});

describe('SearchInput', () => {
  it('renders without crashing', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    expect(screen.getByPlaceholderText('Search...')).toBeDefined();
  });

  it('shows custom placeholder', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="Etsi…" />);
    expect(screen.getByPlaceholderText('Etsi…')).toBeDefined();
  });

  it('calls onChange when typing', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('shows clear control when value is non-empty and clears on click', () => {
    const onChange = vi.fn();
    render(<SearchInput value="hello" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
