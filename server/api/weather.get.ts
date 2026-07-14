import type { WeatherData, WeatherAlertDetail } from '~/types/weather'

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
  pop: number | null  // OWM currently returns null here; see deriveDailyPop
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
  city: { sunrise: number; sunset: number; timezone: number }
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
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(deg / 22.5) % 16]!
}

/**
 * Hour/day/date-key readers below all take an explicit UTC offset (seconds,
 * from OWM's timezone_offset / city.timezone) rather than using the host's
 * local timezone. `new Date(dt * 1000).getHours()` reads the *server's* TZ,
 * which drifts from the queried location's calendar day/hour whenever the
 * two differ — this was silently mislabeling hours and day names.
 */
function localHour(dt: number, offsetSeconds: number): number {
  return new Date((dt + offsetSeconds) * 1000).getUTCHours()
}

function localDayOfWeek(dt: number, offsetSeconds: number): number {
  return new Date((dt + offsetSeconds) * 1000).getUTCDay()
}

function localDateKey(dt: number, offsetSeconds: number): string {
  return new Date((dt + offsetSeconds) * 1000).toISOString().slice(0, 10)
}

/**
 * OWM's daily `pop` field is currently null on this endpoint. Derive a
 * per-day probability from the 3h-interval 5-day forecast instead: treating
 * each bucket's pop as an independent chance of rain, the probability of
 * rain at some point in the day is 1 minus the chance it stays dry all day.
 */
function deriveDailyPop(items: Array<{ dt: number; pop: number }>, offsetSeconds: number): Map<string, number> {
  const byDay = new Map<string, number[]>()
  for (const item of items) {
    const key = localDateKey(item.dt, offsetSeconds)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(item.pop)
  }
  const result = new Map<string, number>()
  for (const [key, pops] of byDay) {
    const probDry = pops.reduce((acc, p) => acc * (1 - p), 1)
    result.set(key, Math.round((1 - probDry) * 100))
  }
  return result
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

/**
 * Some regional alert sources (e.g. Environment Canada) append CAP section
 * delimiters like a trailing "###" to the description text. Strip those
 * plus surrounding whitespace so the overlay only shows prose.
 */
function cleanAlertDescription(text: string): string {
  return text.replace(/#+\s*$/, '').trim()
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
      $fetch<{ data: OWMCurrentData[]; timezone_offset: number }>(`${OWM}/data/4.0/onecall/current?${base}`),
      $fetch<{ data: OWMHourlyData[]; timezone_offset: number }>(`${OWM}/data/4.0/onecall/timeline/1h?${base}&cnt=24`),
      $fetch<{ data: OWMDailyData[]; timezone_offset: number }>(`${OWM}/data/4.0/onecall/timeline/1day?${base}&cnt=8`),
      $fetch<OWMAQIResponse>(`${OWM}/data/2.5/air_pollution?${base}`),
      $fetch<OWMForecastResponse>(`${OWM}/data/2.5/forecast?${base}`),
    ])

    // Same location across all three onecall calls, so one offset covers them all.
    const tzOffset = currentRes.timezone_offset
    const forecastTzOffset = forecastRes.city.timezone

    const cur = currentRes.data[0]!
    const { cond: curCond, isNight: curIsNight } = conditionFromIcon(cur.weather[0]?.icon ?? '01d')

    // First hourly entry's pop is the best proxy for current-hour rain probability
    const rainPercent = Math.round((hourlyRes.data[0]?.pop ?? 0) * 100)

    const pm25 = aqiRes.list[0]?.components?.pm2_5 ?? 0
    const aqi = pm25ToAqi(pm25)

    // Fetch the first active alert to get a human-readable event name
    let alertActive = false
    let alertText = 'None'
    let alertDetail: WeatherAlertDetail | null = null
    if (cur.alerts && cur.alerts.length > 0) {
      try {
        const alert = await $fetch<{
          sender_name: string
          event: string
          start: number
          end: number
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

        alertDetail = {
          event: alert.event || alertText,
          senderName: alert.sender_name || 'Unknown source',
          start: alert.start,
          end: alert.end,
          description: cleanAlertDescription(engDesc) || 'No further details available.',
        }
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
      alertDetail,
    }

    const hourly = hourlyRes.data.map((h, i) => {
      const hourNum = localHour(h.dt, tzOffset)
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

    // 5-day forecast is the only source with real (non-null) pop values;
    // group its 3h buckets into the location's local calendar days.
    const derivedDailyPop = deriveDailyPop(forecastRes.list, forecastTzOffset)

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const daily = dailyRes.data.slice(1, 8).map((d) => {
      const { cond } = d.weather?.[0]?.icon
        ? conditionFromIcon(d.weather[0].icon)
        : conditionFromClouds(d.clouds ?? 0, d.dt, cur.sunrise, cur.sunset)
      const derived = derivedDailyPop.get(localDateKey(d.dt, tzOffset))
      return {
        dt: d.dt,
        dayLabel: dayNames[localDayOfWeek(d.dt, tzOffset)]!,
        conditionCode: cond,
        precip: derived ?? Math.round((d.pop ?? 0) * 100),
        low: Math.round(d.temp.min),
        high: Math.round(d.temp.max),
      }
    })

    const forecast = forecastRes.list.map(item => {
      const hourNum = localHour(item.dt, forecastTzOffset)
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
