import { useState, useRef, useEffect, useCallback } from 'react';
import type { WorkItemSummary } from '@cornerstone/shared';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { StatusBadge } from '../StatusBadge/StatusBadge.js';
import styles from './WorkItemPicker.module.css';

interface WorkItemPickerProps {
  value: string;
  onChange: (id: string) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
}

export function WorkItemPicker({
  value,
  onChange,
  excludeIds,
  disabled = false,
  placeholder = 'Search work items...',
}: WorkItemPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<WorkItemSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<WorkItemSummary | null>(null);

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
    }
  }, [value]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const searchWorkItems = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listWorkItems({ q: query, pageSize: 15 });
        const filtered = response.items.filter((item) => !excludeIds.includes(item.id));
        setResults(filtered);
      } catch {
        setError('Failed to search work items');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [excludeIds],
  );

  const handleInputChange = (inputValue: string) => {
    setSearchTerm(inputValue);
    setIsOpen(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchWorkItems(inputValue);
    }, 300);
  };

  const handleSelect = (item: WorkItemSummary) => {
    setSelectedItem(item);
    onChange(item.id);
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleClear = () => {
    setSelectedItem(null);
    onChange('');
    setSearchTerm('');
    setResults([]);
    inputRef.current?.focus();
  };

  if (selectedItem) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.selectedDisplay}>
          <span className={styles.selectedTitle}>{selectedItem.title}</span>
          <StatusBadge status={selectedItem.status} />
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear selection"
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
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (searchTerm.trim()) {
            setIsOpen(true);
          }
        }}
        disabled={disabled}
      />

      {isOpen && (
        <div className={styles.dropdown} role="listbox">
          {isLoading && <div className={styles.stateMessage}>Searching...</div>}

          {!isLoading && error && <div className={styles.errorMessage}>{error}</div>}

          {!isLoading &&
            !error &&
            results.length > 0 &&
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={false}
                className={styles.resultOption}
                onClick={() => handleSelect(item)}
              >
                <span className={styles.resultTitle}>{item.title}</span>
                <StatusBadge status={item.status} />
              </button>
            ))}

          {!isLoading && !error && results.length === 0 && searchTerm.trim() && (
            <div className={styles.stateMessage}>No matching work items found</div>
          )}
        </div>
      )}
    </div>
  );
}
