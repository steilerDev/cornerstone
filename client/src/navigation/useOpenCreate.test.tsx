/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { routeUrl } from '@cornerstone/shared';
import { createRouterLog, RecordingRouter } from '../test/recordingRouter.js';
import type { RouterLog } from '../test/recordingRouter.js';
import {
  CreateMenuProvider,
  useCreateContext,
} from '../components/CreateMenu/CreateMenuContext.js';
import type { CreateEntryId } from './createEntries.js';
import type { QuickLogMode } from './createQuery.js';
import {
  createLinkFor,
  useCreateEntryLink,
  useOpenCreate,
  useQuickLogLink,
} from './useOpenCreate.js';

const LOCATION = { pathname: '/schedule/gantt', search: '?q=1', hash: '', state: null, key: 'k0' };

function Opener({ id, createOpener }: { id: CreateEntryId; createOpener?: boolean }) {
  const open = useOpenCreate();
  return (
    <button type="button" data-testid="open" onClick={() => open(id, { createOpener })}>
      open
    </button>
  );
}

function LinkProbe({ id }: { id: CreateEntryId }) {
  const { to, state } = useCreateEntryLink(id, { createOpener: true });
  return <output data-testid="link">{JSON.stringify({ to, state })}</output>;
}

function Context({ date, areaId }: { date?: string; areaId?: string }) {
  useCreateContext({ date, areaId });
  return null;
}

function setup(ui: React.ReactNode, log: RouterLog = createRouterLog(), withProvider = true) {
  render(
    <RecordingRouter entries={['/schedule/gantt?q=1']} log={log}>
      {withProvider ? (
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
          {ui}
        </CreateMenuProvider>
      ) : (
        ui
      )}
    </RecordingRouter>,
  );
  return log;
}

describe('createLinkFor', () => {
  it('gives dialog targets a background, the origin and no opener flag by default', () => {
    const link = createLinkFor('task', {}, LOCATION);
    expect(link.to).toBe(routeUrl('workItemNew'));
    expect(link.state).toMatchObject({
      origin: { to: '/schedule/gantt?q=1' },
      background: { pathname: '/schedule/gantt', search: '?q=1', key: 'k0' },
    });
    expect(link.state).not.toHaveProperty('createOpener');
  });

  it('gives the company target a background like the other dialogs (#2213)', () => {
    const link = createLinkFor('company', {}, LOCATION);
    expect(link.to).toBe(routeUrl('companyNew'));
    expect(link.state).toMatchObject({
      origin: { to: '/schedule/gantt?q=1' },
      background: { pathname: '/schedule/gantt', search: '?q=1' },
    });
  });

  it('gives non-dialog targets the origin but no background', () => {
    const link = createLinkFor('fundingSource', {}, LOCATION);
    expect(link.state).toHaveProperty('origin');
    expect(link.state).not.toHaveProperty('background');
  });

  it('marks createOpener only when asked', () => {
    expect(createLinkFor('task', {}, LOCATION, { createOpener: true }).state).toMatchObject({
      createOpener: true,
    });
    expect(createLinkFor('task', {}, LOCATION, { createOpener: false }).state).not.toHaveProperty(
      'createOpener',
    );
  });

  it('adds only accepted pre-fill keys to the URL', () => {
    const link = createLinkFor('milestone', { date: '2026-03-01', areaId: 'a1' }, LOCATION);
    expect(link.to).toBe(routeUrl('milestoneNew', undefined, { date: '2026-03-01' }));
  });
});

describe('useOpenCreate', () => {
  it('pushes a dialog target with background and origin', () => {
    const log = setup(<Opener id="task" />);
    fireEvent.click(screen.getByTestId('open'));
    expect(log.actions).toEqual([`PUSH ${routeUrl('workItemNew')}`]);
    expect(log.states[0]).toMatchObject({
      origin: { to: '/schedule/gantt?q=1' },
      background: { pathname: '/schedule/gantt', search: '?q=1' },
    });
  });

  it('pushes a non-dialog target without a background', () => {
    const log = setup(<Opener id="grant" />);
    fireEvent.click(screen.getByTestId('open'));
    expect(log.actions).toEqual([
      `PUSH ${routeUrl('financing', undefined, { create: '1', kind: 'grant' })}`,
    ]);
    expect(log.states[0]).not.toHaveProperty('background');
  });

  it('carries the context the page registered', () => {
    const log = setup(
      <>
        <Context date="2026-03-01" />
        <Opener id="milestone" />
      </>,
    );
    fireEvent.click(screen.getByTestId('open'));
    expect(log.actions).toEqual([
      `PUSH ${routeUrl('milestoneNew', undefined, { date: '2026-03-01' })}`,
    ]);
  });

  it('passes createOpener through', () => {
    const log = setup(<Opener id="task" createOpener />);
    fireEvent.click(screen.getByTestId('open'));
    expect(log.states[0]).toMatchObject({ createOpener: true });
  });

  it('works without a CreateMenuProvider (no pre-fill)', () => {
    const log = setup(<Opener id="task" />, createRouterLog(), false);
    fireEvent.click(screen.getByTestId('open'));
    expect(log.actions).toEqual([`PUSH ${routeUrl('workItemNew')}`]);
  });
});

describe('useCreateEntryLink', () => {
  it('builds the same link and always flags createOpener when asked', () => {
    setup(
      <>
        <Context areaId="a1" />
        <LinkProbe id="task" />
      </>,
    );
    const { to, state } = JSON.parse(screen.getByTestId('link').textContent ?? '{}') as {
      to: string;
      state: Record<string, unknown>;
    };
    expect(to).toBe(routeUrl('workItemNew', undefined, { areaId: 'a1' }));
    expect(state.createOpener).toBe(true);
    expect(state.background).toBeDefined();
  });
});

function QuickProbe({ mode }: { mode: QuickLogMode }) {
  const { to, state } = useQuickLogLink(mode);
  return <output data-testid="quick">{JSON.stringify({ to, state })}</output>;
}

describe('useQuickLogLink', () => {
  it('links to the capture screen with the page area and the origin, nothing else', () => {
    setup(
      <>
        <Context areaId="a1" date="2026-03-01" />
        <QuickProbe mode="note" />
      </>,
    );
    const { to, state } = JSON.parse(screen.getByTestId('quick').textContent ?? '{}') as {
      to: string;
      state: Record<string, unknown>;
    };
    expect(to).toBe('/diary/new?areaId=a1&start=note');
    expect(state).toMatchObject({ origin: { to: '/schedule/gantt?q=1' } });
    expect(state).not.toHaveProperty('background');
    expect(state).not.toHaveProperty('createOpener');
  });

  it('works without a provider (no area)', () => {
    setup(<QuickProbe mode="photo" />, createRouterLog(), false);
    const { to } = JSON.parse(screen.getByTestId('quick').textContent ?? '{}') as { to: string };
    expect(to).toBe('/diary/new?start=photo');
  });
});
