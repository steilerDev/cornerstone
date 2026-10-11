/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import type { ObjectFormResult, ObjectFormSchema } from '../components/ObjectForm/types.js';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type * as RoutesTypes from './ObjectFormRoutes.js';

let mockUser: { id: string } | null = { id: 'u1' };
jest.unstable_mockModule('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockWhenReady = jest.fn<() => () => void>(() => () => {});
jest.unstable_mockModule('../lib/focusPageHeading.js', () => ({
  focusPageHeading: jest.fn(),
  focusPageHeadingWhenReady: mockWhenReady,
}));

const mockSubmit = jest.fn<(values: Record<string, unknown>) => Promise<ObjectFormResult>>();

function schemaFor(
  id: string,
  title: string,
  prefill: ObjectFormSchema['prefill'],
): ObjectFormSchema {
  return {
    id,
    title,
    prefill,
    initialValues: { title: '', area: '', targetDate: '' },
    fields: [
      { name: 'title', label: 'Title', kind: 'text', essential: true, required: true },
      { name: 'area', label: 'Area', kind: 'text', essential: true },
      { name: 'targetDate', label: 'Target', kind: 'text', essential: true },
    ],
    validate: (v) => (String(v.title ?? '') ? {} : { title: 'Title is required' }),
    submit: (v) => mockSubmit(v),
  };
}

jest.unstable_mockModule('./taskForm.js', () => ({
  useTaskFormSchema: () => schemaFor('task', 'New task', { areaId: 'area' }),
}));
jest.unstable_mockModule('./purchaseForm.js', () => ({
  usePurchaseFormSchema: () => schemaFor('purchase', 'New purchase', { areaId: 'area' }),
}));
jest.unstable_mockModule('./milestoneForm.js', () => ({
  useMilestoneFormSchema: () => schemaFor('milestone', 'New milestone', { date: 'targetDate' }),
}));

const BACKGROUND = {
  pathname: '/project/work-items',
  search: '?q=a',
  hash: '',
  key: 'bgkey',
  state: null,
};

function Probe() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <div>
      <output data-testid="path">{location.pathname + location.search}</output>
      <output data-testid="type">{type}</output>
      <output data-testid="state">{JSON.stringify(location.state)}</output>
    </div>
  );
}

function Controls() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" data-testid="back" onClick={() => void navigate(-1)} />
      <button type="button" data-testid="push-away" onClick={() => void navigate('/elsewhere')} />
    </div>
  );
}

describe('ObjectFormRoutes', () => {
  let Mod: typeof RoutesTypes;
  let media: MatchMediaControl;

  beforeEach(async () => {
    mockUser = { id: 'u1' };
    mockSubmit.mockReset();
    mockWhenReady.mockClear();
    mockSubmit.mockResolvedValue({ id: 'w1', href: '/project/work-items/w1', label: 'W' });
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Mod) Mod = await import('./ObjectFormRoutes.js');
  });

  afterEach(() => {
    media.restore();
  });

  function renderAt(
    entries: Array<string | { pathname: string; search?: string; state?: unknown }>,
    index = entries.length - 1,
    extra: React.ReactNode = null,
  ) {
    return render(
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        {extra}
        <Mod.ObjectFormRoutes />
        <Probe />
        <Controls />
      </MemoryRouter>,
    );
  }

  const withBackground = (path = '/project/work-items/new', extra: object = {}) => [
    { pathname: '/project/work-items', search: '?q=a' },
    {
      pathname: path,
      state: { background: BACKGROUND, origin: { to: '/project/work-items?q=a' }, ...extra },
    },
  ];

  const title = () => screen.getByLabelText(/^Title/) as HTMLInputElement;

  it.each([
    ['/project/work-items/new', 'New task'],
    ['/project/household-items/new', 'New purchase'],
    ['/project/milestones/new', 'New milestone'],
  ])('renders the form of %s', (path, heading) => {
    renderAt([{ pathname: path }]);
    expect(screen.getByRole('dialog', { name: heading })).toBeInTheDocument();
  });

  it.each(['/project/work-items', '/diary/new', '/'])('renders nothing on %s', (path) => {
    renderAt([{ pathname: path }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders nothing without a signed-in user', () => {
    mockUser = null;
    renderAt([{ pathname: '/project/work-items/new' }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pre-fills from the URL search through the schema mapping, dropping invalid values', () => {
    renderAt([{ pathname: '/project/work-items/new', search: '?areaId=a1' }]);
    expect((screen.getByLabelText('Area') as HTMLInputElement).value).toBe('a1');
  });

  it('drops an invalid pre-fill date', () => {
    renderAt([{ pathname: '/project/milestones/new', search: '?date=2026-02-30' }]);
    expect((screen.getByLabelText('Target') as HTMLInputElement).value).toBe('');
  });

  it('pre-fills a milestone date', () => {
    renderAt([{ pathname: '/project/milestones/new', search: '?date=2026-03-01' }]);
    expect((screen.getByLabelText('Target') as HTMLInputElement).value).toBe('2026-03-01');
  });

  describe('Cancel', () => {
    it('with a background goes back one entry (to the page you came from)', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.click(screen.getByTestId('object-form-cancel'));
      expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items?q=a');
      expect(screen.getByTestId('type')).toHaveTextContent('POP');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('Escape also goes back with a background', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.keyboard('{Escape}');
      expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items?q=a');
    });

    it('without a background replaces the entry with the origin', async () => {
      const user = userEvent.setup();
      renderAt([
        {
          pathname: '/project/work-items/new',
          state: { origin: { to: '/schedule/gantt?filter=tasks' } },
        },
      ]);
      await user.click(screen.getByTestId('object-form-cancel'));
      expect(screen.getByTestId('path')).toHaveTextContent('/schedule/gantt?filter=tasks');
      expect(screen.getByTestId('type')).toHaveTextContent('REPLACE');
    });

    it('without a background and without an origin replaces the entry with the list', async () => {
      const user = userEvent.setup();
      renderAt([{ pathname: '/project/household-items/new' }]);
      await user.click(screen.getByTestId('object-form-cancel'));
      expect(screen.getByTestId('path')).toHaveTextContent('/project/household-items');
      expect(screen.getByTestId('path').textContent).not.toContain('/new');
      expect(screen.getByTestId('type')).toHaveTextContent('REPLACE');
    });

    it('an unsafe background is treated as no background (replaces with the list, never goes back)', async () => {
      const user = userEvent.setup();
      renderAt([
        { pathname: '/project/milestones' },
        {
          pathname: '/project/milestones/new',
          state: { background: { ...BACKGROUND, pathname: '//evil.example' } },
        },
      ]);
      await user.click(screen.getByTestId('object-form-cancel'));
      expect(screen.getByTestId('path')).toHaveTextContent('/project/milestones');
      expect(screen.getByTestId('type')).toHaveTextContent('REPLACE');
    });

    it('a dirty form asks first; Discard then goes back and does not hold', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.type(title(), 'x');
      await user.click(screen.getByTestId('object-form-cancel'));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items/new');
      await user.click(screen.getByTestId('object-form-discard-confirm'));
      expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items?q=a');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });

  describe('Save', () => {
    it('replaces the dialog entry with the new object and forwards only the origin', async () => {
      const user = userEvent.setup();
      renderAt(withBackground('/project/work-items/new', { unrelated: true }));
      await user.type(title(), 'T');
      await user.click(screen.getByTestId('object-form-save'));
      await waitFor(() =>
        expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items/w1'),
      );
      expect(screen.getByTestId('type')).toHaveTextContent('REPLACE');
      expect(JSON.parse(screen.getByTestId('state').textContent ?? 'null')).toEqual({
        origin: { to: '/project/work-items?q=a' },
      });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('forwards no state when there is no valid origin', async () => {
      const user = userEvent.setup();
      renderAt([{ pathname: '/project/work-items/new', state: { origin: { to: '//evil' } } }]);
      await user.type(title(), 'T');
      await user.click(screen.getByTestId('object-form-save'));
      await waitFor(() =>
        expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items/w1'),
      );
      expect(screen.getByTestId('state')).toHaveTextContent('null');
    });

    it('hands focus to the destination heading once it renders (focusPageHeadingWhenReady)', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.type(title(), 'T');
      await user.click(screen.getByTestId('object-form-save'));
      await waitFor(() => expect(mockWhenReady).toHaveBeenCalledTimes(1));
    });

    it('Cancel does not wait for a heading', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.click(screen.getByTestId('object-form-cancel'));
      expect(mockWhenReady).not.toHaveBeenCalled();
    });

    it('does not hold the form after Save (the replace is not a Back)', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.type(title(), 'T');
      await user.click(screen.getByTestId('object-form-save'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('Back from the saved object returns to the page you came from', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.type(title(), 'T');
      await user.click(screen.getByTestId('object-form-save'));
      await waitFor(() =>
        expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items/w1'),
      );
      await user.click(screen.getByTestId('back'));
      expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items?q=a');
    });
  });

  describe('browser Back out of a dirty form', () => {
    it('a clean form closes at once', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.click(screen.getByTestId('back'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('a dirty form is held and asks to discard', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.type(title(), 'draft');
      await act(async () => {
        fireEvent.click(screen.getByTestId('back'));
      });
      expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items?q=a');
      expect(screen.getByRole('alertdialog')).toHaveTextContent('Discard changes?');
      expect(title().value).toBe('draft');
    });

    it('Keep editing navigates forward to the dialog entry and keeps the input', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.type(title(), 'draft');
      await act(async () => {
        fireEvent.click(screen.getByTestId('back'));
      });
      await user.click(screen.getByTestId('object-form-discard-cancel'));
      await waitFor(() =>
        expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items/new'),
      );
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(title().value).toBe('draft');
    });

    it('after Keep editing the form is guarded again', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.type(title(), 'draft');
      await act(async () => {
        fireEvent.click(screen.getByTestId('back'));
      });
      await user.click(screen.getByTestId('object-form-discard-cancel'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('back'));
      });
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('Discard closes the form and stays on the background', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.type(title(), 'draft');
      await act(async () => {
        fireEvent.click(screen.getByTestId('back'));
      });
      await user.click(screen.getByTestId('object-form-discard-confirm'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByTestId('path')).toHaveTextContent('/project/work-items?q=a');
    });

    it('a push away from the dialog (not a Back) is not held', async () => {
      const user = userEvent.setup();
      renderAt(withBackground());
      await user.type(title(), 'draft');
      await act(async () => {
        fireEvent.click(screen.getByTestId('push-away'));
      });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });

  describe('focus', () => {
    it('falls back to the New trigger when the opener is gone (createOpener)', async () => {
      const user = userEvent.setup();
      renderAt(
        withBackground('/project/work-items/new', { createOpener: true }),
        1,
        <button type="button" data-create-trigger="" data-testid="trigger">
          New
        </button>,
      );
      await user.click(screen.getByTestId('object-form-cancel'));
      await waitFor(() => expect(screen.getByTestId('trigger')).toHaveFocus());
    });

    it('without createOpener the trigger is not used', async () => {
      const user = userEvent.setup();
      renderAt(
        withBackground(),
        1,
        <button type="button" data-create-trigger="" data-testid="trigger">
          New
        </button>,
      );
      await user.click(screen.getByTestId('object-form-cancel'));
      expect(screen.getByTestId('trigger')).not.toHaveFocus();
    });
  });

  it('keeps one form instance when the same dialog route stays mounted (keyed by route id)', async () => {
    const user = userEvent.setup();
    renderAt(withBackground());
    await user.type(title(), 'kept');
    expect(title().value).toBe('kept');
  });
});
