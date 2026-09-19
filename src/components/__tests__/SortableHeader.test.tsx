// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SortableHeader } from '../SortableHeader';

afterEach(() => {
  cleanup();
});

describe('SortableHeader', () => {
  it('renders without crashing', () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Pvm"
              sortKey="date"
              current={null}
              onSort={onSort}
            />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader', { name: /Pvm/i })).toBeDefined();
  });

  it('invokes onSort with sortKey when clicked', () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Pvm"
              sortKey="date"
              current={null}
              onSort={onSort}
            />
          </tr>
        </thead>
      </table>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Pvm/i }));
    expect(onSort).toHaveBeenCalledWith('date');
  });

  it('renders resize handle when onResizePointerDown is provided', () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableHeader
              label="Summa"
              sortKey="amount"
              current={{ key: 'amount', direction: 'asc' }}
              onSort={onSort}
              onResizePointerDown={vi.fn()}
            />
          </tr>
        </thead>
      </table>,
    );
    expect(
      screen.getByRole('separator', {
        name: /Resize column Summa width/i,
      }),
    ).toBeDefined();
  });
});
