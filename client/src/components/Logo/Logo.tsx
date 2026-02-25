interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Cornerstone logo — an inline SVG keystone / arch motif.
 *
 * The design shows a classic architectural keystone with a semicircular arch
 * opening, flanked by two column blocks on a shared base. A horizontal
 * capstone band (with visible shoulders) separates the keystone wedge from
 * the columns. The apex is gently rounded and the base corners are softened.
 *
 * Reads clearly at both 16 px (favicon) and 200 px (splash).
 *
 * Uses `currentColor` for all fills so it inherits the text colour of its
 * container and works correctly in both light and dark contexts with no
 * hardcoded hex values.
 *
 * Accessible: role="img" + aria-label so screen readers announce "Cornerstone".
 */
export function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Cornerstone"
      className={className}
    >
      {/*
       * The shape is drawn as a single compound path using the even-odd fill
       * rule so the arch opening punches through as transparent — giving the
       * keystone silhouette without needing a background colour.
       *
       * Outer shape: pediment base, columns, capstone shoulders, keystone wedge
       * with a rounded apex and softened base corners.
       * Inner cutout: semicircular arch opening (SVG arc command).
       */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d={[
          // --- Outer boundary (clockwise) ---
          // Start bottom-left, inset for rounded corner
          'M 4 29',
          // Rounded bottom-left corner
          'Q 2 29 2 27',
          // Left base edge up to shelf / step
          'L 2 20',
          // Shelf — step in to column inner edge
          'L 10 20',
          // Left column inner edge up to capstone
          'L 10 13',
          // Capstone left shoulder (2-unit ledge)
          'L 12 13',
          // Capstone band (1-unit vertical step to keystone base)
          'L 12 12',
          // Keystone left slope
          'L 15 6',
          // Rounded keystone apex
          'Q 16 4 17 6',
          // Keystone right slope
          'L 20 12',
          // Capstone band right
          'L 20 13',
          // Capstone right shoulder
          'L 22 13',
          // Right column inner edge down to shelf
          'L 22 20',
          // Shelf — step out to base
          'L 30 20',
          // Right base edge down
          'L 30 27',
          // Rounded bottom-right corner
          'Q 30 29 28 29',
          // Close outer
          'Z',

          // --- Inner arch cutout (semicircular) ---
          // Start bottom-left of arch opening
          'M 10 29',
          // Up left side to arch spring line
          'L 10 20',
          // Semicircular arch (radius 6, clockwise sweep = upward)
          'A 6 6 0 0 1 22 20',
          // Down right side
          'L 22 29',
          // Close inner
          'Z',
        ].join(' ')}
      />
    </svg>
  );
}
