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
import ReceiptAttachmentPanel from '../ReceiptAttachmentPanel';

const { uploadDocumentReceiptAction } = vi.hoisted(() => ({
  uploadDocumentReceiptAction: vi.fn(),
}));

vi.mock('@/actions/app-actions', () => ({
  uploadDocumentReceiptAction,
  updateDocumentReceiptAction: vi.fn(),
}));

describe('ReceiptAttachmentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uploads receipts through the document receipt route', async () => {
    const onReceiptChange = vi.fn();
    uploadDocumentReceiptAction.mockResolvedValue({
      receiptPath: 'tositteet/2025-2025/MU-7.pdf',
      receiptSource: 'manual',
    });

    const { container } = render(
      <ReceiptAttachmentPanel
        documentId={5}
        documentNumber={7}
        initialReceiptPath={null}
        initialReceiptSource={null}
        onReceiptChange={onReceiptChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Attach document/i }));

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([Buffer.from('%PDF-1.4')], 'receipt.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadDocumentReceiptAction).toHaveBeenCalledTimes(1);
    });

    expect(uploadDocumentReceiptAction).toHaveBeenCalledWith(5, file);

    expect(
      await screen.findByText('tositteet/2025-2025/MU-7.pdf'),
    ).toBeInTheDocument();
    expect(onReceiptChange).toHaveBeenCalledWith(
      'tositteet/2025-2025/MU-7.pdf',
      'manual',
    );
  });

  it('opens the receipt preview in a full-screen modal', async () => {
    render(
      <ReceiptAttachmentPanel
        documentId={5}
        documentNumber={7}
        initialReceiptPath="tositteet/2025-2025/MU-7.pdf"
        initialReceiptSource="manual"
      />,
    );

    expect(screen.getByTitle('Document 7 PDF')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open larger/i }));

    expect(
      await screen.findByRole('dialog', {
        name: /Document 7 PDF preview/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle('Document 7 PDF (expanded)')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Close PDF preview/i }),
    );

    await waitFor(() => {
      expect(
        screen.queryByTitle('Document 7 PDF (expanded)'),
      ).not.toBeInTheDocument();
    });

    expect(screen.getByTitle('Document 7 PDF')).toBeInTheDocument();
  });
});
