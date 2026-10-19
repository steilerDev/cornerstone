/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { CreateMenuProvider, useCreateContext } from './CreateMenuContext.js';
import { QuickLogTiles } from './QuickLogTiles.js';
import type { QuickLogMode } from '../../navigation/createQuery.js';

function Context({ areaId, date }: { areaId?: string; date?: string }) {
  useCreateContext({ areaId, date });
  return null;
}

function setup(lastUsed: QuickLogMode | null = null) {
  const log = createRouterLog();
  const onChoose = jest.fn<(mode: QuickLogMode) => void>();
  render(
    <RecordingRouter entries={['/schedule/gantt?q=1']} log={log}>
      <CreateMenuProvider moneyPage={false} wide={false} sheetOpen onSheetOpenChange={() => {}}>
        <Context areaId="a1" date="2026-03-01" />
        <QuickLogTiles lastUsed={lastUsed} onChoose={onChoose} />
      </CreateMenuProvider>
    </RecordingRouter>,
  );
  return { log, onChoose };
}

describe('QuickLogTiles', () => {
  it('is a group named "Log now" with three links in default order', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Log now' });
    const links = within(group).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('data-testid'))).toEqual([
      'quick-log-photo',
      'quick-log-note',
      'quick-log-delivery',
    ]);
    expect(links.map((a) => a.textContent)).toEqual(['Photo', 'Note', 'Delivery']);
    expect(group.querySelector('ul, ol, [role="list"]')).toBeNull();
  });

  it('builds each href from quickLogHref: area kept, date dropped', () => {
    setup();
    for (const mode of ['photo', 'note', 'delivery']) {
      expect(screen.getByTestId(`quick-log-${mode}`)).toHaveAttribute(
        'href',
        `/diary/new?areaId=a1&start=${mode}`,
      );
    }
  });

  it('puts the last used tile first, names it "last used" and marks only that tile', () => {
    setup('delivery');
    const links = within(screen.getByRole('group', { name: 'Log now' })).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('data-testid'))).toEqual([
      'quick-log-delivery',
      'quick-log-photo',
      'quick-log-note',
    ]);
    expect(links[0]).toHaveAccessibleName('Delivery, last used');
    expect(links[0]).toHaveAttribute('data-last-used', 'true');
    expect(links[1]).not.toHaveAttribute('data-last-used');
    expect(links[2]).not.toHaveAttribute('data-last-used');
    expect(links[1]).toHaveAccessibleName('Photo');
    expect(links[2]).toHaveAccessibleName('Note');
  });

  it('marks nothing without a last used tile', () => {
    setup(null);
    expect(document.querySelector('[data-last-used]')).toBeNull();
  });

  it('a plain click calls onChoose and pushes the href with origin state', () => {
    const { log, onChoose } = setup();
    fireEvent.click(screen.getByTestId('quick-log-note'));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('note');
    expect(log.actions).toEqual(['PUSH /diary/new?areaId=a1&start=note']);
    expect(log.states[0]).toMatchObject({ origin: { to: '/schedule/gantt?q=1' } });
    expect(log.states[0]).not.toHaveProperty('background');
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    'a modified click %p does not call onChoose',
    (mod) => {
      const { log, onChoose } = setup();
      fireEvent.click(screen.getByTestId('quick-log-photo'), mod);
      expect(onChoose).not.toHaveBeenCalled();
      expect(log.actions).toEqual([]);
    },
  );

  it('hides every icon from assistive technology', () => {
    setup();
    const icons = document.querySelectorAll('[data-testid^="quick-log-"] svg');
    expect(icons).toHaveLength(3);
    icons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
  });
});
