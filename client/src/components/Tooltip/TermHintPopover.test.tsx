/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent, within } from '@testing-library/react';
import i18n from '../../i18n/index.js';
import { TermHintPopover } from './TermHintPopover.js';

const T = (key: string) => i18n.t(`common:${key}`);

describe('TermHintPopover', () => {
  it('labels a single-term button with the term name', () => {
    render(<TermHintPopover terms={['late']} testId="hint" />);
    expect(screen.getByTestId('hint')).toHaveAttribute(
      'aria-label',
      `Explain “${T('termHint.term.late')}”`,
    );
    expect(screen.getByTestId('hint')).toHaveAttribute('aria-label', 'Explain “Late”');
  });

  it('labels a multi-term button generically', () => {
    render(<TermHintPopover terms={['late', 'heldUp']} testId="hint" />);
    expect(screen.getByTestId('hint')).toHaveAttribute('aria-label', 'Explain these terms');
  });

  it('opens a named dialog listing each term and definition in order', () => {
    render(<TermHintPopover terms={['late', 'heldUp', 'critical']} testId="hint" />);
    const button = screen.getByTestId('hint');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog', { name: 'What these terms mean' });
    expect(screen.getByTestId('hint-panel')).toBe(dialog);
    expect(button).toHaveAttribute('aria-controls', dialog.id);

    const names = within(dialog)
      .getAllByRole('term')
      .map((el) => el.textContent);
    expect(names).toEqual(['late', 'heldUp', 'critical'].map((m) => T(`termHint.term.${m}`)));
    const defs = within(dialog)
      .getAllByRole('definition')
      .map((el) => el.textContent);
    expect(defs).toEqual(['late', 'heldUp', 'critical'].map((m) => T(`termHint.definition.${m}`)));
  });

  it('toggles closed on a second click', () => {
    render(<TermHintPopover terms={['late']} testId="hint" />);
    const button = screen.getByTestId('hint');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape and returns focus to the button', () => {
    render(<TermHintPopover terms={['late']} testId="hint" />);
    const button = screen.getByTestId('hint');
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes on an outside press', () => {
    render(
      <div>
        <button type="button">elsewhere</button>
        <TermHintPopover terms={['late']} testId="hint" />
      </div>,
    );
    fireEvent.click(screen.getByTestId('hint'));
    const outside = screen.getByRole('button', { name: 'elsewhere' });
    fireEvent.pointerDown(outside);
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not propagate the button click to a parent handler', () => {
    const onClick = jest.fn();
    render(
      <div onClick={onClick}>
        <TermHintPopover terms={['late']} testId="hint" />
      </div>,
    );
    fireEvent.click(screen.getByTestId('hint'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the panel free of focusable elements', () => {
    render(<TermHintPopover terms={['late', 'heldUp']} testId="hint" align="end" />);
    fireEvent.click(screen.getByTestId('hint'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelectorAll('button, a, input, select, textarea, [tabindex]')).toHaveLength(
      0,
    );
  });

  it('omits test ids when none is given', () => {
    render(<TermHintPopover terms={['late']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Explain “Late”' }));
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-testid');
  });
});
