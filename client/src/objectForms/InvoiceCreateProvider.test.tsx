/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { installMatchMedia } from '../test/matchMediaControl.js';
import type { MatchMediaControl } from '../test/matchMediaControl.js';
import type { ObjectFormSchema } from '../components/ObjectForm/types.js';
import type * as ProviderTypes from './InvoiceCreateProvider.js';
import type * as HookTypes from './useOpenInvoiceForm.js';
import type { InvoiceCreateRequest } from './invoiceCreateContext.js';

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
const seenRequests: InvoiceCreateRequest[] = [];
jest.unstable_mockModule('./invoiceForm.js', () => ({
  invoiceFormPrefill: (request: InvoiceCreateRequest) =>
    request.company ? { name: request.company.id } : {},
  useInvoiceFormSchema: (options: { request: InvoiceCreateRequest }): ObjectFormSchema => {
    seenRequests.push(options.request);
    return {
      id: options.request.kind,
      title: options.request.kind === 'offer' ? 'New offer' : 'New invoice',
      initialValues: { name: '' },
      fields: [{ name: 'name', label: 'Name', kind: 'text', essential: true }],
      validate: () => ({}),
      submit: (values) => mockSubmit(values),
    };
  },
}));

describe('InvoiceCreateProvider', () => {
  let Provider: typeof ProviderTypes.InvoiceCreateProvider;
  let useOpenInvoiceForm: typeof HookTypes.useOpenInvoiceForm;
  let media: MatchMediaControl;

  beforeEach(async () => {
    mockUser = { id: 'u1' };
    mockSubmit.mockReset();
    mockSubmit.mockResolvedValue({ id: 'inv-9', href: '/budget/invoices/inv-9', label: 'Invoice' });
    mockFocusHeading.mockClear();
    seenRequests.length = 0;
    media = installMatchMedia({ '(min-width: 768px)': true });
    if (!Provider) {
      ({ InvoiceCreateProvider: Provider } = await import('./InvoiceCreateProvider.js'));
      ({ useOpenInvoiceForm } = await import('./useOpenInvoiceForm.js'));
    }
  });

  afterEach(() => {
    media.restore();
  });

  let open: ReturnType<typeof HookTypes.useOpenInvoiceForm> = null;
  function Probe() {
    open = useOpenInvoiceForm();
    const location = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <output data-testid="where">{`${location.pathname}${location.search}`}</output>
        <output data-testid="state">{JSON.stringify(location.state)}</output>
        <button type="button" data-testid="go-other" onClick={() => void navigate('/other')} />
        <button type="button" data-testid="same-path" onClick={() => void navigate('/money?x=1')} />
      </>
    );
  }

  function setup(entry = '/money') {
    open = null;
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Provider>
          <Probe />
        </Provider>
      </MemoryRouter>,
    );
  }

  const request = (over: Partial<InvoiceCreateRequest> = {}): InvoiceCreateRequest => ({
    kind: 'invoice',
    ...over,
  });
  const openForm = (req = request()) => act(() => open!(req));
  const save = () => screen.getByTestId('invoice-form-save');

  it('renders nothing until a page asks for the form, and offers the opener', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(open).toEqual(expect.any(Function));
  });

  it('gives no opener outside the provider', () => {
    open = jest.fn() as never;
    function Bare() {
      open = useOpenInvoiceForm();
      return null;
    }
    render(<Bare />);
    expect(open).toBeNull();
  });

  it('opens the New invoice form in place, over the page it was opened on', async () => {
    setup('/money?tab=open');

    openForm();

    expect(await screen.findByRole('dialog', { name: 'New invoice' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/money?tab=open');
  });

  it('opens the New offer form for the offer kind and seeds the form from the request', async () => {
    setup();

    openForm(request({ kind: 'offer', company: { id: 'v-1' } }));

    expect(await screen.findByRole('dialog', { name: 'New offer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('v-1');
  });

  it('ignores a second open while the form is up and keeps the first request', async () => {
    setup();
    openForm(request({ kind: 'invoice', company: { id: 'first' } }));
    await screen.findByRole('dialog');

    openForm(request({ kind: 'offer', company: { id: 'second' } }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'New invoice' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('first');
  });

  it('accepts a new request once the form was closed', async () => {
    const user = userEvent.setup();
    setup();
    openForm();
    await screen.findByRole('dialog');
    await user.click(screen.getByTestId('invoice-form-cancel'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    openForm(request({ kind: 'offer' }));

    expect(await screen.findByRole('dialog', { name: 'New offer' })).toBeInTheDocument();
  });

  it('Cancel closes without saving or navigating', async () => {
    const user = userEvent.setup();
    setup('/money');
    openForm();
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('invoice-form-cancel'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/money');
    expect(mockFocusHeading).not.toHaveBeenCalled();
  });

  it('Save closes the form, goes to the new invoice with the page behind as origin, and focuses its heading', async () => {
    const user = userEvent.setup();
    setup('/money?tab=open');
    openForm();
    await screen.findByRole('dialog');

    await user.click(save());

    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/budget/invoices/inv-9'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(screen.getByTestId('state').textContent!)).toEqual({
      origin: { to: '/money?tab=open' },
    });
    expect(mockFocusHeading).toHaveBeenCalledTimes(1);
  });

  it('Save uses the opener-supplied origin state over the page behind', async () => {
    const user = userEvent.setup();
    setup('/money');
    openForm(request({ originState: { origin: { to: '/companies/c-1', name: 'Acme' } } }));
    await screen.findByRole('dialog');

    await user.click(save());

    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/budget/invoices/inv-9'),
    );
    expect(JSON.parse(screen.getByTestId('state').textContent!)).toEqual({
      origin: { to: '/companies/c-1', name: 'Acme' },
    });
  });

  it('passes the request through to the form schema, including the focus-return ref', async () => {
    setup();
    const returnFocusRef = createRef<HTMLElement>();
    const req = request({ company: { id: 'v-1', name: 'Acme' }, returnFocusRef });

    openForm(req);
    await screen.findByRole('dialog');

    expect(seenRequests[0]).toBe(req);
    expect(seenRequests[0]!.returnFocusRef).toBe(returnFocusRef);
  });

  it('returns focus to the opener element when the form is cancelled', async () => {
    const user = userEvent.setup();
    setup();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    openForm(request({ returnFocusRef: { current: trigger } }));
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('invoice-form-cancel'));

    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  it('closes when the page changes (a link or Back)', async () => {
    const user = userEvent.setup();
    setup('/money');
    openForm();
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('go-other'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('stays open when only the query of the same page changes', async () => {
    const user = userEvent.setup();
    setup('/money');
    openForm();
    await screen.findByRole('dialog');

    await user.click(screen.getByTestId('same-path'));

    expect(screen.getByRole('dialog', { name: 'New invoice' })).toBeInTheDocument();
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
});
