import { useTranslation } from 'react-i18next';
import type { ToolName, StrokeWidthKey } from './useAnnotator.js';
import { ANNOTATION_COLORS, ANNOTATION_STROKE_WIDTHS } from './annotationConstants.js';
import styles from './ToolPalette.module.css';

interface ToolPaletteProps {
  selectedTool: ToolName;
  activeColor: string;
  activeStrokeWidthKey: StrokeWidthKey;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: ToolName) => void;
  onSelectColor: (color: string) => void;
  onSelectStrokeWidth: (key: StrokeWidthKey) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function ToolPalette({
  selectedTool,
  activeColor,
  activeStrokeWidthKey,
  canUndo,
  canRedo,
  onSelectTool,
  onSelectColor,
  onSelectStrokeWidth,
  onUndo,
  onRedo,
}: ToolPaletteProps) {
  const { t } = useTranslation('photoAnnotator');

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar')}
      className={styles.toolPalette}
    >
      {/* Tool group */}
      <div className={styles.toolGroup}>
        <button
          type="button"
          role="button"
          aria-pressed={selectedTool === 'select'}
          data-testid="tool-select"
          aria-label={t('toolSelect')}
          className={`${styles.toolButton} ${
            selectedTool === 'select' ? styles.toolButtonActive : ''
          }`}
          onClick={() => onSelectTool('select')}
        >
          <SelectIcon />
        </button>

        <button
          type="button"
          role="button"
          aria-pressed={selectedTool === 'rectangle'}
          data-testid="tool-rectangle"
          aria-label={t('toolRectangle')}
          className={`${styles.toolButton} ${
            selectedTool === 'rectangle' ? styles.toolButtonActive : ''
          }`}
          onClick={() => onSelectTool('rectangle')}
        >
          <RectangleIcon />
        </button>

        <button
          type="button"
          role="button"
          aria-pressed={selectedTool === 'highlight'}
          data-testid="tool-highlight"
          aria-label={t('toolHighlight')}
          className={`${styles.toolButton} ${
            selectedTool === 'highlight' ? styles.toolButtonActive : ''
          }`}
          onClick={() => onSelectTool('highlight')}
        >
          <HighlightIcon />
        </button>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* Color swatches */}
      <div
        role="radiogroup"
        aria-label={t('colorPalette')}
        className={styles.swatchGroup}
      >
        {Object.entries(ANNOTATION_COLORS).map(([key, hex]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={activeColor === hex}
            aria-label={t(`color${key.charAt(0).toUpperCase() + key.slice(1)}`)}
            className={`${styles.swatchButton} ${
              activeColor === hex ? styles.swatchButtonActive : ''
            }`}
            style={{ backgroundColor: hex }}
            onClick={() => onSelectColor(hex)}
          />
        ))}
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* Stroke width picker */}
      <div
        role="radiogroup"
        aria-label={t('strokeWidth')}
        className={styles.strokeGroup}
      >
        {Object.entries(ANNOTATION_STROKE_WIDTHS).map(([key, width]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={activeStrokeWidthKey === key}
            aria-label={t(`stroke${key.charAt(0).toUpperCase() + key.slice(1)}`)}
            className={`${styles.strokeButton} ${
              activeStrokeWidthKey === key ? styles.strokeButtonActive : ''
            }`}
            onClick={() => onSelectStrokeWidth(key as StrokeWidthKey)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line
                x1="4"
                y1="12"
                x2="20"
                y2="12"
                stroke="currentColor"
                strokeWidth={width}
                strokeLinecap="round"
              />
            </svg>
          </button>
        ))}
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* Undo/Redo */}
      <div className={styles.undoRedoGroup}>
        <button
          type="button"
          disabled={!canUndo}
          aria-label={t('undo')}
          data-testid="annotator-undo"
          className={styles.toolButton}
          onClick={onUndo}
          style={{ opacity: canUndo ? 1 : 0.4, cursor: canUndo ? 'pointer' : 'not-allowed' }}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          disabled={!canRedo}
          aria-label={t('redo')}
          data-testid="annotator-redo"
          className={styles.toolButton}
          onClick={onRedo}
          style={{ opacity: canRedo ? 1 : 0.4, cursor: canRedo ? 'pointer' : 'not-allowed' }}
        >
          <RedoIcon />
        </button>
      </div>
    </div>
  );
}

function SelectIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 3V21M5 5H19L11 12L19 19H5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function RectangleIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function HighlightIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="8" width="16" height="8" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 12C4 16.4183 7.58172 20 12 20C15.0583 20 17.7158 18.2957 18.9995 15.5M4 12H8M4 12V8M20 12C20 7.58172 16.4183 4 12 4C8.94172 4 6.28423 5.70433 5.00049 8.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 12C20 16.4183 16.4183 20 12 20C8.94172 20 6.28423 18.2957 5.00049 15.5M20 12H16M20 12V8M4 12C4 7.58172 7.58172 4 12 4C15.0583 4 17.7158 5.70433 18.9995 8.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
