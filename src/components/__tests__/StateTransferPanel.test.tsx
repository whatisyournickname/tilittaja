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
import StateTransferPanel from '../StateTransferPanel';

const { mockRefresh, importStateTransferAction } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  importStateTransferAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock('@/actions/app-actions', () => ({
  importStateTransferAction,
}));

describe('StateTransferPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('keeps the import action disabled until a file is selected', async () => {
    render(<StateTransferPanel sourceSlug="demo" sourceName="Demo Oy" />);

    expect(
      screen.getByRole('button', { name: /Restore from export/i }),
    ).toBeDisabled();
    expect(screen.getByText('No file selected.')).toBeInTheDocument();
  });

  it('does nothing when the user cancels confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<StateTransferPanel sourceSlug="demo" sourceName="Demo Oy" />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([Buffer.from('zip')], 'state.zip', {
      type: 'application/zip',
    });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(
      screen.getByRole('button', { name: /Restore from export/i }),
    );

    expect(importStateTransferAction).not.toHaveBeenCalled();
  });

  it('imports the selected archive and shows success details', async () => {
    importStateTransferAction.mockResolvedValue({
      success: true,
      source: 'demo',
      fileCount: 2,
      restoredAt: '2026-04-05T00:00:00.000Z',
      manifest: {
        sourceName: 'Demo Oy',
        createdAt: '2026-04-04T23:00:00.000Z',
      },
    });

    render(<StateTransferPanel sourceSlug="demo" sourceName="Demo Oy" />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([Buffer.from('zip')], 'state.zip', {
      type: 'application/zip',
    });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(
      screen.getByRole('button', { name: /Restore from export/i }),
    );

    await waitFor(() => {
      expect(importStateTransferAction).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByText(/Restore successful/i)).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.getByText('No file selected.')).toBeInTheDocument();
  });

  it('shows import failures', async () => {
    importStateTransferAction.mockRejectedValue(new Error('Virheellinen ZIP'));

    render(<StateTransferPanel sourceSlug="demo" sourceName="Demo Oy" />);
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([Buffer.from('zip')], 'state.zip', {
      type: 'application/zip',
    });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(
      screen.getByRole('button', { name: /Restore from export/i }),
    );

    expect(await screen.findByText('Virheellinen ZIP')).toBeInTheDocument();
  });
});
