import { useState, useRef, useEffect, useCallback } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkItemSummary } from '@cornerstone/shared';
import { listWorkItems } from '../../lib/workItemsApi.js';
import styles from './MilestonePanel.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MilestoneWorkItemLinkerProps {
  milestoneId: number;
  linkedWorkItems: WorkItemSummary[];
  isLinking: boolean;
  onLink: (workItemId: string) => void;
  onUnlink: (workItemId: string) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Work item linker for milestones.
 * Displays a searchable list of all work items with toggleable link/unlink actions.
 * Uses chip-style display for linked items and a search-driven dropdown for adding.
 */
export function MilestoneWorkItemLinker({
  milestoneId: _milestoneId,
  linkedWorkItems,
  isLinking,
  onLink,
  onUnlink,
  onBack,
}: MilestoneWorkItemLinkerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<WorkItemSummary[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const linkedIds = new Set(linkedWorkItems.map((wi) => wi.id));

  const searchWorkItems = useCallback(
    async (query: string) => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const response = await listWorkItems({ q: query || undefined, pageSize: 20 });
        // Exclude already-linked items from search results
        setResults(response.items.filter((item) => !linkedIds.has(item.id)));
      } catch {
        setSearchError('Failed to load work items');
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [linkedIds],
  );

  function handleInputChange(value: string) {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void searchWorkItems(value);
    }, 250);
    setIsDropdownOpen(true);
  }

  function handleInputFocus() {
    setIsDropdownOpen(true);
    if (!searchTerm) {
      void searchWorkItems('');
    }
  }

  function handleSelect(item: WorkItemSummary) {
    onLink(item.id);
    setSearchTerm('');
    setIsDropdownOpen(false);
    inputRef.current?.focus();
  }

  function handleUnlinkChip(id: string) {
    onUnlink(id);
  }

  // Keyboard navigation in dropdown
  function handleInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
    if (e.key === 'Backspace' && !searchTerm && linkedWorkItems.length > 0) {
      // Remove last chip
      const lastItem = linkedWorkItems[linkedWorkItems.length - 1];
      if (lastItem) onUnlink(lastItem.id);
    }
  }

  return (
    <div className={styles.linkerContainer} data-testid="milestone-work-item-linker">
      {/* Header */}
      <div className={styles.linkerHeader}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          aria-label="Back to milestone detail"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 5l-5 5 5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <h3 className={styles.linkerTitle}>Linked Work Items</h3>
      </div>

      <div className={styles.dialogBody}>
        {/* Linked items as chips + search input */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            Linked Work Items
            <span className={styles.linkedCount}>
              {linkedWorkItems.length > 0 ? ` (${linkedWorkItems.length})` : ''}
            </span>
          </label>

          <div
            ref={containerRef}
            className={`${styles.chipContainer} ${isDropdownOpen ? styles.chipContainerFocused : ''}`}
            style={{ position: 'relative' }}
          >
            {/* Chips for linked items */}
            {linkedWorkItems.length === 0 && !searchTerm && (
              <span className={styles.chipsEmpty}>No work items linked</span>
            )}
            {linkedWorkItems.map((item) => (
              <span key={item.id} className={styles.chip}>
                <span className={styles.chipLabel} title={item.title}>
                  {item.title.length > 30 ? `${item.title.slice(0, 30)}…` : item.title}
                </span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  onClick={() => handleUnlinkChip(item.id)}
                  disabled={isLinking}
                  aria-label={`Remove ${item.title}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </span>
            ))}

            {/* Search input */}
            <input
              ref={inputRef}
              type="text"
              className={styles.chipInput}
              value={searchTerm}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={handleInputFocus}
              onKeyDown={handleInputKeyDown}
              placeholder={linkedWorkItems.length === 0 ? 'Search work items…' : 'Add more…'}
              disabled={isLinking}
              aria-label="Search work items to link"
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              aria-controls="work-item-linker-listbox"
              autoComplete="off"
            />

            {/* Dropdown */}
            {isDropdownOpen && (
              <ul
                id="work-item-linker-listbox"
                role="listbox"
                aria-label="Work item search results"
                className={styles.chipDropdown}
              >
                {isSearching && (
                  <li className={styles.chipDropdownItem} role="option" aria-selected={false}>
                    <span className={styles.chipDropdownLoading}>Searching…</span>
                  </li>
                )}
                {!isSearching && searchError !== null && (
                  <li className={styles.chipDropdownItem} role="option" aria-selected={false}>
                    <span className={styles.chipDropdownEmpty}>{searchError}</span>
                  </li>
                )}
                {!isSearching && searchError === null && results.length === 0 && (
                  <li className={styles.chipDropdownItem} role="option" aria-selected={false}>
                    <span className={styles.chipDropdownEmpty}>
                      {searchTerm ? 'No matching work items' : 'No available work items'}
                    </span>
                  </li>
                )}
                {!isSearching &&
                  searchError === null &&
                  results.map((item) => (
                    <li
                      key={item.id}
                      role="option"
                      aria-selected={false}
                      className={styles.chipDropdownItem}
                      onClick={() => handleSelect(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelect(item);
                        }
                      }}
                      tabIndex={0}
                    >
                      <span className={styles.chipDropdownItemTitle}>{item.title}</span>
                      <span className={styles.chipDropdownItemStatus}>{item.status}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
