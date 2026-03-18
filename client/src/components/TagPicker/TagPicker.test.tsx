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

  const mockTags: TagResponse[] = [
    { id: 'tag-1', name: 'Frontend', color: '#FF5733', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'tag-2', name: 'Backend', color: '#33FF57', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'tag-3', name: 'Design', color: '#3357FF', createdAt: '2024-01-01T00:00:00Z' },
  ];

  beforeEach(async () => {
    // Dynamic import so jest.unstable_mockModule applies before the module loads
    const mod = await import('./TagPicker.js');
    TagPicker = mod.TagPicker;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Dropdown opens on focus
  // ---------------------------------------------------------------------------
  it('opens the dropdown when the input receives focus', async () => {
    const user = userEvent.setup();
    render(
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
      />,
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

    expect(screen.queryByRole('button', { name: /tagPicker.createButton/i })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 6. Successful tag creation
  // ---------------------------------------------------------------------------
  it('calls onCreateTag with the trimmed search term and selected color when the create button is clicked', async () => {
    const user = userEvent.setup();
    const newTag: TagResponse = { id: 'tag-new', name: 'MyNewTag', color: '#3b82f6' };
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
    expect(onCreateTag).toHaveBeenCalledWith('MyNewTag', '#3b82f6');

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
    const onCreateTag = jest.fn<(name: string, color: string | null) => Promise<TagResponse>>()
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
    const onCreateTag = jest.fn<(name: string, color: string | null) => Promise<TagResponse>>()
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
    const onCreateTag = jest.fn<(name: string, color: string | null) => Promise<TagResponse>>()
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
        <TagPicker
          availableTags={mockTags}
          selectedTagIds={[]}
          onSelectionChange={jest.fn()}
        />
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
    render(
      <TagPicker
        availableTags={[]}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
      />,
    );

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
      <TagPicker
        availableTags={mockTags}
        selectedTagIds={[]}
        onSelectionChange={jest.fn()}
      />,
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

    expect(screen.queryByRole('button', { name: /tagPicker.createButton/i })).not.toBeInTheDocument();
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
    const onCreateTag = jest.fn<(name: string, color: string | null) => Promise<TagResponse>>()
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
