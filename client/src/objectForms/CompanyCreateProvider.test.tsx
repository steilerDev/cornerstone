/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormSchema } from '../components/ObjectForm/types.js';
import type * as ProviderTypes from './CompanyCreateProvider.js';
import type * as HookTypes from './useCompanyCreateAction.js';
import type { CompanyOption } from './companyForm.js';

let mockUser: { id: string } | null = { id: 'u1' };
jest.unstable_mockModule('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const mockSubmit = jest.fn<ObjectFormSchema['submit']>();
const schema: ObjectFormSchema = {
  id: 'company',
  title: 'New company',
  initialValues: { name: '' },
  fields: [{ name: 'name', label: 'Name', kind: 'text', essential: true, required: true }],
  validate: (values) => (String(values.name ?? '').trim() ? {} : { name: 'Enter a name.' }),
  submit: (values) => mockSubmit(values),
};
jest.unstable_mockModule('./companyForm.js', () => ({ useCompanyFormSchema: () => schema }));

describe('CompanyCreateProvider', () => {
  let Provider: typeof ProviderTypes.CompanyCreateProvider;
  let useCompanyCreateAction: typeof HookTypes.useCompanyCreateAction;
  let media: MatchMediaControl;

  beforeEach(async () => {
    mockUser = { id: 'u1' };
    mockSubmit.mockReset();
    mockSubmit.mockResolvedValue({ id: 'c-1', href: '/companies/c-1', label: 'Brand New Co' });
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Provider) {
      ({ CompanyCreateProvider: Provider } = await import('./CompanyCreateProvider.js'));
      ({ useCompanyCreateAction } = await import('./useCompanyCreateAction.js'));
    }
  });

  afterEach(() => {
    media.restore();
  });

  let latest: ReturnType<typeof HookTypes.useCompanyCreateAction> | null = null;
  function Probe() {
    latest = useCompanyCreateAction();
    return <output data-testid="creating">{String(latest.isCreating)}</output>;
  }

  function setup() {
    latest = null;
    return render(
      <MemoryRouter>
        <Provider>
          <Probe />
        </Provider>
      </MemoryRouter>,
    );
  }

  /** Opens a request and keeps its promise for later assertions. */
  function open(name: string): { result: Promise<CompanyOption | null> } {
    let result: Promise<CompanyOption | null> = Promise.resolve(null);
    act(() => {
      result = latest!.createAction!.onCreate(name);
    });
    return { result };
  }

  const nameInput = () => screen.getByLabelText(/^Name/) as HTMLInputElement;

  it('renders no dialog until a picker asks for one', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(latest?.createAction).toBeDefined();
  });

  it('renders the New company form over the page with the typed name pre-filled', async () => {
    setup();

    open('Brand New Co');

    expect(await screen.findByRole('dialog', { name: 'New company' })).toBeInTheDocument();
    expect(nameInput()).toHaveValue('Brand New Co');
  });

  it('Save resolves the created company {id, name} and closes the dialog', async () => {
    const user = userEvent.setup();
    setup();
    const { result } = open('Brand New Co');
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('company-create-form-save'));

    await expect(result).resolves.toEqual({ id: 'c-1', name: 'Brand New Co' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockSubmit).toHaveBeenCalledWith({ name: 'Brand New Co' });
  });

  it('resolves the name the server stored, not the typed one', async () => {
    const user = userEvent.setup();
    mockSubmit.mockResolvedValue({ id: 'c-9', href: '/companies/c-9', label: 'Stored Name' });
    setup();
    const { result } = open('typed name');
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('company-create-form-save'));

    await expect(result).resolves.toEqual({ id: 'c-9', name: 'Stored Name' });
  });

  it('Cancel resolves null and closes the dialog without saving', async () => {
    const user = userEvent.setup();
    setup();
    const { result } = open('Brand New Co');
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('company-create-form-cancel'));

    await expect(result).resolves.toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('Escape on a clean form also resolves null', async () => {
    const user = userEvent.setup();
    setup();
    const { result } = open('Brand New Co');
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await expect(result).resolves.toBeNull();
  });

  it('answers a second request with null while the first dialog is open, and keeps the first', async () => {
    setup();
    open('First Co');
    await screen.findByRole('dialog');

    const second = open('Second Co');

    await expect(second.result).resolves.toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(nameInput()).toHaveValue('First Co');
  });

  it('accepts a new request after the first one finished', async () => {
    const user = userEvent.setup();
    setup();
    const first = open('First Co');
    await screen.findByRole('dialog');
    await user.click(screen.getByTestId('company-create-form-cancel'));
    await first.result;
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    open('Second Co');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(nameInput()).toHaveValue('Second Co');
  });

  it('isCreating is true while the dialog is open and false once it closes', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByTestId('creating')).toHaveTextContent('false');

    const { result } = open('Brand New Co');
    await screen.findByRole('dialog');
    expect(screen.getByTestId('creating')).toHaveTextContent('true');

    await user.click(screen.getByTestId('company-create-form-cancel'));
    await result;
    await waitFor(() => expect(screen.getByTestId('creating')).toHaveTextContent('false'));
  });

  it('renders no dialog without a signed-in user', async () => {
    mockUser = null;
    setup();

    open('Brand New Co');
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never navigates: the router location is unchanged by open, save and cancel', async () => {
    const user = userEvent.setup();
    function Location() {
      const location = useLocation();
      return <output data-testid="loc">{`${location.pathname}${location.search}`}</output>;
    }
    latest = null;
    render(
      <MemoryRouter initialEntries={['/diary/new?date=2026-03-01']}>
        <Provider>
          <Probe />
          <Location />
        </Provider>
      </MemoryRouter>,
    );

    const first = open('Brand New Co');
    await screen.findByRole('dialog');
    expect(screen.getByTestId('loc')).toHaveTextContent('/diary/new?date=2026-03-01');
    await user.click(screen.getByTestId('company-create-form-save'));
    await first.result;
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const second = open('Other Co');
    await screen.findByRole('dialog');
    await user.click(screen.getByTestId('company-create-form-cancel'));
    await second.result;

    expect(screen.getByTestId('loc')).toHaveTextContent('/diary/new?date=2026-03-01');
  });

  describe('leaving the page while the form is open (#2213)', () => {
    function Nav() {
      const navigate = useNavigate();
      const location = useLocation();
      return (
        <>
          <output data-testid="where">{`${location.pathname}${location.search}`}</output>
          <button type="button" data-testid="go-other" onClick={() => void navigate('/other')} />
          <button
            type="button"
            data-testid="go-origin"
            onClick={() => void navigate('/diary/new')}
          />
          <button
            type="button"
            data-testid="replace-query"
            onClick={() => void navigate('/diary/new?date=2026-03-01', { replace: true })}
          />
          <button type="button" data-testid="push-query" onClick={() => void navigate('?x=1')} />
        </>
      );
    }

    function setupNav() {
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

    it('a pathname change resolves the request to null and unmounts the form', async () => {
      const user = userEvent.setup();
      setupNav();
      const { result } = open('Brand New Co');
      await screen.findByRole('dialog');

      await user.click(screen.getByTestId('go-other'));

      await expect(result).resolves.toBeNull();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(mockSubmit).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByTestId('creating')).toHaveTextContent('false'));
    });

    it('a query-only replace on the same pathname keeps the form open', async () => {
      const user = userEvent.setup();
      setupNav();
      open('Brand New Co');
      await screen.findByRole('dialog');

      await user.click(screen.getByTestId('replace-query'));

      expect(screen.getByTestId('where')).toHaveTextContent('/diary/new?date=2026-03-01');
      expect(screen.getByRole('dialog', { name: 'New company' })).toBeInTheDocument();
      expect(nameInput()).toHaveValue('Brand New Co');
    });

    it('a query-only push on the same pathname keeps the form open too', async () => {
      const user = userEvent.setup();
      setupNav();
      open('Brand New Co');
      await screen.findByRole('dialog');

      await user.click(screen.getByTestId('push-query'));

      expect(screen.getByRole('dialog', { name: 'New company' })).toBeInTheDocument();
    });

    it('a pathname change with no request open does nothing and a later request still works', async () => {
      const user = userEvent.setup();
      setupNav();

      await user.click(screen.getByTestId('go-other'));
      open('Later Co');

      expect(await screen.findByRole('dialog', { name: 'New company' })).toBeInTheDocument();
      expect(nameInput()).toHaveValue('Later Co');
    });

    it('returning to the original page does not bring the cancelled form back or settle it twice', async () => {
      const user = userEvent.setup();
      setupNav();
      let resolutions = 0;
      const { result } = open('Brand New Co');
      void result.then(() => {
        resolutions += 1;
      });
      await screen.findByRole('dialog');

      await user.click(screen.getByTestId('go-other'));
      await expect(result).resolves.toBeNull();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await user.click(screen.getByTestId('go-origin'));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByTestId('where')).toHaveTextContent('/diary/new');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(resolutions).toBe(1);
      expect(mockSubmit).not.toHaveBeenCalled();
      expect(screen.getByTestId('creating')).toHaveTextContent('false');
    });

    it('after the page change the form can be opened again on the new page', async () => {
      const user = userEvent.setup();
      setupNav();
      const first = open('First Co');
      await screen.findByRole('dialog');
      await user.click(screen.getByTestId('go-other'));
      await first.result;
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      open('Second Co');

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(nameInput()).toHaveValue('Second Co');
    });
  });
});
