/**
 * @jest-environment jsdom
 */
/**
 * FinancingCreateProvider + useOpenFinancingForm (#2242, D18): the in-place New funding source /
 * New grant dialogs.
 *
 * Mutations these tests catch: the wrong form for a kind; a second open replacing the first;
 * the dialog staying open after Back/another page; Save not navigating to the new object with
 * the page behind as origin; no heading focus after Save; a dialog for a signed-out user.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormSchema } from '../components/ObjectForm/types.js';
import type * as ProviderTypes from './FinancingCreateProvider.js';
import type * as HookTypes from './useOpenFinancingForm.js';
import { FINANCING_FORM_KINDS, FinancingCreateContext } from './financingCreateContext.js';
import type { FinancingCreateRequest, OpenFinancingForm } from './financingCreateContext.js';

let mockUser: { id: string } | null = { id: 'u1' };
jest.unstable_mockModule('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockFocusHeading = jest.fn<() => () => void>(() => () => {});
jest.unstable_mockModule('../lib/focusPageHeading.js', () => ({
  focusPageHeading: jest.fn(),
  focusPageHeadingWhenReady: mockFocusHeading,
}));

const mockSubmit = jest.fn<ObjectFormSchema['submit']>();
function fakeSchema(id: string, title: string): ObjectFormSchema {
  return {
    id,
    title,
    initialValues: { name: '' },
    fields: [{ name: 'name', label: 'Name', kind: 'text', essential: true }],
    validate: () => ({}),
    submit: (values) => mockSubmit(values),
  };
}
jest.unstable_mockModule('./fundingSourceForm.js', () => ({
  useFundingSourceFormSchema: () => fakeSchema('funding-source', 'New funding source'),
}));
jest.unstable_mockModule('./grantForm.js', () => ({
  useGrantFormSchema: () => fakeSchema('grant', 'New grant'),
}));

describe('FinancingCreateProvider', () => {
  let Provider: typeof ProviderTypes.FinancingCreateProvider;
  let useOpenFinancingForm: typeof HookTypes.useOpenFinancingForm;
  let media: MatchMediaControl;

  beforeEach(async () => {
    mockUser = { id: 'u1' };
    mockSubmit.mockReset();
    mockSubmit.mockResolvedValue({
      id: 'bs-9',
      href: '/budget/financing/sources/bs-9',
      label: 'Loan',
    });
    mockFocusHeading.mockClear();
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Provider) {
      ({ FinancingCreateProvider: Provider } = await import('./FinancingCreateProvider.js'));
      ({ useOpenFinancingForm } = await import('./useOpenFinancingForm.js'));
    }
  });

  afterEach(() => {
    media.restore();
  });

  let open: ReturnType<typeof HookTypes.useOpenFinancingForm> = null;
  function Probe() {
    open = useOpenFinancingForm();
    const location = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <output data-testid="where">{`${location.pathname}${location.search}`}</output>
        <output data-testid="state">{JSON.stringify(location.state)}</output>
        <button type="button" data-testid="go-other" onClick={() => void navigate('/other')} />
        <button type="button" data-testid="same-path" onClick={() => void navigate('/x?y=1')} />
      </>
    );
  }

  function setup(entry = '/budget/financing') {
    open = null;
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Provider>
          <Probe />
        </Provider>
      </MemoryRouter>,
    );
  }

  const request = (over: Partial<FinancingCreateRequest> = {}): FinancingCreateRequest => ({
    kind: 'source',
    ...over,
  });
  const openForm = (req = request()) => act(() => open!(req));

  it('renders nothing until a page asks, and offers the opener', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(open).toEqual(expect.any(Function));
  });

  it.each([
    ['source', 'New funding source', 'source-form'],
    ['grant', 'New grant', 'grant-form'],
  ] as const)(
    'opens the %s form in place with the matching test id',
    async (kind, title, testId) => {
      setup('/budget/financing?tab=x');

      openForm(request({ kind }));

      expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent('/budget/financing?tab=x');
    },
  );

  it('ignores a second open while a form is up', async () => {
    setup();
    openForm(request({ kind: 'source' }));
    await screen.findByRole('dialog');

    openForm(request({ kind: 'grant' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'New funding source' })).toBeInTheDocument();
  });

  it('accepts a new request after Cancel, without saving or navigating', async () => {
    const user = userEvent.setup();
    setup();
    openForm();
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('source-form-cancel'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockFocusHeading).not.toHaveBeenCalled();
    openForm(request({ kind: 'grant' }));
    expect(await screen.findByRole('dialog', { name: 'New grant' })).toBeInTheDocument();
  });

  it('Save closes the form, goes to the new object with the page behind as origin and focuses its heading', async () => {
    const user = userEvent.setup();
    setup('/budget/financing');
    openForm();
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('source-form-save'));

    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/budget/financing/sources/bs-9'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(screen.getByTestId('state').textContent!)).toEqual({
      origin: { to: '/budget/financing' },
    });
    expect(mockFocusHeading).toHaveBeenCalledTimes(1);
  });

  it('Save uses the opener-supplied origin state', async () => {
    const user = userEvent.setup();
    setup('/budget/financing');
    openForm(request({ originState: { origin: { to: '/home', name: 'Home' } } }));
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('source-form-save'));

    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/budget/financing/sources/bs-9'),
    );
    expect(JSON.parse(screen.getByTestId('state').textContent!)).toEqual({
      origin: { to: '/home', name: 'Home' },
    });
  });

  it('returns focus to the opener when the form is cancelled', async () => {
    const user = userEvent.setup();
    setup();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    openForm(request({ returnFocusRef: { current: trigger } }));
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('source-form-cancel'));

    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  it('closes when the page changes, and stays open when only the query changes', async () => {
    const user = userEvent.setup();
    setup('/x');
    openForm();
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('same-path'));
    expect(screen.getByRole('dialog', { name: 'New funding source' })).toBeInTheDocument();

    await user.click(screen.getByTestId('go-other'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('renders no form without a signed-in user', async () => {
    mockUser = null;
    setup();

    openForm();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('accepts a returnFocusRef in the request type', () => {
    const ref = createRef<HTMLElement>();
    expect(request({ returnFocusRef: ref }).returnFocusRef).toBe(ref);
  });
});

describe('useOpenFinancingForm', () => {
  let useOpen: typeof HookTypes.useOpenFinancingForm;

  beforeEach(async () => {
    ({ useOpenFinancingForm: useOpen } = await import('./useOpenFinancingForm.js'));
  });

  it('is null outside a FinancingCreateProvider', () => {
    const { result } = renderHook(() => useOpen());
    expect(result.current).toBeNull();
  });

  it('returns the function the provider supplies', () => {
    const openSpy = jest.fn<OpenFinancingForm>();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FinancingCreateContext value={openSpy}>{children}</FinancingCreateContext>
    );
    const { result } = renderHook(() => useOpen(), { wrapper });

    expect(result.current).toBe(openSpy);
    result.current!({ kind: 'grant' });
    expect(openSpy).toHaveBeenCalledWith({ kind: 'grant' });
  });

  it('lists the source and the grant kind, in that order', () => {
    expect([...FINANCING_FORM_KINDS]).toEqual(['source', 'grant']);
  });
});
