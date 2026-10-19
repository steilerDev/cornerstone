import { describe, it, expect, beforeAll, afterEach, jest } from '@jest/globals';
import { createRef, useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Photo } from '@cornerstone/shared';
import { installMatchMedia } from '../../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../../test/matchMediaControl.js';
import type * as DialogModule from './PhotoAnnotateDialog.js';

jest.unstable_mockModule('../PhotoAnnotator/PhotoAnnotator.js', () => ({
  PhotoAnnotator: (props: {
    photo: Photo;
    onSave: (photo: Photo) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="annotator" data-photo-id={props.photo.id}>
      <button type="button" onClick={() => props.onSave({ ...props.photo, annotatedAt: 'now' })}>
        save annotation
      </button>
      <button type="button" onClick={props.onCancel}>
        cancel annotation
      </button>
    </div>
  ),
}));

const WIDE = '(min-width: 768px)';

const photo = { id: 'p1', annotatedAt: null } as unknown as Photo;

describe('PhotoAnnotateDialog', () => {
  let PhotoAnnotateDialog: typeof DialogModule.PhotoAnnotateDialog;
  let media: MatchMediaControl | null = null;

  beforeAll(async () => {
    ({ PhotoAnnotateDialog } = await import('./PhotoAnnotateDialog.js'));
  });

  afterEach(() => {
    media?.restore();
    media = null;
  });

  function setup() {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const view = render(
      <PhotoAnnotateDialog
        photo={photo}
        onSaved={onSaved}
        onClose={onClose}
        returnFocusRef={createRef<HTMLElement>()}
      />,
    );
    return { onSaved, onClose, ...view };
  }

  it('hosts the annotator for the photo in a full-screen Sheet below 768px', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Annotate photo' })).toBeInTheDocument();
    expect(screen.getByTestId('photo-annotate-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('photo-annotate-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('annotator')).toHaveAttribute('data-photo-id', 'p1');
  });

  it('hosts the annotator in a Modal from 768px', () => {
    media = installMatchMedia({ [WIDE]: true });
    setup();
    expect(screen.getByRole('dialog', { name: 'Annotate photo' })).toBeInTheDocument();
    expect(screen.queryByTestId('photo-annotate-sheet')).not.toBeInTheDocument();
    expect(screen.getByTestId('annotator')).toBeInTheDocument();
  });

  it.each([
    ['sheet', false],
    ['modal', true],
  ])('passes a saved photo to onSaved (%s)', async (_name, wide) => {
    media = installMatchMedia({ [WIDE]: wide });
    const { onSaved, onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'save annotation' }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', annotatedAt: 'now' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ['sheet', false],
    ['modal', true],
  ])('annotator Cancel calls onClose (%s)', async (_name, wide) => {
    media = installMatchMedia({ [WIDE]: wide });
    const { onSaved, onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'cancel annotation' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each([
    ['sheet', false],
    ['modal', true],
  ])('Escape calls onClose (%s)', async (_name, wide) => {
    media = installMatchMedia({ [WIDE]: wide });
    const { onClose } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('focus return', () => {
    function Host({ wide }: { wide: boolean }) {
      void wide;
      const [open, setOpen] = useState(false);
      const openerRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={openerRef} type="button" onClick={() => setOpen(true)}>
            open annotate
          </button>
          {open ? (
            <PhotoAnnotateDialog
              photo={photo}
              onSaved={() => setOpen(false)}
              onClose={() => setOpen(false)}
              returnFocusRef={openerRef}
            />
          ) : null}
        </>
      );
    }

    it.each([
      ['sheet', false],
      ['modal', true],
    ])('returns focus to the opener after Cancel (%s)', async (_name, wide) => {
      media = installMatchMedia({ [WIDE]: wide });
      render(<Host wide={wide} />);
      const opener = screen.getByRole('button', { name: 'open annotate' });
      await userEvent.click(opener);
      expect(screen.getByTestId('annotator')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'cancel annotation' }));

      expect(screen.queryByTestId('annotator')).not.toBeInTheDocument();
      await waitFor(() => expect(opener).toHaveFocus());
    });
  });
});
