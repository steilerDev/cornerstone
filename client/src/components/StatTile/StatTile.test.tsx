/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { StatTile } from './StatTile.js';
import type { StatTileProps } from './StatTile.js';

function setup(props: Partial<StatTileProps> = {}) {
  const log = createRouterLog();
  render(
    <RecordingRouter entries={['/']} log={log}>
      <StatTile
        label="Still to pay"
        figure="€4,200.00"
        to="/budget/invoices"
        testId="tile-1"
        {...props}
      />
    </RecordingRouter>,
  );
  return { log, tile: screen.getByTestId('tile-1') };
}

describe('StatTile', () => {
  it('is one link whose text is its name, with an h3 label and a hidden chevron', () => {
    const { tile } = setup({ detail: '3 open invoices' });
    expect(tile.tagName).toBe('A');
    expect(tile).toHaveAttribute('href', '/budget/invoices');
    expect(tile).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('heading', { level: 3, name: /Still to pay/ })).toBeInTheDocument();
    expect(tile.querySelector('[aria-hidden="true"]')).toHaveTextContent('›');
    expect(screen.getByTestId('tile-1-figure')).toHaveTextContent('€4,200.00');
    expect(screen.getByTestId('tile-1-detail')).toHaveTextContent('3 open invoices');
  });

  it('wraps in a div by default', () => {
    const { tile } = setup();
    expect(tile.parentElement?.tagName).toBe('DIV');
  });

  it('renders an li root when as="li"', () => {
    const { tile } = setup({ as: 'li' });
    expect(tile.parentElement?.tagName).toBe('LI');
  });

  it.each([
    [2, 'H2'],
    [3, 'H3'],
    [4, 'H4'],
  ] as const)('uses heading level %s', (level, tag) => {
    setup({ headingLevel: level });
    expect(screen.getByRole('heading', { level }).tagName).toBe(tag);
  });

  it('uses the large figure by default', () => {
    setup();
    expect(screen.getByTestId('tile-1-figure').className).not.toContain('figureMedium');
  });

  it('adds the medium figure class with figureSize="medium"', () => {
    setup({ figureSize: 'medium' });
    expect(screen.getByTestId('tile-1-figure').className).toContain('figureMedium');
  });

  it('gives a non-text figure role img and its label', () => {
    setup({ figure: '–', figureLabel: 'No figure yet' });
    expect(screen.getByRole('img', { name: 'No figure yet' })).toHaveTextContent('–');
  });

  it('has no role img without a figureLabel', () => {
    setup();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it.each(['left-to-spend', 'still-to-pay', 'paid', 'ready-to-submit', 'holds-up'] as const)(
    'marks the figure element with data-figure="%s" (#2232)',
    (figureKind) => {
      setup({ figureKind });
      expect(screen.getByTestId('tile-1-figure')).toHaveAttribute('data-figure', figureKind);
    },
  );

  it('has no data-figure attribute without a figureKind (#2232)', () => {
    setup();
    expect(screen.getByTestId('tile-1-figure')).not.toHaveAttribute('data-figure');
    expect(document.querySelector('[data-figure]')).toBeNull();
  });

  it('puts the marker on the figure span only, next to the img role of a non-text figure (#2232)', () => {
    setup({ figure: '–', figureLabel: 'No figure yet', figureKind: 'left-to-spend' });
    const img = screen.getByRole('img', { name: 'No figure yet' });
    expect(img).toHaveAttribute('data-figure', 'left-to-spend');
    expect(document.querySelectorAll('[data-figure]')).toHaveLength(1);
  });

  it('omits the detail line without detail', () => {
    setup();
    expect(screen.queryByTestId('tile-1-detail')).toBeNull();
  });

  it('navigates in-app with the given state on a plain click', () => {
    const { log, tile } = setup({ state: { from: 'home' } });
    fireEvent.click(tile);
    expect(log.actions).toEqual(['PUSH /budget/invoices']);
    expect(log.states).toEqual([{ from: 'home' }]);
  });
});
