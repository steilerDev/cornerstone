interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Cornerstone logo — an inline SVG keystone / arch motif.
 *
 * The design shows a classic architectural keystone: a central arch stone
 * flanked by two column blocks sitting on a shared base. It reads clearly
 * at both 16 px (favicon) and 200 px (splash).
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
       * rule so the "arch opening" punches through to become transparent —
       * giving the keystone silhouette without needing a background colour.
       *
       * Outer shape: a wide pediment / keystone block.
       * Inner cutout: the arch opening between the columns.
       */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d={[
          // --- Outer boundary (clockwise) ---
          // Start bottom-left of base
          'M 2 29',
          // Base bottom edge
          'L 30 29',
          // Base right edge up to column top
          'L 30 20',
          // Right column top — right edge
          'L 22 20',
          // Right column up to keystone shoulder
          'L 22 14',
          // Keystone right shoulder
          'L 20 14',
          // Keystone apex — pointed top
          'L 16 5',
          // Keystone left shoulder
          'L 12 14',
          // Left column up to keystone shoulder
          'L 10 14',
          // Left column top — left edge
          'L 10 20',
          // Base left edge down
          'L 2 20',
          // Close outer
          'Z',

          // --- Inner arch cutout (counter-clockwise) ---
          // Start bottom-left of arch opening
          'M 10 27',
          // Up left inner edge
          'L 10 22',
          // Arch lintel (horizontal top of opening)
          'L 22 22',
          // Down right inner edge
          'L 22 27',
          // Close inner
          'Z',
        ].join(' ')}
      />
    </svg>
  );
}
