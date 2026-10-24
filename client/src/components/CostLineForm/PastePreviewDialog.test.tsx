/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { PastePreviewDialog } from './PastePreviewDialog.js';
import type { MappedPasteRow, PasteColumn } from './pasteRows.js';

let media: MatchMediaControl;

beforeEach(() => {
  media = installMatchMedia({ '(min-width: 768px)': true });
});

const TABLE = [
  ['Tile', '2', '10'],
  ['Glue', '1', '3'],
  ['Grout', '4', '2'],
  ['Paint', '1', '60'],
  ['Brush', '2', '5'],
  ['Tape', '3', '1'],
];
const MAPPING: PasteColumn[] = ['description', 'quantity', 'unitPrice'];

function setup(over: Partial<ComponentProps<typeof PastePreviewDialog>> = {}) {
  const onInsert = jest.fn<(rows: readonly MappedPasteRow[]) => void>();
  const onClose = jest.fn<() => void>();
  const user = userEvent.setup();
  render(
    <PastePreviewDialog
      table={TABLE}
      columnCount={3}
      mapping={MAPPING}
      locale="en"
      onInsert={onInsert}
      onClose={onClose}
      {...over}
    />,
  );
  return { user, onInsert, onClose };
}

describe('PastePreviewDialog', () => {
  it('previews the first five rows with a select per column and the row count', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Check pasted rows' });
    expect(
      within(dialog).getByRole('table', { name: 'First rows of the paste' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Brush')).toBeInTheDocument();
    expect(within(dialog).queryByText('Tape')).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(3);
    expect(within(dialog).getByLabelText('Column 3')).toHaveValue('unitPrice');
    expect(screen.getByTestId('paste-preview-status')).toHaveTextContent('6 rows, 0 problems');
    expect(screen.getByTestId('paste-preview-insert')).toHaveTextContent('Insert 6 lines');
  });

  it('remaps a column and inserts the rows as mapped', async () => {
    const { user, onInsert } = setup();
    await user.selectOptions(screen.getByLabelText('Column 2'), 'ignore');
    await user.click(screen.getByTestId('paste-preview-insert'));
    expect(onInsert).toHaveBeenCalledTimes(1);
    const rows = onInsert.mock.calls[0]![0];
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ description: 'Tile', quantity: '', unitPrice: '10' });
  });

  it('counts problems when a text column is mapped to a number', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText('Column 1'), 'unitPrice');
    expect(screen.getByTestId('paste-preview-status')).toHaveTextContent('6 problems');
  });

  it('uses a singular insert label for one row and pads missing cells and mapping', () => {
    setup({ table: [['Tile']], columnCount: 3, mapping: ['description'] });
    expect(screen.getByTestId('paste-preview-insert')).toHaveTextContent('Insert 1 line');
    expect(screen.getByLabelText('Column 3')).toHaveValue('ignore');
  });

  it('closes without inserting on Cancel', async () => {
    const { user, onClose, onInsert } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('is a full-screen sheet below 768px', () => {
    media.set('(min-width: 768px)', false);
    setup();
    expect(screen.getByRole('dialog', { name: 'Check pasted rows' })).toBeInTheDocument();
    expect(screen.getByTestId('paste-preview-insert')).toBeInTheDocument();
  });
});
