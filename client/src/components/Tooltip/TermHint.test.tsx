/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import i18n from '../../i18n/index.js';
import { TermHint } from './TermHint.js';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(async () => {
  jest.runAllTimers();
  jest.useRealTimers();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

const tip = () => screen.getByRole('tooltip');
const visible = () => tip().className.includes('visible');

describe('TermHint', () => {
  it('renders the label with the dotted-underline term class', () => {
    render(<TermHint term="late">Late</TermHint>);
    const term = screen.getByText('Late');
    expect(term.className).toContain('term');
    expect(term).toHaveAttribute('tabindex', '0');
  });

  it('shows the English definition on focus', () => {
    render(<TermHint term="late">Late</TermHint>);
    fireEvent.focus(screen.getByText('Late'));
    expect(visible()).toBe(true);
    expect(tip()).toHaveTextContent(/\S/);
    expect(tip().textContent).toBe(i18n.t('common:termHint.definition.late'));
    expect(tip().className).toContain('multiline');
  });

  it('shows the German definition after the language changes', async () => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    render(<TermHint term="late">Verspätet</TermHint>);
    fireEvent.focus(screen.getByText('Verspätet'));
    expect(tip().textContent).toBe(i18n.t('common:termHint.definition.late', { lng: 'de' }));
    expect(tip().textContent).not.toBe(i18n.t('common:termHint.definition.late', { lng: 'en' }));
  });

  it('hides on Escape', () => {
    render(<TermHint term="spot">Spot</TermHint>);
    const term = screen.getByText('Spot');
    fireEvent.focus(term);
    expect(visible()).toBe(true);
    fireEvent.keyDown(term, { key: 'Escape' });
    expect(visible()).toBe(false);
  });

  it('pins on click and unpins on a second click', () => {
    render(<TermHint term="spot">Spot</TermHint>);
    const term = screen.getByText('Spot');
    fireEvent.click(term);
    expect(visible()).toBe(true);
    fireEvent.click(term);
    expect(visible()).toBe(false);
  });

  it('does not propagate a click or key press to a parent handler', () => {
    const onClick = jest.fn();
    const onKeyDown = jest.fn();
    render(
      <div onClick={onClick} onKeyDown={onKeyDown}>
        <TermHint term="range">Range</TermHint>
      </div>,
    );
    const term = screen.getByText('Range');
    fireEvent.click(term);
    fireEvent.keyDown(term, { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('does not propagate a Space key press to a parent key handler', () => {
    const onKeyDown = jest.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <TermHint term="range">Range</TermHint>
      </div>,
    );
    fireEvent.keyDown(screen.getByText('Range'), { key: ' ' });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it.each(['Escape', '?', 'g'])('lets the %s key reach a parent key handler', (key) => {
    const onKeyDown = jest.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <TermHint term="range">Range</TermHint>
      </div>,
    );
    fireEvent.keyDown(screen.getByText('Range'), { key });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('hides an open tooltip on Escape and still lets the key reach a parent handler', () => {
    const onKeyDown = jest.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <TermHint term="range">Range</TermHint>
      </div>,
    );
    const term = screen.getByText('Range');
    fireEvent.focus(term);
    expect(visible()).toBe(true);
    fireEvent.keyDown(term, { key: 'Escape' });
    expect(visible()).toBe(false);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('puts the id on the term span, not on the tooltip', () => {
    render(
      <TermHint term="late" id="late-label" testId="late-hint">
        Late
      </TermHint>,
    );
    const term = screen.getByTestId('late-hint');
    expect(term).toHaveAttribute('id', 'late-label');
    expect(tip()).not.toHaveAttribute('id', 'late-label');
  });

  it('passes align="end" to the tooltip', () => {
    render(
      <TermHint term="late" align="end">
        Late
      </TermHint>,
    );
    expect(tip().className).toContain('alignEnd');
  });
});
