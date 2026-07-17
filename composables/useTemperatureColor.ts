/**
 * Converts temperatures to colors for the background tint and range-bar gradient.
 *
 * The hue scale runs from 222 (blue, −10 °C) to 15 (orange-red, 35 °C) using a
 * linear mapping: hue = 222 − 207 × ((clamp(t, −10, 35) + 10) / 45).
 * Lightness and saturation differ between the page tint (lighter, more washed-out)
 * and the range-bar fill (more saturated).
 */
export function useTemperatureColor() {
  /** Returns the hue angle (0–360) for a given temperature in °C. */
  function hueFor(t: number): number {
    const x = Math.max(-10, Math.min(35, t))
    return 222 - 207 * ((x + 10) / 45)
  }

  /** Page-background wash: light, low-saturation tint that shifts with temperature. */
  function tintFor(t: number): string {
    return `hsl(${hueFor(t).toFixed(0)} 72% 93%)`
  }

  /** Dark-mode page-background wash: same hue map, flipped to near-black lightness. */
  function darkTintFor(t: number): string {
    return `hsl(${hueFor(t).toFixed(0)} 24% 11%)`
  }

  /** Saturated fill color used for the 7-day low→high range-bar gradient. */
  function barColorFor(t: number): string {
    return `hsl(${hueFor(t).toFixed(0)} 68% 56%)`
  }

  return { hueFor, tintFor, darkTintFor, barColorFor }
}
