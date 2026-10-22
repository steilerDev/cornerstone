/**
 * @jest-environment jsdom
 */
import { createRef } from 'react';
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { FilterChipGroup } from './FilterChipGroup.js';
import type { FilterChipLinkOption } from './FilterChipGroup.js';

const OPTIONS: FilterChipLinkOption[] = [
  { value: 'a', label: 'Ground floor › Kitchen', to: '/diary/new?areaId=a', title: 'Full path' },
  { value: 'other', label: 'Other area', to: '/diary/new', state: { origin: 'home' } },
  { value: 'c', label: 'Bath', to: '/diary/new?areaId=c', testId: 'custom-chip' },
];

function setup(extra: Record<string, unknown> = {}) {
  const log = createRouterLog();
  render(
    <RecordingRouter entries={['/']} log={log}>
      <FilterChipGroup
        variant="navigate"
        options={OPTIONS}
        ariaLabel="Where are you?"
        testIdPrefix="where"
        {...extra}
      />
    </RecordingRouter>,
  );
  return log;
}

describe('FilterChipGroup variant="navigate"', () => {
  it('renders one anchor per option in a labelled group, with no pressed state', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Where are you?' });
    const links = group.querySelectorAll('a');
    expect(links).toHaveLength(3);
    expect(group.querySelectorAll('button')).toHaveLength(0);
    links.forEach((a) => expect(a).not.toHaveAttribute('aria-pressed'));
    expect(links[0]).toHaveAttribute('href', '/diary/new?areaId=a');
  });

  it('sets title, data-chip-value and test ids (prefix or override)', () => {
    setup();
    expect(screen.getByTestId('where-a')).toHaveAttribute('title', 'Full path');
    expect(screen.getByTestId('where-a')).toHaveAttribute('data-chip-value', 'a');
    expect(screen.getByTestId('custom-chip')).toHaveTextContent('Bath');
    expect(screen.getByTestId('where-other')).not.toHaveAttribute('title');
  });

  it('navigates with the option state on a plain click', () => {
    const log = setup();
    fireEvent.click(screen.getByTestId('where-other'));
    expect(log.actions).toEqual(['PUSH /diary/new']);
    expect(log.states).toEqual([{ origin: 'home' }]);
  });

  it('names the group by labelledBy instead of ariaLabel and defaults layout to scroll', () => {
    render(
      <RecordingRouter entries={['/']} log={createRouterLog()}>
        <h2 id="h">Where?</h2>
        <FilterChipGroup variant="navigate" options={OPTIONS} labelledBy="h" ariaLabel="ignored" />
      </RecordingRouter>,
    );
    const group = screen.getByRole('group', { name: 'Where?' });
    expect(group).not.toHaveAttribute('aria-label');
    expect(group).toHaveAttribute('data-layout', 'scroll');
    expect(screen.getByTestId('filter-chip-a')).toBeInTheDocument();
  });

  it('supports wrap layout and a group ref', () => {
    const ref = createRef<HTMLDivElement>();
    setup({ layout: 'wrap', groupRef: ref });
    expect(ref.current).toBe(screen.getByRole('group'));
    expect(ref.current).toHaveAttribute('data-layout', 'wrap');
  });

  it('leaves the toggle variant unchanged (pressed buttons)', () => {
    render(
      <FilterChipGroup
        options={[{ value: 'x', label: 'X' }]}
        value="x"
        onChange={() => {}}
        ariaLabel="Toggle"
      />,
    );
    expect(screen.getByRole('button', { name: 'X' })).toHaveAttribute('aria-pressed', 'true');
  });
});
