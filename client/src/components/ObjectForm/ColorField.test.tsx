/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ColorField } from './ColorField.js';

function Host({
  initial,
  onChange,
  disabled,
  noPrefix = false,
}: {
  initial: string | null;
  onChange?: (value: string | null) => void;
  disabled?: boolean;
  noPrefix?: boolean;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <ColorField
      id="color-id"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      disabled={disabled}
      noColorLabel="No color"
      {...(noPrefix ? {} : { testIdPrefix: 'c' })}
      describedBy="hint-id"
    />
  );
}

const colorInput = () => screen.getByTestId('c-color') as HTMLInputElement;
const noColorBox = () => screen.getByTestId('c-no-color') as HTMLInputElement;

describe('ColorField', () => {
  it('shows the colour, an unticked "No color" box and the id and description wiring', () => {
    render(<Host initial="#112233" />);
    expect(colorInput().value).toBe('#112233');
    expect(colorInput()).toHaveAttribute('id', 'color-id');
    expect(colorInput()).toHaveAttribute('aria-describedby', 'hint-id');
    expect(colorInput()).toBeEnabled();
    expect(noColorBox()).not.toBeChecked();
    expect(screen.getByLabelText('No color')).toBe(noColorBox());
  });

  it('with no colour ticks the box, disables the picker and shows the browser default', () => {
    render(<Host initial={null} />);
    expect(noColorBox()).toBeChecked();
    expect(colorInput()).toBeDisabled();
    expect(colorInput().value).toBe('#000000');
  });

  it('reports a picked colour', () => {
    const onChange = jest.fn<(value: string | null) => void>();
    render(<Host initial="#112233" onChange={onChange} />);
    fireEvent.change(colorInput(), { target: { value: '#abcdef' } });
    expect(onChange).toHaveBeenCalledWith('#abcdef');
    expect(colorInput().value).toBe('#abcdef');
  });

  it('ticking "No color" reports null', async () => {
    const onChange = jest.fn<(value: string | null) => void>();
    render(<Host initial="#112233" onChange={onChange} />);
    await userEvent.setup().click(noColorBox());
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(colorInput()).toBeDisabled();
  });

  it('unticking restores the last picked colour', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn<(value: string | null) => void>();
    render(<Host initial="#112233" onChange={onChange} />);
    fireEvent.change(colorInput(), { target: { value: '#abcdef' } });
    await user.click(noColorBox());
    await user.click(noColorBox());
    expect(onChange).toHaveBeenLastCalledWith('#abcdef');
    expect(colorInput().value).toBe('#abcdef');
  });

  it('unticking with nothing picked yet restores the value it started with', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn<(value: string | null) => void>();
    render(<Host initial="#112233" onChange={onChange} />);
    await user.click(noColorBox());
    await user.click(noColorBox());
    expect(onChange).toHaveBeenLastCalledWith('#112233');
  });

  it('unticking when it started without a colour restores the browser default', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn<(value: string | null) => void>();
    render(<Host initial={null} onChange={onChange} />);
    await user.click(noColorBox());
    expect(onChange).toHaveBeenLastCalledWith('#000000');
    expect(colorInput()).toBeEnabled();
  });

  it('disables both controls when disabled', () => {
    render(<Host initial="#112233" disabled />);
    expect(colorInput()).toBeDisabled();
    expect(noColorBox()).toBeDisabled();
  });

  it('adds no test ids without a prefix', () => {
    const { container } = render(<Host initial="#112233" noPrefix />);
    expect(container.querySelector('[data-testid]')).toBeNull();
  });
});
