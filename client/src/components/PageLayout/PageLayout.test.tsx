/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { createRef } from 'react';
import type { ReactElement } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageLayout } from './PageLayout.js';

// PageTitle reads the router (its title menu navigates), so every render sits inside one.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

// CSS modules are mocked via identity-obj-proxy (classNames returned as-is)

describe('PageLayout', () => {
  // ── title prop ────────────────────────────────────────────────────────────

  it('renders h1 with the given title', () => {
    render(
      <PageLayout title="Work Items">
        <p>content</p>
      </PageLayout>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Work Items' })).toBeInTheDocument();
  });

  // ── children ──────────────────────────────────────────────────────────────

  it('renders children in the DOM', () => {
    render(
      <PageLayout title="Test">
        <p data-testid="child-content">Hello</p>
      </PageLayout>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByTestId('child-content')).toHaveTextContent('Hello');
  });

  // ── action prop ───────────────────────────────────────────────────────────

  it('renders action content when action prop is provided', () => {
    render(
      <PageLayout title="Test" action={<button type="button">New</button>}>
        <p>content</p>
      </PageLayout>,
    );

    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });

  it('does not render the action wrapper div when action is undefined', () => {
    const { container } = render(
      <PageLayout title="Test">
        <p>content</p>
      </PageLayout>,
    );

    // identity-obj-proxy returns CSS module class names as-is
    expect(container.querySelector('.action')).toBeNull();
  });

  // ── no sub-navigation row (AC5, #2205) ────────────────────────────────────

  it('renders no sub-navigation wrapper or navigation landmark of its own', () => {
    const { container } = render(
      <PageLayout title="Test">
        <p>content</p>
      </PageLayout>,
    );

    expect(container.querySelector('.subNav')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('puts the breadcrumb slot above the header row and nothing in between', () => {
    render(
      <PageLayout title="Test" breadcrumbs={<nav aria-label="Trail">trail</nav>}>
        <p>content</p>
      </PageLayout>,
    );

    const trail = screen.getByRole('navigation', { name: 'Trail' });
    const heading = screen.getByRole('heading', { level: 1, name: 'Test' });
    expect(trail.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trail.nextElementSibling).toBe(heading.parentElement);
  });

  // ── maxWidth prop ─────────────────────────────────────────────────────────

  it('does not apply containerNarrow class by default (wide)', () => {
    const { container } = render(
      <PageLayout title="Test">
        <p>content</p>
      </PageLayout>,
    );

    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).not.toContain('containerNarrow');
  });

  it('applies containerNarrow class when maxWidth is "narrow"', () => {
    const { container } = render(
      <PageLayout title="Test" maxWidth="narrow">
        <p>content</p>
      </PageLayout>,
    );

    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain('containerNarrow');
  });

  it('does not apply containerNarrow class when maxWidth is "wide"', () => {
    const { container } = render(
      <PageLayout title="Test" maxWidth="wide">
        <p>content</p>
      </PageLayout>,
    );

    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).not.toContain('containerNarrow');
  });

  // ── testId prop ───────────────────────────────────────────────────────────

  it('applies data-testid to the container when testId prop is provided', () => {
    const { container } = render(
      <PageLayout title="Test" testId="my-page">
        <p>content</p>
      </PageLayout>,
    );

    const outer = container.firstElementChild as HTMLElement;
    expect(outer).toHaveAttribute('data-testid', 'my-page');
  });

  it('does not add data-testid attribute when testId is omitted', () => {
    const { container } = render(
      <PageLayout title="Test">
        <p>content</p>
      </PageLayout>,
    );

    const outer = container.firstElementChild as HTMLElement;
    expect(outer).not.toHaveAttribute('data-testid');
  });

  // ── combined props ────────────────────────────────────────────────────────

  it('renders title, action, breadcrumbs, and children together correctly', () => {
    render(
      <PageLayout
        title="Budget"
        maxWidth="wide"
        testId="budget-page"
        action={<button type="button">Add</button>}
        breadcrumbs={<nav aria-label="Budget trail">trail</nav>}
      >
        <table>
          <tbody>
            <tr>
              <td>Row 1</td>
            </tr>
          </tbody>
        </table>
      </PageLayout>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Budget trail' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Row 1' })).toBeInTheDocument();
  });

  // ── headingRef ────────────────────────────────────────────────────────────

  it('makes the h1 programmatically focusable and exposes it through headingRef', () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <PageLayout title="Photos" headingRef={ref}>
        <p>content</p>
      </PageLayout>,
    );

    const h1 = screen.getByRole('heading', { level: 1, name: 'Photos' });
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(ref.current).toBe(h1);
    ref.current?.focus();
    expect(document.activeElement).toBe(h1);
  });

  it('renders no tabindex on the h1 without headingRef', () => {
    render(
      <PageLayout title="Photos">
        <p>content</p>
      </PageLayout>,
    );

    expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute('tabindex');
  });
  // -- breadcrumbs slot (#2203) --

  it('renders the breadcrumbs slot before the heading', () => {
    render(
      <PageLayout title="Grants" breadcrumbs={<nav data-testid="trail">Money</nav>}>
        <p>content</p>
      </PageLayout>,
    );

    const trail = screen.getByTestId('trail');
    const heading = screen.getByRole('heading', { level: 1, name: 'Grants' });
    expect(trail.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('adds no element without the breadcrumbs prop', () => {
    const { container } = render(
      <PageLayout title="Grants">
        <p>content</p>
      </PageLayout>,
    );

    const first = container.firstElementChild?.firstElementChild;
    expect(first).toHaveClass('header');
    expect(first).toContainElement(screen.getByRole('heading', { level: 1, name: 'Grants' }));
  });
});
