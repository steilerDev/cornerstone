/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { ObjectListFiltersPanel } from './ObjectListFiltersPanel.js';

const WIDE = '(min-width: 768px)';

const LABELS = {
  button: 'Filters',
  buttonActive: (count: number) => `Filters, ${count} active`,
  done: 'Done',
  clear: 'Clear all',
};

let media: MatchMediaControl;

beforeEach(() => {
  media = installMatchMedia({ [WIDE]: true });
});

afterEach(() => {
  media.restore();
});

function Host({
  activeCount = 0,
  onClear = jest.fn(),
  idPrefix = 'tasks-filters',
  testIdPrefix = 'tasks-filters',
  buttonClassName,
  noFields = false,
  labels = LABELS,
  buttonSuffix,
  panelFooter,
}: {
  activeCount?: number;
  onClear?: () => void;
  idPrefix?: string;
  testIdPrefix?: string;
  buttonClassName?: string;
  noFields?: boolean;
  labels?: React.ComponentProps<typeof ObjectListFiltersPanel>['labels'];
  buttonSuffix?: React.ReactNode;
  panelFooter?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" data-testid="go" onClick={() => navigate('/elsewhere')}>
        go
      </button>
      <ObjectListFiltersPanel
        idPrefix={idPrefix}
        testIdPrefix={testIdPrefix}
        activeCount={activeCount}
        labels={labels}
        onClear={onClear}
        buttonRef={buttonRef}
        buttonClassName={buttonClassName}
        buttonSuffix={buttonSuffix}
        panelFooter={panelFooter}
      >
        {noFields ? (
          <p>Nothing to set</p>
        ) : (
          <>
            <input aria-label="From date" />
            <input aria-label="To date" />
          </>
        )}
      </ObjectListFiltersPanel>
    </div>
  );
}

function setup(props: React.ComponentProps<typeof Host> = {}) {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Host {...props} />
    </MemoryRouter>,
  );
  return user;
}

const button = () => screen.getByTestId('tasks-filters-button');

describe('ObjectListFiltersPanel button', () => {
  it('shows the plain label without a count and no aria-label override', () => {
    setup();
    expect(button()).toHaveTextContent('Filters');
    expect(button()).not.toHaveAttribute('aria-label');
    expect(button()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button()).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the active count and names it', () => {
    setup({ activeCount: 2 });
    expect(button()).toHaveAttribute('aria-label', 'Filters, 2 active');
    expect(button()).toHaveTextContent('2');
  });

  it('applies a custom button class', () => {
    setup({ buttonClassName: 'custom-btn' });
    expect(button()).toHaveClass('custom-btn');
  });

  it('defaults to the compact secondary button class', () => {
    setup();
    expect(button().className).toContain('btnSecondaryCompact');
  });
});

describe('ObjectListFiltersPanel wide', () => {
  it('opens an anchored panel with the id derived from idPrefix', async () => {
    const user = setup();
    expect(button()).toHaveAttribute('aria-controls', 'tasks-filters-panel');
    await user.click(button());
    const panel = screen.getByTestId('tasks-filters-panel');
    expect(panel).toHaveAttribute('id', 'tasks-filters-panel');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(button()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByTestId('tasks-filters-sheet')).toBeNull();
  });

  it('moves focus to the first field on open', async () => {
    const user = setup();
    await user.click(button());
    await waitFor(() => expect(screen.getByLabelText('From date')).toHaveFocus());
  });

  it('opens without moving focus when the panel has no focusable field', async () => {
    const user = setup({ noFields: true });
    await user.click(button());
    expect(await screen.findByText('Nothing to set')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-filters-panel')).toBeInTheDocument();
  });

  it('toggles closed on a second click', async () => {
    const user = setup();
    await user.click(button());
    await user.click(button());
    await waitFor(() => expect(screen.queryByTestId('tasks-filters-panel')).toBeNull());
  });

  it('closes on Escape and returns focus to the button', async () => {
    const user = setup();
    await user.click(button());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('tasks-filters-panel')).toBeNull());
    expect(button()).toHaveFocus();
  });

  it('closes on a route change without stealing focus to the button', async () => {
    const user = setup();
    await user.click(button());
    // A bare click (no pointer-down) so the outside-press dismissal does not fire first.
    fireEvent.click(screen.getByTestId('go'));
    await waitFor(() => expect(screen.queryByTestId('tasks-filters-panel')).toBeNull());
    expect(button()).not.toHaveFocus();
  });

  it('has no Done or sheet Clear buttons', async () => {
    const user = setup();
    await user.click(button());
    expect(screen.queryByTestId('tasks-filters-done')).toBeNull();
    expect(screen.queryByTestId('tasks-filters-sheet-clear')).toBeNull();
  });

  it('does not render the default-prefixed ids when a custom prefix is used', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Host idPrefix="foo" testIdPrefix="foo" />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('foo-button'));
    expect(document.getElementById('foo-panel')).not.toBeNull();
    expect(document.getElementById('tasks-filters-panel')).toBeNull();
    expect(document.getElementById('diary-filters-panel')).toBeNull();
  });
});

describe('ObjectListFiltersPanel narrow', () => {
  beforeEach(() => {
    media.set(WIDE, false);
  });

  it('opens a bottom sheet with Clear and Done in the footer', async () => {
    const user = setup();
    expect(button()).toHaveAttribute('aria-controls', 'tasks-filters-sheet');
    await user.click(button());
    expect(screen.getByTestId('tasks-filters-sheet')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-filters-panel')).toBeNull();
    expect(screen.getByTestId('tasks-filters-done').className).toContain('btnSecondary');
    expect(screen.getByTestId('tasks-filters-done').className).not.toContain('btnPrimary');
    expect(screen.getByTestId('tasks-filters-sheet-clear')).toHaveTextContent('Clear all');
  });

  it('Clear calls onClear and leaves the sheet open', async () => {
    const onClear = jest.fn();
    const user = setup({ onClear });
    await user.click(button());
    await user.click(screen.getByTestId('tasks-filters-sheet-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('tasks-filters-sheet')).toBeInTheDocument();
  });

  it('Done closes the sheet and returns focus to the button', async () => {
    const user = setup();
    await user.click(button());
    await user.click(screen.getByTestId('tasks-filters-done'));
    await waitFor(() =>
      expect(screen.getByTestId('tasks-filters-sheet')).toHaveAttribute('data-open', 'false'),
    );
    expect(button()).toHaveFocus();
  });

  it('Escape closes the sheet and returns focus to the button', async () => {
    const user = setup();
    await user.click(button());
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByTestId('tasks-filters-sheet')).toHaveAttribute('data-open', 'false'),
    );
    expect(button()).toHaveFocus();
  });
});

describe('ObjectListFiltersPanel optional title, suffix and panel footer', () => {
  it('names the panel after labels.title when given, else after the button label', async () => {
    const user = setup({ labels: { ...LABELS, title: 'Narrow the budget' } });
    await user.click(button());
    expect(screen.getByTestId('tasks-filters-panel')).toHaveAttribute(
      'aria-label',
      'Narrow the budget',
    );
  });

  it('falls back to the button label for the panel name without a title', async () => {
    const user = setup();
    await user.click(button());
    expect(screen.getByTestId('tasks-filters-panel')).toHaveAttribute('aria-label', 'Filters');
  });

  it('names the bottom sheet after labels.title on narrow screens', async () => {
    media.set(WIDE, false);
    const user = setup({ labels: { ...LABELS, title: 'Narrow the budget' } });
    await user.click(button());
    expect(screen.getByRole('dialog', { name: 'Narrow the budget' })).toBeInTheDocument();
  });

  it('renders buttonSuffix instead of the count bubble', () => {
    setup({ activeCount: 3, buttonSuffix: <span data-testid="suffix"> (3 of 5)</span> });
    expect(screen.getByTestId('suffix')).toBeInTheDocument();
    expect(button()).not.toHaveTextContent(/^Filters3$/);
    expect(button().querySelector('.filtersToggleCount')).toBeNull();
    expect(button()).toHaveAttribute('aria-label', 'Filters, 3 active');
  });

  it('shows no panel footer by default (ObjectList and Diary DOM unchanged)', async () => {
    const user = setup();
    await user.click(button());
    expect(screen.queryByTestId('tasks-filters-panel-clear')).toBeNull();
    expect(screen.queryByTestId('tasks-filters-panel-done')).toBeNull();
  });

  it('renders Clear and Done under the anchored panel with panelFooter', async () => {
    const onClear = jest.fn();
    const user = setup({ panelFooter: true, onClear });
    await user.click(button());
    await user.click(screen.getByTestId('tasks-filters-panel-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('tasks-filters-panel')).toBeInTheDocument();
    await user.click(screen.getByTestId('tasks-filters-panel-done'));
    await waitFor(() => expect(screen.queryByTestId('tasks-filters-panel')).toBeNull());
    expect(button()).toHaveFocus();
  });

  it('keeps the sheet footer ids when panelFooter is set on a narrow screen', async () => {
    media.set(WIDE, false);
    const user = setup({ panelFooter: true });
    await user.click(button());
    expect(screen.getByTestId('tasks-filters-sheet-clear')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-filters-panel-clear')).toBeNull();
  });
});
