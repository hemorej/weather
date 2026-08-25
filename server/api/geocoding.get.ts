import type { GeoLocation } from '~/types/weather'

/** Raw shape returned by Open-Meteo's Geocoding API before we simplify it. */
interface OpenMeteoGeoResult {
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
  population?: number
}

interface OpenMeteoGeoResponse {
  results?: OpenMeteoGeoResult[]
}

/**
 * Geocodes a city name using Open-Meteo's Geocoding API (free, keyless).
 * Returns up to 5 matches shaped as GeoLocation objects, ranked by
 * population so e.g. "Ottawa" surfaces the Ontario capital before smaller
 * same-named US towns.
 */
export default defineEventHandler(async (event): Promise<GeoLocation[]> => {
  enforceOrigin(event)

  // h3 v2 (Nuxt 3.16+) getQuery fails on relative URLs in dev; parse manually
  const rawUrl = event.node.req.url ?? ''
  const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : ''
  const query = new URLSearchParams(qs).get('q')?.trim() ?? ''

  if (!query) return []

  try {
    const response = await $fetch<OpenMeteoGeoResponse>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
    )

    return (response.results ?? []).map((r) => ({
      name: r.name,
      country: r.country,
      state: r.admin1,
      lat: r.latitude,
      lon: r.longitude,
    }))
  } catch (err: unknown) {
    const e = err as Record<string, any>
    const status: number | undefined = e?.status ?? e?.response?.status
    getLogger('geocoding').error('geocoding.open_meteo_request_failed', {
      requestId: event.context.requestId,
      status,
    })
    throw createError({ statusCode: 502, message: 'Geocoding service unavailable' })
  }
})
