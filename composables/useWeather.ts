import type { WeatherData, GeoLocation, WeatherCache } from '~/types/weather'

/**
 * Open-Meteo updates its models roughly every 15 minutes; a 10-minute client
 * cache avoids re-fetching on every page load while keeping data current.
 */
const CACHE_TTL = 10 * 60 * 1000
const LOCATION_KEY = 'weather_location'

/** Bump whenever the cached `WeatherData` shape changes so old entries are ignored and swept. */
const CACHE_VERSION = 2
const CACHE_PREFIX = 'weather_cache_'
const CURRENT_PREFIX = `${CACHE_PREFIX}v${CACHE_VERSION}_`

/** Cache key rounded to 2 d.p. so nearby successive lookups share the same entry. */
function cacheKey(lat: number, lon: number): string {
  return `${CURRENT_PREFIX}${lat.toFixed(2)}_${lon.toFixed(2)}`
}

/**
 * One-time cleanup: removes cache entries from older versions, expired
 * entries, and anything unparseable. Entries for cities the user never
 * revisits would otherwise stay in localStorage forever.
 */
function sweepCache(): void {
  if (!import.meta.client) return
  try {
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(CACHE_PREFIX)) continue
      if (!key.startsWith(CURRENT_PREFIX)) { stale.push(key); continue }
      try {
        const { timestamp }: WeatherCache = JSON.parse(localStorage.getItem(key)!)
        if (Date.now() - timestamp > CACHE_TTL) stale.push(key)
      } catch {
        stale.push(key)
      }
    }
    stale.forEach(k => localStorage.removeItem(k))
  } catch {
    // localStorage unavailable — nothing to sweep
  }
}

/**
 * Read/write weather data from localStorage with a 10-minute TTL.
 * Both methods are no-ops during SSR (`import.meta.client` guard).
 */
export function useWeatherCache() {
  function get(lat: number, lon: number): WeatherData | null {
    if (!import.meta.client) return null
    try {
      const raw = localStorage.getItem(cacheKey(lat, lon))
      if (!raw) return null
      const { timestamp, data }: WeatherCache = JSON.parse(raw)
      if (Date.now() - timestamp > CACHE_TTL) {
        localStorage.removeItem(cacheKey(lat, lon))
        return null
      }
      return data
    } catch {
      return null
    }
  }

  function set(lat: number, lon: number, data: WeatherData): void {
    if (!import.meta.client) return
    try {
      const entry: WeatherCache = { timestamp: Date.now(), data }
      localStorage.setItem(cacheKey(lat, lon), JSON.stringify(entry))
    } catch {
      // Silently ignore QuotaExceededError — stale cache is not fatal
    }
  }

  return { get, set, sweep: sweepCache }
}

/**
 * Persist and restore the user's last selected location across sessions.
 * Falls back to null (the component then uses the default city).
 */
export function useLocationStorage() {
  function load(): GeoLocation | null {
    if (!import.meta.client) return null
    try {
      const raw = localStorage.getItem(LOCATION_KEY)
      return raw ? (JSON.parse(raw) as GeoLocation) : null
    } catch {
      return null
    }
  }

  function save(loc: GeoLocation): void {
    if (!import.meta.client) return
    try {
      localStorage.setItem(LOCATION_KEY, JSON.stringify(loc))
    } catch {
      // Ignore
    }
  }

  return { load, save }
}

/**
 * Calls the Nuxt server route that aggregates Open-Meteo (forecast + air
 * quality) and Environment Canada alerts into the app's WeatherData shape.
 */
export async function fetchWeatherData(loc: GeoLocation): Promise<WeatherData> {
  return $fetch<WeatherData>('/api/weather', {
    params: { lat: loc.lat, lon: loc.lon },
  })
}
