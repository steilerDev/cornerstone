import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './SearchPicker.module.css';

export interface SpecialOption {
  id: string;
  label: string;
}

export interface SearchPickerProps<T> {
  value: string;
  onChange: (id: string) => void;
  onSelectItem?: (item: { id: string; label: string }) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
  searchFn: (query: string, excludeIds: string[]) => Promise<T[]>;
  renderItem: (item: T) => { id: string; label: string };
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
  value,
  onChange,
  onSelectItem,
  excludeIds,
  disabled = false,
  placeholder,
  searchFn,
  renderItem,
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
  // Track whether we just cleared a special option (to prevent immediate re-match)
  const [justClearedSpecial, setJustClearedSpecial] = useState(false);

  // The currently selected special option (if value matches one)
  // Don't show if: we just cleared it OR user hasn't explicitly selected it
  const selectedSpecial =
    !justClearedSpecial && specialSelected && specialOptions
      ? (specialOptions.find((opt) => opt.id === value) ?? null)
      : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset when value is cleared externally (e.g. after form submission)
  useEffect(() => {
    if (value === '') {
      setSelectedItem(null);
      setSearchTerm('');
      setInitialTitleCleared(false);
    } else {
      // If value changes to a non-empty value, clear the "just cleared" flag
      // and set specialSelected if this is a special option id
      setJustClearedSpecial(false);
      if (specialOptions?.some((opt) => opt.id === value)) {
        setSpecialSelected(true);
      }
    }
  }, [value, specialOptions]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

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

  const handleInputChange = (inputValue: string) => {
    setSearchTerm(inputValue);
    setIsOpen(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(inputValue);
    }, 300);
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
    onChange(rendered.id);
    onSelectItem?.({ id: rendered.id, label: rendered.label });
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleSelectSpecial = (opt: SpecialOption) => {
    setJustClearedSpecial(false);
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
    setJustClearedSpecial(true);
    onChange('');
    setSearchTerm('');
    setResults([]);
    inputRef.current?.focus();
  };

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
  if (initialTitle && value && !selectedItem && !initialTitleCleared) {
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
    const rendered = renderItem(selectedItem);
    const borderColor = getStatusBorderColor?.(selectedItem);
    return (
      <div className={styles.container} ref={containerRef}>
        <div
          className={styles.selectedDisplay}
          style={borderColor ? { borderLeftColor: borderColor } : undefined}
        >
          <span className={styles.selectedTitle}>{rendered.label}</span>
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
        ref={inputRef}
        type="text"
        className={styles.input}
        placeholder={resolvedPlaceholder}
        value={searchTerm}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
        disabled={disabled}
      />

      {isOpen && (
        <div className={styles.dropdown} role="listbox">
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
              return (
                <button
                  key={rendered.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={styles.resultOption}
                  onClick={() => handleSelect(item)}
                >
                  <span className={styles.resultTitle}>{rendered.label}</span>
                </button>
              );
            })}

          {!isLoading && !error && results.length === 0 && searchTerm.trim() && (
            <div className={styles.stateMessage}>{resolvedNoResults}</div>
          )}

          {!isLoading &&
            !error &&
            results.length === 0 &&
            !searchTerm.trim() &&
            (!specialOptions || specialOptions.length === 0) && (
              <div className={styles.stateMessage}>{resolvedEmptyHint}</div>
            )}
        </div>
      )}
    </div>
  );
}
