/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, afterEach } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';

// KeyboardShortcutsHelp now renders via the shared Modal component, which uses
// createPortal into document.body — dialog role, aria-modal, backdrop, Escape,
// and focus trap are all inherited from Modal (covered generically by Modal.test.tsx).
// These tests verify KeyboardShortcutsHelp's own rendering (table/rows) plus that
// it correctly wires into Modal (onClose plumbing, dialog semantics).

/** The page's own shortcut table (the first one); the "Everywhere" table follows it. */
function pageTable(): HTMLElement {
  return screen.getAllByRole('table')[0]!;
}

describe('KeyboardShortcutsHelp', () => {
  const mockShortcuts: KeyboardShortcut[] = [
    { key: 'n', handler: () => {}, description: 'New work item' },
    { key: 'Escape', handler: () => {}, description: 'Close dialog' },
    { key: '?', handler: () => {}, description: 'Show keyboard shortcuts' },
  ];

  it('renders inside a Modal with dialog role, aria-modal, and portal to document.body', () => {
    const onClose = jest.fn<() => void>();
    const { baseElement } = render(
      <KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // baseElement is document.body — portal content should live there
    expect(baseElement.querySelector('[role="dialog"]')).toBe(dialog);
  });

  it('should render modal with title and shortcuts list', () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />);

    expect(screen.getByRole('heading', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();

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

    const rows = within(pageTable()).getAllByRole('row');
    // Header row + 3 data rows
    expect(rows).toHaveLength(4);

    // Verify table has correct headings
    expect(screen.getByText('Key')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('should call onClose when backdrop is clicked', async () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />);

    // Modal portals into document.body, so the backdrop isn't inside the
    // render() container — query the whole document instead.
    const backdrop = document.querySelector('[class*="modalBackdrop"]');
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

  it('close button aria-label resolves via common:aria.closeDialog (not the removed keyboardShortcuts.closeAriaLabel key)', () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />);

    // "Close dialog" is the en value of common:aria.closeDialog — the same key
    // Modal uses for every consumer. KeyboardShortcutsHelp no longer defines its
    // own close-button aria-label.
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('Escape key closes the dialog (inherited from Modal, not KeyboardShortcutsHelp logic)', () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />);

    // Fire directly against document, matching Modal's own Escape-key effect
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(event);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should render all shortcuts with kbd elements', () => {
    const onClose = jest.fn<() => void>();
    render(<KeyboardShortcutsHelp shortcuts={mockShortcuts} onClose={onClose} />);

    // Modal portals into document.body, so query document instead of the
    // render() container.
    const kbdElements = pageTable().querySelectorAll('kbd');
    expect(kbdElements).toHaveLength(3);

    expect(kbdElements[0]!).toHaveTextContent('n');
    expect(kbdElements[1]!).toHaveTextContent('Escape');
    expect(kbdElements[2]!).toHaveTextContent('?');
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
    const rows = within(pageTable()).getAllByRole('row');
    // Only header row, no data rows
    expect(rows).toHaveLength(1);
  });

  it('filters out shortcuts with no description', () => {
    const onClose = jest.fn<() => void>();
    const shortcutsWithBlank: KeyboardShortcut[] = [
      ...mockShortcuts,
      { key: 'x', handler: () => {}, description: '' },
    ];
    render(<KeyboardShortcutsHelp shortcuts={shortcutsWithBlank} onClose={onClose} />);

    const rows = within(pageTable()).getAllByRole('row');
    // Header row + 3 data rows (the blank-description shortcut is filtered out)
    expect(rows).toHaveLength(4);
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });

  describe('emptyMessage', () => {
    it('shows the empty state instead of the table when nothing is listed', () => {
      render(
        <KeyboardShortcutsHelp
          shortcuts={[]}
          emptyMessage="This page has no shortcuts of its own."
          onClose={() => {}}
        />,
      );
      expect(screen.getByText('This page has no shortcuts of its own.')).toBeInTheDocument();
      expect(screen.getAllByRole('table')).toHaveLength(1);
      expect(screen.queryByText('Key')).not.toBeInTheDocument();
    });

    it('treats shortcuts without a description as empty', () => {
      render(
        <KeyboardShortcutsHelp
          shortcuts={[{ key: 'x', handler: () => {}, description: '' }]}
          emptyMessage="Nothing here"
          onClose={() => {}}
        />,
      );
      expect(screen.getByText('Nothing here')).toBeInTheDocument();
      expect(screen.getAllByRole('table')).toHaveLength(1);
      expect(screen.queryByText('Key')).not.toBeInTheDocument();
    });

    it('keeps the table when shortcuts exist, ignoring emptyMessage', () => {
      render(
        <KeyboardShortcutsHelp
          shortcuts={mockShortcuts}
          emptyMessage="Nothing here"
          onClose={() => {}}
        />,
      );
      expect(screen.getAllByRole('table')).toHaveLength(2);
      expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument();
      expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
    });

    it('keeps the empty table when no emptyMessage is given (existing callers)', () => {
      render(<KeyboardShortcutsHelp shortcuts={[]} onClose={() => {}} />);
      expect(screen.getAllByRole('table')).toHaveLength(2);
      expect(screen.getByText('Key')).toBeInTheDocument();
    });
  });

  describe('Everywhere table', () => {
    const platformSpy = () => jest.spyOn(navigator, 'platform', 'get');

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('lists the undo shortcut under an "Everywhere" heading, even with an empty page list', () => {
      render(<KeyboardShortcutsHelp shortcuts={[]} emptyMessage="Nothing" onClose={() => {}} />);
      expect(screen.getByRole('heading', { name: 'Everywhere' })).toBeInTheDocument();
      const table = screen.getAllByRole('table').at(-1)!;
      expect(within(table).getByText('Undo the last change')).toBeInTheDocument();
    });

    it('shows Ctrl Z on non-Apple platforms', () => {
      platformSpy().mockReturnValue('Win32');
      render(<KeyboardShortcutsHelp shortcuts={[]} onClose={() => {}} />);
      expect(screen.getByText('Ctrl Z')).toBeInTheDocument();
      expect(screen.queryByText('⌘Z')).toBeNull();
    });

    it('shows ⌘Z on Apple platforms', () => {
      platformSpy().mockReturnValue('MacIntel');
      render(<KeyboardShortcutsHelp shortcuts={[]} onClose={() => {}} />);
      expect(screen.getByText('⌘Z')).toBeInTheDocument();
      expect(screen.queryByText('Ctrl Z')).toBeNull();
    });
  });
});
