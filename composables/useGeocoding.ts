import type { GeoLocation } from '~/types/weather'

/**
 * Composable that wraps the server-side geocoding endpoint.
 * Debouncing is handled by the caller; this composable is stateless.
 */
export function useGeocoding() {
  /**
   * Search for cities matching `query` via the OWM Geocoding API.
   * Returns up to 5 results, or an empty array when the query is blank.
   * Throws on network/API errors — callers should catch.
   */
  async function searchCity(query: string): Promise<GeoLocation[]> {
    if (!query.trim()) return []
    return $fetch<GeoLocation[]>('/api/geocoding', { params: { q: query } })
  }

  return { searchCity }
}
