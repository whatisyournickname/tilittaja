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
import PeriodLockToggle from '../PeriodLockToggle';

const { mockRefresh, setPeriodLockAction } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  setPeriodLockAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock('@/actions/app-actions', () => ({
  setPeriodLockAction,
}));

describe('PeriodLockToggle', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('does not call the action when confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<PeriodLockToggle periodId={4} locked={false} label="2025" />);
    fireEvent.click(screen.getByRole('button', { name: /Lock/i }));

    expect(setPeriodLockAction).not.toHaveBeenCalled();
  });

  it('toggles the lock state and refreshes the route', async () => {
    setPeriodLockAction.mockResolvedValue({ ok: true, locked: true });

    render(<PeriodLockToggle periodId={4} locked={false} label="2025" />);
    fireEvent.click(screen.getByRole('button', { name: /Lock/i }));

    await waitFor(() => {
      expect(setPeriodLockAction).toHaveBeenCalledWith(4, true);
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows the saving state while the action is pending', async () => {
    let resolveAction!: () => void;
    setPeriodLockAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = () => resolve({ ok: true, locked: false });
        }),
    );

    render(<PeriodLockToggle periodId={4} locked={true} label="2025" />);
    fireEvent.click(screen.getByRole('button', { name: /Unlock/i }));

    expect(
      screen.getByRole('button', { name: /Saving/i }),
    ).toBeDisabled();
    resolveAction();
    await waitFor(() => {
      expect(setPeriodLockAction).toHaveBeenCalledWith(4, false);
    });
  });
});
