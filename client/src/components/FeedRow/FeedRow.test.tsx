/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { FeedRow } from './FeedRow.js';
import type { FeedRowEntryProps, FeedRowEventProps } from './FeedRow.js';

function setup(props: Partial<FeedRowEventProps> = {}, wrapInList = true) {
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

  describe('actions slot', () => {
    it('renders no actions wrapper and an unchanged footer when actions is omitted', () => {
      const { root } = setup({
        link: { to: '/project/work-items/wi-1', label: 'Open task', ariaLabel: 'Open task: A' },
      });
      expect(screen.queryByTestId('row-1-actions')).toBeNull();
      // The link is a direct child of the row (no footer wrapper).
      const link = screen.getByTestId('row-1-link');
      expect(link.parentElement).toBe(root);
    });

    it.each([
      ['null', null],
      ['false', false],
      ['undefined', undefined],
    ])('renders nothing for actions=%s', (_name, actions) => {
      const { root } = setup({ actions, removedLabel: 'No longer exists' });
      expect(screen.queryByTestId('row-1-actions')).toBeNull();
      expect(screen.getByTestId('row-1-removed').parentElement).toBe(root);
    });

    it('renders the actions after the link row', () => {
      setup({
        link: { to: '/project/work-items/wi-1', label: 'Open task', ariaLabel: 'Open task: A' },
        actions: <button type="button">Revert submission</button>,
      });
      const link = screen.getByTestId('row-1-link');
      const actions = screen.getByTestId('row-1-actions');
      expect(
        within(actions).getByRole('button', { name: 'Revert submission' }),
      ).toBeInTheDocument();
      expect(link.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(link.parentElement).toBe(actions.parentElement);
    });

    it('renders the actions after the removed label when there is no link', () => {
      setup({ removedLabel: 'No longer exists', actions: <span>Act</span> });
      const removed = screen.getByTestId('row-1-removed');
      const actions = screen.getByTestId('row-1-actions');
      expect(
        removed.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('renders the actions without a link row or removed label', () => {
      setup({ actions: <span>Act</span> });
      expect(screen.getByTestId('row-1-actions')).toHaveTextContent('Act');
    });

    it('compact never renders actions', () => {
      setup({ compact: true, actions: <span>Act</span> });
      expect(screen.queryByTestId('row-1-actions')).toBeNull();
    });
  });
});

function setupEntry(props: Partial<FeedRowEntryProps> = {}, as: 'li' | 'div' = 'li') {
  const log = createRouterLog();
  const row = (
    <FeedRow
      variant="entry"
      as={as}
      typeBadge={{ label: 'Daily log', className: 'x' }}
      title="Entry A"
      titleLink={{ to: '/diary/e1', ariaLabel: 'Entry A, 12 Oct 2026', state: { origin: 'diary' } }}
      dateLabel="Oct 12"
      testId="entry-1"
      {...props}
    />
  );
  render(
    <RecordingRouter entries={['/diary']} log={log}>
      {as === 'li' ? <ul>{row}</ul> : row}
    </RecordingRouter>,
  );
  return { log, root: screen.getByTestId('entry-1') };
}

const thumbs = (n: number) =>
  Array.from({ length: n }, (_v, i) => ({ id: `p${i}`, src: `/thumb/${i}.jpg` }));

describe('FeedRow variant="entry"', () => {
  it('renders an li by default and a div with as="div"', () => {
    expect(setupEntry().root.tagName).toBe('LI');
    document.body.innerHTML = '';
    expect(setupEntry({}, 'div').root.tagName).toBe('DIV');
  });

  it('shows the type badge, the date and the title as the one link with the given name', () => {
    const { root } = setupEntry();
    expect(screen.getByTestId('entry-1-type')).toHaveTextContent('Daily log');
    expect(root).toHaveTextContent('Oct 12');
    const link = screen.getByTestId('entry-1-link');
    expect(link).toHaveAttribute('href', '/diary/e1');
    expect(link).toHaveAttribute('aria-label', 'Entry A, 12 Oct 2026');
    expect(link).toHaveTextContent('Entry A');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('navigates with the origin state on a plain click', () => {
    const { log } = setupEntry();
    fireEvent.click(screen.getByTestId('entry-1-link'));
    expect(log.actions).toEqual(['PUSH /diary/e1']);
    expect(log.states[0]).toEqual({ origin: 'diary' });
  });

  it('renders extra badges after the type badge', () => {
    setupEntry({ badges: <span data-testid="extra">Draft</span> });
    const type = screen.getByTestId('entry-1-type');
    expect(
      type.compareDocumentPosition(screen.getByTestId('extra')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows no strip, sentence, facts or areas when none are given', () => {
    const { root } = setupEntry();
    expect(screen.queryByTestId('entry-1-thumbs')).toBeNull();
    expect(screen.queryByTestId('entry-1-areas')).toBeNull();
    expect(screen.queryByTestId('entry-1-signed')).toBeNull();
    expect(root.querySelector('p')).toBeNull();
    expect(root).not.toHaveAttribute('data-has-strip');
  });

  it('shows the one-line sentence', () => {
    setupEntry({ sentence: 'Poured the slab' });
    expect(screen.getByText('Poured the slab').tagName).toBe('P');
  });

  describe('thumbnail strip', () => {
    it('shows at most 5 decorative images in an aria-hidden strip', () => {
      const { root } = setupEntry({ thumbnails: thumbs(7) });
      const strip = screen.getByTestId('entry-1-thumbs');
      expect(strip).toHaveAttribute('aria-hidden', 'true');
      const imgs = strip.querySelectorAll('img');
      expect(imgs).toHaveLength(5);
      imgs.forEach((img) => expect(img).toHaveAttribute('alt', ''));
      expect(root).toHaveAttribute('data-has-strip', 'true');
    });

    it('shows the +n tile only when more photos exist', () => {
      setupEntry({
        thumbnails: thumbs(5),
        thumbnailsMore: 3,
        thumbnailsMoreLabel: (n) => `+${n} more`,
      });
      expect(screen.getByTestId('entry-1-thumbs-more')).toHaveTextContent('+3 more');
    });

    it('falls back to a plain +n when no label function is given', () => {
      setupEntry({ thumbnails: thumbs(2), thumbnailsMore: 4 });
      expect(screen.getByTestId('entry-1-thumbs-more')).toHaveTextContent('+4');
    });

    it('omits the +n tile when nothing is hidden', () => {
      setupEntry({ thumbnails: thumbs(3), thumbnailsMore: 0 });
      expect(screen.queryByTestId('entry-1-thumbs-more')).toBeNull();
    });

    it('adds a visually hidden photo count sentence outside the strip', () => {
      setupEntry({ thumbnails: thumbs(1), thumbnailsLabel: '3 photos' });
      const label = screen.getByText('3 photos');
      expect(screen.getByTestId('entry-1-thumbs')).not.toContainElement(label);
    });
  });

  describe('facts and signed', () => {
    it('joins facts with a middle dot', () => {
      setupEntry({ facts: ['Company A', '2 workers'] });
      expect(screen.getByText('Company A · 2 workers')).toBeInTheDocument();
    });

    it('shows Signed after the facts with an aria-hidden check icon', () => {
      setupEntry({ facts: ['Company A'], signedLabel: 'Signed' });
      const signed = screen.getByTestId('entry-1-signed');
      expect(signed).toHaveTextContent('· Signed');
      expect(signed.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });

    it('shows Signed alone without a leading separator', () => {
      setupEntry({ signedLabel: 'Signed' });
      expect(screen.getByTestId('entry-1-signed').textContent?.trim()).toBe('Signed');
    });
  });

  describe('area chips', () => {
    const areas = (n: number) =>
      Array.from({ length: n }, (_v, i) => ({ id: `a${i}`, content: `Area ${i}` }));

    it('shows up to 3 chips as plain list items', () => {
      setupEntry({ areas: areas(3), areasMoreLabel: (n) => `+${n}` });
      const list = screen.getByTestId('entry-1-areas');
      expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    });

    it('collapses the rest into one +n chip', () => {
      setupEntry({ areas: areas(6), areasMoreLabel: (n) => `+${n}` });
      const items = within(screen.getByTestId('entry-1-areas')).getAllByRole('listitem');
      expect(items).toHaveLength(4);
      expect(items[3]).toHaveTextContent('+3');
    });

    it('falls back to a plain +n without a label function', () => {
      setupEntry({ areas: areas(4) });
      const items = within(screen.getByTestId('entry-1-areas')).getAllByRole('listitem');
      expect(items[3]).toHaveTextContent('+1');
    });
  });

  it('nests nothing interactive inside the link', () => {
    const { root } = setupEntry({ thumbnails: thumbs(2), sentence: 'x', signedLabel: 'Signed' });
    const link = screen.getByTestId('entry-1-link');
    expect(link.querySelector('a, button, input')).toBeNull();
    expect(root.querySelectorAll('button')).toHaveLength(0);
  });
});
