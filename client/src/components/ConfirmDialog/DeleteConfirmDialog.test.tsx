/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type * as DeleteImpactApiTypes from '../../lib/deleteImpactApi.js';
import type * as DeleteConfirmDialogTypes from './DeleteConfirmDialog.js';

const mockFetch = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
jest.unstable_mockModule('../../lib/deleteImpactApi.js', () => ({ fetchDeleteImpact: mockFetch }));

let DeleteConfirmDialog: typeof DeleteConfirmDialogTypes.DeleteConfirmDialog;
type Props = Parameters<typeof DeleteConfirmDialogTypes.DeleteConfirmDialog>[0];

beforeEach(async () => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    entityType: 'area',
    id: '7',
    effects: [
      { kind: 'childAreas', count: 2 },
      { kind: 'photosLoseArea', count: 0 },
    ],
  });
  if (!DeleteConfirmDialog) ({ DeleteConfirmDialog } = await import('./DeleteConfirmDialog.js'));
});

afterEach(() => {
  delete document.documentElement.dataset.scrollLocked;
});

function props(overrides: Partial<Props> = {}): Props {
  return {
    entityType: 'area',
    id: 7,
    name: 'Sample Roof',
    busy: false,
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    testIdPrefix: 'sample-delete',
    ...overrides,
  };
}

describe('DeleteConfirmDialog', () => {
  it('is an alertdialog titled "Delete <name>?"', async () => {
    render(<DeleteConfirmDialog {...props()} />);
    expect(screen.getByRole('alertdialog', { name: 'Delete Sample Roof?' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('sample-delete-consequences')).toBeInTheDocument(),
    );
  });

  it('asks the server for the dry-run counts of the record and lists non-zero ones only', async () => {
    render(<DeleteConfirmDialog {...props()} />);
    const list = await screen.findByTestId('sample-delete-consequences');
    expect(mockFetch).toHaveBeenCalledWith('area', 7);
    expect(list.querySelectorAll('li')).toHaveLength(1);
    expect(list.querySelector('li')).toHaveTextContent('2');
  });

  it('shows a loading skeleton before the counts arrive', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<DeleteConfirmDialog {...props()} />);
    expect(screen.queryByTestId('sample-delete-consequences')).toBeNull();
    expect(screen.getByTestId('sample-delete-confirm')).toHaveAttribute('aria-disabled', 'true');
  });

  it('says the delete cannot be undone by default', async () => {
    render(<DeleteConfirmDialog {...props()} />);
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    await screen.findByTestId('sample-delete-consequences');
  });

  it('omits the irreversible note when irreversible is false', async () => {
    render(<DeleteConfirmDialog {...props({ irreversible: false })} />);
    await screen.findByTestId('sample-delete-consequences');
    expect(screen.queryByText("This can't be undone.")).toBeNull();
  });

  it('shows an error with Retry when the counts fail, and Retry refetches', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));
    render(<DeleteConfirmDialog {...props()} />);
    const retry = await screen.findByTestId('sample-delete-retry');
    fireEvent.click(retry);
    await screen.findByTestId('sample-delete-consequences');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('hides the Delete action once the delete was blocked', async () => {
    render(<DeleteConfirmDialog {...props({ blocked: true })} />);
    expect(screen.queryByTestId('sample-delete-confirm')).toBeNull();
    expect(screen.getByTestId('sample-delete-cancel')).toBeInTheDocument();
    await screen.findByTestId('sample-delete-consequences');
  });

  it('shows "Deleting…" and ignores clicks while busy', async () => {
    const onConfirm = jest.fn();
    render(<DeleteConfirmDialog {...props({ busy: true, onConfirm })} />);
    const confirm = screen.getByTestId('sample-delete-confirm');
    expect(confirm).toHaveTextContent('Deleting…');
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    await screen.findByTestId('sample-delete-consequences');
  });

  it('renders the error message passed by the host', async () => {
    render(<DeleteConfirmDialog {...props({ error: 'Could not delete.' })} />);
    expect(screen.getByText('Could not delete.')).toBeInTheDocument();
    await screen.findByTestId('sample-delete-consequences');
  });

  it('confirms once the counts have loaded', async () => {
    const onConfirm = jest.fn();
    render(<DeleteConfirmDialog {...props({ onConfirm })} />);
    await screen.findByTestId('sample-delete-consequences');
    fireEvent.click(screen.getByTestId('sample-delete-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels from the Cancel button and from Escape', async () => {
    const onCancel = jest.fn();
    render(<DeleteConfirmDialog {...props({ onCancel })} />);
    await screen.findByTestId('sample-delete-consequences');
    fireEvent.click(screen.getByTestId('sample-delete-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('focuses Cancel first', async () => {
    render(<DeleteConfirmDialog {...props()} />);
    expect(screen.getByTestId('sample-delete-cancel')).toHaveFocus();
    await screen.findByTestId('sample-delete-consequences');
  });
});
