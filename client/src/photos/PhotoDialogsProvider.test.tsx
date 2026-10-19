import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { Photo, UndoToken } from '@cornerstone/shared';
import type { PhotoDialogsContextValue } from './photoDialogsContext.js';
import type * as ProviderModule from './PhotoDialogsProvider.js';
import type * as HookModule from './usePhotoDialogs.js';

const SAVED_PHOTO = { id: 'p1', annotatedAt: '2026-09-11T10:00:00.000Z' } as unknown as Photo;
const UNDO: UndoToken = { token: 'tok-1', expiresAt: '2026-09-11T10:00:30.000Z' };

// Stand-ins for the two dialogs: a button per outcome, props echoed as data attributes.
jest.unstable_mockModule('../components/photos/PhotoStrip/PhotoAnnotateDialog.js', () => ({
  PhotoAnnotateDialog: (props: {
    photo: { id: string };
    onSaved: (photo: Photo) => void;
    onClose: () => void;
  }) => (
    <div data-testid="annotate-dialog" data-photo-id={props.photo.id}>
      <button type="button" onClick={() => props.onSaved(SAVED_PHOTO)}>
        annotate save
      </button>
      <button type="button" onClick={props.onClose}>
        annotate close
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../components/photos/PhotoStrip/PhotoBulkTagSheet.js', () => ({
  PhotoBulkTagSheet: (props: {
    photoIds: string[];
    areas: unknown[];
    onSaved: (result: { areaId: string; updated: number; undo: UndoToken }) => void;
    onCancel: () => void;
  }) => (
    <div
      data-testid="bulk-dialog"
      data-ids={props.photoIds.join(',')}
      data-areas={props.areas.length}
    >
      <button
        type="button"
        onClick={() => props.onSaved({ areaId: 'a1', updated: props.photoIds.length, undo: UNDO })}
      >
        bulk save
      </button>
      <button type="button" onClick={props.onCancel}>
        bulk cancel
      </button>
    </div>
  ),
}));

let PhotoDialogsProvider: typeof ProviderModule.PhotoDialogsProvider;
let usePhotoDialogs: typeof HookModule.usePhotoDialogs;

beforeAll(async () => {
  ({ PhotoDialogsProvider } = await import('./PhotoDialogsProvider.js'));
  ({ usePhotoDialogs } = await import('./usePhotoDialogs.js'));
});

function setup() {
  const ref: { current: PhotoDialogsContextValue | null } = { current: null };
  function Capture() {
    ref.current = usePhotoDialogs();
    return null;
  }
  const nav: { current: ((to: string) => void) | null } = { current: null };
  function Navigator() {
    const navigate = useNavigate();
    nav.current = (to) => void navigate(to);
    return null;
  }
  render(
    <MemoryRouter initialEntries={['/photos']}>
      <PhotoDialogsProvider>
        <Capture />
        <Navigator />
        <p>page content</p>
      </PhotoDialogsProvider>
    </MemoryRouter>,
  );
  const goTo = (to: string) => act(() => nav.current!(to));
  const returnFocusRef = createRef<HTMLElement>();
  const annotate = () =>
    ref.current!.annotate({
      photo: { id: 'p1', width: 800, height: 600 },
      returnFocusRef,
    });
  const bulkTag = (ids = ['a', 'b']) =>
    ref.current!.bulkTag({ photoIds: ids, areas: [], returnFocusRef });
  return { annotate, bulkTag, ref, goTo };
}

describe('PhotoDialogsProvider', () => {
  it('renders its children and no dialog until one is requested', () => {
    setup();
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.queryByTestId('annotate-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bulk-dialog')).not.toBeInTheDocument();
  });

  it('annotate: opens the annotate dialog with the photo and resolves with the saved photo', async () => {
    const { annotate } = setup();
    let result: Photo | null | undefined;
    act(() => {
      void annotate().then((r) => {
        result = r;
      });
    });

    expect(screen.getByTestId('annotate-dialog')).toHaveAttribute('data-photo-id', 'p1');
    fireEvent.click(screen.getByRole('button', { name: 'annotate save' }));

    await waitFor(() => expect(result).toBe(SAVED_PHOTO));
    expect(screen.queryByTestId('annotate-dialog')).not.toBeInTheDocument();
  });

  it('annotate: resolves with null and closes when cancelled', async () => {
    const { annotate } = setup();
    let result: Photo | null | undefined;
    act(() => {
      void annotate().then((r) => {
        result = r;
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'annotate close' }));

    await waitFor(() => expect(result).toBeNull());
    expect(screen.queryByTestId('annotate-dialog')).not.toBeInTheDocument();
  });

  it('bulkTag: opens the sheet with ids and areas and resolves with the result', async () => {
    const { bulkTag } = setup();
    let result: Awaited<ReturnType<PhotoDialogsContextValue['bulkTag']>> | undefined;
    act(() => {
      void bulkTag(['a', 'b', 'c']).then((r) => {
        result = r;
      });
    });

    expect(screen.getByTestId('bulk-dialog')).toHaveAttribute('data-ids', 'a,b,c');
    expect(screen.getByTestId('bulk-dialog')).toHaveAttribute('data-areas', '0');
    fireEvent.click(screen.getByRole('button', { name: 'bulk save' }));

    await waitFor(() => expect(result).toEqual({ areaId: 'a1', updated: 3, undo: UNDO }));
    expect(screen.queryByTestId('bulk-dialog')).not.toBeInTheDocument();
  });

  it('bulkTag: resolves with null when cancelled', async () => {
    const { bulkTag } = setup();
    let result: Awaited<ReturnType<PhotoDialogsContextValue['bulkTag']>> | undefined;
    act(() => {
      void bulkTag().then((r) => {
        result = r;
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'bulk cancel' }));

    await waitFor(() => expect(result).toBeNull());
    expect(screen.queryByTestId('bulk-dialog')).not.toBeInTheDocument();
  });

  it('a second request while one is open resolves the first with null and shows the second', async () => {
    const { annotate, bulkTag } = setup();
    let first: Photo | null | undefined;
    let second: Awaited<ReturnType<PhotoDialogsContextValue['bulkTag']>> | undefined;
    act(() => {
      void annotate().then((r) => {
        first = r;
      });
    });
    expect(screen.getByTestId('annotate-dialog')).toBeInTheDocument();

    act(() => {
      void bulkTag().then((r) => {
        second = r;
      });
    });

    await waitFor(() => expect(first).toBeNull());
    expect(screen.queryByTestId('annotate-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('bulk-dialog')).toBeInTheDocument();
    expect(second).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'bulk save' }));
    await waitFor(() => expect(second).toMatchObject({ updated: 2 }));
  });

  it('does not resolve an already finished request again when a new one opens', async () => {
    const { annotate, bulkTag } = setup();
    const firstResolved = jest.fn();
    act(() => {
      void annotate().then(firstResolved);
    });
    fireEvent.click(screen.getByRole('button', { name: 'annotate close' }));
    await waitFor(() => expect(firstResolved).toHaveBeenCalledTimes(1));

    act(() => {
      void bulkTag();
    });

    expect(screen.getByTestId('bulk-dialog')).toBeInTheDocument();
    expect(firstResolved).toHaveBeenCalledTimes(1);
  });
});

describe('PhotoDialogsProvider navigation', () => {
  it('closes an open Annotate dialog and resolves the request with null when the location changes', async () => {
    const { annotate, goTo } = setup();
    let result: Photo | null | undefined;
    act(() => {
      void annotate().then((r) => {
        result = r;
      });
    });
    expect(screen.getByTestId('annotate-dialog')).toBeInTheDocument();

    goTo('/diary/e-1');

    await waitFor(() => expect(result).toBeNull());
    expect(screen.queryByTestId('annotate-dialog')).not.toBeInTheDocument();
  });

  it('closes an open Set tags dialog and resolves the request with null when the location changes', async () => {
    const { bulkTag, goTo } = setup();
    let result: Awaited<ReturnType<PhotoDialogsContextValue['bulkTag']>> | undefined;
    act(() => {
      void bulkTag().then((r) => {
        result = r;
      });
    });
    expect(screen.getByTestId('bulk-dialog')).toBeInTheDocument();

    goTo('/areas');

    await waitFor(() => expect(result).toBeNull());
    expect(screen.queryByTestId('bulk-dialog')).not.toBeInTheDocument();
  });

  it('keeps a dialog open while the location stays the same', () => {
    const { bulkTag } = setup();
    act(() => {
      void bulkTag();
    });
    expect(screen.getByTestId('bulk-dialog')).toBeInTheDocument();
  });

  it('a dialog opened after a navigation belongs to the new location and stays open', async () => {
    const { bulkTag, goTo } = setup();
    goTo('/areas');
    act(() => {
      void bulkTag();
    });
    expect(screen.getByTestId('bulk-dialog')).toBeInTheDocument();
    goTo('/areas?x=1');
    await waitFor(() => expect(screen.queryByTestId('bulk-dialog')).not.toBeInTheDocument());
  });
});

describe('usePhotoDialogs without a provider', () => {
  it('throws "PhotoDialogsProvider missing" when a dialog is requested', () => {
    let value: PhotoDialogsContextValue | null = null;
    function Probe() {
      value = usePhotoDialogs();
      return null;
    }
    render(<Probe />);

    const returnFocusRef = createRef<HTMLElement>();
    expect(() =>
      value!.annotate({ photo: { id: 'p', width: 1, height: 1 }, returnFocusRef }),
    ).toThrow('PhotoDialogsProvider missing');
    expect(() => value!.bulkTag({ photoIds: ['p'], areas: [], returnFocusRef })).toThrow(
      'PhotoDialogsProvider missing',
    );
  });
});
