/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import type { SearchResultType } from '@cornerstone/shared';
import { enFormatters, enT, makeItem } from '../../test/commandSearchFixtures.js';
import { SearchResultRow } from './SearchResultRow.js';
import type { SearchResultRowProps } from './SearchResultRow.js';
import type { CommandOption } from './commandSearchModel.js';

const DEPS = { t: enT, language: 'en', ...enFormatters };

function itemOption(
  type: SearchResultType,
  overrides: Partial<Extract<CommandOption, { kind: 'item' }>> = {},
  itemOverrides: Parameters<typeof makeItem>[0] = {},
): CommandOption {
  const item = makeItem({ id: 'x1', label: 'Roof tiles', ...itemOverrides });
  return {
    kind: 'item',
    id: `${type}-${item.id}`,
    type,
    item,
    title: item.label ?? '',
    target: { kind: 'app', href: routeUrl('workItem', { id: item.id }) },
    disabled: false,
    pending: false,
    ...overrides,
  };
}

function setup(option: CommandOption, props: Partial<SearchResultRowProps> = {}) {
  const handlers = {
    onActivate: jest.fn<(id: string) => void>(),
    onChoose: jest.fn<(target: string) => void>(),
    onShowMore: jest.fn<(type: SearchResultType) => void>(),
  };
  render(
    <MemoryRouter>
      <SearchResultRow
        option={option}
        listboxId="lb"
        active={false}
        itemQuery="roof"
        liveQuery="roof"
        deps={DEPS}
        originState={{ origin: { to: '/start' } }}
        callHintId="call-hint"
        newTabHintId="tab-hint"
        {...handlers}
        {...props}
      />
    </MemoryRouter>,
  );
  return handlers;
}

describe('SearchResultRow', () => {
  describe('item rows', () => {
    it('renders an in-app option anchor with the DOM id, origin-ready href and test id', () => {
      setup(itemOption('work_item'));
      const row = screen.getByRole('option');
      expect(row.tagName).toBe('A');
      expect(row.id).toBe('lb-work_item-x1');
      expect(row).toHaveAttribute('href', routeUrl('workItem', { id: 'x1' }));
      expect(row).toHaveAttribute('tabindex', '-1');
      expect(row).toHaveAttribute('aria-selected', 'false');
      expect(row).toHaveAttribute('data-testid', 'command-search-option-work_item-x1');
    });

    it('reflects the active state in aria-selected', () => {
      setup(itemOption('work_item'), { active: true });
      expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
    });

    it('marks the settled query in the title', () => {
      setup(itemOption('work_item'));
      expect(screen.getByRole('option').querySelector('mark')?.textContent).toBe('Roof');
    });

    it('reports a plain click as a choice with the target, and a modified click not at all', () => {
      const { onChoose } = setup(itemOption('work_item'));
      fireEvent.click(screen.getByRole('option'), { metaKey: true });
      expect(onChoose).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('option'));
      expect(onChoose).toHaveBeenCalledWith(routeUrl('workItem', { id: 'x1' }));
    });

    it('reports pointer movement as activation', () => {
      const { onActivate } = setup(itemOption('work_item'));
      fireEvent.pointerMove(screen.getByRole('option'));
      expect(onActivate).toHaveBeenCalledWith('work_item-x1');
    });

    it('renders a chip for a known status and none for an unknown one', () => {
      setup(itemOption('invoice', {}, { status: 'paid', label: 'INV-1' }));
      expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('renders no chip for types without a status vocabulary', () => {
      setup(itemOption('vendor', {}, { status: 'paid', label: 'Acme' }));
      expect(screen.queryByText('Paid')).toBeNull();
    });

    it('renders no chip when the status is null', () => {
      setup(itemOption('work_item', {}, { status: null }));
      expect(screen.getByRole('option').querySelector('[class*="badge" i]')).toBeNull();
    });
  });

  describe('company rows', () => {
    const vendor = () =>
      itemOption('vendor', {}, { id: 'v1', label: 'Acme Roofing', phone: '+49 (30) 12-34' });

    it('renders a presentation wrapper with the option and a Call sibling', () => {
      setup(vendor());
      const call = screen.getByTestId('command-search-call-v1');
      expect(call).toHaveAttribute('href', 'tel:+49301234');
      expect(call).toHaveAttribute('aria-label', 'Call Acme Roofing on +49 (30) 12-34');
      expect(call).toHaveAttribute('tabindex', '-1');
      expect(call.textContent).toBe('Call');
      expect(call.id).toBe(`${screen.getByRole('option').id}-call`);
      expect(call.parentElement).toHaveAttribute('role', 'presentation');
      expect(screen.getByRole('option')).toHaveAttribute('aria-describedby', 'call-hint');
      expect(screen.getByRole('option').contains(call)).toBe(false);
    });

    it('does not select or open the row when Call is clicked', () => {
      const { onChoose } = setup(vendor());
      const call = screen.getByTestId('command-search-call-v1');
      call.addEventListener('click', (e) => e.preventDefault());
      fireEvent.click(call);
      expect(onChoose).not.toHaveBeenCalled();
    });

    it('renders no Call link for other types even if the item carries a phone', () => {
      setup(itemOption('work_item', {}, { id: 'w7', phone: '+49 1' }));
      expect(screen.queryByTestId('command-search-call-w7')).toBeNull();
      expect(screen.getByRole('option')).not.toHaveAttribute('aria-describedby', 'call-hint');
    });

    it('renders no Call link for a company without a phone', () => {
      setup(itemOption('vendor', {}, { id: 'v2', phone: null }));
      expect(screen.queryByTestId('command-search-call-v2')).toBeNull();
    });
  });

  describe('disabled and external rows', () => {
    it('renders a disabled option as a div that is never selected', () => {
      setup(
        itemOption(
          'paperless_document',
          { disabled: true, target: null },
          { matchedField: 'fullText' },
        ),
        { active: true },
      );
      const row = screen.getByRole('option');
      expect(row.tagName).toBe('DIV');
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(row).toHaveAttribute('aria-selected', 'false');
      expect(row.textContent).toContain("Can't be opened from here");
    });

    it('omits the cannot-open text while the link base is pending', () => {
      setup(itemOption('paperless_document', { disabled: true, target: null, pending: true }));
      expect(screen.getByRole('option').textContent).not.toContain("Can't be opened");
    });

    it('renders an external option as a new-tab link described by the new-tab hint', () => {
      setup(
        itemOption('paperless_document', {
          target: { kind: 'external', href: 'https://docs.example.test/documents/1/details' },
        }),
      );
      const row = screen.getByRole('option');
      expect(row.tagName).toBe('A');
      expect(row).toHaveAttribute('target', '_blank');
      expect(row).toHaveAttribute('rel', 'noopener noreferrer');
      expect(row).toHaveAttribute('aria-describedby', 'tab-hint');
    });

    it('does not report a choice for an external link', () => {
      const { onChoose } = setup(
        itemOption('paperless_document', {
          target: { kind: 'external', href: 'https://docs.example.test/documents/1/details' },
        }),
      );
      const row = screen.getByRole('option');
      row.addEventListener('click', (e) => e.preventDefault());
      fireEvent.click(row);
      expect(onChoose).not.toHaveBeenCalled();
    });
  });

  describe('show more rows', () => {
    it('renders the count, activates on pointer move and expands on click', () => {
      const { onShowMore, onActivate } = setup({
        kind: 'more',
        id: 'more-work_item',
        type: 'work_item',
        count: 7,
      });
      const row = screen.getByRole('option');
      expect(row.textContent).toBe('Show 7 more');
      expect(row).toHaveAttribute('data-testid', 'command-search-more-work_item');
      fireEvent.pointerMove(row);
      expect(onActivate).toHaveBeenCalledWith('more-work_item');
      fireEvent.click(row);
      expect(onShowMore).toHaveBeenCalledWith('work_item');
    });
  });

  describe('destination rows', () => {
    const destination = (viaFormerName: boolean): CommandOption => ({
      kind: 'destination',
      id: 'dest-scheduleGantt-0',
      dest: {
        route: 'scheduleGantt',
        term: 'Schedule',
        matched: 'Gantt',
        viaFormerName,
        rank: 0,
      },
      title: 'Schedule',
      target: routeUrl('scheduleGantt'),
      replace: true,
    });

    it('names the destination and links to it', () => {
      setup(destination(false));
      const row = screen.getByRole('option');
      expect(row).toHaveAttribute('aria-label', 'Go to Schedule');
      expect(row).toHaveAttribute('href', routeUrl('scheduleGantt'));
      expect(row).not.toHaveAttribute('aria-describedby');
      expect(row.textContent).not.toContain('Formerly');
    });

    it('shows and links the former name', () => {
      setup(destination(true));
      const row = screen.getByRole('option');
      expect(row.textContent).toContain('Formerly “Gantt”');
      const sub = document.getElementById(row.getAttribute('aria-describedby')!);
      expect(sub?.textContent).toBe('Formerly “Gantt”');
    });

    it('marks the live query, reports activation and a plain click', () => {
      const { onActivate, onChoose } = setup(destination(false), { liveQuery: 'sched' });
      const row = screen.getByRole('option');
      expect(row.querySelector('mark')?.textContent).toBe('Sched');
      fireEvent.pointerMove(row);
      expect(onActivate).toHaveBeenCalledWith('dest-scheduleGantt-0');
      fireEvent.click(row);
      expect(onChoose).toHaveBeenCalledWith(routeUrl('scheduleGantt'));
    });
  });
});
