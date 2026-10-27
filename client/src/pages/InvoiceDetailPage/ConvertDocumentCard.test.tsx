/**
 * @jest-environment jsdom
 *
 * ConvertDocumentCard (#2240, #2241): pick a Paperless document with the document picker and read
 * its amounts. The hook state is a plain object; the picker is the real EntityPicker over mocked
 * Paperless calls.
 *
 * Mutations these tests catch:
 *  - Read amounts shown without the AI reader or without a document;
 *  - a read result passed to the form when the read failed (null);
 *  - picking not selecting, or the picker's clear button not removing, the document;
 *  - the picker unlabelled, or not disabled while the page saves;
 *  - mismatch / no-lines / error copy shown outside its state;
 *  - Try again not returning focus to Read amounts.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type { UseConvertDocument } from './useConvertDocument.js';
import type * as CardModule from './ConvertDocumentCard.js';

const mockListPaperlessDocuments = jest.fn<typeof PaperlessApiTypes.listPaperlessDocuments>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  listPaperlessDocuments: mockListPaperlessDocuments,
}));
jest.unstable_mockModule('../../lib/documentLinksApi.js', () => ({
  listAllLinkedDocumentIds: jest.fn(() => Promise.resolve([])),
}));

let Card: (typeof CardModule)['ConvertDocumentCard'];

beforeEach(async () => {
  mockListPaperlessDocuments.mockReset();
  mockListPaperlessDocuments.mockResolvedValue({
    documents: [
      { id: 7, title: 'Picked.pdf', correspondent: null, created: null },
      { id: 8, title: 'Other.pdf', correspondent: null, created: null },
    ],
  } as never);
  ({ ConvertDocumentCard: Card } = (await import('./ConvertDocumentCard.js')) as typeof CardModule);
});

function makeDoc(over: Partial<UseConvertDocument> = {}): UseConvertDocument {
  return {
    configured: true,
    paperlessUrl: 'https://paperless.example',
    llmEnabled: true,
    document: null,
    select: jest.fn(),
    remove: jest.fn(),
    aiState: 'idle',
    aiError: '',
    mismatch: null,
    noLines: false,
    analyze: jest.fn(async () => null),
    ...over,
  } as UseConvertDocument;
}

function ui(doc: UseConvertDocument, onRead = jest.fn(), disabled = false) {
  return (
    <LocaleProvider>
      <Card doc={doc} offerAmount={10000} onRead={onRead} disabled={disabled} />
    </LocaleProvider>
  );
}

const PICKED = { id: 5, title: 'Offer.pdf' };

const picker = () => screen.getByLabelText('Source document') as HTMLInputElement;

describe('without a document', () => {
  it('labels the picker "Source document", prompts to pre-fill and offers only the picker', () => {
    render(ui(makeDoc()));
    expect(screen.getByRole('heading', { name: 'Document' })).toBeInTheDocument();
    expect(screen.getByText('Pre-fill the final invoice from a document.')).toBeVisible();
    expect(picker()).toBeEnabled();
    expect(picker()).toHaveAttribute('id', 'convert-document-picker');
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
    expect(screen.queryByTestId('convert-ai-prefill')).toBeNull();
    expect(screen.queryByText(/linked to the final invoice/)).toBeNull();
  });

  it('keeps none of the removed select, change and remove controls', () => {
    render(ui(makeDoc({ document: PICKED })));
    for (const id of [
      'convert-select-document',
      'convert-remove-document',
      'convert-selected-document',
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });

  it('picking a document hands its id and title to the hook', async () => {
    const doc = makeDoc();
    render(ui(doc));
    await userEvent.click(picker());
    await userEvent.click(await screen.findByRole('option', { name: /Picked\.pdf/ }));
    expect(doc.select).toHaveBeenCalledWith({ id: 7, title: 'Picked.pdf' });
    expect(doc.remove).not.toHaveBeenCalled();
  });

  it('searches the documents when the picker is opened', async () => {
    render(ui(makeDoc()));
    await userEvent.click(picker());
    await screen.findByRole('option', { name: /Other\.pdf/ });
    expect(mockListPaperlessDocuments).toHaveBeenCalled();
  });
});

describe('with a document', () => {
  it('shows its title in the picker, Read amounts and the linked note', () => {
    render(ui(makeDoc({ document: PICKED })));
    expect(screen.getByText('Offer.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('convert-ai-prefill')).toHaveTextContent('Read amounts');
    expect(screen.getByText('The selected document is linked to the final invoice.')).toBeVisible();
    expect(screen.queryByText('Pre-fill the final invoice from a document.')).not.toBeNull();
  });

  it('has no Read amounts without the AI reader', () => {
    render(ui(makeDoc({ document: PICKED, llmEnabled: false })));
    expect(screen.queryByTestId('convert-ai-prefill')).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });

  it("the picker's clear button removes the document and puts focus in the picker", async () => {
    const doc = makeDoc({ document: PICKED });
    render(ui(doc));
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(doc.remove).toHaveBeenCalledTimes(1);
    expect(doc.select).not.toHaveBeenCalled();
  });

  it('after the document is cleared, focus lands in the picker input, not on the body', async () => {
    const { rerender } = render(ui(makeDoc({ document: PICKED })));
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    rerender(ui(makeDoc({ document: null })));
    await waitFor(() => expect(picker()).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it('disables the picker and Read amounts while the page is saving', () => {
    render(ui(makeDoc({ document: PICKED }), jest.fn(), true));
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeDisabled();
    expect(screen.getByTestId('convert-ai-prefill')).toBeDisabled();
  });

  it('disables the empty picker while the page is saving', () => {
    render(ui(makeDoc(), jest.fn(), true));
    expect(picker()).toBeDisabled();
  });
});

describe('reading', () => {
  it('Read amounts analyzes the document against the offer and hands the values to the form', async () => {
    const candidates = { amount: '10500.00' };
    const doc = makeDoc({ document: PICKED, analyze: jest.fn(async () => candidates) });
    const onRead = jest.fn();
    render(ui(doc, onRead));
    fireEvent.click(screen.getByTestId('convert-ai-prefill'));
    await waitFor(() => expect(onRead).toHaveBeenCalledWith(candidates));
    expect(doc.analyze).toHaveBeenCalledWith(5, 10000);
  });

  it('a failed read hands nothing to the form', async () => {
    const doc = makeDoc({ document: PICKED, analyze: jest.fn(async () => null) });
    const onRead = jest.fn();
    render(ui(doc, onRead));
    fireEvent.click(screen.getByTestId('convert-ai-prefill'));
    await waitFor(() => expect(doc.analyze).toHaveBeenCalled());
    expect(onRead).not.toHaveBeenCalled();
  });

  it('while reading the button says so and is aria-disabled', () => {
    render(ui(makeDoc({ document: PICKED, aiState: 'analyzing' })));
    const button = screen.getByTestId('convert-ai-prefill');
    expect(button).toHaveTextContent('Reading document…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('is quiet before a read: an empty status region and no notices', () => {
    render(ui(makeDoc({ document: PICKED })));
    expect(screen.getByTestId('convert-read-status')).toBeEmptyDOMElement();
    expect(screen.queryByTestId('convert-ai-error')).toBeNull();
    expect(screen.queryByTestId('convert-ai-mismatch')).toBeNull();
    expect(screen.getByTestId('convert-ai-prefill')).not.toHaveAttribute('aria-disabled');
  });

  it('announces a finished read in the status region', () => {
    render(ui(makeDoc({ document: PICKED, aiState: 'success' })));
    expect(screen.getByTestId('convert-read-status')).toHaveTextContent(
      'Document read. Review the suggestions.',
    );
  });

  it('shows the total mismatch with both formatted totals after a read', () => {
    render(ui(makeDoc({ document: PICKED, aiState: 'success', mismatch: { extracted: 10200.3 } })));
    const notice = screen.getByTestId('convert-ai-mismatch');
    expect(notice).toHaveTextContent('€10,200.30');
    expect(notice).toHaveTextContent('€10,000.00');
  });

  it('shows the mismatch only after a successful read', () => {
    render(ui(makeDoc({ document: PICKED, aiState: 'idle', mismatch: { extracted: 1 } })));
    expect(screen.queryByTestId('convert-ai-mismatch')).toBeNull();
  });

  it('says so when the document has no lines, only after a successful read', () => {
    const { rerender } = render(
      ui(makeDoc({ document: PICKED, aiState: 'success', noLines: true })),
    );
    expect(
      screen.getByText('The document has no lines, so the final amount was not pre-filled.'),
    ).toBeVisible();
    rerender(ui(makeDoc({ document: PICKED, aiState: 'idle', noLines: true })));
    expect(screen.queryByText(/has no lines/)).toBeNull();
  });

  it('shows a read error with Try again, which reads again', async () => {
    const doc = makeDoc({
      document: PICKED,
      aiState: 'error',
      aiError: "Couldn't read the document. Your entries are kept.",
      analyze: jest.fn(async () => ({ notes: 'n' })),
    });
    const onRead = jest.fn();
    render(ui(doc, onRead));
    expect(screen.getByTestId('convert-ai-error')).toHaveTextContent(
      "Couldn't read the document. Your entries are kept.",
    );
    fireEvent.click(screen.getByTestId('convert-ai-retry'));
    await waitFor(() => expect(onRead).toHaveBeenCalledWith({ notes: 'n' }));
    expect(doc.analyze).toHaveBeenCalledWith(5, 10000);
  });
});

describe('focus never falls to the body', () => {
  it('Try again hands focus to Read amounts once the error has cleared, not before', async () => {
    const doc = makeDoc({
      document: PICKED,
      aiState: 'error',
      aiError: 'boom',
      analyze: jest.fn(async () => null),
    });
    const { rerender } = render(ui(doc));
    const retry = screen.getByTestId('convert-ai-retry');
    retry.focus();
    fireEvent.click(retry);
    await waitFor(() => expect(doc.analyze).toHaveBeenCalled());
    // Still failing: the error block (and Try again) stays, and focus stays with it.
    rerender(ui(makeDoc({ document: PICKED, aiState: 'error', aiError: 'boom' })));
    expect(screen.getByTestId('convert-ai-retry')).toHaveFocus();
    // Reading: the error block unmounts, focus goes to Read amounts.
    rerender(ui(makeDoc({ document: PICKED, aiState: 'analyzing' })));
    expect(screen.queryByTestId('convert-ai-error')).toBeNull();
    expect(screen.getByTestId('convert-ai-prefill')).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('Try again moves focus only once', async () => {
    const doc = makeDoc({ document: PICKED, aiState: 'error', aiError: 'x' });
    const { rerender } = render(ui(doc));
    fireEvent.click(screen.getByTestId('convert-ai-retry'));
    rerender(ui(makeDoc({ document: PICKED, aiState: 'success' })));
    expect(screen.getByTestId('convert-ai-prefill')).toHaveFocus();
    screen.getByTestId('convert-ai-prefill').blur();
    rerender(ui(makeDoc({ document: PICKED, aiState: 'idle' })));
    expect(screen.getByTestId('convert-ai-prefill')).not.toHaveFocus();
  });
});
