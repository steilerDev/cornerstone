/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { RefObject } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockFocusPageHeading = jest.fn<() => void>();
jest.unstable_mockModule('../../lib/focusPageHeading.js', () => ({
  focusPageHeading: mockFocusPageHeading,
}));

const { useFocusRestore } = await import('./useFocusRestore.js');

interface HostProps {
  readonly active?: boolean;
  readonly useReturn?: boolean;
  readonly skip?: boolean;
  readonly removeOpenerOnClose?: boolean;
  readonly removeOpenerAfterCommit?: boolean;
}

function Dialog({
  active,
  returnFocusRef,
  skipOpenerRef,
}: {
  active?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  skipOpenerRef?: RefObject<boolean>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusRestore(ref, { active, returnFocusRef, skipOpenerRef });
  return (
    <div ref={ref}>
      <button type="button" data-testid="inside">
        inside
      </button>
    </div>
  );
}

function Host({
  active,
  useReturn,
  skip,
  removeOpenerOnClose,
  removeOpenerAfterCommit,
}: HostProps) {
  const [open, setOpen] = useState(false);
  const [openerGone, setOpenerGone] = useState(false);
  const returnRef = useRef<HTMLButtonElement>(null);
  const skipRef = useRef(skip === true);
  return (
    <div>
      {!openerGone && (
        <button type="button" onClick={() => setOpen(true)}>
          opener
        </button>
      )}
      <button ref={returnRef} type="button">
        return target
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          if (removeOpenerOnClose) setOpenerGone(true);
          // Queued before the commit's own microtask: removes the opener once the sync restore has run.
          if (removeOpenerAfterCommit) {
            // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the test needs the removal to land synchronously inside this microtask
            queueMicrotask(() => flushSync(() => setOpenerGone(true)));
          }
        }}
        data-testid="closer"
      >
        close
      </button>
      {open && (
        <Dialog
          active={active}
          returnFocusRef={useReturn ? returnRef : undefined}
          skipOpenerRef={skipRef}
        />
      )}
    </div>
  );
}

async function openAndClose(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('opener'));
  const inside = screen.getByTestId('inside');
  act(() => inside.focus());
  // The dialog unmounts with focus inside it.
  act(() => {
    screen.getByTestId('closer').click();
  });
}

afterEach(() => {
  mockFocusPageHeading.mockReset();
});

describe('useFocusRestore', () => {
  it('restores focus to the opener captured at mount', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openAndClose(user);
    expect(screen.getByText('opener')).toHaveFocus();
    expect(mockFocusPageHeading).not.toHaveBeenCalled();
  });

  it('falls back to returnFocusRef when the opener is gone', async () => {
    const user = userEvent.setup();
    render(<Host useReturn removeOpenerOnClose />);
    await openAndClose(user);
    expect(screen.getByText('return target')).toHaveFocus();
    expect(mockFocusPageHeading).not.toHaveBeenCalled();
  });

  it('prefers returnFocusRef over the opener when skipOpenerRef is true', async () => {
    const user = userEvent.setup();
    render(<Host useReturn skip />);
    await openAndClose(user);
    expect(screen.getByText('return target')).toHaveFocus();
  });

  it('ends on the page heading when neither opener nor returnFocusRef is usable', async () => {
    const user = userEvent.setup();
    render(<Host removeOpenerOnClose />);
    await openAndClose(user);
    expect(mockFocusPageHeading).toHaveBeenCalled();
  });

  it('re-runs the chain after the commit when the restored opener is removed right away', async () => {
    const user = userEvent.setup();
    render(<Host useReturn removeOpenerAfterCommit />);
    await user.click(screen.getByText('opener'));
    act(() => screen.getByTestId('inside').focus());
    await act(async () => {
      screen.getByTestId('closer').click();
      await Promise.resolve();
    });
    expect(screen.queryByText('opener')).toBeNull();
    expect(screen.getByText('return target')).toHaveFocus();
  });

  it('does not move focus when the user already focused something outside the dialog', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByText('opener'));
    act(() => screen.getByText('return target').focus());
    act(() => {
      screen.getByTestId('closer').click();
    });
    // closing via the closer focuses the closer (a click focuses it), which is outside the dialog
    expect(screen.getByText('opener')).not.toHaveFocus();
    expect(mockFocusPageHeading).not.toHaveBeenCalled();
  });

  it('is a no-op with active: false', async () => {
    const user = userEvent.setup();
    render(<Host active={false} />);
    await user.click(screen.getByText('opener'));
    act(() => screen.getByTestId('inside').focus());
    act(() => {
      screen.getByTestId('closer').click();
    });
    expect(screen.getByText('opener')).not.toHaveFocus();
    expect(mockFocusPageHeading).not.toHaveBeenCalled();
  });
});
