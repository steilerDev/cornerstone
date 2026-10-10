/**
 * Unit tests for client/src/pages/ReportWizardPage/Step1UseCase.tsx
 *
 * Covers: use-case selection, helper text, radiogroup semantics/keyboard behavior.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import type { TFunction } from 'i18next';
import { Step1UseCase } from './Step1UseCase.js';
import enBudget from '../../i18n/en/budget.json';

const t = ((key: string) => key) as unknown as TFunction;

describe('Step1UseCase', () => {
  it('renders a radiogroup with 3 use-case cards', () => {
    render(<Step1UseCase value={null} onChange={jest.fn()} t={t} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('renders title and helper text for every use case', () => {
    render(<Step1UseCase value={null} onChange={jest.fn()} t={t} />);
    expect(screen.getByText('sourceReports.useCase.budget-overview')).toBeInTheDocument();
    expect(screen.getByText('sourceReports.useCaseHelper.budget-overview')).toBeInTheDocument();
    expect(screen.getByText('sourceReports.useCase.claim')).toBeInTheDocument();
    expect(screen.getByText('sourceReports.useCaseHelper.claim')).toBeInTheDocument();
    expect(screen.getByText('sourceReports.useCase.proof-of-funds')).toBeInTheDocument();
    expect(screen.getByText('sourceReports.useCaseHelper.proof-of-funds')).toBeInTheDocument();
  });

  it('none of the radios are checked when value is null', () => {
    render(<Step1UseCase value={null} onChange={jest.fn()} t={t} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.every((r) => !r.checked)).toBe(true);
  });

  it('checks the radio matching the current value', () => {
    render(<Step1UseCase value="claim" onChange={jest.fn()} t={t} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const claimRadio = radios.find((r) => r.value === 'claim')!;
    expect(claimRadio.checked).toBe(true);
    expect(radios.filter((r) => r.checked)).toHaveLength(1);
  });

  it('calls onChange with the selected use case value when a card is clicked', () => {
    const onChange = jest.fn();
    render(<Step1UseCase value={null} onChange={onChange} t={t} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const proofRadio = radios.find((r) => r.value === 'proof-of-funds')!;
    fireEvent.click(proofRadio);
    expect(onChange).toHaveBeenCalledWith('proof-of-funds');
  });

  it('radios share the same name attribute (native radiogroup keyboard nav works)', () => {
    render(<Step1UseCase value={null} onChange={jest.fn()} t={t} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const names = new Set(radios.map((r) => r.name));
    expect(names.size).toBe(1);
  });

  it('renders the 3 use cases in a fixed order: budget-overview, claim, proof-of-funds', () => {
    render(<Step1UseCase value={null} onChange={jest.fn()} t={t} />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(['budget-overview', 'claim', 'proof-of-funds']);
  });

  // #2194 D-18: the Claim helper describes the server set (to pay or paid, not yet submitted),
  // resolved from the real English catalogue rather than a literal copy.
  it('renders the Claim helper from the real en catalogue: to pay or paid, not yet submitted', () => {
    const resolve = ((key: string) => {
      const path = key.replace(/^sourceReports\./, '').split('.');
      let node: unknown = enBudget.sourceReports;
      for (const part of path) node = (node as Record<string, unknown>)[part];
      return node as string;
    }) as unknown as TFunction;
    render(<Step1UseCase value={null} onChange={jest.fn()} t={resolve} />);

    const helper = screen.getByText(enBudget.sourceReports.useCaseHelper.claim);
    expect(helper.textContent).toMatch(/to pay or paid/i);
    expect(helper.textContent).toMatch(/not yet submitted/i);
    expect(helper.textContent).not.toMatch(/claimed/i);
    expect(enBudget.sourceReports.amountLabel.claim).toMatch(/to pay or paid/i);
    expect(enBudget.sourceReports.amountLabel.claim).not.toMatch(/claimed/i);
  });
});
