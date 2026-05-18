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

/** Stroke widths in image-space pixels */
export const ANNOTATION_STROKE_WIDTHS = {
  thin: 2,
  medium: 4,
  thick: 8,
} as const;

export type StrokeWidthKey = keyof typeof ANNOTATION_STROKE_WIDTHS;

export const DEFAULT_COLOR: AnnotationColor = ANNOTATION_COLORS.red;
export const DEFAULT_STROKE_WIDTH: StrokeWidthKey = 'medium';

/** Font sizes in image-space pixels (matching font-size attribute in SVG) */
export const ANNOTATION_FONT_SIZES = {
  small: 12,
  medium: 18,  // default
  large: 24,
  xlarge: 32,
} as const;

export type FontSizeKey = keyof typeof ANNOTATION_FONT_SIZES;
export const DEFAULT_FONT_SIZE = ANNOTATION_FONT_SIZES.medium;
