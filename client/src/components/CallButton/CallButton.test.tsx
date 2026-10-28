/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { act, render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n/index.js';
import { CallButton } from './CallButton.js';

describe('CallButton', () => {
  describe('href', () => {
    it('is a tel: link that keeps digits and the plus sign', () => {
      render(<CallButton phone="+49 (30) 555-0142" name="Sample Roofing Co" />);
      expect(screen.getByRole('link')).toHaveAttribute('href', 'tel:+49305550142');
    });

    it('strips every other character, also from a plain local number', () => {
      render(<CallButton phone="030 / 555.01 42 ext." name="Sample Roofing Co" />);
      expect(screen.getByRole('link')).toHaveAttribute('href', 'tel:0305550142');
    });

    it('shows the number as stored in the tooltip', () => {
      render(<CallButton phone="+49 30 555 0142" name="Sample Roofing Co" />);
      expect(screen.getByRole('link')).toHaveAttribute('title', '+49 30 555 0142');
    });
  });

  describe('accessible name (WCAG 2.5.3: label starts with the visible text)', () => {
    it('plain variant: visible "Call", name "Call ‹name› on ‹number›"', () => {
      render(<CallButton phone="555-0142" name="Sample Roofing Co" />);
      const link = screen.getByRole('link');

      expect(link).toHaveTextContent('Call');
      expect(link).toHaveAccessibleName('Call Sample Roofing Co on 555-0142');
      expect(link.getAttribute('aria-label')!.startsWith(link.textContent!)).toBe(true);
    });

    it('number variant: visible "Call ‹number›", name "Call ‹number›, ‹name›"', () => {
      render(<CallButton phone="555-0142" name="Sample Roofing Co" showNumber />);
      const link = screen.getByRole('link');

      expect(link).toHaveTextContent('Call 555-0142');
      expect(link).toHaveAccessibleName('Call 555-0142, Sample Roofing Co');
      expect(link.getAttribute('aria-label')!.startsWith(link.textContent!)).toBe(true);
    });

    it('does not show the number in the plain variant', () => {
      render(<CallButton phone="555-0142" name="Sample Roofing Co" />);
      expect(screen.getByRole('link').textContent).toBe('Call');
    });
  });

  describe('props', () => {
    it('passes onClick through with the click event', () => {
      const onClick = jest.fn();
      render(<CallButton phone="555-0142" name="Sample Roofing Co" onClick={onClick} />);

      fireEvent.click(screen.getByRole('link'));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick.mock.calls[0]![0]).toHaveProperty('type', 'click');
    });

    it('lets a row stop propagation in onClick', () => {
      const parentClick = jest.fn();
      render(
        <div onClick={parentClick}>
          <CallButton
            phone="555-0142"
            name="Sample Roofing Co"
            onClick={(event) => event.stopPropagation()}
          />
        </div>,
      );

      fireEvent.click(screen.getByRole('link'));

      expect(parentClick).not.toHaveBeenCalled();
    });

    it('applies tabIndex, id and testId', () => {
      render(
        <CallButton
          phone="555-0142"
          name="Sample Roofing Co"
          tabIndex={-1}
          id="call-1"
          testId="call-x"
        />,
      );
      const link = screen.getByTestId('call-x');

      expect(link).toHaveAttribute('tabindex', '-1');
      expect(link).toHaveAttribute('id', 'call-1');
    });

    it('sets no tabindex, id or test id when they are not given', () => {
      render(<CallButton phone="555-0142" name="Sample Roofing Co" />);
      const link = screen.getByRole('link');

      expect(link).not.toHaveAttribute('tabindex');
      expect(link).not.toHaveAttribute('id');
      expect(link).not.toHaveAttribute('data-testid');
    });

    // Mutation: replacing the module classes with className drops the button styling.
    it('appends a host className after its own classes', () => {
      const { rerender } = render(<CallButton phone="555-0142" name="Sample Roofing Co" />);
      const plain = screen.getByRole('link').className;
      rerender(<CallButton phone="555-0142" name="Sample Roofing Co" className="hostClass" />);
      const link = screen.getByRole('link');

      expect(link.className).toBe(`${plain} hostClass`);
      expect(link).toHaveClass('button');
    });

    it('renders the shared phone glyph with the icon class', () => {
      render(<CallButton phone="555-0142" name="Sample Roofing Co" />);
      const svg = screen.getByRole('link').querySelector('svg')!;

      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveClass('icon');
    });

    it('adds the full-width class only when asked', () => {
      const { rerender } = render(<CallButton phone="555-0142" name="Sample Roofing Co" />);
      const plainClass = screen.getByRole('link').className;
      rerender(<CallButton phone="555-0142" name="Sample Roofing Co" fullWidth />);

      expect(screen.getByRole('link').className).not.toBe(plainClass);
      expect(screen.getByRole('link').className).toContain(plainClass);
    });

    it('hides the icon from assistive technology', () => {
      const { container } = render(<CallButton phone="555-0142" name="Sample Roofing Co" />);
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });
  });
});

describe('CallButton in German (WCAG 2.5.3)', () => {
  const inGerman = async (fn: () => void) => {
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    try {
      fn();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  };

  it('plain variant: the accessible name starts with the visible text "Anrufen"', async () => {
    await inGerman(() => {
      render(<CallButton phone="555-0142" name="Muster Dach GmbH" />);
      const link = screen.getByRole('link');

      expect(link.textContent).toBe('Anrufen');
      expect(link).toHaveAccessibleName('Anrufen, Muster Dach GmbH, 555-0142');
      expect(link.getAttribute('aria-label')!.startsWith('Anrufen')).toBe(true);
    });
  });

  it('number variant: the accessible name starts with the visible text', async () => {
    await inGerman(() => {
      render(<CallButton phone="555-0142" name="Muster Dach GmbH" showNumber />);
      const link = screen.getByRole('link');

      expect(link.textContent).toBe('555-0142 anrufen');
      expect(link.getAttribute('aria-label')!.startsWith(link.textContent!)).toBe(true);
    });
  });
});
