import { useState, useRef, useEffect } from 'react';
import type { DiaryEntryType } from '@cornerstone/shared';
import { exportDiaryPdf } from '../../../lib/diaryApi.js';
import { ApiClientError } from '../../../lib/apiClient.js';
import shared from '../../../styles/shared.module.css';
import styles from './DiaryExportDialog.module.css';

interface DiaryExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALL_ENTRY_TYPES: DiaryEntryType[] = [
  'daily_log',
  'site_visit',
  'delivery',
  'issue',
  'general_note',
  'work_item_status',
  'invoice_status',
  'milestone_delay',
  'budget_breach',
  'auto_reschedule',
  'subsidy_status',
];

const TYPE_LABELS: Record<DiaryEntryType, string> = {
  daily_log: 'Daily Log',
  site_visit: 'Site Visit',
  delivery: 'Delivery',
  issue: 'Issue',
  general_note: 'Note',
  work_item_status: 'Work Item',
  invoice_status: 'Invoice',
  milestone_delay: 'Milestone',
  budget_breach: 'Budget',
  auto_reschedule: 'Schedule',
  subsidy_status: 'Subsidy',
};

export function DiaryExportDialog({ isOpen, onClose }: DiaryExportDialogProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<DiaryEntryType[]>(ALL_ENTRY_TYPES);
  const [includeAutomatic, setIncludeAutomatic] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap and Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])',
        );
        const focusableArray = Array.from(focusable);
        if (focusableArray.length === 0) return;
        const firstEl = focusableArray[0];
        const lastEl = focusableArray[focusableArray.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleTypeToggle = (type: DiaryEntryType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError('');

    try {
      const blob = await exportDiaryPdf({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        types: selectedTypes.length > 0 ? selectedTypes.join(',') : undefined,
        includeAutomatic,
        includePhotos,
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `diary-export-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to export diary entries. Please try again.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={styles.modalContent} ref={modalRef}>
        <h2 id="export-modal-title" className={styles.modalTitle}>
          Export Diary to PDF
        </h2>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        <div className={styles.formGroup}>
          <label htmlFor="export-date-from" className={styles.label}>
            From
          </label>
          <input
            id="export-date-from"
            type="date"
            className={shared.input}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            disabled={isExporting}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="export-date-to" className={styles.label}>
            To
          </label>
          <input
            id="export-date-to"
            type="date"
            className={shared.input}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            disabled={isExporting}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Entry Types</label>
          <div className={styles.typeCheckboxes} role="group" aria-label="Select entry types">
            {ALL_ENTRY_TYPES.map((type) => (
              <label key={type} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type)}
                  onChange={() => handleTypeToggle(type)}
                  disabled={isExporting}
                />
                {TYPE_LABELS[type]}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includeAutomatic}
              onChange={(e) => setIncludeAutomatic(e.target.checked)}
              disabled={isExporting}
            />
            Include automatic entries
          </label>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => setIncludePhotos(e.target.checked)}
              disabled={isExporting}
            />
            Include photos
          </label>
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={shared.btnPrimary}
            onClick={() => void handleExport()}
            disabled={isExporting}
          >
            {isExporting ? 'Generating...' : 'Generate PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
