import { useTranslation } from 'react-i18next';
import type { ToolName, StrokeWidthKey, FontSizeKey } from './useAnnotator.js';
import {
  ANNOTATION_COLORS,
  ANNOTATION_STROKE_WIDTH_RATIOS,
  ANNOTATION_FONT_SIZE_RATIOS,
  resolveStrokeWidth,
  resolveFontSize,
} from './annotationConstants.js';
import styles from './ToolPalette.module.css';

interface ToolPaletteProps {
  selectedTool: ToolName;
  activeColor: string;
  activeStrokeWidthKey: StrokeWidthKey;
  activeFontSizeKey: string;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: ToolName) => void;
  onSelectColor: (color: string) => void;
  onSelectStrokeWidth: (key: StrokeWidthKey) => void;
  onSelectFontSize: (key: string) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function ToolPalette({
  selectedTool,
  activeColor,
  activeStrokeWidthKey,
  activeFontSizeKey,
  canUndo,
  canRedo,
  onSelectTool,
  onSelectColor,
  onSelectStrokeWidth,
  onSelectFontSize,
  onUndo,
  onRedo,
}: ToolPaletteProps) {
  const { t } = useTranslation('photoAnnotator');

  return (
    <div role="toolbar" aria-label={t('toolbar')} className={styles.toolPalette}>
      {/* Tool group */}
      <div className={styles.toolGroup}>
        <button
          type="button"
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

        <button
          type="button"
          aria-pressed={selectedTool === 'arrow'}
          data-testid="tool-arrow"
          aria-label={t('toolArrow')}
          className={`${styles.toolButton} ${
            selectedTool === 'arrow' ? styles.toolButtonActive : ''
          }`}
          onClick={() => onSelectTool('arrow')}
        >
          <ArrowIcon />
        </button>

        <button
          type="button"
          aria-pressed={selectedTool === 'line'}
          data-testid="tool-line"
          aria-label={t('toolLine')}
          className={`${styles.toolButton} ${
            selectedTool === 'line' ? styles.toolButtonActive : ''
          }`}
          onClick={() => onSelectTool('line')}
        >
          <LineIcon />
        </button>

        <button
          type="button"
          aria-pressed={selectedTool === 'ellipse'}
          data-testid="tool-ellipse"
          aria-label={t('toolEllipse')}
          className={`${styles.toolButton} ${
            selectedTool === 'ellipse' ? styles.toolButtonActive : ''
          }`}
          onClick={() => onSelectTool('ellipse')}
        >
          <EllipseIcon />
        </button>

        <button
          type="button"
          aria-pressed={selectedTool === 'text'}
          data-testid="tool-text"
          aria-label={t('toolText')}
          className={`${styles.toolButton} ${
            selectedTool === 'text' ? styles.toolButtonActive : ''
          }`}
          onClick={() => onSelectTool('text')}
        >
          <TextIcon />
        </button>

        <button
          type="button"
          aria-pressed={selectedTool === 'measurement'}
          data-testid="tool-measurement"
          aria-label={t('toolMeasurement')}
          className={`${styles.toolButton} ${
            selectedTool === 'measurement' ? styles.toolButtonActive : ''
          }`}
          onClick={() => onSelectTool('measurement')}
        >
          <MeasurementIcon />
        </button>

        <button
          type="button"
          aria-pressed={selectedTool === 'freehand'}
          data-testid="tool-freehand"
          aria-label={t('toolFreehand')}
          className={`${styles.toolButton} ${
            selectedTool === 'freehand' ? styles.toolButtonActive : ''
          }`}
          onClick={() => onSelectTool('freehand')}
        >
          <FreehandIcon />
        </button>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* Color swatches */}
      <div role="radiogroup" aria-label={t('colorPalette')} className={styles.swatchGroup}>
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
      <div role="radiogroup" aria-label={t('strokeWidth')} className={styles.strokeGroup}>
        {Object.entries(ANNOTATION_STROKE_WIDTH_RATIOS).map(([key]) => {
          // Use a reference image dimension of 1000px for consistent button preview
          const previewWidth = resolveStrokeWidth(key as StrokeWidthKey, 1000, 1000);
          return (
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
                  strokeWidth={Math.max(1, previewWidth * 0.06)}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          );
        })}
      </div>

      {(selectedTool === 'text' || selectedTool === 'measurement') && (
        <>
          <div className={styles.divider} aria-hidden="true" />
          <div role="radiogroup" aria-label={t('fontSize')} className={styles.fontSizeGroup}>
            {Object.entries(ANNOTATION_FONT_SIZE_RATIOS).map(([key]) => {
              // Use a reference image dimension of 1000px for consistent button preview
              const previewSize = resolveFontSize(key as FontSizeKey, 1000, 1000);
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={activeFontSizeKey === key}
                  aria-label={t(`fontSize${key.charAt(0).toUpperCase() + key.slice(1)}`)}
                  className={`${styles.fontSizeButton} ${
                    activeFontSizeKey === key ? styles.fontSizeButtonActive : ''
                  }`}
                  onClick={() => onSelectFontSize(key)}
                >
                  <span style={{ fontSize: `${Math.max(10, previewSize * 0.06)}px` }}>A</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className={styles.divider} aria-hidden="true" />

      {/* Undo/Redo */}
      <div className={styles.undoRedoGroup}>
        <button
          type="button"
          disabled={!canUndo}
          aria-label={t('undo')}
          data-testid="annotator-undo"
          className={`${styles.toolButton} ${!canUndo ? styles.toolButtonDisabled : ''}`}
          onClick={onUndo}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          disabled={!canRedo}
          aria-label={t('redo')}
          data-testid="annotator-redo"
          className={`${styles.toolButton} ${!canRedo ? styles.toolButtonDisabled : ''}`}
          onClick={onRedo}
        >
          <RedoIcon />
        </button>
      </div>
    </div>
  );
}

function SelectIcon() {
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      ↖
    </span>
  );
}

function RectangleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function HighlightIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="16" height="8" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      ↶
    </span>
  );
}

function RedoIcon() {
  return (
    <span
      aria-hidden="true"
      style={{ fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      ↷
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line
        x1="4"
        y1="20"
        x2="16"
        y2="8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <polygon points="16,8 20,4 21,12" fill="currentColor" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line
        x1="4"
        y1="20"
        x2="20"
        y2="4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EllipseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="18" fontSize="16" fontWeight="700" fill="currentColor" fontFamily="serif">
        T
      </text>
    </svg>
  );
}

function MeasurementIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Horizontal measurement line */}
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Left tick */}
      <line
        x1="4"
        y1="8"
        x2="4"
        y2="16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Right tick */}
      <line
        x1="20"
        y1="8"
        x2="20"
        y2="16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FreehandIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 18 C6 14, 8 10, 10 12 C12 14, 14 8, 16 10 C18 12, 20 8, 21 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
