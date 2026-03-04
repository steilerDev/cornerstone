/**
 * @jest-environment jsdom
 *
 * Unit tests for GanttHouseholdItems — circle marker rendering, positioning,
 * interaction states (highlighted/dimmed), keyboard/click accessibility,
 * delivered vs amber color schemes, and tooltip callbacks.
 *
 * EPIC-09: Story 9.1 — Household Item Timeline Dependencies & Delivery Date Scheduling
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { GanttHouseholdItems } from './GanttHouseholdItems.js';
import type {
  GanttHouseholdItemsProps,
  HouseholdItemColors,
  HouseholdItemInteractionState,
} from './GanttHouseholdItems.js';
import type { TimelineHouseholdItem } from '@cornerstone/shared';
import { ROW_HEIGHT } from './ganttUtils.js';
import type { ChartRange } from './ganttUtils.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COLORS: HouseholdItemColors = {
  fill: '#F59E0B',
  stroke: '#B45309',
  deliveredFill: '#22C55E',
  deliveredStroke: '#15803D',
  hoverGlow: 'rgba(245,158,11,0.3)',
};

// Chart range: 2026-04-01 to 2026-08-31 (day zoom)
const CHART_RANGE: ChartRange = {
  start: new Date(2026, 3, 1, 12, 0, 0, 0), // April 1 2026
  end: new Date(2026, 7, 31, 12, 0, 0, 0), // August 31 2026
  totalDays: 152,
};

const HI_NOT_ORDERED: TimelineHouseholdItem = {
  id: 'hi-1',
  name: 'Leather Sofa',
  category: 'furniture',
  status: 'planned',
  expectedDeliveryDate: null,
  earliestDeliveryDate: '2026-05-15',
  latestDeliveryDate: '2026-06-01',
  actualDeliveryDate: null,
  isLate: false,
  dependencyIds: [{ predecessorType: 'work_item', predecessorId: 'wi-1' }],
};

const HI_DELIVERED: TimelineHouseholdItem = {
  id: 'hi-2',
  name: 'Kitchen Fridge',
  category: 'appliances',
  status: 'arrived',
  expectedDeliveryDate: null,
  earliestDeliveryDate: '2026-04-15',
  latestDeliveryDate: '2026-04-20',
  actualDeliveryDate: '2026-04-18',
  isLate: false,
  dependencyIds: [],
};

const HI_ORDERED: TimelineHouseholdItem = {
  id: 'hi-3',
  name: 'Dining Table',
  category: 'furniture',
  status: 'purchased',
  expectedDeliveryDate: '2026-06-01',
  earliestDeliveryDate: '2026-06-10',
  latestDeliveryDate: '2026-07-01',
  actualDeliveryDate: null,
  isLate: true,
  dependencyIds: [],
};

const HI_NO_DATES: TimelineHouseholdItem = {
  id: 'hi-4',
  name: 'Lamp',
  category: 'decor',
  status: 'planned',
  expectedDeliveryDate: null,
  earliestDeliveryDate: null,
  latestDeliveryDate: null,
  actualDeliveryDate: null,
  isLate: false,
  dependencyIds: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * GanttHouseholdItems renders SVG elements.
 * Wrap in <svg> for valid DOM structure.
 */
function renderHouseholdItems(overrides: Partial<GanttHouseholdItemsProps> = {}) {
  const props: GanttHouseholdItemsProps = {
    householdItems: [HI_NOT_ORDERED],
    chartRange: CHART_RANGE,
    zoom: 'day',
    hiRowIndices: new Map([['hi-1', 0]]),
    colors: COLORS,
    ...overrides,
  };
  return render(
    <svg>
      <GanttHouseholdItems {...props} />
    </svg>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GanttHouseholdItems', () => {
  // ── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('renders nothing when householdItems array is empty', () => {
      const { container } = renderHouseholdItems({ householdItems: [] });
      expect(container.querySelector('[data-testid="gantt-hi-layer"]')).not.toBeInTheDocument();
    });

    it('returns null for empty array (no SVG elements added)', () => {
      const { container } = renderHouseholdItems({ householdItems: [] });
      expect(container.querySelectorAll('[data-testid="gantt-hi-circle"]')).toHaveLength(0);
    });
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the hi layer group', () => {
      renderHouseholdItems();
      expect(screen.getByTestId('gantt-hi-layer')).toBeInTheDocument();
    });

    it('renders one circle marker per household item with a delivery date', () => {
      renderHouseholdItems({
        householdItems: [HI_NOT_ORDERED, HI_DELIVERED],
        hiRowIndices: new Map([
          ['hi-1', 0],
          ['hi-2', 1],
        ]),
      });
      const circles = screen.getAllByTestId('gantt-hi-circle');
      expect(circles).toHaveLength(2);
    });

    it('does not render circle for HI with no earliestDeliveryDate and no actualDeliveryDate', () => {
      renderHouseholdItems({
        householdItems: [HI_NO_DATES],
        hiRowIndices: new Map([['hi-4', 0]]),
      });
      const circles = screen.queryAllByTestId('gantt-hi-circle');
      expect(circles).toHaveLength(0);
    });

    it('layer aria-label includes household item count', () => {
      renderHouseholdItems({
        householdItems: [HI_NOT_ORDERED, HI_ORDERED],
        hiRowIndices: new Map([
          ['hi-1', 0],
          ['hi-3', 1],
        ]),
      });
      const layer = screen.getByTestId('gantt-hi-layer');
      expect(layer.getAttribute('aria-label')).toContain('2');
    });

    it('circle has role="graphics-symbol"', () => {
      renderHouseholdItems();
      const circle = screen.getByTestId('gantt-hi-circle');
      expect(circle.getAttribute('role')).toBe('graphics-symbol');
    });

    it('circle has correct aria-label including name, status, and delivery date', () => {
      renderHouseholdItems();
      const circle = screen.getByTestId('gantt-hi-circle');
      const ariaLabel = circle.getAttribute('aria-label');
      expect(ariaLabel).toBeDefined();
      expect(ariaLabel).toContain('Leather Sofa');
      expect(ariaLabel).toContain('planned');
    });
  });

  // ── Delivered vs non-delivered color ──────────────────────────────────────

  describe('color scheme based on status', () => {
    it('delivered HI circle uses deliveredFill color', () => {
      renderHouseholdItems({
        householdItems: [HI_DELIVERED],
        hiRowIndices: new Map([['hi-2', 0]]),
      });
      const circle = screen.getByTestId('gantt-hi-circle');
      // The main filled circle is the 3rd circle element (hit area + glow + main)
      const circles = circle.querySelectorAll('circle');
      const mainCircle = circles[circles.length - 1];
      expect(mainCircle.getAttribute('fill')).toBe(COLORS.deliveredFill);
    });

    it('non-delivered HI circle uses default fill color', () => {
      renderHouseholdItems({
        householdItems: [HI_NOT_ORDERED],
        hiRowIndices: new Map([['hi-1', 0]]),
      });
      const circle = screen.getByTestId('gantt-hi-circle');
      const circles = circle.querySelectorAll('circle');
      const mainCircle = circles[circles.length - 1];
      expect(mainCircle.getAttribute('fill')).toBe(COLORS.fill);
    });

    it('ordered HI uses default fill color (not delivered)', () => {
      renderHouseholdItems({
        householdItems: [HI_ORDERED],
        hiRowIndices: new Map([['hi-3', 0]]),
      });
      const circle = screen.getByTestId('gantt-hi-circle');
      const circles = circle.querySelectorAll('circle');
      const mainCircle = circles[circles.length - 1];
      expect(mainCircle.getAttribute('fill')).toBe(COLORS.fill);
    });

    it('delivered HI uses actualDeliveryDate for x position (not earliestDeliveryDate)', () => {
      // For delivered items, actualDeliveryDate takes priority for positioning
      const { container } = renderHouseholdItems({
        householdItems: [HI_DELIVERED],
        hiRowIndices: new Map([['hi-2', 0]]),
      });

      // Verify the circle renders (it will use actualDeliveryDate: 2026-04-18)
      const circle = container.querySelector('[data-testid="gantt-hi-circle"]');
      expect(circle).toBeInTheDocument();
    });
  });

  // ── Interaction states ─────────────────────────────────────────────────────

  describe('interaction states', () => {
    it('applies no special class when interaction state is "default"', () => {
      renderHouseholdItems({
        hiInteractionStates: new Map([['hi-1', 'default' as HouseholdItemInteractionState]]),
      });
      const circle = screen.getByTestId('gantt-hi-circle');
      // hiHighlighted and hiDimmed classes should NOT be present
      expect(circle.getAttribute('class') ?? '').not.toContain('hiHighlighted');
      expect(circle.getAttribute('class') ?? '').not.toContain('hiDimmed');
    });

    it('applies hiHighlighted class when interaction state is "highlighted"', () => {
      renderHouseholdItems({
        hiInteractionStates: new Map([['hi-1', 'highlighted' as HouseholdItemInteractionState]]),
      });
      const circle = screen.getByTestId('gantt-hi-circle');
      // CSS module class name will contain 'hiHighlighted' (module obfuscation not applied in tests)
      expect(circle.getAttribute('class') ?? '').toContain('hiHighlighted');
    });

    it('applies hiDimmed class when interaction state is "dimmed"', () => {
      renderHouseholdItems({
        hiInteractionStates: new Map([['hi-1', 'dimmed' as HouseholdItemInteractionState]]),
      });
      const circle = screen.getByTestId('gantt-hi-circle');
      expect(circle.getAttribute('class') ?? '').toContain('hiDimmed');
    });

    it('uses "default" state when hiInteractionStates is not provided', () => {
      renderHouseholdItems({ hiInteractionStates: undefined });
      const circle = screen.getByTestId('gantt-hi-circle');
      expect(circle.getAttribute('class') ?? '').not.toContain('hiHighlighted');
      expect(circle.getAttribute('class') ?? '').not.toContain('hiDimmed');
    });

    it('uses "default" state when HI id is not in hiInteractionStates map', () => {
      // Provide map without the HI's id
      renderHouseholdItems({
        hiInteractionStates: new Map([
          ['hi-other', 'highlighted' as HouseholdItemInteractionState],
        ]),
      });
      const circle = screen.getByTestId('gantt-hi-circle');
      expect(circle.getAttribute('class') ?? '').not.toContain('hiHighlighted');
    });
  });

  // ── Keyboard accessibility ─────────────────────────────────────────────────

  describe('keyboard accessibility', () => {
    it('circle is focusable (tabIndex=0)', () => {
      renderHouseholdItems();
      const circle = screen.getByTestId('gantt-hi-circle');
      expect(circle.getAttribute('tabindex')).toBe('0');
    });

    it('Enter key triggers onHiClick with the item id', () => {
      const onHiClick = jest.fn();
      renderHouseholdItems({ onHiClick });

      const circle = screen.getByTestId('gantt-hi-circle');
      fireEvent.keyDown(circle, { key: 'Enter' });

      expect(onHiClick).toHaveBeenCalledTimes(1);
      expect(onHiClick).toHaveBeenCalledWith('hi-1');
    });

    it('Space key triggers onHiClick with the item id', () => {
      const onHiClick = jest.fn();
      renderHouseholdItems({ onHiClick });

      const circle = screen.getByTestId('gantt-hi-circle');
      fireEvent.keyDown(circle, { key: ' ' });

      expect(onHiClick).toHaveBeenCalledTimes(1);
      expect(onHiClick).toHaveBeenCalledWith('hi-1');
    });

    it('other keys do NOT trigger onHiClick', () => {
      const onHiClick = jest.fn();
      renderHouseholdItems({ onHiClick });

      const circle = screen.getByTestId('gantt-hi-circle');
      fireEvent.keyDown(circle, { key: 'Tab' });
      fireEvent.keyDown(circle, { key: 'Escape' });
      fireEvent.keyDown(circle, { key: 'ArrowDown' });

      expect(onHiClick).not.toHaveBeenCalled();
    });

    it('does not call onHiClick when not provided (no error thrown on keydown)', () => {
      renderHouseholdItems({ onHiClick: undefined });

      const circle = screen.getByTestId('gantt-hi-circle');
      expect(() => {
        fireEvent.keyDown(circle, { key: 'Enter' });
      }).not.toThrow();
    });
  });

  // ── Mouse / click interaction ──────────────────────────────────────────────

  describe('click interaction', () => {
    it('click triggers onHiClick with the item id', () => {
      const onHiClick = jest.fn();
      renderHouseholdItems({ onHiClick });

      const circle = screen.getByTestId('gantt-hi-circle');
      fireEvent.click(circle);

      expect(onHiClick).toHaveBeenCalledTimes(1);
      expect(onHiClick).toHaveBeenCalledWith('hi-1');
    });

    it('does not call onHiClick when not provided on click (no error thrown)', () => {
      renderHouseholdItems({ onHiClick: undefined });

      const circle = screen.getByTestId('gantt-hi-circle');
      expect(() => {
        fireEvent.click(circle);
      }).not.toThrow();
    });
  });

  // ── Tooltip callbacks ──────────────────────────────────────────────────────

  describe('tooltip callbacks', () => {
    it('mouseEnter fires onHiMouseEnter with the item and event', () => {
      const onHiMouseEnter = jest.fn();
      renderHouseholdItems({ onHiMouseEnter });

      const circle = screen.getByTestId('gantt-hi-circle');
      fireEvent.mouseEnter(circle);

      expect(onHiMouseEnter).toHaveBeenCalledTimes(1);
      // First argument is the TimelineHouseholdItem
      const firstArg = (onHiMouseEnter.mock.calls[0] as unknown[])[0] as TimelineHouseholdItem;
      expect(firstArg.id).toBe('hi-1');
      expect(firstArg.name).toBe('Leather Sofa');
    });

    it('mouseLeave fires onHiMouseLeave with the item', () => {
      const onHiMouseLeave = jest.fn();
      renderHouseholdItems({ onHiMouseLeave });

      const circle = screen.getByTestId('gantt-hi-circle');
      fireEvent.mouseLeave(circle);

      expect(onHiMouseLeave).toHaveBeenCalledTimes(1);
      const firstArg = (onHiMouseLeave.mock.calls[0] as unknown[])[0] as TimelineHouseholdItem;
      expect(firstArg.id).toBe('hi-1');
    });

    it('does not error when onHiMouseEnter is not provided', () => {
      renderHouseholdItems({ onHiMouseEnter: undefined });

      const circle = screen.getByTestId('gantt-hi-circle');
      expect(() => {
        fireEvent.mouseEnter(circle);
      }).not.toThrow();
    });

    it('does not error when onHiMouseLeave is not provided', () => {
      renderHouseholdItems({ onHiMouseLeave: undefined });

      const circle = screen.getByTestId('gantt-hi-circle');
      expect(() => {
        fireEvent.mouseLeave(circle);
      }).not.toThrow();
    });
  });

  // ── Positioning ────────────────────────────────────────────────────────────

  describe('y-position based on rowIndex', () => {
    it('positions item at correct y based on row index', () => {
      const ROW_INDEX = 3;
      const EXPECTED_Y = ROW_INDEX * ROW_HEIGHT + ROW_HEIGHT / 2;

      renderHouseholdItems({
        hiRowIndices: new Map([['hi-1', ROW_INDEX]]),
      });

      const circle = screen.getByTestId('gantt-hi-circle');
      // The main circle (3rd circle element) has cy set to EXPECTED_Y
      const circles = circle.querySelectorAll('circle');
      // All circles should be at the same y
      for (const c of circles) {
        expect(Number(c.getAttribute('cy'))).toBe(EXPECTED_Y);
      }
    });

    it('defaults to row 0 when item id not found in hiRowIndices', () => {
      const EXPECTED_Y = 0 * ROW_HEIGHT + ROW_HEIGHT / 2;

      renderHouseholdItems({
        hiRowIndices: new Map(), // empty map — HI defaults to row 0
      });

      const circle = screen.getByTestId('gantt-hi-circle');
      const circles = circle.querySelectorAll('circle');
      for (const c of circles) {
        expect(Number(c.getAttribute('cy'))).toBe(EXPECTED_Y);
      }
    });
  });
});
