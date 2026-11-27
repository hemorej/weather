/** A plain decimal number, with the exponent form JavaScript uses for tiny values. */
const DECIMAL = /^-?\d+(\.\d+)?(e-?\d+)?$/i

/**
 * Parses a latitude (`limit` 90) or longitude (`limit` 180) from a query
 * string value. Returns null for anything that isn't a number in range, so
 * raw input never reaches an upstream URL.
 */
export function parseCoordinate(value: string | null, limit: 90 | 180): number | null {
  if (value === null || !DECIMAL.test(value)) return null
  const n = Number(value)
  return Math.abs(n) <= limit ? n : null
}
