import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from './DataTable.js';
import { DataTableColumnSettings } from './DataTableColumnSettings.js';

interface TestItem {
  id: string;
  title: string;
  amount: number;
}

const COLUMNS: ColumnDef<TestItem>[] = [
  { key: 'title', label: 'Title', defaultVisible: true, render: (i) => i.title },
  { key: 'amount', label: 'Amount', defaultVisible: true, render: (i) => i.amount },
  { key: 'id', label: 'ID', defaultVisible: false, render: (i) => i.id },
];

function renderSettings({
  columns = COLUMNS,
  visibleColumns = new Set(['title', 'amount']),
  onToggleColumn = jest.fn(),
  onMoveColumn = jest.fn(),
  onResetToDefaults = jest.fn(),
}: {
  columns?: ColumnDef<TestItem>[];
  visibleColumns?: Set<string>;
  onToggleColumn?: jest.Mock;
  onMoveColumn?: jest.Mock;
  onResetToDefaults?: jest.Mock;
} = {}) {
  return render(
    <DataTableColumnSettings<TestItem>
      columns={columns}
      visibleColumns={visibleColumns}
      onToggleColumn={onToggleColumn}
      onMoveColumn={onMoveColumn}
      onResetToDefaults={onResetToDefaults}
    />,
  );
}

describe('DataTableColumnSettings', () => {
  describe('trigger button', () => {
    it('renders a gear/settings button', () => {
      renderSettings();
      expect(screen.getByRole('button', { name: /column settings/i })).toBeInTheDocument();
    });

    it('button has aria-expanded="false" initially', () => {
      renderSettings();
      expect(screen.getByRole('button', { name: /column settings/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('button has aria-haspopup="dialog"', () => {
      renderSettings();
      expect(screen.getByRole('button', { name: /column settings/i })).toHaveAttribute(
        'aria-haspopup',
        'dialog',
      );
    });
  });

  describe('popover open/close', () => {
    it('does not show popover initially', () => {
      renderSettings();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows popover after clicking the trigger button', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('button has aria-expanded="true" when popover is open', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('button', { name: /column settings/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('hides popover after clicking trigger button again', async () => {
      const user = userEvent.setup();
      renderSettings();
      const triggerBtn = screen.getByRole('button', { name: /column settings/i });
      await user.click(triggerBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.click(triggerBtn);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('hides popover on Escape key press', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('hides popover on outside click', async () => {
      renderSettings();
      const triggerBtn = screen.getByRole('button', { name: /column settings/i });
      await userEvent.click(triggerBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      act(() => {
        const event = new MouseEvent('mousedown', { bubbles: true });
        document.body.dispatchEvent(event);
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('checkbox list', () => {
    it('renders a checkbox for each column', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(COLUMNS.length);
    });

    it('renders column labels', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('ID')).toBeInTheDocument();
    });

    it('checks visible columns', async () => {
      const user = userEvent.setup();
      renderSettings({ visibleColumns: new Set(['title', 'amount']) });
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('checkbox', { name: 'Title' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Amount' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'ID' })).not.toBeChecked();
    });

    it('calls onToggleColumn with column key when checkbox clicked', async () => {
      const user = userEvent.setup();
      const mockToggle = jest.fn();
      renderSettings({ onToggleColumn: mockToggle });
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      await user.click(screen.getByRole('checkbox', { name: 'Title' }));
      expect(mockToggle).toHaveBeenCalledWith('title');
    });

    it('calls onToggleColumn for a hidden column when its checkbox clicked', async () => {
      const user = userEvent.setup();
      const mockToggle = jest.fn();
      renderSettings({ onToggleColumn: mockToggle });
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      await user.click(screen.getByRole('checkbox', { name: 'ID' }));
      expect(mockToggle).toHaveBeenCalledWith('id');
    });
  });

  describe('reset button', () => {
    it('renders a "Reset to defaults" button in the popover', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeInTheDocument();
    });

    it('calls onResetToDefaults when reset button clicked', async () => {
      const user = userEvent.setup();
      const mockReset = jest.fn();
      renderSettings({ onResetToDefaults: mockReset });
      await user.click(screen.getByRole('button', { name: /column settings/i }));
      await user.click(screen.getByRole('button', { name: /reset to defaults/i }));
      expect(mockReset).toHaveBeenCalledTimes(1);
    });
  });
});
