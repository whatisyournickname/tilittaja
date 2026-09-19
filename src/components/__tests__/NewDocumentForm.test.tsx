// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NewDocumentForm from '../NewDocumentForm';

const mockRouter = {
  push: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/AccountPickerModal', () => ({
  default: () => null,
}));

const accounts = [
  { id: 1, number: '1000', name: 'Kassa', type: 0, vat_percentage: 0 },
];

describe('NewDocumentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders date input and two initial rows', () => {
    render(
      <NewDocumentForm periodId={1} periodLocked={false} accounts={accounts} />,
    );

    expect(
      screen.getByDisplayValue(new Date().toISOString().split('T')[0]),
    ).toBeInTheDocument();

    const selectButtons = screen.getAllByText('Select account');
    expect(selectButtons).toHaveLength(2);
  });

  it('shows locked period warning', () => {
    render(
      <NewDocumentForm periodId={1} periodLocked={true} accounts={accounts} />,
    );

    expect(screen.getByText(/locked/)).toBeInTheDocument();
  });

  it('adds a new row', () => {
    render(
      <NewDocumentForm periodId={1} periodLocked={false} accounts={accounts} />,
    );

    fireEvent.click(screen.getByText('Add row'));

    const selectButtons = screen.getAllByText('Select account');
    expect(selectButtons).toHaveLength(3);
  });

  it('shows balance status', () => {
    render(
      <NewDocumentForm periodId={1} periodLocked={false} accounts={accounts} />,
    );

    expect(screen.getByText('Document is balanced')).toBeInTheDocument();
  });

  it('disables save when period is locked', () => {
    render(
      <NewDocumentForm periodId={1} periodLocked={true} accounts={accounts} />,
    );

    const saveButton = screen.getByRole('button', { name: /Save/ });
    expect(saveButton).toBeDisabled();
  });
});
