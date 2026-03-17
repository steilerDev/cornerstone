/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { FormError } from './FormError.js';

describe('FormError', () => {
  describe('null / empty rendering', () => {
    it('returns null when message is null', () => {
      const { container } = render(<FormError message={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when message is undefined', () => {
      const { container } = render(<FormError />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when message is empty string', () => {
      const { container } = render(<FormError message="" />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('banner variant (default)', () => {
    it('renders banner variant by default with the error message', () => {
      render(<FormError message="Something went wrong" />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('banner has role="alert"', () => {
      render(<FormError message="Error occurred" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('banner applies the banner CSS class', () => {
      render(<FormError message="Banner error" />);
      const el = screen.getByRole('alert');
      // identity-obj-proxy returns class names as-is
      expect(el.getAttribute('class')).toContain('banner');
    });

    it('does not apply the field CSS class on the banner variant', () => {
      render(<FormError message="Banner error" />);
      const el = screen.getByRole('alert');
      expect(el.getAttribute('class')).not.toContain('field');
    });
  });

  describe('field variant', () => {
    it('renders field variant when variant="field"', () => {
      render(<FormError message="Field error" variant="field" />);
      expect(screen.getByText('Field error')).toBeInTheDocument();
    });

    it('field variant does NOT have role="alert"', () => {
      const { container } = render(<FormError message="Field error" variant="field" />);
      expect(screen.queryByRole('alert')).toBeNull();
      // Confirm the element is present but has no role attribute
      expect(container.firstChild).not.toBeNull();
    });

    it('field variant applies the field CSS class', () => {
      const { container } = render(<FormError message="Field error" variant="field" />);
      const el = container.firstChild as HTMLElement;
      expect(el.getAttribute('class')).toContain('field');
    });
  });

  describe('className prop', () => {
    it('applies a custom className alongside the variant class', () => {
      render(<FormError message="Error" className="my-custom-class" />);
      const el = screen.getByRole('alert');
      expect(el.getAttribute('class')).toContain('my-custom-class');
    });

    it('applies custom className on field variant too', () => {
      const { container } = render(<FormError message="Error" variant="field" className="extra" />);
      const el = container.firstChild as HTMLElement;
      expect(el.getAttribute('class')).toContain('extra');
    });
  });

  describe('message text content', () => {
    it('renders the exact message text', () => {
      render(<FormError message="Please fill in all required fields" />);
      expect(screen.getByText('Please fill in all required fields')).toBeInTheDocument();
    });
  });
});
