/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { FeedRow } from './FeedRow.js';
import type { FeedRowObjectProps } from './FeedRow.js';

function setup(props: Partial<FeedRowObjectProps> = {}) {
  const log = createRouterLog();
  const row = (
    <FeedRow
      variant="object"
      severity="none"
      badges={<span data-testid="badge">Late</span>}
      title="Task A"
      titleLink={{ to: '/project/work-items/wi-1', state: { from: 'home' } }}
      testId="obj-1"
      {...props}
    />
  );
  render(
    <RecordingRouter entries={['/']} log={log}>
      {(props.as ?? 'li') === 'li' ? <ul>{row}</ul> : row}
    </RecordingRouter>,
  );
  return { log, root: screen.getByTestId('obj-1') };
}

describe('FeedRow variant="object"', () => {
  it('is an li by default and a div with as="div"', () => {
    expect(setup().root.tagName).toBe('LI');
  });

  it('renders a div root when as="div"', () => {
    expect(setup({ as: 'div' }).root.tagName).toBe('DIV');
  });

  it.each(['red', 'amber', 'none'] as const)('exposes severity %s as a data attribute', (sev) => {
    expect(setup({ severity: sev }).root).toHaveAttribute('data-severity', sev);
  });

  it('shows the host-built badges in the meta line', () => {
    setup();
    expect(screen.getByTestId('badge')).toHaveTextContent('Late');
  });

  it('shows the key figure with its screen-reader prefix', () => {
    setup({ figure: { text: '€1,234.00', srPrefix: 'Amount:' } });
    const figure = screen.getByTestId('obj-1-figure');
    expect(figure).toHaveTextContent('Amount: €1,234.00');
    expect(figure.querySelector('span')).toHaveTextContent('Amount:');
  });

  it('omits the figure when null or missing', () => {
    setup({ figure: null });
    expect(screen.queryByTestId('obj-1-figure')).toBeNull();
  });

  it('renders the title as a link with row-focus marker and navigates with state', () => {
    const { log } = setup();
    const link = screen.getByTestId('obj-1-link');
    expect(link).toHaveTextContent('Task A');
    expect(link).toHaveAttribute('href', '/project/work-items/wi-1');
    expect(link).toHaveAttribute('data-row-focus');
    fireEvent.click(link);
    expect(log.actions).toEqual(['PUSH /project/work-items/wi-1']);
    expect(log.states).toEqual([{ from: 'home' }]);
  });

  it('renders a plain focusable title (tabIndex -1) when there is no link', () => {
    setup({ titleLink: null, title: '3 tasks not started' });
    expect(screen.queryByTestId('obj-1-link')).toBeNull();
    const title = screen.getByTestId('obj-1-title');
    expect(title.tagName).toBe('SPAN');
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(title).toHaveAttribute('data-row-focus');
  });

  it('shows the kind word, context, sentence and notes when given', () => {
    setup({
      kindLabel: 'Milestone',
      context: <span data-testid="ctx">Kitchen · Company A</span>,
      sentence: 'Target Mar 1 has passed.',
      notes: [<span key="n1">Holds up 2 tasks</span>, <span key="n2">Waits for Task B</span>],
    });
    expect(screen.getByText('Milestone')).toBeInTheDocument();
    expect(screen.getByTestId('ctx')).toBeInTheDocument();
    expect(screen.getByText('Target Mar 1 has passed.')).toBeInTheDocument();
    expect(screen.getByText('Holds up 2 tasks')).toBeInTheDocument();
    expect(screen.getByText('Waits for Task B')).toBeInTheDocument();
  });

  it('omits kind, context, sentence, notes, actions when not given', () => {
    const { root } = setup();
    expect(root.querySelector('p')).toBeNull();
    expect(screen.queryByTestId('obj-1-actions')).toBeNull();
  });

  it('renders actions in a testid wrapper and nested children after them', () => {
    setup({
      actions: <button type="button">Start</button>,
      children: <ul data-testid="nested" />,
    });
    expect(screen.getByTestId('obj-1-actions')).toContainElement(
      screen.getByRole('button', { name: 'Start' }),
    );
    expect(screen.getByTestId('nested')).toBeInTheDocument();
  });
});
