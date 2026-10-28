/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OriginProbe, probedOrigin } from '../../test/originProbe';
import { SummaryStrip } from './SummaryStrip.js';
import type { SummaryFact } from './SummaryStrip.js';

function renderStrip(facts: readonly SummaryFact[], typeLabel = 'Task') {
  return render(
    <MemoryRouter initialEntries={['/project/work-items/w1']}>
      <SummaryStrip typeLabel={typeLabel} facts={facts} />
      <OriginProbe />
    </MemoryRouter>,
  );
}

const link = (
  id: string,
  label: string,
  value: SummaryFact['value'],
  to = '/x',
): Extract<SummaryFact, { kind: 'link' }> => ({
  kind: 'link',
  id,
  label,
  value,
  to,
});

describe('SummaryStrip', () => {
  it('renders a section named for the type with a description list of facts', () => {
    renderStrip([link('area', 'Area', 'Kitchen'), link('owner', 'Owner', 'Sample Co')]);
    const section = screen.getByRole('region', { name: 'Task summary' });
    expect(section).toBe(screen.getByTestId('summary-strip'));
    const dl = section.querySelector('dl');
    expect(dl).not.toBeNull();
    const groups = Array.from(dl!.children);
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.tagName).toBe('DIV');
      expect(group.children[0]?.tagName).toBe('DT');
      expect(group.children[1]?.tagName).toBe('DD');
    }
    expect(dl).toHaveClass('grid');
    expect(groups[0]).toHaveClass('fact');
  });

  it('renders at most seven facts', () => {
    const facts = Array.from({ length: 8 }, (_, i) => link(`f${i}`, `Label ${i}`, `Value ${i}`));
    renderStrip(facts);
    expect(screen.getAllByRole('term')).toHaveLength(7);
    expect(screen.queryByTestId('summary-fact-f7')).toBeNull();
    expect(screen.getByTestId('summary-fact-f6')).toBeInTheDocument();
  });

  it('names a fact target "label value"', () => {
    renderStrip([link('area', 'Area', 'Kitchen')]);
    expect(screen.getByRole('link', { name: 'Area Kitchen' })).toBe(
      screen.getByTestId('summary-fact-area'),
    );
  });

  it.each([null, '', false, undefined] as const)(
    'shows an en dash with a screen-reader "Not set" for empty value %p and stays interactive',
    (value) => {
      renderStrip([link('area', 'Area', value as SummaryFact['value'], '/areas')]);
      const target = screen.getByTestId('summary-fact-area');
      expect(target).toHaveAttribute('href', '/areas');
      expect(within(target).getByText('–')).toHaveAttribute('aria-hidden', 'true');
      expect(within(target).getByText('Not set')).toHaveClass('srOnly');
      expect(screen.getByRole('link', { name: 'Area Not set' })).toBeInTheDocument();
    },
  );

  it('renders a non-empty falsy value 0 as content', () => {
    renderStrip([link('count', 'Count', 0)]);
    expect(screen.getByTestId('summary-fact-count')).toHaveTextContent('0');
    expect(screen.queryByText('Not set')).toBeNull();
  });

  it('navigates a link fact and carries the page it was on as origin state', () => {
    renderStrip([
      { ...link('area', 'Area', 'Kitchen', '/areas/a1'), state: { origin: { to: '/o' } } },
    ]);
    fireEvent.click(screen.getByTestId('summary-fact-area'));
    expect(screen.getByTestId('probe-path')).toHaveTextContent('/areas/a1');
    expect(probedOrigin()).toEqual({ to: '/o' });
  });

  it('runs onActivate on a plain click of a tab fact and does not navigate', () => {
    const onActivate = jest.fn();
    renderStrip([
      {
        kind: 'tab',
        id: 'cost',
        label: 'Cost',
        value: '€ 1',
        href: '/project/work-items/w1?tab=cost',
        onActivate,
      },
    ]);
    const anchor = screen.getByTestId('summary-fact-cost');
    expect(anchor).toHaveAttribute('href', '/project/work-items/w1?tab=cost');
    const notPrevented = fireEvent.click(anchor);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
    expect(screen.getByTestId('probe-path')).toHaveTextContent('/project/work-items/w1');
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle', { button: 1 }],
  ])('leaves a %s click on a tab fact to the browser', (_name, init) => {
    const onActivate = jest.fn();
    renderStrip([{ kind: 'tab', id: 'cost', label: 'Cost', value: 'x', href: '/h', onActivate }]);
    const notPrevented = fireEvent.click(screen.getByTestId('summary-fact-cost'), init);
    expect(onActivate).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it('renders a button fact that opens a dialog, with expanded state and ref', () => {
    const onClick = jest.fn();
    const buttonRef = createRef<HTMLButtonElement>();
    const { rerender } = renderStrip([
      { kind: 'button', id: 'documents', label: 'Documents', value: '2', onClick, buttonRef },
    ]);
    const button = screen.getByRole('button', { name: 'Documents 2' });
    expect(buttonRef.current).toBe(button);
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <SummaryStrip
          typeLabel="Task"
          facts={[
            {
              kind: 'button',
              id: 'documents',
              label: 'Documents',
              value: '2',
              onClick,
              expanded: true,
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('summary-fact-documents')).toHaveAttribute('aria-expanded', 'true');
  });

  it('marks the value element with data-figure when a figureKind is given', () => {
    renderStrip([
      { ...link('left', 'Left to spend', '€ 5', '/m'), figureKind: 'left-to-spend' },
      link('plain', 'Plain', 'x'),
    ]);
    const marked = screen.getByText('€ 5');
    expect(marked).toHaveAttribute('data-figure', 'left-to-spend');
    expect(screen.getByText('x')).not.toHaveAttribute('data-figure');
  });

  it('uses a custom test id for a fact', () => {
    renderStrip([{ ...link('area', 'Area', 'Kitchen'), testId: 'custom-fact' }]);
    expect(screen.getByTestId('custom-fact')).toBeInTheDocument();
  });

  describe('wide facts and span attributes (#2239)', () => {
    const spansOf = () =>
      Array.from(document.querySelectorAll('dl > div')).map((el) => [
        el.getAttribute('data-span-sm'),
        el.getAttribute('data-span-md'),
        el.getAttribute('data-span-lg'),
      ]);

    it('gives every fact span 1 at every breakpoint when the row is full of narrow facts', () => {
      renderStrip([
        link('a', 'A', '1'),
        link('b', 'B', '2'),
        link('c', 'C', '3'),
        link('d', 'D', '4'),
      ]);
      expect(spansOf()).toEqual([
        ['1', '1', '1'],
        ['1', '1', '1'],
        ['1', '1', '1'],
        ['1', '1', '1'],
      ]);
    });

    it('lets a wide fact span two columns and the last fact fill the row (4 columns: 2 / 4 / 4)', () => {
      const facts = [
        link('a', 'A', '1'),
        link('b', 'B', '2'),
        link('c', 'C', '3'),
        link('d', 'D', '4'),
        { ...link('e', 'E', '5 · remark'), wide: true },
        link('f', 'F', '6'),
        link('g', 'G', '7'),
      ];
      renderStrip(facts);
      expect(spansOf()[4]).toEqual(['2', '2', '2']);
      expect(spansOf()[6]).toEqual(['1', '1', '1']);
    });

    it('computes 5-column strips as 2 / 3 / 5 per breakpoint', () => {
      render(
        <MemoryRouter>
          <SummaryStrip
            typeLabel="Money"
            columns={5}
            facts={[link('a', 'A', '1'), link('b', 'B', '2'), link('c', 'C', '3')]}
          />
        </MemoryRouter>,
      );
      // sm: 2 columns -> [1,2]; md: 3 columns -> [1,1,1]; lg: 5 columns -> [1,1,3]
      expect(spansOf()).toEqual([
        ['1', '1', '1'],
        ['1', '1', '1'],
        ['2', '1', '3'],
      ]);
    });

    it('computes spans after the seventh-fact slice', () => {
      const facts = Array.from({ length: 8 }, (_, i) => link(`f${i}`, `L${i}`, `V${i}`));
      renderStrip(facts);
      expect(spansOf()).toHaveLength(7);
      // 7 narrow facts: the 7th fills its row at every breakpoint (2, 4 and 4 columns)
      expect(spansOf()[6]).toEqual(['2', '2', '2']);
    });
  });

  describe('columns', () => {
    it('defaults to 4 columns', () => {
      renderStrip([link('a', 'A', '1')]);
      expect(document.querySelector('dl')).toHaveAttribute('data-columns', '4');
    });

    it('sets data-columns to 5 when asked', () => {
      render(
        <MemoryRouter>
          <SummaryStrip typeLabel="Money" columns={5} facts={[link('a', 'A', '1')]} />
        </MemoryRouter>,
      );
      expect(document.querySelector('dl')).toHaveAttribute('data-columns', '5');
    });
  });

  describe('static fact', () => {
    const staticFact = (
      over: Partial<Extract<SummaryFact, { kind: 'static' }>> = {},
    ): Extract<SummaryFact, { kind: 'static' }> => ({
      kind: 'static',
      id: 'cost',
      label: 'Expected cost',
      value: '€ 100',
      ...over,
    });

    it('renders a plain span, not a link, button or anchor', () => {
      renderStrip([staticFact(), link('a', 'A', 'x')]);
      const target = screen.getByTestId('summary-fact-cost');
      expect(target.tagName).toBe('SPAN');
      expect(target).toHaveTextContent('€ 100');
      expect(target.closest('a')).toBeNull();
      expect(target.closest('button')).toBeNull();
      expect(target).not.toHaveAttribute('aria-labelledby');
    });

    it('marks only the static wrapper with data-static', () => {
      renderStrip([staticFact(), link('a', 'A', 'x')]);
      const wrappers = Array.from(document.querySelectorAll('dl > div'));
      expect(wrappers[0]).toHaveAttribute('data-static', 'true');
      expect(wrappers[1]).not.toHaveAttribute('data-static');
    });

    it('puts the id on the inner value span only, so no id is duplicated', () => {
      renderStrip([staticFact(), link('a', 'A', 'x')]);
      const target = screen.getByTestId('summary-fact-cost');
      expect(target).not.toHaveAttribute('id');
      expect(target.querySelector('span[id]')).not.toBeNull();
      const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('still marks the value with data-figure when it has a figureKind', () => {
      renderStrip([staticFact({ figureKind: 'left-to-spend' })]);
      expect(screen.getByText('€ 100')).toHaveAttribute('data-figure', 'left-to-spend');
    });

    it('renders an en dash with a Not set label when empty', () => {
      renderStrip([staticFact({ value: null })]);
      expect(screen.getByTestId('summary-fact-cost')).toHaveTextContent('–');
      expect(screen.getByText('Not set')).toBeInTheDocument();
    });

    it('leaves existing kinds without data-static', () => {
      renderStrip([link('a', 'A', 'x')]);
      expect(document.querySelector('[data-static]')).toBeNull();
    });
  });

  describe('trailing slot (#2248)', () => {
    const trailing = <a href="tel:+4930123">Call</a>;

    it.each([
      ['link', { ...link('who', 'Who', 'Company One'), trailing }],
      [
        'tab',
        {
          kind: 'tab',
          id: 'who',
          label: 'Who',
          value: 'Company One',
          href: '/x?tab=a',
          onActivate: () => undefined,
          trailing,
        } as SummaryFact,
      ],
      [
        'button',
        {
          kind: 'button',
          id: 'who',
          label: 'Who',
          value: 'Company One',
          onClick: () => undefined,
          trailing,
        } as SummaryFact,
      ],
      ['static', { kind: 'static', id: 'who', label: 'Who', value: 'Company One', trailing }],
    ] as [string, SummaryFact][])('renders the trailing node beside a %s target', (_kind, fact) => {
      renderStrip([fact]);
      const target = screen.getByTestId('summary-fact-who');
      const call = screen.getByRole('link', { name: 'Call' });
      expect(target).toHaveTextContent('Company One');
      expect(target).not.toContainElement(call);
      // wrapped in one span so the sibling control is styled as a unit, beside the target
      expect(call.parentElement!.tagName).toBe('SPAN');
      expect(call.parentElement!.parentElement).toBe(target.parentElement);
      expect(target.compareDocumentPosition(call) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('keeps the target clickable and its name free of the trailing text', () => {
      renderStrip([{ ...link('who', 'Who', 'Company One', '/company/c1'), trailing }]);
      const target = screen.getByTestId('summary-fact-who');
      expect(target).toHaveAttribute('href', '/company/c1');
      expect(target.closest('a')).toBe(target);
      expect(target.textContent).not.toContain('Call');
    });

    it('renders nothing extra when no trailing node is given', () => {
      renderStrip([link('who', 'Who', 'Company One')]);
      expect(screen.getByTestId('summary-fact-who').parentElement!.childElementCount).toBe(1);
    });
  });
});
