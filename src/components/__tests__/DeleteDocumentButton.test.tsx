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
import DeleteDocumentButton from '../DeleteDocumentButton';

const { mockPush, mockRefresh, deleteDocumentAction } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  deleteDocumentAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

vi.mock('@/actions/app-actions', () => ({
  deleteDocumentAction,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeleteDocumentButton', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    render(<DeleteDocumentButton documentId={1} documentCode="2024-001" />);
    expect(
      screen.getByRole('button', { name: /Delete document/i }),
    ).toBeDefined();
  });

  it('renders custom children when provided', () => {
    render(
      <DeleteDocumentButton documentId={1} documentCode="2024-001">
        Delete this
      </DeleteDocumentButton>,
    );
    expect(screen.getByRole('button', { name: /Delete this/i })).toBeDefined();
  });

  it('calls the delete action and refreshes when user confirms deletion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteDocumentAction.mockResolvedValue({ ok: true });

    render(<DeleteDocumentButton documentId={42} documentCode="MU-42" />);
    fireEvent.click(screen.getByRole('button', { name: /Delete document/i }));

    await waitFor(() => {
      expect(deleteDocumentAction).toHaveBeenCalledWith(42);
    });
    expect(mockRefresh).toHaveBeenCalled();
  });
});
