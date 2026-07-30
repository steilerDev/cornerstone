/**
 * Unit tests for client/src/components/WizardStepper/WizardStepper.tsx
 *
 * Covers: completed/current/upcoming states, forward-lock (steps beyond maxReachedStep are
 * non-interactive — not merely disabled), backward clicks, aria-current, connectors, and the
 * ariaLabel/mobileStepLabel prop contract.
 *
 * Responsive layout note: WizardStepper always renders BOTH the desktop `<nav>/<ol>` tree AND
 * the mobile dot-summary tree unconditionally — there is no JS/window.innerWidth branch in the
 * component at all. Show/hide between the two is delegated entirely to a CSS
 * `@media (max-width: 767px)` rule in WizardStepper.module.css (`.stepper { display: none }` /
 * `.stepperMobile { display: flex }` under that query). Jest's CSS Modules transform
 * (identity-obj-proxy) only maps class names to strings — it never loads/applies the real
 * stylesheet — so jsdom has no way to evaluate that media query; both trees are always present
 * and "visible" from a DOM-query perspective in this test environment regardless of any
 * `window.innerWidth` value. Actual viewport-driven show/hide is an E2E concern
 * (e2e-test-engineer), not something unit tests here can meaningfully assert. An earlier version
 * of this file simulated viewport width via `Object.defineProperty(window, 'innerWidth', ...)`
 * and asserted the mobile tree's presence excluded the desktop tree (and vice versa) — that
 * assumed a JS-conditional-render implementation this component no longer has; those assertions
 * are removed below in favor of testing what's actually true: both trees always coexist.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import { WizardStepper, type WizardStep } from './WizardStepper.js';

const STEPS: WizardStep[] = [
  { id: 'use-case', label: 'Use case' },
  { id: 'source', label: 'Source' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'options', label: 'Options' },
];

describe('WizardStepper', () => {
  it('always renders both the desktop nav tree and the mobile summary tree together (CSS-only responsive, not a JS viewport branch)', () => {
    const { container } = render(
      <WizardStepper steps={STEPS} currentStep={2} onStepClick={jest.fn()} />,
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(container.querySelector('.stepperMobile')).not.toBeNull();
    expect(container.querySelector('.stepper')).not.toBeNull();
  });

  describe('desktop nav/ol tree', () => {
    it('renders a nav with an ordered list of all steps', () => {
      render(<WizardStepper steps={STEPS} currentStep={2} onStepClick={jest.fn()} />);
      const nav = screen.getByRole('navigation');
      expect(nav.querySelector('ol')).not.toBeNull();
      expect(screen.getAllByText(/Use case|Source|Invoices|Options/)).toHaveLength(4);
    });

    it('defaults the nav aria-label to "Report wizard" when ariaLabel is not provided', () => {
      render(<WizardStepper steps={STEPS} currentStep={2} onStepClick={jest.fn()} />);
      expect(screen.getByRole('navigation', { name: 'Report wizard' })).toBeInTheDocument();
    });

    it('uses a consumer-supplied ariaLabel for the nav, making it namespace-agnostic', () => {
      render(
        <WizardStepper
          steps={STEPS}
          currentStep={2}
          onStepClick={jest.fn()}
          ariaLabel="Custom stepper label"
        />,
      );
      expect(screen.getByRole('navigation', { name: 'Custom stepper label' })).toBeInTheDocument();
    });

    it('marks the current step with aria-current="step"', () => {
      render(<WizardStepper steps={STEPS} currentStep={2} onStepClick={jest.fn()} />);
      const current = screen.getByRole('button', { name: 'Source' });
      expect(current).toHaveAttribute('aria-current', 'step');
    });

    it('does not mark non-current steps with aria-current', () => {
      render(<WizardStepper steps={STEPS} currentStep={2} onStepClick={jest.fn()} />);
      const useCase = screen.getByRole('button', { name: 'Use case' });
      expect(useCase).not.toHaveAttribute('aria-current');
    });

    it('renders completed and current steps as clickable buttons (within maxReachedStep)', () => {
      render(
        <WizardStepper steps={STEPS} currentStep={2} maxReachedStep={3} onStepClick={jest.fn()} />,
      );
      // Steps 1, 2, 3 are all <= maxReachedStep=3, so all render as <button>.
      expect(screen.getByRole('button', { name: 'Use case' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Source' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Invoices' })).toBeInTheDocument();
    });

    it('forward-lock: a step beyond maxReachedStep is NOT rendered as a button at all (non-interactive, not merely disabled)', () => {
      render(
        <WizardStepper steps={STEPS} currentStep={1} maxReachedStep={1} onStepClick={jest.fn()} />,
      );

      // Step 4 ("Options") is beyond maxReachedStep=1 — must not appear in the button role list,
      // must not be a <button disabled> either (that would still be discoverable/announced
      // differently) — it should render as a plain, non-interactive <div>. It also shows up
      // once (only in the desktop tree — the mobile tree never renders step labels as text).
      expect(screen.queryByRole('button', { name: 'Options' })).not.toBeInTheDocument();
      const optionsElements = screen.getAllByText('Options');
      expect(optionsElements).toHaveLength(1);
      expect(optionsElements[0]!.closest('div')?.tagName).toBe('DIV');
      expect(optionsElements[0]!.closest('div')).not.toHaveAttribute('disabled');
    });

    it('invokes onStepClick with the target step number when a reachable step is clicked', () => {
      const onStepClick = jest.fn();
      render(
        <WizardStepper
          steps={STEPS}
          currentStep={3}
          maxReachedStep={3}
          onStepClick={onStepClick}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Use case' }));
      expect(onStepClick).toHaveBeenCalledWith(1);
    });

    it('supports backward navigation clicks (from a later step back to an earlier completed one)', () => {
      const onStepClick = jest.fn();
      render(
        <WizardStepper
          steps={STEPS}
          currentStep={4}
          maxReachedStep={4}
          onStepClick={onStepClick}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Invoices' }));
      expect(onStepClick).toHaveBeenCalledWith(3);
    });

    it('defaults maxReachedStep to currentStep when not provided (only current step and earlier are clickable)', () => {
      render(<WizardStepper steps={STEPS} currentStep={2} onStepClick={jest.fn()} />);

      expect(screen.getByRole('button', { name: 'Use case' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Source' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Invoices' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Options' })).not.toBeInTheDocument();
    });

    it('renders steps as non-interactive when onStepClick is not provided, even within maxReachedStep', () => {
      render(<WizardStepper steps={STEPS} currentStep={2} maxReachedStep={3} />);
      expect(screen.queryByRole('button', { name: 'Use case' })).not.toBeInTheDocument();
      expect(screen.getAllByText('Use case')).toHaveLength(1);
    });

    it('renders exactly 3 connectors for 4 steps (none trailing the last item)', () => {
      const { container } = render(
        <WizardStepper steps={STEPS} currentStep={1} onStepClick={jest.fn()} />,
      );
      const items = container.querySelectorAll('.stepper li');
      expect(items).toHaveLength(4);
      // identity-obj-proxy maps CSS module class names to their literal key.
      const connectors = container.querySelectorAll('.connector');
      expect(connectors).toHaveLength(3);
    });
  });

  describe('mobile summary tree', () => {
    it('renders a "step X of N" text summary and aria-hidden dot indicators alongside the desktop tree', () => {
      const { container } = render(
        <WizardStepper steps={STEPS} currentStep={2} onStepClick={jest.fn()} />,
      );
      // WizardStepper is namespace-agnostic — the mobile step summary is produced by the
      // consumer-supplied `mobileStepLabel` prop (defaults to `Step ${current} of ${total}`)
      // rather than an internal, page-specific translation key.
      expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
      const dots = container.querySelector('.dotIndicators');
      expect(dots).toHaveAttribute('aria-hidden', 'true');
      expect(dots?.querySelectorAll('.dot')).toHaveLength(4);
    });

    it('uses a consumer-supplied mobileStepLabel prop for the mobile step summary', () => {
      const mobileStepLabel = jest.fn((current: number, total: number) => `${current}/${total}`);
      render(
        <WizardStepper
          steps={STEPS}
          currentStep={3}
          onStepClick={jest.fn()}
          mobileStepLabel={mobileStepLabel}
        />,
      );
      expect(mobileStepLabel).toHaveBeenCalledWith(3, 4);
      expect(screen.getByText('3/4')).toBeInTheDocument();
    });

    it('fills dots for completed and current steps, and outlines upcoming ones', () => {
      const { container } = render(
        <WizardStepper steps={STEPS} currentStep={2} onStepClick={jest.fn()} />,
      );
      const dots = container.querySelectorAll('.dotIndicators .dot');
      expect(dots).toHaveLength(4);
      // Step 1 (completed) and step 2 (current) are filled; steps 3-4 (upcoming) are outlined.
      expect(dots[0]).toHaveClass('dotFilled');
      expect(dots[1]).toHaveClass('dotFilled');
      expect(dots[2]).toHaveClass('dotOutline');
      expect(dots[3]).toHaveClass('dotOutline');
    });
  });
});
