import { describe, it, expect, beforeAll, afterEach, beforeEach, jest } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UpdatePhotoTagsRequest, UpdatePhotoTagsResponse } from '@cornerstone/shared';
import { installMatchMedia } from '../../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../../test/matchMediaControl.js';
import { makeArea } from '../../../test/photoSpotFixtures.js';
import { ApiClientError, NetworkError } from '../../../lib/apiClient.js';
import type * as SheetModule from './PhotoBulkTagSheet.js';

const WIDE = '(min-width: 768px)';
const UNDO = { token: 'tok-1', expiresAt: '2026-09-11T10:00:30.000Z' };

const mockUpdatePhotoTags =
  jest.fn<(req: UpdatePhotoTagsRequest) => Promise<UpdatePhotoTagsResponse>>();
jest.unstable_mockModule('../../../lib/photoApi.js', () => ({
  updatePhotoTags: mockUpdatePhotoTags,
}));

// Light stand-ins for the pickers: they show the special options and the value, and let a
// test pick a concrete value or the "No area" / "No orientation" (empty) special.
jest.unstable_mockModule('../../AreaPicker/AreaPicker.js', () => ({
  AreaPicker: (props: {
    id?: string;
    value: string;
    disabled?: boolean;
    specialOptions?: Array<{ id: string; label: string }>;
    onChange: (id: string) => void;
  }) => (
    <div data-testid="area-picker" data-value={props.value}>
      <input id={props.id} aria-label="area input" disabled={props.disabled} readOnly />
      <span data-testid="area-specials">
        {(props.specialOptions ?? []).map((o) => `${o.id}=${o.label}`).join('|')}
      </span>
      <button type="button" onClick={() => props.onChange('area-2')}>
        pick area
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        clear area
      </button>
      <button type="button" onClick={() => props.onChange('__keep__')}>
        keep area
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../../OrientationPicker/OrientationPicker.js', () => ({
  OrientationPicker: (props: {
    id?: string;
    value: string;
    disabled?: boolean;
    specialOptions?: Array<{ id: string; label: string }>;
    onChange: (id: string) => void;
  }) => (
    <div data-testid="orientation-picker" data-value={props.value}>
      <span data-testid="orientation-specials">
        {(props.specialOptions ?? []).map((o) => `${o.id}=${o.label}`).join('|')}
      </span>
      <button type="button" onClick={() => props.onChange('ori-2')}>
        pick orientation
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        clear orientation
      </button>
    </div>
  ),
}));

describe('PhotoBulkTagSheet', () => {
  let PhotoBulkTagSheet: typeof SheetModule.PhotoBulkTagSheet;
  let media: MatchMediaControl | null = null;

  beforeAll(async () => {
    ({ PhotoBulkTagSheet } = await import('./PhotoBulkTagSheet.js'));
  });

  beforeEach(() => {
    mockUpdatePhotoTags.mockReset();
  });

  afterEach(() => {
    media?.restore();
    media = null;
  });

  function setup(overrides: Partial<SheetModule.PhotoBulkTagSheetProps> = {}) {
    const props: SheetModule.PhotoBulkTagSheetProps = {
      photoIds: ['p1', 'p2', 'p3'],
      areas: [makeArea('area-2', 'Kitchen')],
      onSaved: jest.fn(),
      onCancel: jest.fn(),
      returnFocusRef: createRef<HTMLElement>(),
      ...overrides,
    };
    const view = render(<PhotoBulkTagSheet {...props} />);
    return { props, ...view };
  }

  const save = () => screen.getByTestId('photo-bulk-tags-save');

  describe('container', () => {
    it('is a bottom Sheet below 768px titled with the photo count', () => {
      setup();
      expect(screen.getByRole('dialog', { name: 'Set tags for 3 photos' })).toBeInTheDocument();
      expect(screen.getByTestId('photo-bulk-tags')).toBeInTheDocument();
    });

    it('is a Modal from 768px with the same title and controls', () => {
      media = installMatchMedia({ [WIDE]: true });
      setup();
      expect(screen.getByRole('dialog', { name: 'Set tags for 3 photos' })).toBeInTheDocument();
      expect(screen.queryByTestId('photo-bulk-tags')).not.toBeInTheDocument();
      expect(save()).toBeInTheDocument();
    });

    it('uses the singular title for one photo', () => {
      setup({ photoIds: ['p1'] });
      expect(screen.getByRole('dialog', { name: 'Set tags for 1 photo' })).toBeInTheDocument();
    });

    it('uses a custom testIdPrefix', () => {
      setup({ testIdPrefix: 'my-bulk' });
      expect(screen.getByTestId('my-bulk-save')).toBeInTheDocument();
      expect(screen.getByTestId('my-bulk-cancel')).toBeInTheDocument();
    });

    it('puts initial focus on the area input', async () => {
      setup();
      await waitFor(() => expect(screen.getByLabelText('area input')).toHaveFocus());
    });
  });

  describe('Leave as is defaults', () => {
    it('starts both fields on Leave as is and explains the disabled Save with the hint', () => {
      setup();
      expect(screen.getByTestId('area-picker')).toHaveAttribute('data-value', '__keep__');
      expect(screen.getByTestId('orientation-picker')).toHaveAttribute('data-value', '__keep__');
      expect(save()).toBeDisabled();
      const hint = screen.getByText(/Choose an area, an orientation, or both/);
      expect(save()).toHaveAttribute('aria-describedby', hint.id);
    });

    it('passes the Leave as is special option to both pickers, and "No orientation" to the orientation one', () => {
      setup();
      expect(screen.getByTestId('area-specials')).toHaveTextContent('__keep__=Leave as is');
      expect(screen.getByTestId('orientation-specials')).toHaveTextContent(
        '__keep__=Leave as is|=No orientation',
      );
    });

    it('does not call the API when Save is clicked with nothing chosen', async () => {
      setup();
      fireEvent.click(save());
      expect(mockUpdatePhotoTags).not.toHaveBeenCalled();
    });

    it('disables Save again when the choice is put back to Leave as is', async () => {
      const user = userEvent.setup();
      setup();
      await user.click(screen.getByRole('button', { name: 'pick area' }));
      expect(save()).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'keep area' }));
      expect(save()).toBeDisabled();
    });
  });

  describe('payload', () => {
    beforeEach(() => {
      mockUpdatePhotoTags.mockResolvedValue({ updated: 3, undo: UNDO });
    });

    it('area only: sends photoIds and areaId, no orientationId key', async () => {
      const user = userEvent.setup();
      const { props } = setup();

      await user.click(screen.getByRole('button', { name: 'pick area' }));
      await user.click(save());

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
      expect(mockUpdatePhotoTags).toHaveBeenCalledWith({
        photoIds: ['p1', 'p2', 'p3'],
        areaId: 'area-2',
      });
      expect(Object.keys(mockUpdatePhotoTags.mock.calls[0]![0])).toEqual(['photoIds', 'areaId']);
      expect(props.onSaved).toHaveBeenCalledWith({ areaId: 'area-2', updated: 3, undo: UNDO });
    });

    it('orientation only: sends orientationId, no areaId key', async () => {
      const user = userEvent.setup();
      const { props } = setup();

      await user.click(screen.getByRole('button', { name: 'pick orientation' }));
      await user.click(save());

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
      expect(mockUpdatePhotoTags).toHaveBeenCalledWith({
        photoIds: ['p1', 'p2', 'p3'],
        orientationId: 'ori-2',
      });
      expect(Object.keys(mockUpdatePhotoTags.mock.calls[0]![0])).toEqual([
        'photoIds',
        'orientationId',
      ]);
      expect(props.onSaved).toHaveBeenCalledWith({
        orientationId: 'ori-2',
        updated: 3,
        undo: UNDO,
      });
    });

    it('"No orientation" sends orientationId null (clears it)', async () => {
      const user = userEvent.setup();
      const { props } = setup();

      await user.click(screen.getByRole('button', { name: 'clear orientation' }));
      await user.click(save());

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
      expect(mockUpdatePhotoTags).toHaveBeenCalledWith({
        photoIds: ['p1', 'p2', 'p3'],
        orientationId: null,
      });
      expect(props.onSaved).toHaveBeenCalledWith({ orientationId: null, updated: 3, undo: UNDO });
    });

    it('an emptied area sends areaId null', async () => {
      const user = userEvent.setup();
      setup();

      await user.click(screen.getByRole('button', { name: 'clear area' }));
      await user.click(save());

      await waitFor(() => expect(mockUpdatePhotoTags).toHaveBeenCalledTimes(1));
      expect(mockUpdatePhotoTags).toHaveBeenCalledWith({
        photoIds: ['p1', 'p2', 'p3'],
        areaId: null,
      });
    });

    it('both fields: sends both keys', async () => {
      const user = userEvent.setup();
      const { props } = setup();

      await user.click(screen.getByRole('button', { name: 'pick area' }));
      await user.click(screen.getByRole('button', { name: 'pick orientation' }));
      await user.click(save());

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
      expect(mockUpdatePhotoTags).toHaveBeenCalledWith({
        photoIds: ['p1', 'p2', 'p3'],
        areaId: 'area-2',
        orientationId: 'ori-2',
      });
      expect(props.onSaved).toHaveBeenCalledWith({
        areaId: 'area-2',
        orientationId: 'ori-2',
        updated: 3,
        undo: UNDO,
      });
    });
  });

  describe('busy and errors', () => {
    it('shows Saving..., disables both buttons and blocks a second request while in flight', async () => {
      let resolve!: (value: UpdatePhotoTagsResponse) => void;
      mockUpdatePhotoTags.mockReturnValue(
        new Promise<UpdatePhotoTagsResponse>((r) => {
          resolve = r;
        }),
      );
      const user = userEvent.setup();
      const { props } = setup();

      await user.click(screen.getByRole('button', { name: 'pick area' }));
      await user.click(save());

      expect(save()).toHaveTextContent('Saving…');
      expect(save()).toBeDisabled();
      expect(screen.getByTestId('photo-bulk-tags-cancel')).toBeDisabled();
      expect(screen.getByLabelText('area input')).toBeDisabled();
      expect(mockUpdatePhotoTags).toHaveBeenCalledTimes(1);

      resolve({ updated: 3, undo: UNDO });
      await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    });

    it('keeps the choices and shows the translated message on an API error', async () => {
      mockUpdatePhotoTags.mockRejectedValue(
        new ApiClientError(403, { code: 'IMMUTABLE_ENTRY', message: 'locked' }),
      );
      const user = userEvent.setup();
      const { props } = setup();

      await user.click(screen.getByRole('button', { name: 'pick area' }));
      await user.click(save());

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('alert')).not.toHaveTextContent('IMMUTABLE_ENTRY');
      expect(props.onSaved).not.toHaveBeenCalled();
      expect(screen.getByTestId('area-picker')).toHaveAttribute('data-value', 'area-2');
      expect(save()).toBeEnabled();
      expect(save()).toHaveTextContent('Save');
    });

    it('shows the generic "nothing was changed" message for a non-API error', async () => {
      mockUpdatePhotoTags.mockRejectedValue(new NetworkError('offline', null));
      const user = userEvent.setup();
      setup();

      await user.click(screen.getByRole('button', { name: 'pick orientation' }));
      await user.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The tags could not be saved. Nothing was changed.',
      );
    });

    it('clears the error when Save is tried again', async () => {
      mockUpdatePhotoTags.mockRejectedValueOnce(new NetworkError('offline', null));
      mockUpdatePhotoTags.mockResolvedValueOnce({ updated: 3, undo: UNDO });
      const user = userEvent.setup();
      const { props } = setup();

      await user.click(screen.getByRole('button', { name: 'pick orientation' }));
      await user.click(save());
      await screen.findByRole('alert');
      await user.click(save());

      await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('cancel', () => {
    it('Cancel calls onCancel without a request', async () => {
      const user = userEvent.setup();
      const { props } = setup();
      await user.click(screen.getByTestId('photo-bulk-tags-cancel'));
      expect(props.onCancel).toHaveBeenCalledTimes(1);
      expect(mockUpdatePhotoTags).not.toHaveBeenCalled();
    });

    it('Escape cancels from the dialog', async () => {
      const user = userEvent.setup();
      const { props } = setup();
      await user.keyboard('{Escape}');
      expect(props.onCancel).toHaveBeenCalled();
    });

    it('the wide Modal cancels through its Cancel button too', async () => {
      media = installMatchMedia({ [WIDE]: true });
      const user = userEvent.setup();
      const { props } = setup();
      await user.click(screen.getByTestId('photo-bulk-tags-cancel'));
      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
