/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import type { AreaResponse } from '@cornerstone/shared';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormSchema } from '../components/ObjectForm/types.js';
import type * as ProviderTypes from './TagCreateProvider.js';
import type * as HookTypes from './useTagCreate.js';
import type { CreatedTag } from './tagCreateContext.js';

let mockUser: { id: string } | null = { id: 'u1' };
jest.unstable_mockModule('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: mockUser }),
}));

let mockAreasLoading = false;
const mockAreas: AreaResponse[] = [];
jest.unstable_mockModule('../hooks/useAreas.js', () => ({
  useAreas: () => ({ areas: mockAreas, isLoading: mockAreasLoading }),
}));

const mockAreaSubmit = jest.fn<ObjectFormSchema['submit']>();
const mockOrientationSubmit = jest.fn<ObjectFormSchema['submit']>();
const areasSeen: unknown[] = [];
const makeSchema = (
  id: string,
  title: string,
  submit: jest.Mock<ObjectFormSchema['submit']>,
): ObjectFormSchema => ({
  id,
  title,
  initialValues: { name: '' },
  fields: [{ name: 'name', label: 'Name', kind: 'text', essential: true, required: true }],
  validate: (values) => (String(values.name ?? '').trim() ? {} : { name: 'Enter a name.' }),
  submit: (values) => submit(values),
});
jest.unstable_mockModule('./areaForm.js', () => ({
  useAreaFormSchema: (options: { mode: string; areas: unknown }) => {
    areasSeen.push(options);
    return makeSchema('area', 'New area', mockAreaSubmit);
  },
}));
jest.unstable_mockModule('./orientationForm.js', () => ({
  useOrientationFormSchema: () =>
    makeSchema('orientation', 'New orientation', mockOrientationSubmit),
}));

describe('TagCreateProvider', () => {
  let Provider: typeof ProviderTypes.TagCreateProvider;
  let useTagCreate: typeof HookTypes.useTagCreate;
  let media: MatchMediaControl;

  beforeEach(async () => {
    mockUser = { id: 'u1' };
    mockAreasLoading = false;
    areasSeen.length = 0;
    mockAreaSubmit.mockReset();
    mockAreaSubmit.mockResolvedValue({ id: 'a-1', href: '/areas/a-1', label: 'Shed' });
    mockOrientationSubmit.mockReset();
    mockOrientationSubmit.mockResolvedValue({ id: 'o-1', href: '/x', label: 'North' });
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Provider) {
      ({ TagCreateProvider: Provider } = await import('./TagCreateProvider.js'));
      ({ useTagCreate } = await import('./useTagCreate.js'));
    }
  });

  afterEach(() => {
    media.restore();
  });

  let latest: ReturnType<typeof HookTypes.useTagCreate> | null = null;
  function Probe() {
    latest = useTagCreate();
    return (
      <>
        <button type="button" data-testid="opener">
          opener
        </button>
        <output data-testid="creating">{String(latest.isCreating)}</output>
      </>
    );
  }

  function Nav() {
    const navigate = useNavigate();
    const location = useLocation();
    return (
      <>
        <output data-testid="where">{`${location.pathname}${location.search}`}</output>
        <button type="button" data-testid="go-other" onClick={() => void navigate('/other')} />
        <button type="button" data-testid="push-query" onClick={() => void navigate('?x=1')} />
      </>
    );
  }

  function setup() {
    latest = null;
    return render(
      <MemoryRouter initialEntries={['/diary/new']}>
        <Provider>
          <Probe />
          <Nav />
        </Provider>
      </MemoryRouter>,
    );
  }

  function open(kind: 'area' | 'orientation', returnFocus?: HTMLElement | null) {
    let result: Promise<CreatedTag | null> = Promise.resolve(null);
    act(() => {
      result = latest!.request!(kind, returnFocus);
    });
    return { result };
  }

  const nameInput = () => screen.getByLabelText(/^Name/) as HTMLInputElement;

  it('renders no dialog until a chip asks for one', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(latest?.request).toBeDefined();
  });

  it('opens the New area form in place and resolves { id, name } on Save', async () => {
    const user = userEvent.setup();
    setup();
    const { result } = open('area');

    expect(await screen.findByRole('dialog', { name: 'New area' })).toBeInTheDocument();
    expect(screen.getByTestId('tag-create-form')).toBeInTheDocument();
    expect(areasSeen[0]).toMatchObject({ mode: 'new', areas: mockAreas });
    await user.type(nameInput(), 'Shed');
    await user.click(screen.getByTestId('tag-create-form-save'));

    await expect(result).resolves.toEqual({ id: 'a-1', name: 'Shed' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockAreaSubmit).toHaveBeenCalledWith({ name: 'Shed' });
  });

  it('opens the New orientation form and resolves the stored name', async () => {
    const user = userEvent.setup();
    mockOrientationSubmit.mockResolvedValue({ id: 'o-9', href: '/x', label: 'Stored North' });
    setup();
    const { result } = open('orientation');

    expect(await screen.findByRole('dialog', { name: 'New orientation' })).toBeInTheDocument();
    await user.type(nameInput(), 'north');
    await user.click(screen.getByTestId('tag-create-form-save'));

    await expect(result).resolves.toEqual({ id: 'o-9', name: 'Stored North' });
    expect(mockAreaSubmit).not.toHaveBeenCalled();
  });

  it('Cancel resolves null without saving', async () => {
    const user = userEvent.setup();
    setup();
    const { result } = open('area');
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('tag-create-form-cancel'));

    await expect(result).resolves.toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockAreaSubmit).not.toHaveBeenCalled();
  });

  it('Cancel on the orientation form resolves null', async () => {
    const user = userEvent.setup();
    setup();
    const { result } = open('orientation');
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('tag-create-form-cancel'));

    await expect(result).resolves.toBeNull();
  });

  it('waits for the areas to load before showing the New area form', async () => {
    mockAreasLoading = true;
    const view = setup();
    open('area');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    mockAreasLoading = false;
    view.rerender(
      <MemoryRouter initialEntries={['/diary/new']}>
        <Provider>
          <Probe />
          <Nav />
        </Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('dialog', { name: 'New area' })).toBeInTheDocument();
  });

  it('returns focus to the chip that opened the form when Cancel closes it', async () => {
    const user = userEvent.setup();
    setup();
    const opener = screen.getByTestId('opener');
    opener.focus();
    const { result } = open('area', opener);
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('tag-create-form-cancel'));
    await result;

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('answers a second request with null while the first dialog is open', async () => {
    setup();
    open('area');
    await screen.findByRole('dialog');

    const second = open('orientation');

    await expect(second.result).resolves.toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'New area' })).toBeInTheDocument();
  });

  it('accepts a new request after the first one finished', async () => {
    const user = userEvent.setup();
    setup();
    const first = open('area');
    await screen.findByRole('dialog');
    await user.click(screen.getByTestId('tag-create-form-cancel'));
    await first.result;
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    open('orientation');

    expect(await screen.findByRole('dialog', { name: 'New orientation' })).toBeInTheDocument();
  });

  it('isCreating is true while the dialog is open', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByTestId('creating')).toHaveTextContent('false');

    const { result } = open('area');
    await screen.findByRole('dialog');
    expect(screen.getByTestId('creating')).toHaveTextContent('true');

    await user.click(screen.getByTestId('tag-create-form-cancel'));
    await result;
    await waitFor(() => expect(screen.getByTestId('creating')).toHaveTextContent('false'));
  });

  it('renders no dialog without a signed-in user', async () => {
    mockUser = null;
    setup();

    open('area');
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaving the pathname resolves the request with null and unmounts the form', async () => {
    const user = userEvent.setup();
    setup();
    const { result } = open('area');
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('go-other'));

    await expect(result).resolves.toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockAreaSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('creating')).toHaveTextContent('false'));
  });

  it('a query-only change keeps the form open', async () => {
    const user = userEvent.setup();
    setup();
    open('orientation');
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('push-query'));

    expect(screen.getByTestId('where')).toHaveTextContent('/diary/new?x=1');
    expect(screen.getByRole('dialog', { name: 'New orientation' })).toBeInTheDocument();
  });

  it('never navigates on open, save or cancel', async () => {
    const user = userEvent.setup();
    setup();
    const first = open('area');
    await screen.findByRole('dialog');
    await user.type(nameInput(), 'Shed');
    await user.click(screen.getByTestId('tag-create-form-save'));
    await first.result;
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const second = open('orientation');
    await screen.findByRole('dialog');
    await user.click(screen.getByTestId('tag-create-form-cancel'));
    await second.result;

    expect(screen.getByTestId('where')).toHaveTextContent('/diary/new');
  });
});
