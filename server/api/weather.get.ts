import type { WeatherData } from '~/types/weather'

const OWM = 'https://api.openweathermap.org'

// ── OWM response shapes ───────────────────────────────────────────────────────

interface OWMWeather { id: number; main: string; icon: string }

interface OWMCurrentData {
  dt: number
  sunrise: number
  sunset: number
  temp: number
  feels_like: number
  humidity: number
  wind_speed: number  // m/s — converted to km/h before returning
  wind_deg: number
  clouds?: number
  weather: OWMWeather[]
  rain?: { '1h': number }
  alerts?: string[]   // alert UUIDs; details fetched separately
}

interface OWMHourlyData {
  dt: number
  temp: number
  humidity: number
  wind_speed: number
  wind_deg: number
  clouds?: number
  pop: number         // probability of precipitation, 0–1
  weather?: OWMWeather[]
}

interface OWMDailyData {
  dt: number
  temp: { day: number; min: number; max: number; night: number; morn: number; eve: number }
  pop: number
  clouds?: number
  weather?: OWMWeather[]
}

interface OWMAQIResponse {
  list: Array<{
    main: { aqi: number }
    components: { pm2_5: number }
  }>
}

interface OWMForecastResponse {
  list: Array<{
    dt: number
    main: { temp: number }
    weather?: OWMWeather[]
    clouds?: { all: number }
    pop: number
    sys?: { pod: string }
  }>
  city: { sunrise: number; sunset: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Maps an OWM icon code (e.g. "01d", "10n") to an internal condition string
 * and a day/night flag. The OWM suffix already encodes day (d) vs night (n),
 * so we can derive both from one field rather than comparing against sunrise/sunset.
 */
function conditionFromIcon(icon: string): { cond: string; isNight: boolean } {
  const isNight = icon.endsWith('n')
  const condMap: Record<string, string> = {
    '01': 'clear', '02': 'partly', '03': 'cloudy', '04': 'cloudy',
    '09': 'rain',  '10': 'rain',   '11': 'storm',  '13': 'rain', '50': 'fog',
  }
  return { cond: condMap[icon.slice(0, 2)] ?? 'cloudy', isNight }
}

/**
 * Fallback condition inference when a record lacks a weather icon (can happen
 * on some OWM One Call 4.0 timeline responses). Uses cloud cover percentage
 * and compares dt against today's sunrise/sunset for day/night.
 */
function conditionFromClouds(clouds: number, dt: number, sunrise: number, sunset: number) {
  const isNight = dt < sunrise || dt > sunset
  let cond = 'clear'
  if (clouds > 80) cond = 'cloudy'
  else if (clouds > 20) cond = 'partly'
  return { cond, isNight }
}

function windDir(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]!
}

/**
 * Converts a PM2.5 concentration (μg/m³) to approximate US AQI
 * using the EPA's standard linear interpolation breakpoints.
 * OWM returns AQI on a 1–5 scale; this gives a more informative 0–200+ value.
 */
function pm25ToAqi(pm25: number): number {
  if (pm25 <= 12.0) return Math.round((pm25 / 12.0) * 50)
  if (pm25 <= 35.4) return Math.round(51 + ((pm25 - 12.1) / 23.3) * 49)
  if (pm25 <= 55.4) return Math.round(101 + ((pm25 - 35.5) / 19.9) * 49)
  return Math.min(200, Math.round(151 + ((pm25 - 55.5) / 94.9) * 49))
}

function aqiLabel(aqi: number): string {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  return 'Poor'
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * Fetches current conditions, hourly (up to 24 h), 7-day daily forecast, and
 * air quality in parallel, then shapes the combined response into the app's
 * internal WeatherData format.
 *
 * The API key never leaves the server — callers receive only the shaped data.
 */
export default defineEventHandler(async (event): Promise<WeatherData> => {
  const config = useRuntimeConfig()

  // h3 v2 (Nuxt 3.16+) getQuery fails on relative URLs in dev; parse manually
  const rawUrl = event.node.req.url ?? ''
  const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : ''
  const params = new URLSearchParams(qs)
  const lat = params.get('lat') ?? ''
  const lon = params.get('lon') ?? ''

  if (!lat || !lon) throw createError({ statusCode: 400, message: 'lat and lon required' })

  const key = config.openWeatherApiKey
  if (!key) throw createError({ statusCode: 500, message: 'API key not configured' })

  const base = `lat=${lat}&lon=${lon}&units=metric&appid=${key}`

  try {
    const [currentRes, hourlyRes, dailyRes, aqiRes, forecastRes] = await Promise.all([
      $fetch<{ data: OWMCurrentData[] }>(`${OWM}/data/4.0/onecall/current?${base}`),
      $fetch<{ data: OWMHourlyData[] }>(`${OWM}/data/4.0/onecall/timeline/1h?${base}&cnt=24`),
      $fetch<{ data: OWMDailyData[] }>(`${OWM}/data/4.0/onecall/timeline/1day?${base}&cnt=8`),
      $fetch<OWMAQIResponse>(`${OWM}/data/2.5/air_pollution?${base}`),
      $fetch<OWMForecastResponse>(`${OWM}/data/2.5/forecast?${base}`),
    ])

    const cur = currentRes.data[0]!
    const { cond: curCond, isNight: curIsNight } = conditionFromIcon(cur.weather[0]?.icon ?? '01d')

    // First hourly entry's pop is the best proxy for current-hour rain probability
    const rainPercent = Math.round((hourlyRes.data[0]?.pop ?? 0) * 100)

    const pm25 = aqiRes.list[0]?.components?.pm2_5 ?? 0
    const aqi = pm25ToAqi(pm25)

    // Fetch the first active alert to get a human-readable event name
    let alertActive = false
    let alertText = 'None'
    if (cur.alerts && cur.alerts.length > 0) {
      try {
        const alert = await $fetch<{
          event: string
          description?: Array<{ language: string; description: string }> | string
        }>(`${OWM}/data/4.0/onecall/alert/${cur.alerts[0]}?appid=${key}`)

        // Some regional alert sources (e.g. Environment Canada) leave `event` empty;
        // fall back to scanning the English description for type keywords.
        const engDesc = Array.isArray(alert.description)
          ? (alert.description.find(d => d.language.startsWith('en'))?.description ?? '')
          : (typeof alert.description === 'string' ? alert.description : '')
        const searchText = (alert.event + ' ' + engDesc).toLowerCase()

        alertActive = true
        if (searchText.includes('heat') || searchText.includes('humidex')) alertText = 'Heat'
        else if (searchText.includes('thunder') || searchText.includes('storm')) alertText = 'Storm'
        else if (searchText.includes('wind') || searchText.includes('gale')) alertText = 'Wind'
        else if (searchText.includes('flood')) alertText = 'Flood'
        else if (searchText.includes('freeze') || searchText.includes('frost') || searchText.includes('snow')) alertText = 'Ice'
        else alertText = alert.event.split(' ')[0] || 'Alert'
      } catch {
        alertActive = true
        alertText = 'Alert'
      }
    }

    const current = {
      temp: Math.round(cur.temp),
      conditionCode: curCond,
      isNight: curIsNight,
      rain: rainPercent,
      wind: Math.round(cur.wind_speed * 3.6), // m/s → km/h
      windDir: windDir(cur.wind_deg),
      humidity: cur.humidity,
      aqi,
      aqiLabel: aqiLabel(aqi),
      alertActive,
      alertText,
    }

    const hourly = hourlyRes.data.map((h, i) => {
      const hourNum = new Date(h.dt * 1000).getHours()
      const { cond, isNight } = h.weather?.[0]?.icon
        ? conditionFromIcon(h.weather[0].icon)
        : conditionFromClouds(h.clouds ?? 0, h.dt, cur.sunrise, cur.sunset)
      return {
        dt: h.dt,
        label: i === 0 ? 'Now' : String(hourNum).padStart(2, '0'),
        isNight,
        temp: Math.round(h.temp),
        conditionCode: cond,
        precip: Math.round(h.pop * 100),
      }
    })

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const daily = dailyRes.data.slice(1, 8).map((d) => {
      const { cond } = d.weather?.[0]?.icon
        ? conditionFromIcon(d.weather[0].icon)
        : conditionFromClouds(d.clouds ?? 0, d.dt, cur.sunrise, cur.sunset)
      return {
        dt: d.dt,
        dayLabel: dayNames[new Date(d.dt * 1000).getDay()]!,
        conditionCode: cond,
        precip: Math.round(d.pop * 100),
        low: Math.round(d.temp.min),
        high: Math.round(d.temp.max),
      }
    })

    const forecast = forecastRes.list.map(item => {
      const hourNum = new Date(item.dt * 1000).getHours()
      const { cond, isNight } = item.weather?.[0]?.icon
        ? conditionFromIcon(item.weather[0].icon)
        : conditionFromClouds(item.clouds?.all ?? 0, item.dt, forecastRes.city.sunrise, forecastRes.city.sunset)
      return {
        dt: item.dt,
        label: String(hourNum).padStart(2, '0'),
        isNight,
        temp: Math.round(item.main.temp),
        conditionCode: cond,
        precip: Math.round(item.pop * 100),
      }
    })

    return { current, hourly, forecast, daily }
  } catch (err: unknown) {
    const e = err as Record<string, any>
    // ofetch exposes status both as err.status (shortcut) and err.response.status
    const status: number | undefined = e?.status ?? e?.response?.status
    // ofetch stores parsed response body in err.response._data
    const owmMessage: string = e?.response?._data?.message ?? e?.data?.message ?? ''

    console.error(`[weather] OWM error — status: ${status}, message: ${owmMessage}`)

    if (status === 401) {
      throw createError({
        statusCode: 401,
        message: owmMessage || 'Invalid API key or missing One Call API 4.0 subscription',
      })
    }
    if (status === 429) throw createError({ statusCode: 429, message: 'Rate limit exceeded — try again later' })
    throw createError({ statusCode: 502, message: owmMessage || 'Weather service unavailable' })
  }
})
