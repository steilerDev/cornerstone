/**
 * @jest-environment jsdom
 *
 * ConvertDocumentCard (#2240): pick a Paperless document and read its amounts. The hook state is
 * a plain object; the picker modal is a probe (it has its own test).
 *
 * Mutations these tests catch:
 *  - Read amounts shown without the AI reader or without a document;
 *  - a read result passed to the form when the read failed (null);
 *  - the picker's close or select not returning focus to Select / Change document;
 *  - mismatch / no-lines / error copy shown outside its state;
 *  - the picker receiving the wrong Paperless URL.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import type { UseConvertDocument } from './useConvertDocument.js';
import type * as CardModule from './ConvertDocumentCard.js';

jest.unstable_mockModule('../../components/invoices/InvoicePaperlessPickerModal.js', () => ({
  InvoicePaperlessPickerModal: (props: {
    onDocumentSelected: (doc: { id: number; title: string }) => void;
    onManualEntry: () => void;
    onClose: () => void;
    paperlessUrl: string | null;
  }) => (
    <div role="dialog" aria-label="picker-probe" data-url={props.paperlessUrl ?? ''}>
      <button
        type="button"
        onClick={() => props.onDocumentSelected({ id: 7, title: 'Picked.pdf' })}
      >
        probe-select
      </button>
      <button type="button" onClick={props.onManualEntry}>
        probe-manual
      </button>
      <button type="button" onClick={props.onClose}>
        probe-close
      </button>
    </div>
  ),
}));

let Card: (typeof CardModule)['ConvertDocumentCard'];

beforeEach(async () => {
  ({ ConvertDocumentCard: Card } = (await import('./ConvertDocumentCard.js')) as typeof CardModule);
});

function makeDoc(over: Partial<UseConvertDocument> = {}): UseConvertDocument {
  return {
    configured: true,
    paperlessUrl: 'https://paperless.example',
    llmEnabled: true,
    document: null,
    pickerOpen: false,
    openPicker: jest.fn(),
    closePicker: jest.fn(),
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

describe('without a document', () => {
  it('prompts to pre-fill and offers only Select document', () => {
    render(ui(makeDoc()));
    expect(screen.getByRole('heading', { name: 'Document' })).toBeInTheDocument();
    expect(screen.getByText('Pre-fill the final invoice from a document.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Select document' })).toBeEnabled();
    expect(screen.queryByTestId('convert-remove-document')).toBeNull();
    expect(screen.queryByTestId('convert-ai-prefill')).toBeNull();
    expect(screen.queryByTestId('convert-selected-document')).toBeNull();
    expect(screen.queryByText(/linked to the final invoice/)).toBeNull();
  });

  it('Select document opens the picker', () => {
    const doc = makeDoc();
    render(ui(doc));
    fireEvent.click(screen.getByTestId('convert-select-document'));
    expect(doc.openPicker).toHaveBeenCalledTimes(1);
  });
});

describe('with a document', () => {
  it('shows its title, Change document, Remove, Read amounts and the linked note', () => {
    render(ui(makeDoc({ document: PICKED })));
    const name = screen.getByTestId('convert-selected-document');
    expect(name).toHaveTextContent('Offer.pdf');
    expect(name).toHaveAttribute('title', 'Offer.pdf');
    expect(screen.getByTestId('convert-select-document')).toHaveTextContent('Change document');
    expect(screen.getByTestId('convert-remove-document')).toBeInTheDocument();
    expect(screen.getByTestId('convert-ai-prefill')).toHaveTextContent('Read amounts');
    expect(screen.getByText('The selected document is linked to the final invoice.')).toBeVisible();
    expect(screen.queryByText('Pre-fill the final invoice from a document.')).toBeNull();
  });

  it('has no Read amounts without the AI reader', () => {
    render(ui(makeDoc({ document: PICKED, llmEnabled: false })));
    expect(screen.queryByTestId('convert-ai-prefill')).toBeNull();
    expect(screen.getByTestId('convert-remove-document')).toBeInTheDocument();
  });

  it('Remove clears the document', () => {
    const doc = makeDoc({ document: PICKED });
    render(ui(doc));
    fireEvent.click(screen.getByTestId('convert-remove-document'));
    expect(doc.remove).toHaveBeenCalledTimes(1);
  });

  it('disables the buttons while the page is saving', () => {
    render(ui(makeDoc({ document: PICKED }), jest.fn(), true));
    for (const id of ['convert-select-document', 'convert-remove-document', 'convert-ai-prefill']) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
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

describe('picker', () => {
  it('is not mounted while closed', () => {
    render(ui(makeDoc()));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens with the Paperless URL', () => {
    render(ui(makeDoc({ pickerOpen: true })));
    expect(screen.getByRole('dialog', { name: 'picker-probe' })).toHaveAttribute(
      'data-url',
      'https://paperless.example',
    );
  });

  it('passes a missing URL as null', () => {
    render(ui(makeDoc({ pickerOpen: true, paperlessUrl: null })));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-url', '');
  });

  it('selecting a document hands its id and title to the hook', () => {
    const doc = makeDoc({ pickerOpen: true });
    render(ui(doc));
    fireEvent.click(screen.getByText('probe-select'));
    expect(doc.select).toHaveBeenCalledWith({ id: 7, title: 'Picked.pdf' });
  });

  it.each(['probe-manual', 'probe-close'])('%s closes the picker', (label) => {
    const doc = makeDoc({ pickerOpen: true });
    render(ui(doc));
    fireEvent.click(screen.getByText(label));
    expect(doc.closePicker).toHaveBeenCalledTimes(1);
  });

  it('returns focus to Select document once the picker has closed', () => {
    const doc = makeDoc({ pickerOpen: true });
    const { rerender } = render(ui(doc));
    fireEvent.click(screen.getByText('probe-close'));
    rerender(ui(makeDoc({ pickerOpen: false })));
    expect(screen.getByTestId('convert-select-document')).toHaveFocus();
  });

  it('returns focus to Change document after selecting', () => {
    const { rerender } = render(ui(makeDoc({ pickerOpen: true })));
    fireEvent.click(screen.getByText('probe-select'));
    rerender(ui(makeDoc({ pickerOpen: false, document: PICKED })));
    expect(screen.getByTestId('convert-select-document')).toHaveFocus();
    expect(screen.getByTestId('convert-select-document')).toHaveTextContent('Change document');
  });

  it('does not take focus on mount or when the picker was never opened', () => {
    const { rerender } = render(ui(makeDoc()));
    expect(screen.getByTestId('convert-select-document')).not.toHaveFocus();
    rerender(ui(makeDoc({ document: PICKED })));
    expect(screen.getByTestId('convert-select-document')).not.toHaveFocus();
  });

  it('moves focus once, not on every later render', () => {
    const { rerender } = render(ui(makeDoc({ pickerOpen: true })));
    fireEvent.click(screen.getByText('probe-close'));
    rerender(ui(makeDoc({ pickerOpen: false })));
    screen.getByTestId('convert-select-document').blur();
    rerender(ui(makeDoc({ pickerOpen: false, aiState: 'success' })));
    expect(screen.getByTestId('convert-select-document')).not.toHaveFocus();
  });
});

describe('focus never falls to the body', () => {
  it('Remove hands focus to Select document once the document is gone', () => {
    const { rerender } = render(ui(makeDoc({ document: PICKED })));
    const remove = screen.getByTestId('convert-remove-document');
    remove.focus();
    fireEvent.click(remove);
    rerender(ui(makeDoc({ document: null })));
    expect(screen.queryByTestId('convert-remove-document')).toBeNull();
    expect(screen.getByTestId('convert-select-document')).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

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
