import type { WeatherData, GeoLocation, WeatherCache } from '~/types/weather'

/**
 * OWM data refreshes every 10 minutes — matching that interval avoids wasted
 * API calls on every page load while keeping the displayed data current.
 */
const CACHE_TTL = 10 * 60 * 1000
const LOCATION_KEY = 'weather_location'

/** Cache key rounded to 2 d.p. so nearby successive lookups share the same entry. */
function cacheKey(lat: number, lon: number): string {
  return `weather_cache_${lat.toFixed(2)}_${lon.toFixed(2)}`
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

  return { get, set }
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

/** Calls the Nuxt server route that proxies the OWM One Call API 4.0. */
export async function fetchWeatherData(loc: GeoLocation): Promise<WeatherData> {
  return $fetch<WeatherData>('/api/weather', {
    params: { lat: loc.lat, lon: loc.lon },
  })
}
