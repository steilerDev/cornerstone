/**
 * Unit tests for client/src/components/IconLinkButton/IconLinkButton.tsx
 *
 * IconLinkButton is a new shared component (Issue #1933): an icon-only react-router `Link`,
 * optionally opening in a new tab (with the safe `rel` baked in) and optionally wrapped in the
 * shared Tooltip. It renders a react-router `Link`, so every test goes through `renderWithRouter`
 * (see client/src/test/testUtils.tsx) rather than plain RTL `render`.
 *
 * CSS Modules are mocked via identity-obj-proxy (jest.config.ts) — `styles.link` resolves to the
 * literal string `"link"`, so classList assertions below check for that string directly.
 */
import { screen } from '@testing-library/react';
import { describe, it, expect } from '@jest/globals';
import { renderWithRouter } from '../../test/testUtils.js';
import { IconLinkButton } from './IconLinkButton.js';

function TestIcon() {
  return (
    <svg data-testid="test-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h16v16H4z" />
    </svg>
  );
}

describe('IconLinkButton', () => {
  it('renders an anchor whose resolved href matches `to`', () => {
    renderWithRouter(
      <IconLinkButton to="/budget/invoices/inv-1" ariaLabel="Open invoice" icon={<TestIcon />} />,
    );
    const link = screen.getByRole('link', { name: 'Open invoice' });
    expect(link).toHaveAttribute('href', '/budget/invoices/inv-1');
  });

  describe('newTab', () => {
    it('sets target="_blank" and rel="noopener noreferrer" when true', () => {
      renderWithRouter(<IconLinkButton to="/x" ariaLabel="Open" icon={<TestIcon />} newTab />);
      const link = screen.getByRole('link', { name: 'Open' });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('sets neither target nor rel when omitted (defaults to false)', () => {
      renderWithRouter(<IconLinkButton to="/x" ariaLabel="Open" icon={<TestIcon />} />);
      const link = screen.getByRole('link', { name: 'Open' });
      expect(link).not.toHaveAttribute('target');
      expect(link).not.toHaveAttribute('rel');
    });

    it('sets neither target nor rel when explicitly false', () => {
      renderWithRouter(
        <IconLinkButton to="/x" ariaLabel="Open" icon={<TestIcon />} newTab={false} />,
      );
      const link = screen.getByRole('link', { name: 'Open' });
      expect(link).not.toHaveAttribute('target');
      expect(link).not.toHaveAttribute('rel');
    });
  });

  it('sets the accessible name to the ariaLabel prop verbatim', () => {
    const label = 'Open invoice ACME Builders, INV-001 in new tab';
    renderWithRouter(<IconLinkButton to="/x" ariaLabel={label} icon={<TestIcon />} />);
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  });

  it('renders the passed icon node as a descendant of the anchor', () => {
    renderWithRouter(<IconLinkButton to="/x" ariaLabel="Open" icon={<TestIcon />} />);
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link).toContainElement(screen.getByTestId('test-icon'));
  });

  describe('tooltip', () => {
    it('wraps the link in the shared Tooltip (role="tooltip" with the given text) when tooltip is provided', () => {
      renderWithRouter(
        <IconLinkButton
          to="/x"
          ariaLabel="Open"
          icon={<TestIcon />}
          tooltip="Open invoice in new tab"
        />,
      );
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('Open invoice in new tab');
      // The link is still reachable and nested inside the tooltip wrapper.
      expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument();
    });

    it('renders no tooltip element when tooltip is omitted', () => {
      renderWithRouter(<IconLinkButton to="/x" ariaLabel="Open" icon={<TestIcon />} />);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  it('merges the className prop into the anchor class list alongside the component-owned class', () => {
    renderWithRouter(
      <IconLinkButton to="/x" ariaLabel="Open" icon={<TestIcon />} className="myExtraClass" />,
    );
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link.className).toContain('myExtraClass');
    // Component's own class (identity-obj-proxy maps styles.link -> 'link') must survive the merge.
    expect(link.className).toContain('link');
  });

  it('omits any extra class token beyond its own when className is not provided', () => {
    renderWithRouter(<IconLinkButton to="/x" ariaLabel="Open" icon={<TestIcon />} />);
    const link = screen.getByRole('link', { name: 'Open' });
    // className is `${styles.link} ${className || ''}` — with no className this must not leave a
    // stray literal "undefined" token in the class list.
    expect(link.className).not.toContain('undefined');
    expect(link.className).toContain('link');
  });
});
