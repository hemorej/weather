import type { GeoLocation } from '~/types/weather'

/** Raw shape returned by the OWM Geocoding API before we simplify it. */
interface OWMGeoResult {
  name: string
  local_names?: Record<string, string>
  lat: number
  lon: number
  country: string
  state?: string
}

/**
 * Geocodes a city name using the OWM Geocoding API.
 * Returns up to 5 matches shaped as GeoLocation objects.
 * The API key is kept server-side and never exposed to the browser.
 */
export default defineEventHandler(async (event): Promise<GeoLocation[]> => {
  const config = useRuntimeConfig()

  // h3 v2 (Nuxt 3.16+) getQuery fails on relative URLs in dev; parse manually
  const rawUrl = event.node.req.url ?? ''
  const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : ''
  const query = new URLSearchParams(qs).get('q')?.trim() ?? ''

  if (!query) return []

  const key = config.openWeatherApiKey
  if (!key) throw createError({ statusCode: 500, message: 'API key not configured' })

  try {
    const results = await $fetch<OWMGeoResult[]>(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${key}`
    )

    return results.map((r) => ({
      name: r.name,
      country: r.country,
      state: r.state,
      lat: r.lat,
      lon: r.lon,
    }))
  } catch (err: unknown) {
    const e = err as Record<string, any>
    const status: number | undefined = e?.status ?? e?.response?.status
    if (status === 401) throw createError({ statusCode: 401, message: 'Invalid API key' })
    throw createError({ statusCode: 502, message: 'Geocoding service unavailable' })
  }
})
