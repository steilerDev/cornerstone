/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useRef, useState } from 'react';
import type { AreaResponse, VendorListItem } from '@cornerstone/shared';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { TagCreateContext } from '../../objectForms/tagCreateContext.js';
import type { CreatedTag, RequestTagCreate } from '../../objectForms/tagCreateContext.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as OrientationApiTypes from '../../lib/orientationApi.js';
import type * as DialogModule from './EntityPickerDialog.js';
import type { EntityOption } from './types.js';

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockFetchOrientations = jest.fn<typeof OrientationApiTypes.fetchOrientations>();

// EntityPicker formats document dates, so it reads the locale.
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
  fetchVendor: mockFetchVendor,
}));
jest.unstable_mockModule('../../lib/orientationApi.js', () => ({
  fetchOrientations: mockFetchOrientations,
}));

const WIDE = '(min-width: 768px)';
const AREAS = [
  { id: 'a-1', name: 'Ground floor', parentId: null, sortOrder: 0 },
  { id: 'a-2', name: 'Hallway', parentId: 'a-1', sortOrder: 0 },
] as AreaResponse[];

describe('EntityPickerDialog', () => {
  let Dialog: typeof DialogModule.EntityPickerDialog;
  let media: MatchMediaControl;
  const onClose = jest.fn<() => void>();
  const onPick = jest.fn<(option: EntityOption) => void>();

  beforeEach(async () => {
    onClose.mockReset();
    onPick.mockReset();
    mockSearchCompanies.mockReset();
    mockSearchCompanies.mockResolvedValue([
      { id: 'c1', name: 'Alpha Build' },
      { id: 'c2', name: 'Beta Roofing' },
    ] as VendorListItem[]);
    mockFetchVendor.mockReset();
    mockFetchOrientations.mockReset();
    mockFetchOrientations.mockResolvedValue({
      orientations: [{ id: 'o-1', name: 'North', description: null }],
    } as never);
    media = installMatchMedia();
    if (!Dialog) ({ EntityPickerDialog: Dialog } = await import('./EntityPickerDialog.js'));
  });

  afterEach(() => {
    media.restore();
  });

  function setup(
    over: Partial<React.ComponentProps<typeof DialogModule.EntityPickerDialog>> = {},
    tagCreate: RequestTagCreate | null = null,
  ) {
    return render(
      <TagCreateContext value={tagCreate}>
        <Dialog
          open
          title="Choose a company"
          onClose={onClose}
          onPick={onPick}
          testId="picker-dialog"
          picker={{ kind: 'company', placeholder: 'Company name' }}
          {...over}
        />
      </TagCreateContext>,
    );
  }

  describe('layout', () => {
    it('is a titled Modal from 768px with the picker inside and the testId on its body', async () => {
      media.set(WIDE, true);
      setup();

      const dialog = await screen.findByRole('dialog', { name: 'Choose a company' });
      expect(dialog).toContainElement(screen.getByTestId('picker-dialog'));
      expect(screen.getByTestId('picker-dialog')).toContainElement(
        screen.getByPlaceholderText('Company name'),
      );
    });

    it('is a titled bottom Sheet below 768px and puts the testId on the sheet', async () => {
      setup();

      const dialog = await screen.findByRole('dialog', { name: 'Choose a company' });
      expect(screen.getByTestId('picker-dialog')).toBeInTheDocument();
      expect(dialog).toContainElement(screen.getByPlaceholderText('Company name'));
    });

    it('renders nothing from 768px while closed', () => {
      media.set(WIDE, true);
      setup({ open: false });

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByTestId('picker-dialog')).toBeNull();
    });

    it('does not mount the picker while the sheet is closed', () => {
      setup({ open: false });

      expect(screen.queryByPlaceholderText('Company name')).toBeNull();
    });

    it('works without a testId', async () => {
      media.set(WIDE, true);
      setup({ testId: undefined });

      expect(await screen.findByPlaceholderText('Company name')).toBeInTheDocument();
    });

    it('names the input after the dialog title, unless the host passes its own aria props', async () => {
      media.set(WIDE, true);
      const { unmount } = setup();
      expect(await screen.findByRole('textbox', { name: 'Choose a company' })).toBeInTheDocument();
      unmount();

      setup({
        picker: { kind: 'company', inputAriaProps: { 'aria-label': 'Which company' } },
      });
      expect(await screen.findByRole('textbox', { name: 'Which company' })).toBeInTheDocument();
    });

    it('focuses the picker input when the Sheet opens', async () => {
      setup();

      await screen.findByRole('textbox');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('focuses the picker input when the Modal opens', async () => {
      media.set(WIDE, true);
      setup();

      await screen.findByRole('textbox');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(screen.getByRole('textbox')).toHaveFocus();
    });
  });

  describe('picking', () => {
    it.each([
      ['Modal', true],
      ['Sheet', false],
    ])('hands the picked option over and closes (%s)', async (_name, wide) => {
      const user = userEvent.setup();
      media.set(WIDE, wide);
      setup();

      await user.click(await screen.findByPlaceholderText('Company name'));
      await user.click(await screen.findByRole('option', { name: 'Beta Roofing' }));

      expect(onPick).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c2', label: 'Beta Roofing', entityId: 'c2' }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('searches as the person types', async () => {
      const user = userEvent.setup();
      media.set(WIDE, true);
      setup();

      await user.type(await screen.findByPlaceholderText('Company name'), 'Alp');

      await waitFor(() =>
        expect(mockSearchCompanies).toHaveBeenLastCalledWith('Alp', expect.any(AbortSignal)),
      );
    });

    it('works for any kind: an orientation dialog lists and hands over orientations', async () => {
      const user = userEvent.setup();
      media.set(WIDE, true);
      setup({
        title: 'Choose an orientation',
        picker: { kind: 'orientation', emptyHint: 'No orientations yet' },
      });

      await user.click(await screen.findByRole('textbox', { name: 'Choose an orientation' }));
      await user.click(await screen.findByRole('option', { name: 'North' }));

      expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o-1', label: 'North' }));
    });

    it('works for the area kind with the host areas', async () => {
      const user = userEvent.setup();
      media.set(WIDE, true);
      setup({ title: 'Choose an area', picker: { kind: 'area', areas: AREAS } });

      await user.click(await screen.findByRole('textbox', { name: 'Choose an area' }));
      await user.click(await screen.findByRole('option', { name: 'Ground floor, Hallway' }));

      expect(onPick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'a-2',
          path: [
            { id: 'a-1', name: 'Ground floor' },
            { id: 'a-2', name: 'Hallway' },
          ],
        }),
      );
      expect(onClose).toHaveBeenCalled();
    });

    it('ignores a special option: nothing is handed over and the dialog stays open', async () => {
      const user = userEvent.setup();
      media.set(WIDE, true);
      setup({
        picker: {
          kind: 'company',
          placeholder: 'Company name',
          specialOptions: [{ id: '__other__', label: 'Other…' }],
        },
      });

      await user.click(await screen.findByPlaceholderText('Company name'));
      await user.click(await screen.findByRole('option', { name: 'Other…' }));

      expect(onPick).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on Escape', async () => {
      const user = userEvent.setup();
      media.set(WIDE, true);
      setup();
      await screen.findByRole('dialog');

      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape in an open list closes only the list, not the dialog', async () => {
      const user = userEvent.setup();
      media.set(WIDE, true);
      setup();
      await user.click(await screen.findByPlaceholderText('Company name'));
      await screen.findByRole('listbox');

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('listbox')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('while a create dialog is open', () => {
    function pendingCreate() {
      let finish!: (tag: CreatedTag | null) => void;
      const request = jest.fn<RequestTagCreate>(
        () => new Promise<CreatedTag | null>((resolve) => (finish = resolve)),
      );
      return { request, finish: (tag: CreatedTag | null) => finish(tag) };
    }

    async function startCreate(user: ReturnType<typeof userEvent.setup>) {
      await user.type(
        await screen.findByRole('textbox', { name: 'Choose an orientation' }),
        'East',
      );
      await user.click(await screen.findByRole('option', { name: 'New orientation East' }));
    }

    const orientationPicker = {
      title: 'Choose an orientation',
      picker: { kind: 'orientation' as const },
    };

    it.each([
      ['Modal', true],
      ['Sheet', false],
    ])('cannot be dismissed with Escape, and can again afterwards (%s)', async (_name, wide) => {
      const user = userEvent.setup();
      media.set(WIDE, wide);
      const { request, finish } = pendingCreate();
      setup(orientationPicker, request);

      await startCreate(user);
      await waitFor(() => expect(request).toHaveBeenCalled());
      await user.keyboard('{Escape}');
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => finish(null));
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
      await user.keyboard('{Escape}');
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('hands the created option over and closes', async () => {
      const user = userEvent.setup();
      media.set(WIDE, true);
      const { request, finish } = pendingCreate();
      setup(orientationPicker, request);

      await startCreate(user);
      await act(async () => finish({ id: 'o-new', name: 'East' }));

      await waitFor(() => expect(onPick).toHaveBeenCalledWith({ id: 'o-new', label: 'East' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('also reports the creating state to the host picker callback', async () => {
      const user = userEvent.setup();
      media.set(WIDE, true);
      const creating = jest.fn<(creating: boolean) => void>();
      const { request, finish } = pendingCreate();
      setup(
        {
          ...orientationPicker,
          picker: { kind: 'orientation', onCreatingChange: creating },
        },
        request,
      );

      await startCreate(user);
      await waitFor(() => expect(creating).toHaveBeenLastCalledWith(true));

      await act(async () => finish(null));
      await waitFor(() => expect(creating).toHaveBeenLastCalledWith(false));
    });
  });

  describe('focus', () => {
    function Host({ removeOpener }: { removeOpener: boolean }) {
      const [open, setOpen] = useState(false);
      const targetRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          {open && removeOpener ? null : (
            <button type="button" onClick={() => setOpen(true)}>
              open
            </button>
          )}
          <button type="button" ref={targetRef}>
            target
          </button>
          <Dialog
            open={open}
            title="Pick one"
            onClose={() => setOpen(false)}
            onPick={onPick}
            returnFocusRef={targetRef}
            testId="picker"
            picker={{ kind: 'company' }}
          />
        </>
      );
    }

    it.each([
      ['Modal', true],
      ['Sheet', false],
    ])('moves focus into the dialog and back to the opener on Escape (%s)', async (_n, wide) => {
      const user = userEvent.setup();
      media.set(WIDE, wide);
      render(<Host removeOpener={false} />);

      await user.click(screen.getByRole('button', { name: 'open' }));
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement),
      );
      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(screen.getByRole('button', { name: 'open' })).toHaveFocus());
    });

    it.each([
      ['Modal', true],
      ['Sheet', false],
    ])('falls back to returnFocusRef when the opener is gone (%s)', async (_n, wide) => {
      const user = userEvent.setup();
      media.set(WIDE, wide);
      render(<Host removeOpener />);

      await user.click(screen.getByRole('button', { name: 'open' }));
      await screen.findByRole('dialog');
      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.getByRole('button', { name: 'target' })).toHaveFocus());
    });

    it('accepts a returnFocusRef that points nowhere', async () => {
      media.set(WIDE, true);
      setup({ returnFocusRef: createRef<HTMLElement>() });

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
  });
});
