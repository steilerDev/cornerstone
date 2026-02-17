import { jest, describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';

describe('KeyboardShortcutsHelp', () => {
  const mockShortcuts: KeyboardShortcut[] = [
    { key: 'n', handler: () => {}, description: 'New work item' },
    { key: 'Escape', handler: () => {}, description: 'Close dialog' },
    { key: '?', handler: () => {}, description: 'Show keyboard shortcuts' },
  ];

  it('should render modal with shortcuts list', () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();

    // Check that all shortcuts are displayed
    expect(screen.getByText('n')).toBeInTheDocument();
    expect(screen.getByText('New work item')).toBeInTheDocument();
    expect(screen.getByText('Escape')).toBeInTheDocument();
    expect(screen.getByText('Close dialog')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument();
  });

  it('should display key and description for each shortcut', () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />);

    const rows = screen.getAllByRole('row');
    // Header row + 3 data rows
    expect(rows).toHaveLength(4);

    // Verify table has correct headings
    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('should call onClose when backdrop is clicked', async () => {
    const onClose = jest.fn<() => void>();
    const { container } = render(
      <KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />,
    );

    // Find the backdrop by className (since it doesn't have a role)
    const backdrop = container.querySelector('[class*="modalBackdrop"]');
    expect(backdrop).toBeInTheDocument();

    await userEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when close button is clicked', async () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should render all shortcuts with kbd elements', () => {
    const onClose = jest.fn<() => void>();
    const { container } = render(
      <KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />,
    );

    const kbdElements = container.querySelectorAll('kbd');
    expect(kbdElements).toHaveLength(3);

    expect(kbdElements[0]).toHaveTextContent('n');
    expect(kbdElements[1]).toHaveTextContent('Escape');
    expect(kbdElements[2]).toHaveTextContent('?');
  });

  it('should have correct ARIA attributes', () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('should handle empty shortcuts array', () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={[]} onClose={onClose} />);

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    // Only header row, no data rows
    expect(rows).toHaveLength(1);
  });
});
