import type { GeoLocation } from '~/types/weather'

export function useGeocoding() {
  async function searchCity(query: string): Promise<GeoLocation[]> {
    if (!query.trim()) return []
    return $fetch<GeoLocation[]>('/api/geocoding', { params: { q: query } })
  }

  return { searchCity }
}
