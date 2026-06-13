/**
 * Konva global initialization.
 * Must be imported before any react-konva component renders.
 * Sets legacyTextRendering=true to preserve Konva 9 text positioning,
 * which all previously-saved annotations were authored under.
 */
import Konva from 'konva';

Konva.legacyTextRendering = true;
