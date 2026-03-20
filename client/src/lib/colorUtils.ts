/**
 * Color utilities for the Cornerstone frontend.
 */

/**
 * Generates a random visually pleasant hex color.
 *
 * Uses HSL color space with constrained saturation (65–90%) and lightness
 * (40–60%) to avoid near-white, near-black, or washed-out colors.
 *
 * @returns A valid CSS hex color string in the form `#RRGGBB`.
 */
export function generateRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const saturation = Math.floor(Math.random() * 26) + 65; // 65–90%
  const lightness = Math.floor(Math.random() * 21) + 40;  // 40–60%
  return hslToHex(hue, saturation, lightness);
}

/**
 * Converts HSL values to a CSS hex color string.
 */
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
