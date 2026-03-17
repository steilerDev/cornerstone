/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiaryEntryTypeSwitcher } from './DiaryEntryTypeSwitcher.js';

describe('DiaryEntryTypeSwitcher', () => {
  beforeEach(() => {
    localStorage.setItem('theme', 'light');
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderSwitcher = (value: 'all' | 'manual' | 'automatic' = 'all', onChange = jest.fn()) =>
    render(<DiaryEntryTypeSwitcher value={value} onChange={onChange} />);

  // ─── Rendering ─────────────────────────────────────────────────────────────

  it('renders the radiogroup container', () => {
    renderSwitcher();
    expect(screen.getByRole('radiogroup', { name: /filter entries by type/i })).toBeInTheDocument();
  });

  it('renders three radio buttons: All, Manual, Automatic', () => {
    renderSwitcher();
    expect(screen.getByTestId('type-switcher-all')).toBeInTheDocument();
    expect(screen.getByTestId('type-switcher-manual')).toBeInTheDocument();
    expect(screen.getByTestId('type-switcher-automatic')).toBeInTheDocument();
  });

  it('renders button labels correctly', () => {
    renderSwitcher();
    expect(screen.getByTestId('type-switcher-all')).toHaveTextContent('All');
    expect(screen.getByTestId('type-switcher-manual')).toHaveTextContent('Manual');
    expect(screen.getByTestId('type-switcher-automatic')).toHaveTextContent('Automatic');
  });

  // ─── aria-checked ──────────────────────────────────────────────────────────

  it('sets aria-checked="true" on the "all" button when value is "all"', () => {
    renderSwitcher('all');
    expect(screen.getByTestId('type-switcher-all')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('type-switcher-manual')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('type-switcher-automatic')).toHaveAttribute('aria-checked', 'false');
  });

  it('sets aria-checked="true" on the "manual" button when value is "manual"', () => {
    renderSwitcher('manual');
    expect(screen.getByTestId('type-switcher-all')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('type-switcher-manual')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('type-switcher-automatic')).toHaveAttribute('aria-checked', 'false');
  });

  it('sets aria-checked="true" on the "automatic" button when value is "automatic"', () => {
    renderSwitcher('automatic');
    expect(screen.getByTestId('type-switcher-all')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('type-switcher-manual')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('type-switcher-automatic')).toHaveAttribute('aria-checked', 'true');
  });

  // ─── Click behaviour ───────────────────────────────────────────────────────

  it('calls onChange with "all" when the All button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderSwitcher('manual', onChange);

    await user.click(screen.getByTestId('type-switcher-all'));

    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('calls onChange with "manual" when the Manual button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderSwitcher('all', onChange);

    await user.click(screen.getByTestId('type-switcher-manual'));

    expect(onChange).toHaveBeenCalledWith('manual');
  });

  it('calls onChange with "automatic" when the Automatic button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderSwitcher('all', onChange);

    await user.click(screen.getByTestId('type-switcher-automatic'));

    expect(onChange).toHaveBeenCalledWith('automatic');
  });

  // ─── Arrow key navigation ──────────────────────────────────────────────────

  it('calls onChange with "manual" when ArrowRight is pressed while "all" is active', () => {
    const onChange = jest.fn();
    const { container } = render(<DiaryEntryTypeSwitcher value="all" onChange={onChange} />);
    const radiogroup = container.querySelector('[role="radiogroup"]')!;

    fireEvent.keyDown(radiogroup, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('manual');
  });

  it('calls onChange with "all" when ArrowLeft is pressed while "manual" is active', () => {
    const onChange = jest.fn();
    const { container } = render(<DiaryEntryTypeSwitcher value="manual" onChange={onChange} />);
    const radiogroup = container.querySelector('[role="radiogroup"]')!;

    fireEvent.keyDown(radiogroup, { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('calls onChange with "automatic" when ArrowRight is pressed while "manual" is active', () => {
    const onChange = jest.fn();
    const { container } = render(<DiaryEntryTypeSwitcher value="manual" onChange={onChange} />);
    const radiogroup = container.querySelector('[role="radiogroup"]')!;

    fireEvent.keyDown(radiogroup, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('automatic');
  });

  it('does not call onChange when ArrowRight is pressed on the last option ("automatic")', () => {
    const onChange = jest.fn();
    const { container } = render(<DiaryEntryTypeSwitcher value="automatic" onChange={onChange} />);
    const radiogroup = container.querySelector('[role="radiogroup"]')!;

    fireEvent.keyDown(radiogroup, { key: 'ArrowRight' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when ArrowLeft is pressed on the first option ("all")', () => {
    const onChange = jest.fn();
    const { container } = render(<DiaryEntryTypeSwitcher value="all" onChange={onChange} />);
    const radiogroup = container.querySelector('[role="radiogroup"]')!;

    fireEvent.keyDown(radiogroup, { key: 'ArrowLeft' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange for irrelevant key presses', () => {
    const onChange = jest.fn();
    const { container } = render(<DiaryEntryTypeSwitcher value="all" onChange={onChange} />);
    const radiogroup = container.querySelector('[role="radiogroup"]')!;

    fireEvent.keyDown(radiogroup, { key: 'Enter' });
    fireEvent.keyDown(radiogroup, { key: ' ' });

    expect(onChange).not.toHaveBeenCalled();
  });

  // ─── Active class ──────────────────────────────────────────────────────────

  it('applies "active" class to the currently selected button', () => {
    renderSwitcher('manual');
    const manualBtn = screen.getByTestId('type-switcher-manual');
    expect(manualBtn.getAttribute('class') ?? '').toContain('active');
  });

  it('does not apply "active" class to unselected buttons', () => {
    renderSwitcher('manual');
    const allBtn = screen.getByTestId('type-switcher-all');
    const automaticBtn = screen.getByTestId('type-switcher-automatic');
    // The "active" class should only appear once (on the selected button)
    expect(allBtn.getAttribute('class') ?? '').not.toContain('active');
    expect(automaticBtn.getAttribute('class') ?? '').not.toContain('active');
  });
});
