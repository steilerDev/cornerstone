/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { PageLayout } from './PageLayout.js';

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

  // ── subNav prop ───────────────────────────────────────────────────────────

  it('renders subNav content when subNav prop is provided', () => {
    render(
      <PageLayout title="Test" subNav={<div data-testid="sub-nav">nav</div>}>
        <p>content</p>
      </PageLayout>,
    );

    expect(screen.getByTestId('sub-nav')).toBeInTheDocument();
  });

  it('does not render the subNav wrapper div when subNav is undefined', () => {
    const { container } = render(
      <PageLayout title="Test">
        <p>content</p>
      </PageLayout>,
    );

    expect(container.querySelector('.subNav')).toBeNull();
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

  it('renders title, action, subNav, and children together correctly', () => {
    render(
      <PageLayout
        title="Budget"
        maxWidth="wide"
        testId="budget-page"
        action={<button type="button">Add</button>}
        subNav={<nav aria-label="Budget nav">tabs</nav>}
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
    expect(screen.getByRole('navigation', { name: 'Budget nav' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Row 1' })).toBeInTheDocument();
  });
});
