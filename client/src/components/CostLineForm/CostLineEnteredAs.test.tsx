/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as EnteredAsTypes from './CostLineEnteredAs.js';
import type { CostLineValues } from './costLineValues.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const values = (over: Partial<CostLineValues> = {}): CostLineValues => ({
  description: '',
  target: null,
  existingLineId: null,
  pricing: 'unit',
  quantity: '2',
  unit: '',
  unitPrice: '50',
  amount: '',
  includesVat: false,
  budgetCategoryId: '',
  budgetSourceId: '',
  vendorId: '',
  confidence: 'own_estimate',
  ...over,
});

describe('CostLineEnteredAs', () => {
  let EnteredAs: typeof EnteredAsTypes;
  const onChange = jest.fn<(includesVat: boolean) => void>();

  beforeEach(async () => {
    onChange.mockReset();
    if (!EnteredAs) EnteredAs = await import('./CostLineEnteredAs.js');
  });

  function renderGroup(v: CostLineValues, busy = false) {
    return render(
      <EnteredAs.CostLineEnteredAs
        id="includesVat"
        values={v}
        onChange={onChange}
        busy={busy}
        describedBy="d"
      />,
    );
  }

  it('is a radio group whose options are named by their visible text, with no pressed state', () => {
    renderGroup(values());
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('id', 'includesVat');
    expect(group).toHaveAttribute('aria-describedby', 'd');
    const net = screen.getByRole('radio', { name: 'Net' });
    const gross = screen.getByRole('radio', { name: 'Gross' });
    expect(net).toBeChecked();
    expect(gross).not.toBeChecked();
    expect(net).not.toHaveAttribute('aria-pressed');
    expect(gross).not.toHaveAttribute('aria-pressed');
  });

  it('reports a change of the choice', async () => {
    const user = userEvent.setup();
    renderGroup(values());
    await user.click(screen.getByRole('radio', { name: 'Gross' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports Net when the gross option is selected and Net is picked', async () => {
    const user = userEvent.setup();
    renderGroup(values({ includesVat: true }));
    await user.click(screen.getByRole('radio', { name: 'Net' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('shows one status line with gross, net and the VAT rate', () => {
    renderGroup(values());
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Gross €119.00 (net €100.00 + VAT 19%)');
    expect(screen.getByRole('status')).not.toHaveAttribute('aria-live');
    expect(screen.getByText('VAT at 19% is added to net prices.')).toBeInTheDocument();
  });

  it('describes a gross entry without the net hint', () => {
    renderGroup(values({ includesVat: true }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Gross €100.00 (includes VAT 19%, net €84.03)',
    );
    expect(screen.queryByText(/is added to net prices/)).toBeNull();
  });

  it('keeps the status empty while the price is incomplete', () => {
    renderGroup(values({ quantity: '' }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('marks the options aria-disabled and ignores clicks while busy', async () => {
    const user = userEvent.setup();
    renderGroup(values(), true);
    expect(screen.getByRole('radio', { name: 'Gross' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('radio', { name: 'Gross' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
