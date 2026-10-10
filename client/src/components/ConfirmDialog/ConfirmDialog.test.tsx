/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog.js';

type Props = ComponentProps<typeof ConfirmDialog>;

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    title: 'Delete Kitchen?',
    confirmLabel: 'Delete',
    busyLabel: 'Deleting…',
    busy: false,
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

afterEach(() => {
  delete document.documentElement.dataset.scrollLocked;
});

describe('ConfirmDialog', () => {
  describe('semantics', () => {
    it('is an alertdialog named by the title and described by the body', () => {
      render(
        <ConfirmDialog {...baseProps({ lead: 'Kitchen has no photos.', irreversible: true })} />,
      );
      const dialog = screen.getByRole('alertdialog', { name: 'Delete Kitchen?' });
      const describedBy = dialog.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      const description = document.getElementById(describedBy!)!;
      expect(description).toHaveTextContent('Kitchen has no photos.');
      expect(description).toHaveTextContent("This can't be undone.");
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('puts initial focus on Cancel, never on the destructive action', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
    });

    it('labels the cancel button "Cancel" by default and honours cancelLabel', () => {
      const { rerender } = render(<ConfirmDialog {...baseProps()} />);
      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Cancel');
      rerender(<ConfirmDialog {...baseProps({ cancelLabel: 'Keep editing' })} />);
      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Keep editing');
    });

    it('omits "can\'t be undone" unless irreversible', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.queryByText("This can't be undone.")).toBeNull();
    });
  });

  describe('test ids', () => {
    it('derives every test id from testIdPrefix', () => {
      render(
        <ConfirmDialog
          {...baseProps({
            testIdPrefix: 'delete-area',
            consequences: { status: 'ready', items: [{ label: 'Sub-areas', count: 2 }] },
          })}
        />,
      );
      expect(screen.getByTestId('delete-area-cancel')).toBeInTheDocument();
      expect(screen.getByTestId('delete-area-confirm')).toBeInTheDocument();
      expect(screen.getByTestId('delete-area-consequences')).toBeInTheDocument();
    });

    it('defaults the prefix to confirm-dialog', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.getByTestId('confirm-dialog-confirm')).toBeInTheDocument();
    });

    it('exposes the retry test id when counts failed', () => {
      render(
        <ConfirmDialog
          {...baseProps({
            testIdPrefix: 'p',
            consequences: { status: 'error', onRetry: jest.fn() },
          })}
        />,
      );
      expect(screen.getByTestId('p-retry')).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('Confirm calls onConfirm once', () => {
      const props = baseProps();
      render(<ConfirmDialog {...props} />);
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      expect(props.onConfirm).toHaveBeenCalledTimes(1);
      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it('Cancel, Escape, the backdrop and the close button all cancel', () => {
      const props = baseProps();
      const { baseElement } = render(<ConfirmDialog {...props} />);
      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.click(baseElement.querySelector('[class*="modalBackdrop"]')!);
      fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
      expect(props.onCancel).toHaveBeenCalledTimes(4);
    });

    it('while busy: shows the busy label, aria-disables both buttons and ignores every dismissal', () => {
      const props = baseProps({ busy: true });
      const { baseElement } = render(<ConfirmDialog {...props} />);
      const confirm = screen.getByTestId('confirm-dialog-confirm');
      const cancel = screen.getByTestId('confirm-dialog-cancel');
      expect(confirm).toHaveTextContent('Deleting…');
      expect(confirm).toHaveAttribute('aria-disabled', 'true');
      expect(cancel).toHaveAttribute('aria-disabled', 'true');
      // aria-disabled, never the disabled attribute, so focus is not lost.
      expect(confirm).not.toBeDisabled();
      expect(cancel).not.toBeDisabled();

      fireEvent.click(confirm);
      fireEvent.click(cancel);
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.click(baseElement.querySelector('[class*="modalBackdrop"]')!);
      expect(props.onConfirm).not.toHaveBeenCalled();
      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it('is not aria-disabled when idle', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.getByTestId('confirm-dialog-confirm')).not.toHaveAttribute('aria-disabled');
      expect(screen.getByTestId('confirm-dialog-cancel')).not.toHaveAttribute('aria-disabled');
    });
  });

  describe('blocked', () => {
    it('hides the action so only Cancel remains', () => {
      render(<ConfirmDialog {...baseProps({ blocked: true, error: 'Still in use.' })} />);
      expect(screen.queryByTestId('confirm-dialog-confirm')).toBeNull();
      expect(screen.getByTestId('confirm-dialog-cancel')).toBeInTheDocument();
    });

    it('shows the action by default', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.getByTestId('confirm-dialog-confirm')).toBeInTheDocument();
    });
  });

  describe('server error', () => {
    it('stays visible inside the dialog', () => {
      render(<ConfirmDialog {...baseProps({ error: 'Cannot delete: in use.' })} />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Cannot delete: in use.');
      expect(screen.getByRole('alertdialog')).toContainElement(alert);
    });

    it('renders no alert without an error', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('consequences', () => {
    it('loading: shows a skeleton and aria-disables the action', () => {
      const props = baseProps({ consequences: { status: 'loading' } });
      render(<ConfirmDialog {...props} />);
      expect(screen.getByLabelText('Loading...', { exact: false })).toBeInTheDocument();
      const confirm = screen.getByTestId('confirm-dialog-confirm');
      expect(confirm).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(confirm);
      expect(props.onConfirm).not.toHaveBeenCalled();
    });

    it('error: shows the failure, keeps the action disabled and Retry calls onRetry', () => {
      const onRetry = jest.fn();
      const props = baseProps({ consequences: { status: 'error', onRetry } });
      render(<ConfirmDialog {...props} />);
      expect(screen.getByText("Couldn't load what else is affected.")).toBeInTheDocument();
      const confirm = screen.getByTestId('confirm-dialog-confirm');
      expect(confirm).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(confirm);
      expect(props.onConfirm).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('confirm-dialog-retry'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('ready: lists the non-zero counts under the intro and enables the action', () => {
      const props = baseProps({
        consequences: {
          status: 'ready',
          items: [
            { label: 'Sub-areas deleted with it:', count: 3 },
            { label: 'Photos that lose their area:', count: 0 },
            { label: 'Notes deleted with it:', count: 12 },
          ],
        },
      });
      render(<ConfirmDialog {...props} />);
      expect(screen.getByText('This also affects:')).toBeInTheDocument();
      const list = screen.getByTestId('confirm-dialog-consequences');
      const items = list.querySelectorAll('li');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Sub-areas deleted with it: 3');
      expect(items[1]).toHaveTextContent('Notes deleted with it: 12');
      expect(screen.queryByText('Photos that lose their area:')).toBeNull();
      const confirm = screen.getByTestId('confirm-dialog-confirm');
      expect(confirm).not.toHaveAttribute('aria-disabled');
      fireEvent.click(confirm);
      expect(props.onConfirm).toHaveBeenCalledTimes(1);
    });

    it('ready with only zero counts: no intro and no list', () => {
      render(
        <ConfirmDialog
          {...baseProps({
            consequences: { status: 'ready', items: [{ label: 'Sub-areas', count: 0 }] },
          })}
        />,
      );
      expect(screen.queryByText('This also affects:')).toBeNull();
      expect(screen.queryByTestId('confirm-dialog-consequences')).toBeNull();
    });

    it('omitted: no intro, no list, no skeleton', () => {
      render(<ConfirmDialog {...baseProps()} />);
      expect(screen.queryByText('This also affects:')).toBeNull();
      expect(screen.queryByTestId('confirm-dialog-consequences')).toBeNull();
      expect(screen.queryByTestId('confirm-dialog-retry')).toBeNull();
    });
  });

  describe('focus restore', () => {
    function Host({ withReturnRef }: { withReturnRef?: boolean }) {
      const [open, setOpen] = useState(false);
      const [openerGone, setOpenerGone] = useState(false);
      const fallbackRef = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <button ref={fallbackRef} type="button">
            fallback
          </button>
          {!openerGone && (
            <button type="button" onClick={() => setOpen(true)}>
              opener
            </button>
          )}
          <button type="button" onClick={() => setOpenerGone(true)}>
            remove opener
          </button>
          {open && (
            <ConfirmDialog
              {...baseProps({
                onCancel: () => setOpen(false),
                returnFocusRef: withReturnRef ? fallbackRef : undefined,
              })}
            />
          )}
        </div>
      );
    }

    it('returns focus to the opener after Cancel', () => {
      render(<Host />);
      const opener = screen.getByRole('button', { name: 'opener' });
      opener.focus();
      fireEvent.click(opener);
      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus();
      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
      expect(opener).toHaveFocus();
    });

    it('returns focus to returnFocusRef when the opener is gone', () => {
      function GoneHost() {
        const [open, setOpen] = useState(true);
        const fallbackRef = useRef<HTMLButtonElement>(null);
        return (
          <div>
            <button ref={fallbackRef} type="button">
              fallback
            </button>
            {open && (
              <ConfirmDialog
                {...baseProps({ onCancel: () => setOpen(false), returnFocusRef: fallbackRef })}
              />
            )}
          </div>
        );
      }
      render(<GoneHost />);
      // Mounted open: the opener captured at mount is the body, so the fallback takes over.
      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
      expect(screen.getByRole('button', { name: 'fallback' })).toHaveFocus();
    });
  });
});
