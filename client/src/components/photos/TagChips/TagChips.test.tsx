import { describe, it, expect, beforeAll, afterEach, jest } from '@jest/globals';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AreaResponse, OrientationResponse } from '@cornerstone/shared';
import { installMatchMedia } from '../../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../../test/matchMediaControl.js';
import { TagCreateContext } from '../../../objectForms/tagCreateContext.js';
import type { RequestTagCreate } from '../../../objectForms/tagCreateContext.js';
import type * as ChipsModule from './TagChips.js';

jest.unstable_mockModule('../../AreaPicker/AreaPicker.js', () => ({
  AreaPicker: (props: { value: string; onChange: (id: string) => void }) => (
    <div data-testid="area-picker" data-value={props.value}>
      <button type="button" onClick={() => props.onChange('a9')}>
        choose a9
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        choose none
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../../OrientationPicker/OrientationPicker.js', () => ({
  OrientationPicker: (props: {
    value: string;
    initialOrientationName?: string;
    emptyHint?: string;
    onChange: (id: string) => void;
  }) => (
    <div
      data-testid="orientation-picker"
      data-empty-hint={props.emptyHint ?? ''}
      data-value={props.value}
      data-name={props.initialOrientationName ?? ''}
    >
      <button type="button" onClick={() => props.onChange('o9')}>
        choose o9
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        choose no orientation
      </button>
    </div>
  ),
}));

const WIDE = '(min-width: 768px)';

/** A spy-able RequestTagCreate that resolves with `result`. */
function mockRequest(result: { id: string; name: string } | null) {
  return jest.fn((_kind: string, _focus?: HTMLElement | null) => Promise.resolve(result));
}

function area(id: string, name: string, parentId: string | null = null): AreaResponse {
  return { id, name, parentId } as unknown as AreaResponse;
}

function orientation(id: string, name: string, sortOrder: number): OrientationResponse {
  return { id, name, description: null, sortOrder } as unknown as OrientationResponse;
}

const AREAS: AreaResponse[] = [
  area('a1', 'Kitchen'),
  area('a2', 'Bath'),
  area('a3', 'Garage'),
  area('a4', 'Attic'),
  area('a5', 'Cellar'),
  area('a6', 'Porch'),
  area('a9', 'Garden'),
];

const FEW_ORIENTATIONS = [
  orientation('o2', 'East wall', 2),
  orientation('o1', 'North wall', 1),
  orientation('o3', 'Ceiling', 3),
];

const MANY_ORIENTATIONS = Array.from({ length: 10 }, (_, i) =>
  orientation(`m${i + 1}`, `Spot ${i + 1}`, i + 1),
);

describe('TagChips', () => {
  let TagChips: typeof ChipsModule.TagChips;
  let media: MatchMediaControl | null = null;

  beforeAll(async () => {
    ({ TagChips } = await import('./TagChips.js'));
  });

  afterEach(() => {
    media?.restore();
    media = null;
  });

  function setup(
    overrides: Partial<ChipsModule.TagChipsProps> = {},
    request: RequestTagCreate | null = null,
  ) {
    const props: ChipsModule.TagChipsProps = {
      areas: AREAS,
      orientations: FEW_ORIENTATIONS,
      recentAreaIds: [],
      recentOrientationIds: [],
      areaId: null,
      orientationId: null,
      onAreaChange: jest.fn(),
      onOrientationChange: jest.fn(),
      idPrefix: 'tc',
      ...overrides,
    };
    const view = render(
      <TagCreateContext value={request}>
        <TagChips {...props} />
      </TagCreateContext>,
    );
    return { props, ...view };
  }

  const areaRow = () => screen.getByRole('group', { name: 'Area' });
  const orientationRow = () => screen.getByRole('group', { name: 'Orientation' });
  const chipLabels = (row: HTMLElement) =>
    within(row)
      .getAllByRole('button')
      .map((b) => b.textContent);

  describe('area chips', () => {
    it('shows at most four recents in order, then Other…', () => {
      setup({ recentAreaIds: ['a3', 'a1', 'a5', 'a2', 'a4', 'a6'] });
      expect(chipLabels(areaRow())).toEqual(['Garage', 'Kitchen', 'Cellar', 'Bath', 'Other…']);
    });

    it('drops recent ids that are not areas any more and duplicates', () => {
      setup({ recentAreaIds: ['gone', 'a1', 'a1', 'a2'] });
      expect(chipLabels(areaRow())).toEqual(['Kitchen', 'Bath', 'Other…']);
    });

    it('has only Other… without recents', () => {
      setup();
      expect(chipLabels(areaRow())).toEqual(['Other…']);
    });

    it('shows a chosen area that is not a recent as a fifth pressed chip', () => {
      setup({ recentAreaIds: ['a1', 'a2', 'a3', 'a4'], areaId: 'a9' });
      expect(chipLabels(areaRow())).toEqual([
        'Kitchen',
        'Bath',
        'Garage',
        'Attic',
        'Garden',
        'Other…',
      ]);
      expect(screen.getByTestId('tc-area-a9')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('tc-area-a1')).toHaveAttribute('aria-pressed', 'false');
    });

    it('does not duplicate a chosen area that is already a recent', () => {
      setup({ recentAreaIds: ['a1', 'a2'], areaId: 'a2' });
      expect(chipLabels(areaRow())).toEqual(['Kitchen', 'Bath', 'Other…']);
      expect(screen.getByTestId('tc-area-a2')).toHaveAttribute('aria-pressed', 'true');
    });

    it('adds the parent to names that appear twice', () => {
      setup({
        areas: [
          area('f1', 'Ground floor'),
          area('f2', 'First floor'),
          area('k1', 'Kitchen', 'f1'),
          area('k2', 'Kitchen', 'f2'),
          area('b1', 'Bath', 'f1'),
        ],
        recentAreaIds: ['k1', 'k2', 'b1'],
      });
      expect(chipLabels(areaRow())).toEqual([
        'Kitchen · Ground floor',
        'Kitchen · First floor',
        'Bath',
        'Other…',
      ]);
    });

    it('keeps the plain name for a duplicate name without a parent', () => {
      setup({
        areas: [area('k1', 'Kitchen'), area('k2', 'Kitchen')],
        recentAreaIds: ['k1', 'k2'],
      });
      expect(chipLabels(areaRow())).toEqual(['Kitchen', 'Kitchen', 'Other…']);
    });

    it('selecting a chip reports its id; tapping the pressed chip reports null', async () => {
      const { props, rerender } = setup({ recentAreaIds: ['a1', 'a2'] });
      await userEvent.click(screen.getByTestId('tc-area-a2'));
      expect(props.onAreaChange).toHaveBeenLastCalledWith('a2');

      rerender(
        <TagCreateContext value={null}>
          <TagChips {...props} areaId="a2" />
        </TagCreateContext>,
      );
      await userEvent.click(screen.getByTestId('tc-area-a2'));
      expect(props.onAreaChange).toHaveBeenLastCalledWith(null);
    });
  });

  describe('Other… area picker', () => {
    it('names the chip "Other area…" and opens the picker dialog', async () => {
      setup({ recentAreaIds: ['a1'], areaId: 'a1' });
      await userEvent.click(screen.getByRole('button', { name: 'Other area…' }));
      const dialog = screen.getByRole('dialog', { name: 'Choose an area' });
      expect(within(dialog).getByTestId('area-picker')).toHaveAttribute('data-value', 'a1');
      expect(screen.getByTestId('tc-area-picker')).toBeInTheDocument();
    });

    it('selecting an area closes the dialog and reports it', async () => {
      const { props } = setup();
      await userEvent.click(screen.getByTestId('tc-area-__other'));
      await userEvent.click(screen.getByRole('button', { name: 'choose a9' }));
      expect(props.onAreaChange).toHaveBeenCalledWith('a9');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('clearing in the picker reports null', async () => {
      const { props } = setup({ areaId: 'a1' });
      await userEvent.click(screen.getByTestId('tc-area-__other'));
      await userEvent.click(screen.getByRole('button', { name: 'choose none' }));
      expect(props.onAreaChange).toHaveBeenCalledWith(null);
    });

    it('Escape closes it without a change and returns focus to the Other… chip that opened it', async () => {
      const { props } = setup({ recentAreaIds: ['a1'], areaId: 'a1' });
      await userEvent.click(screen.getByTestId('tc-area-__other'));
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(props.onAreaChange).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByTestId('tc-area-__other')).toHaveFocus());
    });

    it('opens as a Modal from 768px', async () => {
      media = installMatchMedia({ [WIDE]: true });
      setup();
      await userEvent.click(screen.getByTestId('tc-area-__other'));
      expect(screen.getByRole('dialog', { name: 'Choose an area' })).toBeInTheDocument();
      expect(screen.getByTestId('tc-area-picker')).toBeInTheDocument();
    });
  });

  describe('New area and New orientation', () => {
    it('hides both New chips without a provider', () => {
      setup();
      expect(screen.queryByRole('button', { name: 'New area' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'New orientation' })).not.toBeInTheDocument();
    });

    it('New area asks for a create dialog from the chip and selects the result', async () => {
      const request = mockRequest({ id: 'new-a', name: 'Pantry' });
      const { props } = setup({}, request);
      const chip = screen.getByRole('button', { name: 'New area' });
      await userEvent.click(chip);
      expect(request.mock.calls[0]![0]).toBe('area');
      expect(request.mock.calls[0]![1]).toBe(chip);
      await waitFor(() => expect(props.onAreaChange).toHaveBeenCalledWith('new-a'));
    });

    it('cancelling New area selects nothing', async () => {
      const request = mockRequest(null);
      const { props } = setup({}, request);
      await userEvent.click(screen.getByRole('button', { name: 'New area' }));
      await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(props.onAreaChange).not.toHaveBeenCalled();
    });

    it('New orientation asks for a create dialog from the chip and selects the result', async () => {
      const request = mockRequest({ id: 'new-o', name: 'South wall' });
      const { props } = setup({}, request);
      const chip = screen.getByRole('button', { name: 'New orientation' });
      await userEvent.click(chip);
      expect(request.mock.calls[0]![0]).toBe('orientation');
      expect(request.mock.calls[0]![1]).toBe(chip);
      await waitFor(() => expect(props.onOrientationChange).toHaveBeenCalledWith('new-o'));
    });

    it('cancelling New orientation selects nothing', async () => {
      const request = mockRequest(null);
      const { props } = setup({}, request);
      await userEvent.click(screen.getByRole('button', { name: 'New orientation' }));
      await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      await Promise.resolve();
      expect(props.onOrientationChange).not.toHaveBeenCalled();
    });

    it('the New chips are action chips: never pressed', () => {
      setup({}, mockRequest(null));
      expect(screen.getByRole('button', { name: 'New area' })).not.toHaveAttribute('aria-pressed');
      expect(screen.getByRole('button', { name: 'New orientation' })).not.toHaveAttribute(
        'aria-pressed',
      );
    });
  });

  describe('orientation chips', () => {
    it('lists up to eight orientations in sort order, then No orientation, with no Other…', () => {
      setup();
      expect(chipLabels(orientationRow())).toEqual([
        'North wall',
        'East wall',
        'Ceiling',
        'No orientation',
      ]);
    });

    it('lists exactly eight inline', () => {
      setup({ orientations: MANY_ORIENTATIONS.slice(0, 8) });
      expect(within(orientationRow()).queryByTestId('tc-orientation-__other')).toBeNull();
      expect(chipLabels(orientationRow())).toHaveLength(9);
    });

    it('with more than eight shows recents first (max six, filled from the list), then Other…', () => {
      setup({
        orientations: MANY_ORIENTATIONS,
        recentOrientationIds: ['m7', 'gone', 'm3', 'm7'],
      });
      expect(chipLabels(orientationRow())).toEqual([
        'Spot 7',
        'Spot 3',
        'Spot 1',
        'Spot 2',
        'Spot 4',
        'Spot 5',
        'Other…',
        'No orientation',
      ]);
    });

    it('keeps a chosen orientation outside the shown set visible', () => {
      setup({ orientations: MANY_ORIENTATIONS, orientationId: 'm10' });
      expect(screen.getByTestId('tc-orientation-m10')).toHaveAttribute('aria-pressed', 'true');
    });

    it('selecting a chip reports its id', async () => {
      const { props } = setup();
      await userEvent.click(screen.getByTestId('tc-orientation-o1'));
      expect(props.onOrientationChange).toHaveBeenCalledWith('o1');
    });

    it('No orientation reports "none" and shows pressed for "none"', async () => {
      const { props, rerender } = setup();
      await userEvent.click(screen.getByRole('button', { name: 'No orientation' }));
      expect(props.onOrientationChange).toHaveBeenLastCalledWith('none');

      rerender(
        <TagCreateContext value={null}>
          <TagChips {...props} orientationId="none" />
        </TagCreateContext>,
      );
      const none = screen.getByRole('button', { name: 'No orientation' });
      expect(none).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(none);
      expect(props.onOrientationChange).toHaveBeenLastCalledWith(null);
    });

    it('no chip is pressed when no orientation has been chosen', () => {
      setup();
      expect(within(orientationRow()).queryAllByRole('button', { pressed: true })).toHaveLength(0);
    });

    it('Other… opens the orientation picker; choosing closes it and reports the id', async () => {
      const { props } = setup({ orientations: MANY_ORIENTATIONS });
      await userEvent.click(screen.getByRole('button', { name: 'Other orientation…' }));
      const dialog = screen.getByRole('dialog', { name: 'Choose an orientation' });
      expect(within(dialog).getByTestId('orientation-picker')).toHaveAttribute('data-value', '');
      await userEvent.click(screen.getByRole('button', { name: 'choose o9' }));
      expect(props.onOrientationChange).toHaveBeenCalledWith('o9');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('the Other orientation picker gets the "no orientations configured" hint', async () => {
      setup({ orientations: MANY_ORIENTATIONS });
      await userEvent.click(screen.getByTestId('tc-orientation-__other'));
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute(
        'data-empty-hint',
        'No orientations configured. Add them in Settings › Project setup › Photo orientations.',
      );
    });

    it('the orientation picker shows the chosen name and never receives "none"', async () => {
      setup({ orientations: MANY_ORIENTATIONS, orientationId: 'm10' });
      await userEvent.click(screen.getByTestId('tc-orientation-__other'));
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-value', 'm10');
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-name', 'Spot 10');
    });

    it('clearing in the orientation picker reports null; "none" reaches it as empty', async () => {
      const { props } = setup({ orientations: MANY_ORIENTATIONS, orientationId: 'none' });
      await userEvent.click(screen.getByTestId('tc-orientation-__other'));
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-value', '');
      await userEvent.click(screen.getByRole('button', { name: 'choose no orientation' }));
      expect(props.onOrientationChange).toHaveBeenCalledWith(null);
    });

    it('Escape closes the orientation picker and returns focus to the Other… chip', async () => {
      setup({ orientations: MANY_ORIENTATIONS });
      await userEvent.click(screen.getByTestId('tc-orientation-__other'));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.getByTestId('tc-orientation-__other')).toHaveFocus());
    });
  });

  describe('presentation', () => {
    it('defaults to the default tone and wrap layout', () => {
      setup();
      expect(screen.getByTestId('tc-tag-chips')).toHaveAttribute('data-tone', 'default');
      expect(areaRow()).toHaveAttribute('data-layout', 'wrap');
      expect(orientationRow()).toHaveAttribute('data-layout', 'wrap');
      expect(areaRow()).toHaveAttribute('data-tone', 'default');
    });

    it('passes tone and layout through to the rows', () => {
      setup({ tone: 'onPhoto', layout: 'scroll' });
      expect(screen.getByTestId('tc-tag-chips')).toHaveAttribute('data-tone', 'onPhoto');
      expect(areaRow()).toHaveAttribute('data-layout', 'scroll');
      expect(areaRow()).toHaveAttribute('data-tone', 'onPhoto');
      expect(orientationRow()).toHaveAttribute('data-tone', 'onPhoto');
    });

    it('two mounts stay distinguishable by id prefix', () => {
      render(
        <>
          <TagChips
            areas={AREAS}
            orientations={FEW_ORIENTATIONS}
            recentAreaIds={['a1']}
            recentOrientationIds={[]}
            areaId={null}
            orientationId={null}
            onAreaChange={jest.fn()}
            onOrientationChange={jest.fn()}
            idPrefix="page"
          />
          <TagChips
            areas={AREAS}
            orientations={FEW_ORIENTATIONS}
            recentAreaIds={['a1']}
            recentOrientationIds={[]}
            areaId={null}
            orientationId={null}
            onAreaChange={jest.fn()}
            onOrientationChange={jest.fn()}
            idPrefix="camera"
          />
        </>,
      );
      expect(screen.getByTestId('page-area-a1')).toBeInTheDocument();
      expect(screen.getByTestId('camera-area-a1')).toBeInTheDocument();
      const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
      expect(new Set(ids).size).toBe(ids.length);
      const groups = screen.getAllByRole('group', { name: 'Area' });
      expect(groups).toHaveLength(2);
    });
  });
});
