/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { FeedRow } from './FeedRow.js';
import type { FeedRowProps } from './FeedRow.js';

function setup(props: Partial<FeedRowProps> = {}, wrapInList = true) {
  const log = createRouterLog();
  const row = (
    <FeedRow
      typeLabel="Status change"
      sentence="Kitchen tiling went from Not started to Done"
      testId="row-1"
      {...props}
    />
  );
  render(
    <RecordingRouter entries={['/diary']} log={log}>
      {wrapInList && (props.as ?? 'li') === 'li' ? <ul>{row}</ul> : row}
    </RecordingRouter>,
  );
  return { log, root: screen.getByTestId('row-1') };
}

describe('FeedRow', () => {
  it('is an <li> by default and a <div> with as="div"', () => {
    expect(setup().root.tagName).toBe('LI');
  });

  it('renders a <div> root when as="div"', () => {
    expect(setup({ as: 'div' }).root.tagName).toBe('DIV');
  });

  it('shows the type badge text, the sentence and the time', () => {
    const { root } = setup({ time: '10:30' });
    expect(screen.getByTestId('row-1-type')).toHaveTextContent('Status change');
    expect(root).toHaveTextContent('Kitchen tiling went from Not started to Done');
    expect(root).toHaveTextContent('10:30');
  });

  it('omits the time when none is given (entry page)', () => {
    const { root } = setup();
    expect(root.querySelector('[class*="time"]')).toBeNull();
  });

  it('renders extra badges after the type badge', () => {
    setup({ badges: <span data-testid="extra">x3</span> });
    const type = screen.getByTestId('row-1-type');
    const extra = screen.getByTestId('extra');
    expect(type.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders each detail line as its own paragraph', () => {
    setup({ details: ['€480.00', '3 times on 12 Mar 2026'] });
    expect(screen.getByText('€480.00').tagName).toBe('P');
    expect(screen.getByText('3 times on 12 Mar 2026').tagName).toBe('P');
  });

  it('mutes the sentence for stored legacy text only', () => {
    const plain = setup();
    expect(plain.root.querySelector('p')?.className).not.toContain('muted');
    document.body.innerHTML = '';
    const muted = setup({ sentenceMuted: true });
    expect(muted.root.querySelector('p')?.className).toContain('muted');
  });

  it('renders the link as a real anchor with href, aria-label and a hidden chevron', () => {
    setup({
      link: {
        to: '/project/work-items/wi-1',
        label: 'Open task',
        ariaLabel: 'Open task: Kitchen tiling',
      },
    });
    const link = screen.getByTestId('row-1-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/project/work-items/wi-1');
    expect(link).toHaveAttribute('aria-label', 'Open task: Kitchen tiling');
    expect(link).toHaveTextContent('Open task');
    expect(link.querySelector('[aria-hidden="true"]')).toHaveTextContent('›');
  });

  it('navigates with the given state on a plain click', () => {
    const { log } = setup({
      link: {
        to: '/budget/invoices/i1',
        label: 'Open invoice',
        ariaLabel: 'Open invoice: 1',
        state: { origin: { to: '/diary' } },
      },
    });
    fireEvent.click(screen.getByTestId('row-1-link'));
    expect(log.actions).toEqual(['PUSH /budget/invoices/i1']);
    expect(log.states[0]).toEqual({ origin: { to: '/diary' } });
  });

  it('compact renders no link row and no removed label', () => {
    setup({
      compact: true,
      link: { to: '/x', label: 'Open task', ariaLabel: 'Open task' },
      removedLabel: 'No longer exists',
    });
    expect(screen.queryByTestId('row-1-link')).toBeNull();
    expect(screen.queryByTestId('row-1-removed')).toBeNull();
    expect(screen.getByTestId('row-1')).toHaveTextContent('Kitchen tiling');
  });

  it('a removed label replaces the link with muted text', () => {
    setup({ removedLabel: 'No longer exists' });
    expect(screen.getByTestId('row-1-removed')).toHaveTextContent('No longer exists');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a link wins over the removed label', () => {
    setup({
      link: { to: '/x', label: 'Open task', ariaLabel: 'Open task' },
      removedLabel: 'No longer exists',
    });
    expect(screen.getByTestId('row-1-link')).toBeInTheDocument();
    expect(screen.queryByTestId('row-1-removed')).toBeNull();
  });

  it('is not interactive itself: no tab stop, no role button', () => {
    const { root } = setup();
    expect(root).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
