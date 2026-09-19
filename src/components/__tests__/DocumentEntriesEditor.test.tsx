// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import DocumentEntriesEditor from '../DocumentEntriesEditor';

const { saveDocumentEntriesAction, updateEntryDescriptionAction } = vi.hoisted(
  () => ({
    saveDocumentEntriesAction: vi.fn(),
    updateEntryDescriptionAction: vi.fn(),
  }),
);

vi.mock('@/actions/app-actions', () => ({
  saveDocumentEntriesAction,
  updateEntryDescriptionAction,
}));

const mockRouter = {
  refresh: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const entries = [
  {
    id: 10,
    account_number: '1000',
    account_name: 'Kassa',
    description: 'Testi debet',
    debit: true,
    amount: 100,
    row_number: 1,
  },
  {
    id: 11,
    account_number: '3000',
    account_name: 'Myynti',
    description: 'Testi kredit',
    debit: false,
    amount: 100,
    row_number: 2,
  },
];

describe('DocumentEntriesEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEntryDescriptionAction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders entry rows with account and description', () => {
    render(<DocumentEntriesEditor documentId={1} initialEntries={entries} />);

    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('3000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Testi debet')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Testi kredit')).toBeInTheDocument();
  });

  it('shows balanced totals', () => {
    render(<DocumentEntriesEditor documentId={1} initialEntries={entries} />);

    const matches = screen.getAllByText(/100,00/);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('shows save button as disabled when no changes', () => {
    render(<DocumentEntriesEditor documentId={1} initialEntries={entries} />);

    const saveButton = screen.getByRole('button', { name: /No changes/ });
    expect(saveButton).toBeDisabled();
  });

  it('saves description on blur', async () => {
    render(<DocumentEntriesEditor documentId={1} initialEntries={entries} />);

    const input = screen.getByDisplayValue('Testi debet');
    fireEvent.change(input, { target: { value: 'Uusi kuvaus' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(updateEntryDescriptionAction).toHaveBeenCalledWith(10, {
        description: 'Uusi kuvaus',
      });
    });
  });

  it('shows error when description save fails', async () => {
    updateEntryDescriptionAction.mockRejectedValue(
      new Error('Failed to save description.'),
    );

    render(<DocumentEntriesEditor documentId={1} initialEntries={entries} />);

    const input = screen.getByDisplayValue('Testi debet');
    fireEvent.change(input, { target: { value: 'Fail' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to save description.'),
      ).toBeInTheDocument();
    });
  });
});
