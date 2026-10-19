import { describe, it, expect, beforeAll, afterEach, jest } from '@jest/globals';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AreaResponse, OrientationResponse, Photo } from '@cornerstone/shared';
import { installMatchMedia } from '../../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../../test/matchMediaControl.js';
import type * as SheetModule from './PhotoTagSheet.js';

// Light stand-ins for the search pickers: a button that picks, a button that clears.
jest.unstable_mockModule('../../AreaPicker/AreaPicker.js', () => ({
  AreaPicker: (props: {
    id?: string;
    value: string;
    nullLabel?: string;
    onChange: (id: string) => void;
  }) => (
    <div data-testid="area-picker" data-id={props.id} data-value={props.value}>
      <span>{props.nullLabel}</span>
      <button type="button" onClick={() => props.onChange('area-2')}>
        pick area
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        clear area
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../../OrientationPicker/OrientationPicker.js', () => ({
  OrientationPicker: (props: {
    id?: string;
    value: string;
    initialOrientationName?: string;
    emptyHint?: string;
    onChange: (id: string) => void;
  }) => (
    <div
      data-testid="orientation-picker"
      data-empty-hint={props.emptyHint ?? ''}
      data-id={props.id}
      data-value={props.value}
      data-name={props.initialOrientationName ?? ''}
    >
      <button type="button" onClick={() => props.onChange('ori-2')}>
        pick orientation
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        clear orientation
      </button>
    </div>
  ),
}));

const WIDE = '(min-width: 768px)';

function serverPhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'p1',
    entityType: 'diary_entry',
    entityId: 'e1',
    originalFilename: 'a.jpg',
    mimeType: 'image/jpeg',
    fileSize: 100,
    width: 800,
    height: 600,
    takenAt: null,
    caption: null,
    areaId: null,
    orientationId: null,
    orientation: null,
    sortOrder: 0,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    annotatedAt: null,
    fileUrl: '/api/photos/p1/file',
    thumbnailUrl: '/api/photos/p1/thumbnail',
    ...overrides,
  };
}

function photoOf(overrides: Partial<SheetModule.PhotoTagSheetPhoto> = {}) {
  return {
    key: 'k1',
    previewUrl: 'blob:preview-1',
    areaId: null,
    orientationId: null,
    caption: null,
    uploaded: true,
    annotated: false,
    serverPhoto: serverPhoto(),
    ...overrides,
  } satisfies SheetModule.PhotoTagSheetPhoto;
}

const areas: AreaResponse[] = [];
const orientations: OrientationResponse[] = [
  {
    id: 'ori-1',
    name: 'North wall',
    description: null,
    sortOrder: 0,
  } as unknown as OrientationResponse,
];

describe('PhotoTagSheet', () => {
  let PhotoTagSheet: typeof SheetModule.PhotoTagSheet;
  let media: MatchMediaControl | null = null;

  beforeAll(async () => {
    ({ PhotoTagSheet } = await import('./PhotoTagSheet.js'));
  });

  afterEach(() => {
    media?.restore();
    media = null;
  });

  function setup(
    overrides: Partial<SheetModule.PhotoTagSheetProps> = {},
    callOrder: string[] = [],
  ) {
    const props: SheetModule.PhotoTagSheetProps = {
      open: true,
      index: 2,
      total: 5,
      photo: photoOf(),
      areas,
      onAreaChange: jest.fn(),
      onOrientationChange: jest.fn(),
      onCaptionCommit: jest.fn((c: string | null) => {
        callOrder.push(`commit:${c}`);
      }),
      onAnnotate: jest.fn(),
      onRemove: jest.fn(),
      onPrevious: jest.fn(() => {
        callOrder.push('previous');
      }),
      onNext: jest.fn(() => {
        callOrder.push('next');
      }),
      onClose: jest.fn(() => {
        callOrder.push('close');
      }),
      returnFocusRef: createRef<HTMLElement>(),
      ...overrides,
    };
    const view = render(<PhotoTagSheet {...props} />);
    return { props, callOrder, ...view };
  }

  describe('container', () => {
    it('is a bottom Sheet below 768px, titled "Photo 3 of 5" from a zero-based index', () => {
      setup();
      expect(screen.getByRole('dialog', { name: 'Photo 3 of 5' })).toBeInTheDocument();
      expect(screen.getByTestId('photo-sheet')).toBeInTheDocument();
    });

    it('is a Modal from 768px with the same title and controls', () => {
      media = installMatchMedia({ [WIDE]: true });
      setup();
      expect(screen.getByRole('dialog', { name: 'Photo 3 of 5' })).toBeInTheDocument();
      expect(screen.queryByTestId('photo-sheet')).not.toBeInTheDocument();
      expect(screen.getByTestId('photo-sheet-caption')).toBeInTheDocument();
      expect(screen.getByTestId('photo-sheet-done')).toBeInTheDocument();
    });

    it('renders no dialog while closed (wide)', () => {
      media = installMatchMedia({ [WIDE]: true });
      setup({ open: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('exposes no dialog while closed (sheet)', () => {
      setup({ open: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows the photo preview and puts initial focus on the caption', () => {
      setup();
      expect(screen.getByTestId('photo-sheet-preview')).toHaveAttribute('src', 'blob:preview-1');
      expect(screen.getByTestId('photo-sheet-caption')).toHaveFocus();
    });

    it('uses a custom testIdPrefix for every control', () => {
      setup({ testIdPrefix: 'cap-sheet' });
      for (const part of ['previous', 'next', 'done', 'caption', 'annotate', 'remove', 'preview']) {
        expect(screen.getByTestId(`cap-sheet-${part}`)).toBeInTheDocument();
        expect(screen.queryByTestId(`photo-sheet-${part}`)).not.toBeInTheDocument();
      }
    });

    it('labels each control and gives the pickers distinct ids', () => {
      setup();
      expect(screen.getByLabelText('Caption (optional)')).toBe(
        screen.getByTestId('photo-sheet-caption'),
      );
      const areaId = screen.getByTestId('area-picker').getAttribute('data-id');
      const orientationId = screen.getByTestId('orientation-picker').getAttribute('data-id');
      expect(areaId).toBeTruthy();
      expect(orientationId).toBeTruthy();
      expect(areaId).not.toBe(orientationId);
      expect(screen.getByText('No area')).toBeInTheDocument();
    });
  });

  describe('previous and next', () => {
    it('are enabled in the middle and call the handlers', async () => {
      const { props } = setup();
      const previous = screen.getByRole('button', { name: 'Previous photo' });
      const next = screen.getByRole('button', { name: 'Next photo' });
      expect(previous).not.toHaveAttribute('aria-disabled');
      expect(next).not.toHaveAttribute('aria-disabled');
      await userEvent.click(previous);
      await userEvent.click(next);
      expect(props.onPrevious).toHaveBeenCalledTimes(1);
      expect(props.onNext).toHaveBeenCalledTimes(1);
    });

    it('Previous is aria-disabled on the first photo and does nothing', async () => {
      const { props } = setup({ index: 0 });
      const previous = screen.getByRole('button', { name: 'Previous photo' });
      expect(previous).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(previous);
      expect(props.onPrevious).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Next photo' })).not.toHaveAttribute(
        'aria-disabled',
      );
    });

    it('Next is aria-disabled on the last photo and does nothing', async () => {
      const { props } = setup({ index: 4 });
      const next = screen.getByRole('button', { name: 'Next photo' });
      expect(next).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(next);
      expect(props.onNext).not.toHaveBeenCalled();
    });

    it('a single photo disables both', () => {
      setup({ index: 0, total: 1 });
      expect(screen.getByRole('button', { name: 'Previous photo' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Next photo' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('stay focusable (aria-disabled, not disabled)', () => {
      setup({ index: 0 });
      expect(screen.getByRole('button', { name: 'Previous photo' })).not.toBeDisabled();
    });
  });

  describe('caption', () => {
    it('starts from the stored caption', () => {
      setup({ photo: photoOf({ caption: 'Cracked tile' }) });
      expect(screen.getByTestId('photo-sheet-caption')).toHaveValue('Cracked tile');
    });

    it('commits the trimmed text on blur', async () => {
      const { props } = setup();
      await userEvent.type(screen.getByTestId('photo-sheet-caption'), '  Water stain ');
      expect(props.onCaptionCommit).not.toHaveBeenCalled();
      await userEvent.tab();
      expect(props.onCaptionCommit).toHaveBeenCalledTimes(1);
      expect(props.onCaptionCommit).toHaveBeenCalledWith('Water stain');
    });

    it('does not commit an unchanged caption', async () => {
      const { props } = setup({ photo: photoOf({ caption: 'Same' }) });
      screen.getByTestId('photo-sheet-caption').focus();
      await userEvent.tab();
      expect(props.onCaptionCommit).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only edit of an empty caption as unchanged', async () => {
      const { props } = setup();
      await userEvent.type(screen.getByTestId('photo-sheet-caption'), '   ');
      await userEvent.tab();
      expect(props.onCaptionCommit).not.toHaveBeenCalled();
    });

    it('commits null when the caption is cleared', async () => {
      const { props } = setup({ photo: photoOf({ caption: 'Old' }) });
      await userEvent.clear(screen.getByTestId('photo-sheet-caption'));
      await userEvent.tab();
      expect(props.onCaptionCommit).toHaveBeenCalledWith(null);
    });

    it('Done commits the edit, then closes', async () => {
      const { props, callOrder } = setup();
      await userEvent.type(screen.getByTestId('photo-sheet-caption'), 'Hello');
      await userEvent.click(screen.getByTestId('photo-sheet-done'));
      expect(props.onClose).toHaveBeenCalledTimes(1);
      // The click's blur commits first; Done may repeat the same idempotent value.
      expect(new Set(callOrder.filter((c) => c.startsWith('commit')))).toEqual(
        new Set(['commit:Hello']),
      );
      expect(callOrder.indexOf('commit:Hello')).toBeLessThan(callOrder.indexOf('close'));
    });

    it('Escape commits the edit, then closes', async () => {
      const { props, callOrder } = setup();
      await userEvent.type(screen.getByTestId('photo-sheet-caption'), 'Esc text');
      await userEvent.keyboard('{Escape}');
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(callOrder[0]).toBe('commit:Esc text');
      expect(callOrder).toContain('close');
    });

    it('the backdrop commits the edit, then closes', async () => {
      const { props, callOrder } = setup();
      await userEvent.type(screen.getByTestId('photo-sheet-caption'), 'Back');
      await userEvent.click(screen.getByTestId('photo-sheet-backdrop'));
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(callOrder.indexOf('commit:Back')).toBeLessThan(callOrder.indexOf('close'));
    });

    it('commits before stepping to Previous and to Next', async () => {
      const { props, callOrder } = setup();
      const caption = screen.getByTestId('photo-sheet-caption');
      await userEvent.type(caption, 'one');
      await userEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
      expect(props.onPrevious).toHaveBeenCalledTimes(1);
      expect(callOrder.indexOf('commit:one')).toBeLessThan(callOrder.indexOf('previous'));

      callOrder.length = 0;
      await userEvent.type(caption, 'two');
      await userEvent.click(screen.getByRole('button', { name: 'Next photo' }));
      expect(props.onNext).toHaveBeenCalledTimes(1);
      expect(callOrder.indexOf('commit:onetwo')).toBeLessThan(callOrder.indexOf('next'));
    });

    it('commits through the Modal close button as well (wide)', async () => {
      media = installMatchMedia({ [WIDE]: true });
      const { props, callOrder } = setup();
      await userEvent.type(screen.getByTestId('photo-sheet-caption'), 'Wide');
      await userEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(callOrder.indexOf('commit:Wide')).toBeLessThan(callOrder.indexOf('close'));
    });

    it('shows the new photo caption, not the old draft, after stepping to another photo', async () => {
      const { rerender, props } = setup({ photo: photoOf({ caption: 'First' }) });
      await userEvent.type(screen.getByTestId('photo-sheet-caption'), ' edited');
      rerender(<PhotoTagSheet {...props} photo={photoOf({ key: 'k2', caption: 'Second' })} />);
      expect(screen.getByTestId('photo-sheet-caption')).toHaveValue('Second');
    });
  });

  describe('area and orientation', () => {
    it('reports a picked area and null when cleared', async () => {
      const { props } = setup({ photo: photoOf({ areaId: 'area-1' }) });
      expect(screen.getByTestId('area-picker')).toHaveAttribute('data-value', 'area-1');
      await userEvent.click(screen.getByRole('button', { name: 'pick area' }));
      expect(props.onAreaChange).toHaveBeenLastCalledWith('area-2');
      await userEvent.click(screen.getByRole('button', { name: 'clear area' }));
      expect(props.onAreaChange).toHaveBeenLastCalledWith(null);
    });

    it('reports a picked orientation and null when cleared', async () => {
      const { props } = setup({ photo: photoOf({ orientationId: 'ori-1' }) });
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-value', 'ori-1');
      await userEvent.click(screen.getByRole('button', { name: 'pick orientation' }));
      expect(props.onOrientationChange).toHaveBeenLastCalledWith('ori-2');
      await userEvent.click(screen.getByRole('button', { name: 'clear orientation' }));
      expect(props.onOrientationChange).toHaveBeenLastCalledWith(null);
    });

    it('passes empty values for an untagged photo', () => {
      setup();
      expect(screen.getByTestId('area-picker')).toHaveAttribute('data-value', '');
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-value', '');
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-name', '');
    });

    it('names a saved photo orientation from the server record', () => {
      setup({
        photo: photoOf({
          orientationId: 'ori-1',
          serverPhoto: serverPhoto({
            orientationId: 'ori-1',
            orientation: { id: 'ori-1', name: 'Server name' } as Photo['orientation'],
          }),
        }),
        orientations,
      });
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-name', 'Server name');
    });

    it('names a pending photo orientation from the optional orientations list', () => {
      setup({
        photo: photoOf({ orientationId: 'ori-1', serverPhoto: null, uploaded: false }),
        orientations,
      });
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-name', 'North wall');
    });

    it('works without the orientations list', () => {
      setup({ photo: photoOf({ orientationId: 'ori-1', serverPhoto: null, uploaded: false }) });
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-name', '');
    });
  });

  describe('orientation empty hint', () => {
    it('passes the "no orientations configured" hint to the orientation picker', () => {
      setup();
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute(
        'data-empty-hint',
        'No orientations configured. Add them in Settings → Orientations.',
      );
    });
  });

  describe('Annotate', () => {
    it('is aria-disabled with the wait reason until the photo is uploaded', async () => {
      const { props } = setup({ photo: photoOf({ uploaded: false, serverPhoto: null }) });
      const annotate = screen.getByTestId('photo-sheet-annotate');
      expect(annotate).toHaveAttribute('aria-disabled', 'true');
      expect(annotate).toHaveAccessibleDescription('Wait for the upload to finish.');
      expect(screen.getByText('Wait for the upload to finish.')).toBeVisible();
      await userEvent.click(annotate);
      expect(props.onAnnotate).not.toHaveBeenCalled();
    });

    it('explains missing dimensions on an uploaded photo', async () => {
      const { props } = setup({
        photo: photoOf({ serverPhoto: serverPhoto({ width: null, height: null }) }),
      });
      const annotate = screen.getByTestId('photo-sheet-annotate');
      expect(annotate).toHaveAttribute('aria-disabled', 'true');
      expect(annotate).toHaveAccessibleDescription('Cannot annotate: photo dimensions are missing');
      await userEvent.click(annotate);
      expect(props.onAnnotate).not.toHaveBeenCalled();
    });

    it('a single missing dimension is enough to block', () => {
      setup({ photo: photoOf({ serverPhoto: serverPhoto({ height: null }) }) });
      expect(screen.getByTestId('photo-sheet-annotate')).toHaveAttribute('aria-disabled', 'true');
    });

    it('is enabled without a reason once uploaded with dimensions, and calls onAnnotate', async () => {
      const { props } = setup();
      const annotate = screen.getByTestId('photo-sheet-annotate');
      expect(annotate).not.toHaveAttribute('aria-disabled');
      expect(annotate).not.toHaveAttribute('aria-describedby');
      await userEvent.click(annotate);
      expect(props.onAnnotate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Remove', () => {
    it('calls onRemove once and does not close or step', async () => {
      const { props } = setup();
      await userEvent.type(screen.getByTestId('photo-sheet-caption'), 'dirty');
      await userEvent.click(screen.getByTestId('photo-sheet-remove'));
      expect(props.onRemove).toHaveBeenCalledTimes(1);
      expect(props.onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('photo-sheet-remove')).toHaveTextContent('Remove photo');
    });
  });
});
