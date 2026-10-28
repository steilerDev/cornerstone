/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installMatchMedia, type MatchMediaControl } from '../../test/matchMediaControl.js';
import { SidePanel, SIDE_PANEL_DOCKED_QUERY } from './SidePanel.js';
import { markEscapeHandled } from './useFocusTrap.js';

const WIDE_QUERY = '(min-width: 768px)';

let media: MatchMediaControl;

beforeEach(() => {
  media = installMatchMedia();
});

afterEach(() => {
  media.restore();
  delete document.documentElement.dataset.scrollLocked;
});

function Host({
  initialOpen = false,
  title = 'Roof',
  onCloseSpy,
  withHeaderStart = false,
  withFooter = false,
  dismissOnClose = true,
}: {
  initialOpen?: boolean;
  title?: string;
  onCloseSpy?: () => void;
  withHeaderStart?: boolean;
  withFooter?: boolean;
  dismissOnClose?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [subject, setSubject] = useState(title);
  const [suffix, setSuffix] = useState('');
  const openerRef = useRef<HTMLButtonElement>(null);
  return (
    <main>
      <h1>Schedule</h1>
      <button ref={openerRef} type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <button type="button" onClick={() => setSubject('Windows')}>
        switch subject
      </button>
      <button type="button" onClick={() => setSuffix(' (edited)')}>
        rename
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        programmatic close
      </button>
      <SidePanel
        id="panel"
        open={open}
        title={`${subject}${suffix}`}
        focusKey={subject}
        testId="side-panel"
        returnFocusRef={openerRef}
        headerStart={withHeaderStart ? <button type="button">Back</button> : undefined}
        footer={withFooter ? <button type="button">Save</button> : undefined}
        onClose={() => {
          onCloseSpy?.();
          if (dismissOnClose) setOpen(false);
        }}
      >
        <button type="button">body control</button>
      </SidePanel>
    </main>
  );
}

describe('SidePanel docked (1440 px and wider)', () => {
  beforeEach(() => {
    media.set(SIDE_PANEL_DOCKED_QUERY, true);
    media.set(WIDE_QUERY, true);
  });

  it('exports the 1440 px query', () => {
    expect(SIDE_PANEL_DOCKED_QUERY).toBe('(min-width: 1440px)');
  });

  it('renders nothing while closed', () => {
    render(<Host />);
    expect(screen.queryByTestId('side-panel')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('opens a non-modal complementary region labelled by its heading, with no dialog or backdrop', async () => {
    render(<Host />);
    await userEvent.click(screen.getByText('opener'));
    const aside = screen.getByTestId('side-panel');
    expect(aside.tagName).toBe('ASIDE');
    expect(aside).toHaveAttribute('id', 'panel');
    const heading = screen.getByRole('heading', { level: 2, name: 'Roof' });
    expect(aside).toHaveAttribute('aria-labelledby', heading.id);
    expect(aside).not.toHaveAttribute('aria-modal');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('sheet-backdrop')).toBeNull();
    expect(screen.getByText('body control')).toBeInTheDocument();
  });

  it('moves focus to the heading on open', async () => {
    render(<Host />);
    await userEvent.click(screen.getByText('opener'));
    expect(screen.getByRole('heading', { name: 'Roof' })).toHaveFocus();
  });

  it('does not move focus when only the title text changes', async () => {
    render(<Host initialOpen />);
    screen.getByText('body control').focus();
    await userEvent.click(screen.getByText('rename'));
    expect(screen.getByRole('heading', { name: 'Roof (edited)' })).not.toHaveFocus();
  });

  it('moves focus to the heading again when the focus key (the subject) changes', async () => {
    render(<Host initialOpen />);
    screen.getByText('switch subject').focus();
    await userEvent.click(screen.getByText('switch subject'));
    expect(screen.getByRole('heading', { name: 'Windows' })).toHaveFocus();
  });

  it('does not take focus when it is not open', async () => {
    render(<Host />);
    const opener = screen.getByText('opener');
    opener.focus();
    await userEvent.click(screen.getByText('switch subject'));
    expect(screen.getByText('switch subject')).toHaveFocus();
  });

  it('does not trap focus: Tab leaves the panel', async () => {
    render(<Host initialOpen withFooter />);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByTestId('side-panel').contains(document.activeElement)).toBe(false);
  });

  it('renders headerStart before the title and the footer after the body, only when given', () => {
    const { rerender } = render(<Host initialOpen withHeaderStart withFooter />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    rerender(<Host initialOpen />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('the Close button calls onClose and returns focus to the opener', async () => {
    const onCloseSpy = jest.fn<() => void>();
    render(<Host onCloseSpy={onCloseSpy} />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('side-panel')).toBeNull();
    expect(screen.getByText('opener')).toHaveFocus();
  });

  it('Escape closes the panel and returns focus to the opener', async () => {
    const onCloseSpy = jest.fn<() => void>();
    render(<Host onCloseSpy={onCloseSpy} />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.keyboard('{Escape}');
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('side-panel')).toBeNull();
    expect(screen.getByText('opener')).toHaveFocus();
  });

  it('Escape does not bubble past the panel', () => {
    const outer = jest.fn();
    render(
      <div onKeyDown={outer}>
        <Host initialOpen />
      </div>,
    );
    fireEvent.keyDown(screen.getByText('body control'), { key: 'Escape' });
    expect(outer).not.toHaveBeenCalled();
  });

  it('Escape already consumed by an inner popover does not close the panel', () => {
    const onCloseSpy = jest.fn<() => void>();
    render(<Host initialOpen onCloseSpy={onCloseSpy} />);
    const body = screen.getByText('body control');
    body.addEventListener('keydown', (e) => markEscapeHandled(e));
    fireEvent.keyDown(body, { key: 'Escape' });
    expect(onCloseSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('side-panel')).toBeInTheDocument();
  });

  it('other keys do not close the panel', () => {
    const onCloseSpy = jest.fn<() => void>();
    render(<Host initialOpen onCloseSpy={onCloseSpy} />);
    fireEvent.keyDown(screen.getByText('body control'), { key: 'Enter' });
    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  it('falls back to the page heading when the opener is gone', () => {
    function Gone() {
      const [open, setOpen] = useState(true);
      const [hasOpener, setHasOpener] = useState(true);
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <main>
          <h1>Schedule</h1>
          {hasOpener && (
            <button ref={ref} type="button">
              opener
            </button>
          )}
          <button type="button" onClick={() => setHasOpener(false)}>
            remove opener
          </button>
          <SidePanel
            id="p"
            open={open}
            title="Roof"
            testId="gone-panel"
            returnFocusRef={ref}
            onClose={() => setOpen(false)}
          >
            body
          </SidePanel>
        </main>
      );
    }
    render(<Gone />);
    fireEvent.click(screen.getByText('remove opener'));
    fireEvent.keyDown(screen.getByText('body'), { key: 'Escape' });
    expect(screen.getByRole('heading', { level: 1, name: 'Schedule' })).toHaveFocus();
  });

  it('falls back to the page heading when no opener ref is attached', () => {
    const ref = { current: null };
    render(
      <main>
        <h1>Schedule</h1>
        <SidePanel id="p" open title="Roof" testId="np" returnFocusRef={ref} onClose={() => {}}>
          body
        </SidePanel>
      </main>,
    );
    fireEvent.click(screen.getByTestId('np-close'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});

describe('SidePanel as a side sheet (768 px to 1439 px)', () => {
  beforeEach(() => {
    media.set(SIDE_PANEL_DOCKED_QUERY, false);
    media.set(WIDE_QUERY, true);
  });

  it('is a modal dialog labelled by its heading, in the side variant', async () => {
    render(<Host />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByText('opener'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBe(screen.getByTestId('side-panel'));
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).toContain('panelSide');
    expect(dialog).toHaveAttribute(
      'aria-labelledby',
      screen.getByRole('heading', { name: 'Roof' }).id,
    );
  });

  it('focuses the heading on open, not the first control', async () => {
    render(<Host withHeaderStart />);
    await userEvent.click(screen.getByText('opener'));
    expect(screen.getByRole('heading', { name: 'Roof' })).toHaveFocus();
  });

  it('Escape closes it and focus returns to the opener', async () => {
    const onCloseSpy = jest.fn<() => void>();
    render(<Host onCloseSpy={onCloseSpy} />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.keyboard('{Escape}');
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('opener')).toHaveFocus();
  });

  it('shows the header start and footer slots', () => {
    render(<Host initialOpen withHeaderStart withFooter />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('SidePanel as a bottom sheet (under 768 px)', () => {
  beforeEach(() => {
    media.set(SIDE_PANEL_DOCKED_QUERY, false);
    media.set(WIDE_QUERY, false);
  });

  it('is a modal dialog without the side variant', async () => {
    render(<Host />);
    await userEvent.click(screen.getByText('opener'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).not.toContain('panelSide');
  });

  it('focuses the heading on open', async () => {
    render(<Host />);
    await userEvent.click(screen.getByText('opener'));
    expect(screen.getByRole('heading', { name: 'Roof' })).toHaveFocus();
  });
});

describe('SidePanel responding to viewport changes', () => {
  it('turns from a side sheet into a docked aside when the window grows to 1440 px', () => {
    media.set(SIDE_PANEL_DOCKED_QUERY, false);
    media.set(WIDE_QUERY, true);
    render(<Host initialOpen />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    media.set(SIDE_PANEL_DOCKED_QUERY, true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('side-panel').tagName).toBe('ASIDE');
  });

  it('turns from a docked aside into a side sheet when the window shrinks', () => {
    media.set(SIDE_PANEL_DOCKED_QUERY, true);
    media.set(WIDE_QUERY, true);
    render(<Host initialOpen />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    media.set(SIDE_PANEL_DOCKED_QUERY, false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the body content mounted across the switch', () => {
    media.set(SIDE_PANEL_DOCKED_QUERY, true);
    render(<Host initialOpen />);
    expect(screen.getByText('body control')).toBeInTheDocument();
    media.set(SIDE_PANEL_DOCKED_QUERY, false);
    expect(screen.getByText('body control')).toBeInTheDocument();
  });
});
