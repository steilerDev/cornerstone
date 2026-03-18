/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TagResponse } from '@cornerstone/shared';

// TagPill also uses useTranslation — mock react-i18next globally before any import
jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.name) return `Remove ${String(opts.name)}`;
      return key;
    },
  }),
}));

describe('TagPicker', () => {
  let TagPicker: typeof import('./TagPicker.js').TagPicker;
  let getRandomColor: typeof import('./TagPicker.js').getRandomColor;
  let TAG_COLOR_PALETTE: typeof import('./TagPicker.js').TAG_COLOR_PALETTE;

  const mockTags: TagResponse[] = [
    { id: 'tag-1', name: 'Frontend', color: '#FF5733', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'tag-2', name: 'Backend', color: '#33FF57', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'tag-3', name: 'Design', color: '#3357FF', createdAt: '2024-01-01T00:00:00Z' },
  ];

  beforeEach(async () => {
    // Dynamic import so jest.unstable_mockModule applies before the module loads
    const mod = await import('./TagPicker.js');
    TagPicker = mod.TagPicker;
    getRandomColor = mod.getRandomColor;
    TAG_COLOR_PALETTE = mod.TAG_COLOR_PALETTE;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Dropdown opens on focus
  // ---------------------------------------------------------------------------
  it('opens the dropdown when the input receives focus', async () => {
    const user = userEvent.setup();
    render(
      <TagPicker availableTags={mockTags} selectedTagIds={[]} onSelectionChange={jest.fn()} />,
    );

    // Dropdown should not be visible before focus
    expect(screen.queryByText('Frontend')).not.toBeInTheDocument();

    await user.click(screen.getByRole('textbox'));

    // After focus the dropdown appears and shows available tags
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 2. Tag selection
  // ---------------------------------------------------------------------------
  it('calls onSelectionChange with the selected tag ID appended when a tag option is clicked', async () => {
    const user = userEvent.setup();
    const onSelectionChange = jest.fn();
    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={['tag-1']}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Open dropdown
    await user.click(screen.getByRole('textbox'));

    // 'tag-1' is already selected so only Backend and Design appear
    const backendButton = screen.getByRole('button', { name: /Backend/i });
    await user.click(backendButton);

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith(['tag-1', 'tag-2']);
  });

  // ---------------------------------------------------------------------------
  // 3. Tag removal
  // ---------------------------------------------------------------------------
  it('calls onSelectionChange with the tag ID removed when the TagPill remove button is clicked', async () => {
    const user = userEvent.setup();
    const onSelectionChange = jest.fn();
    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={['tag-1', 'tag-2']}
        onSelectionChange={onSelectionChange}
      />,
    );

    // The TagPill remove button has aria-label "Remove <name>"
    const removeButton = screen.getByRole('button', { name: /Remove Frontend/i });
    await user.click(removeButton);

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith(['tag-2']);
  });

  // ---------------------------------------------------------------------------
  // 4. Create UI appears when search has no exact match
  // ---------------------------------------------------------------------------
  it('shows the create section when the search term does not match any existing tag', async () => {
    const user = userEvent.setup();
    const onCreateTag = jest.fn<() => Promise<TagResponse>>();
    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
        onCreateTag={onCreateTag}
      />,
    );

    await user.click(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'NewTag');

    // The create section header should reference the searched name
    expect(screen.getByText(/NewTag/)).toBeInTheDocument();
    // The create button should appear
    expect(screen.getByRole('button', { name: /tagPicker.createButton/i })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 5. Create UI absent when onCreateTag prop is not provided
  // ---------------------------------------------------------------------------
  it('does not render the create button when onCreateTag prop is omitted', async () => {
    const user = userEvent.setup();
    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
        // onCreateTag intentionally omitted
      />,
    );

    await user.click(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'BrandNewTag');

    expect(
      screen.queryByRole('button', { name: /tagPicker.createButton/i }),
    ).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 6. Successful tag creation
  // ---------------------------------------------------------------------------
  it('calls onCreateTag with the trimmed search term and selected color when the create button is clicked', async () => {
    const user = userEvent.setup();
    // Spy on Math.random so the initial color is deterministic (index 0 → '#b91c1c')
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const expectedColor = '#b91c1c'; // TAG_COLOR_PALETTE[0]
    const newTag: TagResponse = { id: 'tag-new', name: 'MyNewTag', color: expectedColor };
    const onCreateTag = jest.fn<(name: string, color: string | null) => Promise<TagResponse>>()
      .mockResolvedValue(newTag);
    const onSelectionChange = jest.fn();

    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={onSelectionChange}
        onCreateTag={onCreateTag}
      />,
    );

    await user.click(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'MyNewTag');

    const createButton = screen.getByRole('button', { name: /tagPicker.createButton/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(onCreateTag).toHaveBeenCalledTimes(1);
    });
    expect(onCreateTag).toHaveBeenCalledWith('MyNewTag', expectedColor);

    // After successful creation, the new tag ID should be added to the selection
    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenCalledWith(['tag-new']);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Tag creation error
  // ---------------------------------------------------------------------------
  it('displays an error alert when onCreateTag rejects', async () => {
    const user = userEvent.setup();
    const onCreateTag = jest
      .fn<(name: string, color: string | null) => Promise<TagResponse>>()
      .mockRejectedValue(new Error('network error'));

    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
        onCreateTag={onCreateTag}
      />,
    );

    await user.click(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'FailTag');

    const createButton = screen.getByRole('button', { name: /tagPicker.createButton/i });
    await user.click(createButton);

    // The error div has role="alert"
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    // The error message comes from the translation key
    expect(screen.getByRole('alert')).toHaveTextContent('tagPicker.createError');
  });

  // ---------------------------------------------------------------------------
  // 8. Button is disabled during creation
  // ---------------------------------------------------------------------------
  it('disables the create button while a creation is in progress', async () => {
    const user = userEvent.setup();
    let resolveCreate!: (tag: TagResponse) => void;
    const pendingPromise = new Promise<TagResponse>((resolve) => {
      resolveCreate = resolve;
    });
    const onCreateTag = jest
      .fn<(name: string, color: string | null) => Promise<TagResponse>>()
      .mockReturnValue(pendingPromise);

    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
        onCreateTag={onCreateTag}
      />,
    );

    await user.click(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'PendingTag');

    const createButton = screen.getByRole('button', { name: /tagPicker.createButton/i });
    await user.click(createButton);

    // While the promise is unresolved the button should be disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tagPicker.creating/i })).toBeDisabled();
    });

    // Clean up by resolving the promise so no dangling async work remains
    resolveCreate({ id: 'tag-pending', name: 'PendingTag', color: '#3b82f6' });
    await waitFor(() => {
      expect(onCreateTag).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. REGRESSION — Tag creation does not submit parent form
  // ---------------------------------------------------------------------------
  it('does not submit the parent form when the create button is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    const newTag: TagResponse = { id: 'tag-reg', name: 'RegTag', color: '#3b82f6' };
    const onCreateTag = jest
      .fn<(name: string, color: string | null) => Promise<TagResponse>>()
      .mockResolvedValue(newTag);

    render(
      <form onSubmit={onSubmit}>
        <TagPicker
          availableTags={[]}
          selectedTagIds={[]}
          onSelectionChange={jest.fn()}
          onCreateTag={onCreateTag}
        />
      </form>,
    );

    await user.click(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'RegTag');

    const createButton = screen.getByRole('button', { name: /tagPicker.createButton/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(onCreateTag).toHaveBeenCalledTimes(1);
    });

    // The parent form must NOT have been submitted
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 10. Dropdown closes when clicking outside
  // ---------------------------------------------------------------------------
  it('closes the dropdown when a mousedown event fires outside the component', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <TagPicker availableTags={mockTags} selectedTagIds={[]} onSelectionChange={jest.fn()} />
        <div data-testid="outside">Outside element</div>
      </div>,
    );

    // Open dropdown by focusing the input
    await user.click(screen.getByRole('textbox'));
    expect(screen.getByText('Frontend')).toBeInTheDocument();

    // Simulate mousedown on an element outside the component
    await user.pointer({ target: screen.getByTestId('outside'), keys: '[MouseLeft>]' });

    await waitFor(() => {
      expect(screen.queryByText('Frontend')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Additional: empty state when no tags available and no search term
  // ---------------------------------------------------------------------------
  it('shows an empty state message when there are no available tags and no search term', async () => {
    const user = userEvent.setup();
    render(<TagPicker availableTags={[]} selectedTagIds={[]} onSelectionChange={jest.fn()} />);

    await user.click(screen.getByRole('textbox'));

    // When no tags exist and no search term typed, noMoreTags message shown
    expect(screen.getByText('tagPicker.noMoreTags')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Additional: no matching tags message when search yields nothing
  // ---------------------------------------------------------------------------
  it('shows a no-match message when the search term yields no results and creation is not available', async () => {
    const user = userEvent.setup();
    // No onCreateTag — so search with no match shows the noMatchingTags message
    render(
      <TagPicker availableTags={mockTags} selectedTagIds={[]} onSelectionChange={jest.fn()} />,
    );

    await user.click(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'zzznomatch');

    expect(screen.getByText('tagPicker.noMatchingTags')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Additional: exact match does not show create UI
  // ---------------------------------------------------------------------------
  it('does not show the create section when the search term exactly matches an existing tag name', async () => {
    const user = userEvent.setup();
    const onCreateTag = jest.fn<(name: string, color: string | null) => Promise<TagResponse>>();
    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
        onCreateTag={onCreateTag}
      />,
    );

    await user.click(screen.getByRole('textbox'));
    // Type a name that exactly matches an existing tag (case-insensitive)
    await user.type(screen.getByRole('textbox'), 'frontend');

    expect(
      screen.queryByRole('button', { name: /tagPicker.createButton/i }),
    ).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Random color selection
  // ---------------------------------------------------------------------------
  describe('random color selection', () => {
    // 1. getRandomColor without exclude returns a palette member
    it('getRandomColor returns a color that is a member of TAG_COLOR_PALETTE', () => {
      // Test with several Math.random return values to cover different palette indices
      const testValues = [0, 0.1, 0.5, 0.9, 0.99];
      for (const value of testValues) {
        const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(value);
        const result = getRandomColor();
        expect(TAG_COLOR_PALETTE).toContain(result);
        randomSpy.mockRestore();
      }
    });

    // 2. getRandomColor with exclude never returns the excluded color
    it('getRandomColor never returns the excluded color', () => {
      // Test for each palette color as the excluded value
      const testReturnValues = [0, 0.15, 0.3, 0.5, 0.75, 0.99];
      for (const excluded of TAG_COLOR_PALETTE.slice(0, 4)) {
        for (const value of testReturnValues) {
          const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(value);
          const result = getRandomColor(excluded);
          expect(result).not.toBe(excluded);
          expect(TAG_COLOR_PALETTE).toContain(result);
          randomSpy.mockRestore();
        }
      }
    });

    // 3. Initial color is from the palette
    it('renders the color input with an initial value from TAG_COLOR_PALETTE', async () => {
      const user = userEvent.setup();
      // Math.random returns 0 → Math.floor(0 * paletteLength) = 0 → first palette entry
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const expectedColor = TAG_COLOR_PALETTE[0]; // '#b91c1c'

      const onCreateTag = jest.fn<(name: string, color: string | null) => Promise<TagResponse>>();

      render(
        <TagPicker
          availableTags={mockTags}
          selectedTagIds={[]}
          onSelectionChange={jest.fn()}
          onCreateTag={onCreateTag}
        />,
      );

      // Type a term that won't match any existing tag to show the create section
      await user.click(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'BrandNewTag');

      const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
      expect(colorInput).not.toBeNull();
      expect(colorInput.value).toBe(expectedColor);
    });

    // 4. After tag creation, color changes to a different palette color
    it('changes the color input value after a tag is successfully created', async () => {
      const user = userEvent.setup();
      // First call (lazy init): Math.random = 0 → palette[0] = '#b91c1c'
      // After creation: Math.random is still mocked; exclude '#b91c1c', so
      // candidates = palette[1..9]. Math.floor(0 * 9) = 0 → palette[1] = '#c2410c'
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const initialColor = TAG_COLOR_PALETTE[0]; // '#b91c1c'
      const newTag: TagResponse = { id: 'tag-color-test', name: 'ColorTest', color: initialColor };
      const onCreateTag = jest.fn<(name: string, color: string | null) => Promise<TagResponse>>()
        .mockResolvedValue(newTag);

      render(
        <TagPicker
          availableTags={mockTags}
          selectedTagIds={[]}
          onSelectionChange={jest.fn()}
          onCreateTag={onCreateTag}
        />,
      );

      // Show the create section
      await user.click(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'ColorTest');

      // Record the color before creation
      const colorInputBefore = document.querySelector('input[type="color"]') as HTMLInputElement;
      expect(colorInputBefore).not.toBeNull();
      const colorBefore = colorInputBefore.value;
      expect(TAG_COLOR_PALETTE).toContain(colorBefore);

      // Create the tag
      const createButton = screen.getByRole('button', { name: /tagPicker.createButton/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(onCreateTag).toHaveBeenCalledTimes(1);
      });

      // After creation, the create section resets and the search is cleared.
      // Re-trigger it with a new term so the color input is visible again.
      await user.type(screen.getByRole('textbox'), 'NextTag');

      await waitFor(() => {
        const colorInputAfter = document.querySelector('input[type="color"]') as HTMLInputElement;
        expect(colorInputAfter).not.toBeNull();
        // The new color must still be a palette member
        expect(TAG_COLOR_PALETTE).toContain(colorInputAfter.value);
        // And it must be different from the color used for the previous tag
        expect(colorInputAfter.value).not.toBe(colorBefore);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Additional: disabled input when disabled prop is true
  // ---------------------------------------------------------------------------
  it('disables the text input when the disabled prop is set', () => {
    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
        disabled={true}
      />,
    );

    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // Additional: onError callback is called when creation fails
  // ---------------------------------------------------------------------------
  it('calls the onError prop with the error message when tag creation fails', async () => {
    const user = userEvent.setup();
    const onCreateTag = jest
      .fn<(name: string, color: string | null) => Promise<TagResponse>>()
      .mockRejectedValue(new Error('fail'));
    const onError = jest.fn();

    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
        onCreateTag={onCreateTag}
        onError={onError}
      />,
    );

    await user.click(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'ErrorTag');
    await user.click(screen.getByRole('button', { name: /tagPicker.createButton/i }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    expect(onError).toHaveBeenCalledWith('tagPicker.createError');
  });
});
