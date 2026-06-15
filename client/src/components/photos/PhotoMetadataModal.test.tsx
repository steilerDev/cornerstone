/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { AreaResponse } from '@cornerstone/shared';
import type { PhotoMetadataModalProps } from './PhotoMetadataModal.js';

// Captured onChange handlers from mocked pickers
let capturedAreaOnChange: ((id: string) => void) | null = null;
let capturedOrientationOnChange: ((id: string) => void) | null = null;

jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock Modal to render children directly so we can assert on form content
jest.unstable_mockModule('../Modal/Modal.js', () => ({
  Modal: ({
    title,
    onClose,
    children,
  }: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="modal" data-title={title}>
      <button data-testid="modal-close" onClick={onClose}>
        X
      </button>
      {children}
    </div>
  ),
}));

// Mock AreaPicker — captures onChange so tests can simulate selection
jest.unstable_mockModule('../AreaPicker/AreaPicker.js', () => ({
  AreaPicker: (props: { areas: AreaResponse[]; value: string; onChange: (id: string) => void; nullable?: boolean }) => {
    capturedAreaOnChange = props.onChange;
    return (
      <div
        data-testid="area-picker"
        data-value={props.value}
        data-nullable={String(props.nullable)}
      />
    );
  },
}));

// Mock OrientationPicker — captures onChange so tests can simulate selection
jest.unstable_mockModule('../OrientationPicker/index.js', () => ({
  OrientationPicker: (props: { value: string; onChange: (id: string) => void; nullable?: boolean }) => {
    capturedOrientationOnChange = props.onChange;
    return (
      <div
        data-testid="orientation-picker"
        data-value={props.value}
        data-nullable={String(props.nullable)}
      />
    );
  },
}));

let PhotoMetadataModal: React.ComponentType<PhotoMetadataModalProps>;

beforeEach(async () => {
  if (!PhotoMetadataModal) {
    const mod = await import('./PhotoMetadataModal.js');
    PhotoMetadataModal = mod.PhotoMetadataModal;
  }
  capturedAreaOnChange = null;
  capturedOrientationOnChange = null;
  jest.clearAllMocks();
});

function makeFile(name = 'photo.jpg'): File {
  return new File(['img'], name, { type: 'image/jpeg' });
}

function makeAreas(): AreaResponse[] {
  return [
    {
      id: 'area-1',
      name: 'Kitchen',
      parentId: null,
      color: null,
      description: null,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
}

function renderModal(props: Partial<PhotoMetadataModalProps> = {}) {
  const defaults: PhotoMetadataModalProps = {
    file: makeFile(),
    entityType: 'work_item',
    areas: makeAreas(),
    onSave: jest.fn<
      (metadata: { caption: string | null; areaId: string | null; orientationId: string | null }) => void
    >(),
    onCancel: jest.fn<() => void>(),
  };
  return render(<PhotoMetadataModal {...defaults} {...props} />);
}

describe('PhotoMetadataModal', () => {
  it('renders with title from translation key photoMetadataModal.title', () => {
    renderModal();
    const modal = screen.getByTestId('modal');
    expect(modal.getAttribute('data-title')).toBe('photoMetadataModal.title');
  });

  it('renders the description textarea with id="modal-photo-caption"', () => {
    renderModal();
    const textarea = document.getElementById('modal-photo-caption');
    expect(textarea).not.toBeNull();
    expect(textarea!.tagName.toLowerCase()).toBe('textarea');
  });

  it('renders the AreaPicker with nullable=true', () => {
    renderModal();
    const picker = screen.getByTestId('area-picker');
    expect(picker.getAttribute('data-nullable')).toBe('true');
  });

  it('renders the OrientationPicker with nullable=true', () => {
    renderModal();
    const picker = screen.getByTestId('orientation-picker');
    expect(picker.getAttribute('data-nullable')).toBe('true');
  });

  it('onSave is called with all nulls when fields are empty', () => {
    const onSave = jest.fn<PhotoMetadataModalProps['onSave']>();
    renderModal({ onSave });

    fireEvent.click(screen.getByText('photoMetadataModal.saveAndUpload'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ caption: null, areaId: null, orientationId: null });
  });

  it('onSave is called with caption when description textarea is filled', () => {
    const onSave = jest.fn<PhotoMetadataModalProps['onSave']>();
    renderModal({ onSave });

    const textarea = document.getElementById('modal-photo-caption') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Nice view' } });
    fireEvent.click(screen.getByText('photoMetadataModal.saveAndUpload'));

    expect(onSave).toHaveBeenCalledWith({
      caption: 'Nice view',
      areaId: null,
      orientationId: null,
    });
  });

  it('onSave is called with areaId when area is selected', () => {
    const onSave = jest.fn<PhotoMetadataModalProps['onSave']>();
    renderModal({ onSave });

    act(() => {
      capturedAreaOnChange?.('area-1');
    });
    fireEvent.click(screen.getByText('photoMetadataModal.saveAndUpload'));

    expect(onSave).toHaveBeenCalledWith({
      caption: null,
      areaId: 'area-1',
      orientationId: null,
    });
  });

  it('onSave is called with orientationId when orientation is selected', () => {
    const onSave = jest.fn<PhotoMetadataModalProps['onSave']>();
    renderModal({ onSave });

    act(() => {
      capturedOrientationOnChange?.('orient-1');
    });
    fireEvent.click(screen.getByText('photoMetadataModal.saveAndUpload'));

    expect(onSave).toHaveBeenCalledWith({
      caption: null,
      areaId: null,
      orientationId: 'orient-1',
    });
  });

  it('cancel button calls onCancel', () => {
    const onCancel = jest.fn<() => void>();
    renderModal({ onCancel });

    fireEvent.click(screen.getByText('photoMetadataModal.cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('modal close button calls onCancel via onClose prop', () => {
    const onCancel = jest.fn<() => void>();
    renderModal({ onCancel });

    fireEvent.click(screen.getByTestId('modal-close'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('onSave captures all three fields together', () => {
    const onSave = jest.fn<PhotoMetadataModalProps['onSave']>();
    renderModal({ onSave });

    const textarea = document.getElementById('modal-photo-caption') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Panoramic shot' } });
    act(() => {
      capturedAreaOnChange?.('area-1');
    });
    act(() => {
      capturedOrientationOnChange?.('orient-south');
    });

    fireEvent.click(screen.getByText('photoMetadataModal.saveAndUpload'));

    expect(onSave).toHaveBeenCalledWith({
      caption: 'Panoramic shot',
      areaId: 'area-1',
      orientationId: 'orient-south',
    });
  });

  describe('focus trap (useEffect keyboard handler)', () => {
    // The focus trap operates on elements inside the formRef div (formBody).
    // With mocked pickers (plain <div>s), only the textarea is focusable inside formBody.
    // When first === last, Tab on the last wraps back to first (the same element),
    // and Shift+Tab on the first wraps forward to last (the same element).

    it('Tab on the only focusable element wraps focus back to itself', () => {
      renderModal();

      const textarea = document.getElementById('modal-photo-caption') as HTMLTextAreaElement;
      textarea.focus();
      expect(document.activeElement).toBe(textarea);

      // Fire Tab (no shiftKey) — textarea is both first and last, so handler wraps to first
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });

      // After wrapping, focus should land on the first element (the textarea itself)
      expect(document.activeElement).toBe(textarea);
    });

    it('Shift+Tab on the only focusable element wraps focus back to itself', () => {
      renderModal();

      const textarea = document.getElementById('modal-photo-caption') as HTMLTextAreaElement;
      textarea.focus();
      expect(document.activeElement).toBe(textarea);

      // Fire Shift+Tab — textarea is both first and last, so handler wraps to last
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

      expect(document.activeElement).toBe(textarea);
    });

    it('focus trap does not trigger on non-Tab keys', () => {
      renderModal();

      const textarea = document.getElementById('modal-photo-caption') as HTMLTextAreaElement;
      textarea.focus();

      // Should not throw or change focus
      fireEvent.keyDown(document, { key: 'Escape', shiftKey: false });
      fireEvent.keyDown(document, { key: 'Enter', shiftKey: false });

      expect(document.activeElement).toBe(textarea);
    });

    it('focus trap does nothing when no focusable elements exist inside formRef', () => {
      // Render with a disabled textarea by using the modal container — the handler
      // short-circuits when focusable.length === 0. Verify no error is thrown.
      // We test this indirectly by firing Tab before any focus is set.
      renderModal();
      expect(() => {
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
      }).not.toThrow();
    });
  });
});
