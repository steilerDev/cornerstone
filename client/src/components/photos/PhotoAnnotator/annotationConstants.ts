/** Fixed annotation content colors — intentionally NOT CSS tokens.
 *  These are user-visible mark-up colors that must stay constant across themes. */
export const ANNOTATION_COLORS = {
  red: '#dc2626',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  black: '#000000',
  white: '#ffffff',
} as const;

export type AnnotationColor = (typeof ANNOTATION_COLORS)[keyof typeof ANNOTATION_COLORS];

/**
 * Stroke width ratios as fractions of min(imageWidth, imageHeight).
 * These scale stroke widths to match the image resolution.
 */
export const ANNOTATION_STROKE_WIDTH_RATIOS = {
  thin: 0.005,
  medium: 0.009,
  thick: 0.015,
  'extra-thick': 0.025,
} as const;

export type StrokeWidthKey = keyof typeof ANNOTATION_STROKE_WIDTH_RATIOS;

/**
 * Font size ratios as fractions of min(imageWidth, imageHeight).
 * These scale font sizes to match the image resolution.
 */
export const ANNOTATION_FONT_SIZE_RATIOS = {
  small: 0.018,
  medium: 0.028,
  large: 0.04,
  xlarge: 0.056,
  xxlarge: 0.08,
} as const;

export type FontSizeKey = keyof typeof ANNOTATION_FONT_SIZE_RATIOS;

export const DEFAULT_COLOR: AnnotationColor = ANNOTATION_COLORS.red;
export const DEFAULT_STROKE_WIDTH: StrokeWidthKey = 'medium';
export const DEFAULT_FONT_SIZE: FontSizeKey = 'medium';

/**
 * Resolve a stroke width key to an actual pixel value based on image dimensions.
 * @param key The stroke width key (thin/medium/thick/extra-thick)
 * @param imageWidth The image width in pixels
 * @param imageHeight The image height in pixels
 * @returns The resolved stroke width in image-space pixels (minimum 1)
 */
export function resolveStrokeWidth(
  key: StrokeWidthKey,
  imageWidth: number,
  imageHeight: number,
): number {
  const ref = Math.min(imageWidth, imageHeight);
  return Math.max(1, Math.round(ref * ANNOTATION_STROKE_WIDTH_RATIOS[key]));
}

/**
 * Resolve a font size key to an actual pixel value based on image dimensions.
 * @param key The font size key (small/medium/large/xlarge/xxlarge)
 * @param imageWidth The image width in pixels
 * @param imageHeight The image height in pixels
 * @returns The resolved font size in image-space pixels (minimum 8)
 */
export function resolveFontSize(key: FontSizeKey, imageWidth: number, imageHeight: number): number {
  const ref = Math.min(imageWidth, imageHeight);
  return Math.max(8, Math.round(ref * ANNOTATION_FONT_SIZE_RATIOS[key]));
}
