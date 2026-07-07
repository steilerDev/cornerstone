import { useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
  FloatingPortal,
} from '@floating-ui/react';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback.js';
import { useClickOutside } from '../../hooks/useClickOutside.js';

import styles from './SearchPicker.module.css';

export interface SpecialOption {
  id: string;
  label: string;
}

export interface SearchPickerProps<T> {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  onSelectItem?: (item: { id: string; label: string }) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
  searchFn: (query: string, excludeIds: string[]) => Promise<T[]>;
  renderItem: (item: T) => { id: string; label: string };
  renderSecondary?: (item: T) => ReactNode;
  renderSelectedLabel?: (item: T) => string;
  getStatusBorderColor?: (item: T) => string | undefined;
  specialOptions?: SpecialOption[];
  showItemsOnFocus?: boolean;
  initialTitle?: string;
  emptyHint?: string;
  noResultsMessage?: string;
  loadErrorMessage?: string;
  searchErrorMessage?: string;
}

export function SearchPicker<T>({
  id,
  value,
  onChange,
  onSelectItem,
  excludeIds,
  disabled = false,
  placeholder,
  searchFn,
  renderItem,
  renderSecondary,
  renderSelectedLabel,
  getStatusBorderColor,
  specialOptions,
  showItemsOnFocus,
  initialTitle,
  emptyHint,
  noResultsMessage,
  loadErrorMessage,
  searchErrorMessage,
}: SearchPickerProps<T>) {
  const { t } = useTranslation('common');
  const resolvedPlaceholder = placeholder ?? t('search.placeholder');
  const resolvedEmptyHint = emptyHint ?? t('search.emptyHint');
  const resolvedNoResults = noResultsMessage ?? t('search.noResults');
  const resolvedLoadError = loadErrorMessage ?? t('search.loadError');
  const resolvedSearchError = searchErrorMessage ?? t('search.searchError');

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  // Track whether the user has explicitly cleared an initialTitle-based selection
  const [initialTitleCleared, setInitialTitleCleared] = useState(false);
  // Track whether the user has explicitly selected a special option
  const [specialSelected, setSpecialSelected] = useState(false);

  // The currently selected special option (if value matches one)
  // Only match a special option when the user explicitly chose one
  const selectedSpecial =
    specialSelected && specialOptions
      ? (specialOptions.find((opt) => opt.id === value) ?? null)
      : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { refs, floatingStyles, isPositioned } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, { width: `${rects.reference.width}px` });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  // Close dropdown on click outside
  useClickOutside([containerRef, refs.floating], () => setIsOpen(false), isOpen);

  // Reset when value is cleared externally (e.g. after form submission)
  useEffect(() => {
    /* eslint-disable @eslint-react/set-state-in-effect -- syncing picker state with external value changes */
    if (value === '') {
      setSelectedItem(null);
      setSearchTerm('');
      setInitialTitleCleared(false);
    } else {
      if (specialOptions?.some((opt) => opt.id === value)) {
        setSpecialSelected(true);
      }
    }
    /* eslint-enable @eslint-react/set-state-in-effect */
  }, [value, specialOptions]);

  const fetchInitialResults = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await searchFn('', excludeIds);
      setResults(response);
    } catch {
      setError(resolvedLoadError);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [excludeIds, searchFn, resolvedLoadError]);

  const performSearch = useCallback(
    async (query: string) => {
      // If query is empty and dropdown is open, show initial results
      if (!query.trim()) {
        await fetchInitialResults();
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await searchFn(query, excludeIds);
        setResults(response);
      } catch {
        setError(resolvedSearchError);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [excludeIds, fetchInitialResults, searchFn, resolvedSearchError],
  );

  const debouncedSearch = useDebouncedCallback(performSearch, 300);

  const handleInputChange = (inputValue: string) => {
    setSearchTerm(inputValue);
    setIsOpen(true);
    debouncedSearch.trigger(inputValue);
  };

  const handleFocus = () => {
    if (showItemsOnFocus || specialOptions) {
      setIsOpen(true);
      fetchInitialResults();
    } else if (searchTerm.trim()) {
      setIsOpen(true);
    }
  };

  const handleSelect = (item: T) => {
    const rendered = renderItem(item);
    setSelectedItem(item);
    // Once the user selects an item, the pre-populated initialTitle is no longer the source of truth
    setInitialTitleCleared(true);
    onChange(rendered.id);
    onSelectItem?.({ id: rendered.id, label: rendered.label });
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleSelectSpecial = (opt: SpecialOption) => {
    setSelectedItem(null); // clear any real item selection
    setSpecialSelected(true);
    onChange(opt.id);
    onSelectItem?.({ id: opt.id, label: opt.label });
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleClear = () => {
    setSelectedItem(null);
    setInitialTitleCleared(true);
    setSpecialSelected(false);
    onChange('');
    setSearchTerm('');
    setResults([]);
    inputRef.current?.focus();
  };

  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      refs.setReference(node);
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
    },
    [refs],
  );

  // If a special option is selected, show it in a display similar to selectedItem
  if (selectedSpecial) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.selectedDisplay}>
          <span className={`${styles.selectedTitle} ${styles.selectedTitleSpecial}`}>
            {selectedSpecial.label}
          </span>
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label={t('aria.clearSelection')}
            disabled={disabled}
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  // Show initialTitle when value is pre-populated and not yet changed by the user
  if (initialTitle && value && !initialTitleCleared) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.selectedDisplay}>
          <span className={styles.selectedTitle}>{initialTitle}</span>
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label={t('aria.clearSelection')}
            disabled={disabled}
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  if (selectedItem) {
    const borderColor = getStatusBorderColor?.(selectedItem);
    const label = renderSelectedLabel
      ? renderSelectedLabel(selectedItem)
      : renderItem(selectedItem).label;
    return (
      <div className={styles.container} ref={containerRef}>
        <div
          className={styles.selectedDisplay}
          style={borderColor ? { borderLeftColor: borderColor } : undefined}
        >
          <span className={styles.selectedTitle}>{label}</span>
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label={t('aria.clearSelection')}
            disabled={disabled}
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <input
        id={id}
        ref={setInputRef}
        type="text"
        className={styles.input}
        placeholder={resolvedPlaceholder}
        value={searchTerm}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        disabled={disabled}
      />

      <FloatingPortal>
        {isOpen && (
          <div
            data-search-picker-dropdown
            ref={refs.setFloating}
            style={isPositioned ? floatingStyles : { ...floatingStyles, visibility: 'hidden' }}
            className={styles.portalDropdown}
            role="listbox"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsOpen(false);
            }}
          >
            {/* Special options at the top */}
            {specialOptions && specialOptions.length > 0 && (
              <>
                {specialOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={`${styles.resultOption} ${styles.specialOption}`}
                    onClick={() => handleSelectSpecial(opt)}
                  >
                    <span className={`${styles.resultTitle} ${styles.specialOptionLabel}`}>
                      {opt.label}
                    </span>
                  </button>
                ))}
                {/* Divider between special options and search results */}
                {(isLoading || results.length > 0) && (
                  <div className={styles.optionsDivider} role="separator" />
                )}
              </>
            )}

            {isLoading && <div className={styles.stateMessage}>{t('searching')}</div>}

            {!isLoading && error && <div className={styles.errorMessage}>{error}</div>}

            {!isLoading &&
              !error &&
              results.length > 0 &&
              results.map((item) => {
                const rendered = renderItem(item);
                const secondary = renderSecondary?.(item);
                return (
                  <button
                    key={rendered.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={styles.resultOption}
                    onClick={() => handleSelect(item)}
                  >
                    {secondary !== undefined && secondary !== null ? (
                      <span className={styles.resultContent}>
                        <span className={styles.resultTitle}>{rendered.label}</span>
                        <span
                          className={styles.resultSecondary}
                          title={typeof secondary === 'string' ? secondary : undefined}
                        >
                          {secondary}
                        </span>
                      </span>
                    ) : (
                      <span className={styles.resultTitle}>{rendered.label}</span>
                    )}
                  </button>
                );
              })}

            {!isLoading && !error && results.length === 0 && searchTerm.trim() && (
              <div className={styles.stateMessage}>{resolvedNoResults}</div>
            )}

            {!isLoading && !error && results.length === 0 && !searchTerm.trim() && emptyHint && (
              <div className={styles.stateMessage}>{emptyHint}</div>
            )}

            {!isLoading &&
              !error &&
              results.length === 0 &&
              !searchTerm.trim() &&
              (!specialOptions || specialOptions.length === 0) &&
              !emptyHint && <div className={styles.stateMessage}>{resolvedEmptyHint}</div>}
          </div>
        )}
      </FloatingPortal>
    </div>
  );
}
