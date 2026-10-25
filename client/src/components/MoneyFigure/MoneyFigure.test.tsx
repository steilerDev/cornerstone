/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MoneyFigure } from './MoneyFigure.js';
import type { MoneyFigureProps } from './MoneyFigure.js';

function renderFigure(over: Partial<MoneyFigureProps> = {}) {
  return render(
    <MoneyFigure label="Left to spend" figure="€ 12,000" noFigureLabel="No figure yet" {...over} />,
  );
}

describe('MoneyFigure', () => {
  it('names the card section by its h2 heading by default', () => {
    renderFigure();
    const heading = screen.getByRole('heading', { level: 2, name: 'Left to spend' });
    expect(screen.getByRole('region', { name: 'Left to spend' })).toContainElement(heading);
  });

  it('renders an h3 when headingLevel is 3', () => {
    renderFigure({ headingLevel: 3 });
    expect(screen.getByRole('heading', { level: 3, name: 'Left to spend' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('shows the muted label suffix inside the heading and none when absent', () => {
    const { unmount } = renderFigure({ labelSuffix: 'Whole project' });
    expect(screen.getByRole('heading')).toHaveTextContent('Left to spend Whole project');
    unmount();
    renderFigure({ labelSuffix: null });
    expect(screen.getByRole('heading')).toHaveTextContent(/^Left to spend$/);
  });

  it('puts the figure alone in the data-figure element', () => {
    renderFigure({ figureKind: 'left-to-spend', verdict: <b>On budget</b>, range: '€ 1 to € 2' });
    const figure = screen.getByTestId('money-figure-figure');
    expect(figure).toHaveAttribute('data-figure', 'left-to-spend');
    expect(figure).toHaveTextContent(/^€ 12,000$/);
    expect(figure.children).toHaveLength(0);
    expect(document.querySelectorAll('[data-figure]')).toHaveLength(1);
  });

  it('omits data-figure without a figureKind', () => {
    renderFigure();
    expect(screen.getByTestId('money-figure-figure')).not.toHaveAttribute('data-figure');
  });

  it('marks a negative figure and not a positive one', () => {
    const { unmount } = renderFigure({ negative: true });
    expect(screen.getByTestId('money-figure-figure')).toHaveAttribute('data-negative', 'true');
    unmount();
    renderFigure();
    expect(screen.getByTestId('money-figure-figure')).not.toHaveAttribute('data-negative');
  });

  it('shows an en dash named by noFigureLabel when there is no figure', () => {
    renderFigure({ figure: null, figureKind: 'left-to-spend', negative: true });
    const dash = screen.getByRole('img', { name: 'No figure yet' });
    expect(dash).toBe(screen.getByTestId('money-figure-figure'));
    expect(dash).toHaveTextContent('–');
    expect(dash).toHaveAttribute('data-figure', 'left-to-spend');
    expect(dash).not.toHaveAttribute('data-negative');
  });

  it('renders the verdict beside the figure, including Over budget, and none when absent', () => {
    const { unmount } = renderFigure({ figure: '-€ 500', verdict: <span>Over budget</span> });
    expect(screen.getByTestId('money-figure-verdict')).toHaveTextContent('Over budget');
    unmount();
    renderFigure();
    expect(screen.queryByTestId('money-figure-verdict')).toBeNull();
  });

  it('renders the range under the figure and nothing when null or empty', () => {
    const { unmount } = renderFigure({ range: 'Between € 10 and € 20' });
    expect(screen.getByTestId('money-figure-range')).toHaveTextContent('Between € 10 and € 20');
    unmount();
    const second = renderFigure({ range: null });
    expect(screen.queryByTestId('money-figure-range')).toBeNull();
    second.unmount();
    renderFigure({ range: '' });
    expect(screen.queryByTestId('money-figure-range')).toBeNull();
  });

  it('renders the detail line only when given', () => {
    const { unmount } = renderFigure({ detail: 'Based on 4 lines' });
    expect(screen.getByText('Based on 4 lines').tagName).toBe('P');
    unmount();
    renderFigure();
    expect(screen.queryByText('Based on 4 lines')).toBeNull();
  });

  it('has no disclosure without an explanation', () => {
    renderFigure();
    expect(screen.queryByTestId('money-figure-explain-toggle')).toBeNull();
    expect(screen.queryByTestId('money-figure-explain')).toBeNull();
  });

  it('toggles the explanation with aria-expanded and hidden', () => {
    renderFigure({
      explanation: { toggleLabel: 'How is this calculated?', content: <p>Cost minus paid.</p> },
    });
    const toggle = screen.getByRole('button', { name: 'How is this calculated?' });
    const panel = screen.getByTestId('money-figure-explain');
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', panel.id);
    expect(panel.id).not.toBe('');
    expect(panel).toHaveAttribute('hidden');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('hidden');
    expect(screen.getByText('Cost minus paid.')).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('hidden');
  });

  it('derives every test id from a custom testId', () => {
    renderFigure({
      testId: 'lts',
      verdict: <span>ok</span>,
      range: 'r',
      explanation: { toggleLabel: 'Why', content: 'x' },
    });
    for (const id of ['lts', 'lts-figure', 'lts-verdict', 'lts-range', 'lts-explain-toggle']) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('money-figure')).toBeNull();
  });

  it('keeps two instances from sharing ids', () => {
    render(
      <>
        <MoneyFigure
          label="A"
          figure="1"
          noFigureLabel="n"
          testId="a"
          explanation={{ toggleLabel: 'Why', content: 'x' }}
        />
        <MoneyFigure
          label="B"
          figure="2"
          noFigureLabel="n"
          testId="b"
          explanation={{ toggleLabel: 'Why', content: 'x' }}
        />
      </>,
    );
    const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
