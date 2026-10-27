/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { InvoiceCreateContext } from '../../objectForms/invoiceCreateContext.js';
import type {
  InvoiceCreateRequest,
  InvoiceFormKind,
  OpenInvoiceForm,
} from '../../objectForms/invoiceCreateContext.js';
import { ShortcutSnapshot } from '../../test/shortcutSnapshot.js';
import type * as UseInvoiceCreateTypes from './useInvoiceCreate.js';

let useInvoiceCreateHook: typeof UseInvoiceCreateTypes.useInvoiceCreate;
const mockOpen = jest.fn<OpenInvoiceForm>();

function Probe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

/** The smallest host of the hook: a primary button, a kind-specific button and a search box. */
function Host({ defaultKind = 'invoice' }: { defaultKind?: InvoiceFormKind }) {
  const create = useInvoiceCreateHook({ defaultKind });
  return (
    <div>
      <input type="search" aria-label="Search" />
      <button type="button" data-testid="primary" onClick={() => create.open()}>
        New
      </button>
      <button type="button" data-testid="open-offer" onClick={() => create.open('offer')}>
        New offer
      </button>
      <Probe />
    </div>
  );
}

function renderHost({
  entry = '/budget/invoices',
  defaultKind,
  withProvider = true,
  state,
}: {
  entry?: string;
  defaultKind?: InvoiceFormKind;
  withProvider?: boolean;
  state?: unknown;
} = {}) {
  const tree = (
    <MemoryRouter
      initialEntries={[
        {
          pathname: entry.split('?')[0]!,
          search: entry.includes('?') ? `?${entry.split('?')[1]}` : '',
          state,
        },
      ]}
    >
      <Host defaultKind={defaultKind} />
    </MemoryRouter>
  );
  return render(
    withProvider ? <InvoiceCreateContext value={mockOpen}>{tree}</InvoiceCreateContext> : tree,
  );
}

const lastRequest = (): InvoiceCreateRequest => mockOpen.mock.calls.at(-1)![0];

beforeEach(async () => {
  mockOpen.mockReset();
  if (!useInvoiceCreateHook) {
    ({ useInvoiceCreate: useInvoiceCreateHook } = await import('./useInvoiceCreate.js'));
  }
});

describe('useInvoiceCreate', () => {
  describe('the primary action', () => {
    it('opens the New invoice form by default', async () => {
      renderHost();
      await userEvent.click(screen.getByTestId('primary'));
      expect(mockOpen).toHaveBeenCalledTimes(1);
      expect(lastRequest()).toEqual({ kind: 'invoice' });
    });

    it('opens the New offer form when the list shows the Offers chip', async () => {
      renderHost({ defaultKind: 'offer' });
      await userEvent.click(screen.getByTestId('primary'));
      expect(lastRequest()).toEqual({ kind: 'offer' });
    });

    it('follows the chip when it changes after mount', async () => {
      const { rerender } = renderHost({ defaultKind: 'invoice' });
      rerender(
        <InvoiceCreateContext value={mockOpen}>
          <MemoryRouter initialEntries={['/budget/invoices']}>
            <Host defaultKind="offer" />
          </MemoryRouter>
        </InvoiceCreateContext>,
      );
      await userEvent.click(screen.getByTestId('primary'));
      expect(lastRequest().kind).toBe('offer');
    });

    it('an explicit kind wins over the chip', async () => {
      renderHost({ defaultKind: 'invoice' });
      await userEvent.click(screen.getByTestId('open-offer'));
      expect(lastRequest()).toEqual({ kind: 'offer' });
    });

    it('does nothing without a provider (no opener)', async () => {
      renderHost({ withProvider: false });
      await userEvent.click(screen.getByTestId('primary'));
      expect(mockOpen).not.toHaveBeenCalled();
    });
  });

  describe('?create=1', () => {
    it('opens an invoice form and removes the create params from the URL', async () => {
      renderHost({ entry: '/budget/invoices?create=1&q=roof' });

      await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1));
      expect(lastRequest()).toEqual({ kind: 'invoice' });
      await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?q=roof'));
    });

    it('opens an offer form for kind=offer', async () => {
      renderHost({ entry: '/budget/invoices?create=1&kind=offer' });
      await waitFor(() => expect(mockOpen).toHaveBeenCalled());
      expect(lastRequest().kind).toBe('offer');
    });

    it.each(['workitem', '', 'x'])('treats kind=%p as an invoice', async (kind) => {
      renderHost({ entry: `/budget/invoices?create=1&kind=${kind}` });
      await waitFor(() => expect(mockOpen).toHaveBeenCalled());
      expect(lastRequest().kind).toBe('invoice');
    });

    it('carries the company and the document and drops both from the URL', async () => {
      renderHost({ entry: '/budget/invoices?create=1&companyId=v-1&documentId=42' });

      await waitFor(() => expect(mockOpen).toHaveBeenCalled());
      expect(lastRequest()).toEqual({
        kind: 'invoice',
        company: { id: 'v-1' },
        documentId: 42,
      });
      await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/));
    });

    it('carries a company alone and a document alone', async () => {
      renderHost({ entry: '/budget/invoices?create=1&companyId=v-2' });
      await waitFor(() => expect(mockOpen).toHaveBeenCalled());
      expect(lastRequest()).toEqual({ kind: 'invoice', company: { id: 'v-2' } });
    });

    it('carries a document alone', async () => {
      renderHost({ entry: '/budget/invoices?create=1&documentId=9' });
      await waitFor(() => expect(mockOpen).toHaveBeenCalled());
      expect(lastRequest()).toEqual({ kind: 'invoice', documentId: 9 });
    });

    it.each([
      ['an invalid company id', 'companyId=bad/id', { kind: 'invoice' }],
      ['a zero document id', 'documentId=0', { kind: 'invoice' }],
      ['a non-numeric document id', 'documentId=abc', { kind: 'invoice' }],
    ])('ignores %s', async (_name, query, expected) => {
      renderHost({ entry: `/budget/invoices?create=1&${query}` });
      await waitFor(() => expect(mockOpen).toHaveBeenCalled());
      expect(lastRequest()).toEqual(expected);
    });

    it('without a provider it only clears the URL', async () => {
      renderHost({ entry: '/budget/invoices?create=1&q=roof', withProvider: false });
      await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?q=roof'));
      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('does not open for a URL without create=1', async () => {
      renderHost({ entry: '/budget/invoices?companyId=v-1' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('hands the New menu trigger over as the focus target when opened from the menu', async () => {
      const trigger = document.createElement('button');
      trigger.setAttribute('data-create-trigger', '');
      document.body.appendChild(trigger);
      renderHost({ entry: '/budget/invoices?create=1', state: { createOpener: true } });

      await waitFor(() => expect(mockOpen).toHaveBeenCalled());
      expect(lastRequest().returnFocusRef?.current).toBe(trigger);
      trigger.remove();
    });

    it('passes no focus target when the URL was typed or followed (no menu opener)', async () => {
      renderHost({ entry: '/budget/invoices?create=1' });
      await waitFor(() => expect(mockOpen).toHaveBeenCalled());
      expect(lastRequest()).not.toHaveProperty('returnFocusRef');
    });

    it('opens once per occurrence: a later ?create=1 opens it again', async () => {
      function ReAdd() {
        const [, setSearchParams] = useSearchParams();
        return (
          <button
            type="button"
            data-testid="re-add"
            onClick={() => setSearchParams({ create: '1' })}
          >
            re-add
          </button>
        );
      }
      render(
        <InvoiceCreateContext value={mockOpen}>
          <MemoryRouter initialEntries={['/budget/invoices?create=1']}>
            <Host />
            <ReAdd />
          </MemoryRouter>
        </InvoiceCreateContext>,
      );
      await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/));

      await userEvent.click(screen.getByTestId('re-add'));

      await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(2));
    });
  });

  describe('n shortcut', () => {
    it('opens the form like the primary button', async () => {
      renderHost({ defaultKind: 'offer' });
      fireEvent.keyDown(document, { key: 'n' });
      expect(mockOpen).toHaveBeenCalledTimes(1);
      expect(lastRequest()).toEqual({ kind: 'offer' });
    });

    it('ignores n typed into the search field', () => {
      renderHost();
      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'n' });
      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('registers n as "New invoice" in the shortcut registry', () => {
      render(
        <ShortcutRegistryProvider>
          <InvoiceCreateContext value={mockOpen}>
            <MemoryRouter initialEntries={['/budget/invoices']}>
              <Host />
              <ShortcutSnapshot />
            </MemoryRouter>
          </InvoiceCreateContext>
        </ShortcutRegistryProvider>,
      );
      fireEvent.click(screen.getByTestId('shortcut-snapshot'));
      expect(screen.getByTestId('shortcut-snapshot-out').textContent).toContain('n:New invoice');
    });
  });
});
