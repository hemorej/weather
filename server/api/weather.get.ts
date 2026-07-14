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
  feels_like: number
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
  // OWM has no min/max equivalent for feels_like — day/night stand in as the
  // closest approximation of a daily high/low when toggled.
  feels_like: { day: number; night: number; eve: number; morn: number }
  pop: number | null  // OWM currently returns null here; see deriveDailyPop
  clouds?: number
  weather?: OWMWeather[]
}

interface OWMAQIResponse {
  list: Array<{
    main: { aqi: number }
  }>
}

interface OWMAQIForecastResponse {
  list: Array<{
    dt: number
    main: { aqi: number }
  }>
}

interface OWMForecastResponse {
  list: Array<{
    dt: number
    main: { temp: number; feels_like: number; humidity: number }
    wind: { speed: number; deg: number }
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
 * Coarser 8-point compass, lowercased, for the compact hourly-column suffix
 * (e.g. "24kph.w") — the 16-point windDir() is too fine-grained to read at
 * that size.
 */
function windDirShort(deg: number): string {
  const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  return dirs[Math.round(deg / 45) % 8]!
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
 * OWM's Air Pollution API reports `main.aqi` on a fixed 1–5 scale
 * (Good, Fair, Moderate, Poor, Very Poor) rather than the pollutant
 * concentration itself.
 */
function aqiLabel(aqi: number): string {
  const labels: Record<number, string> = {
    1: 'Good',
    2: 'Fair',
    3: 'Moderate',
    4: 'Poor',
    5: 'Very Poor',
  }
  return labels[aqi] ?? 'Unknown'
}

/**
 * Matches each weather-hour timestamp to the closest available air-pollution
 * forecast reading (also hourly, but from a separate OWM endpoint/timeline
 * so the two don't line up exactly minute-for-minute).
 */
function nearestAqi(dt: number, aqiList: Array<{ dt: number; main: { aqi: number } }>): number {
  let best = aqiList[0]
  let bestDiff = Infinity
  for (const item of aqiList) {
    const diff = Math.abs(item.dt - dt)
    if (diff < bestDiff) { bestDiff = diff; best = item }
  }
  return best?.main.aqi ?? 1
}

/**
 * Some regional alert sources (e.g. Environment Canada) use a "###" line to
 * separate the actual hazard description from boilerplate reporting/
 * monitoring instructions repeated on every alert. Drop everything from the
 * first "###" onward so only the hazard-specific prose remains.
 */
function cleanAlertDescription(text: string): string {
  return text.split(/^\s*#+\s*$/m)[0]!.trim()
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
    const [currentRes, hourlyRes, dailyRes, aqiRes, aqiForecastRes, forecastRes] = await Promise.all([
      $fetch<{ data: OWMCurrentData[]; timezone_offset: number }>(`${OWM}/data/4.0/onecall/current?${base}`),
      $fetch<{ data: OWMHourlyData[]; timezone_offset: number }>(`${OWM}/data/4.0/onecall/timeline/1h?${base}&cnt=24`),
      $fetch<{ data: OWMDailyData[]; timezone_offset: number }>(`${OWM}/data/4.0/onecall/timeline/1day?${base}&cnt=8`),
      $fetch<OWMAQIResponse>(`${OWM}/data/2.5/air_pollution?${base}`),
      $fetch<OWMAQIForecastResponse>(`${OWM}/data/2.5/air_pollution/forecast?${base}`),
      $fetch<OWMForecastResponse>(`${OWM}/data/2.5/forecast?${base}`),
    ])

    // Same location across all three onecall calls, so one offset covers them all.
    const tzOffset = currentRes.timezone_offset
    const forecastTzOffset = forecastRes.city.timezone

    const cur = currentRes.data[0]!
    const { cond: curCond, isNight: curIsNight } = conditionFromIcon(cur.weather[0]?.icon ?? '01d')

    // First hourly entry's pop is the best proxy for current-hour rain probability
    const rainPercent = Math.round((hourlyRes.data[0]?.pop ?? 0) * 100)

    const aqi = aqiRes.list[0]?.main?.aqi ?? 1

    // OWM's `alerts` field lists every concurrently active alert's UUID — a
    // single location can have several (e.g. tornado + squall + thunderstorm
    // watches at once), so all of them are fetched, not just the first.
    let alertActive = false
    let alertText = 'None'
    const alertDetails: WeatherAlertDetail[] = []
    if (cur.alerts && cur.alerts.length > 0) {
      const results = await Promise.allSettled(
        cur.alerts.map(id => $fetch<{
          sender_name: string
          event: string
          start: number
          end: number
          description?: Array<{ language: string; description: string }> | string
        }>(`${OWM}/data/4.0/onecall/alert/${id}?appid=${key}`))
      )

      for (const result of results) {
        if (result.status !== 'fulfilled') continue
        const alert = result.value

        // Some regional alert sources (e.g. Environment Canada) leave `event` empty;
        // fall back to scanning the English description for type keywords.
        const engDesc = Array.isArray(alert.description)
          ? (alert.description.find(d => d.language.startsWith('en'))?.description ?? '')
          : (typeof alert.description === 'string' ? alert.description : '')
        const searchText = (alert.event + ' ' + engDesc).toLowerCase()

        let label = 'Alert'
        if (searchText.includes('tornado')) label = 'Tornado'
        else if (searchText.includes('heat') || searchText.includes('humidex')) label = 'Heat'
        else if (searchText.includes('thunder') || searchText.includes('storm')) label = 'Storm'
        else if (searchText.includes('squall') || searchText.includes('wind') || searchText.includes('gale')) label = 'Wind'
        else if (searchText.includes('flood')) label = 'Flood'
        else if (searchText.includes('freeze') || searchText.includes('frost') || searchText.includes('snow')) label = 'Ice'
        else label = alert.event.split(' ')[0] || 'Alert'

        alertDetails.push({
          event: alert.event || label,
          senderName: alert.sender_name || 'Unknown source',
          start: alert.start,
          end: alert.end,
          description: cleanAlertDescription(engDesc) || 'No further details available.',
        })

        // Indicator badge reflects the first successfully-resolved alert.
        if (!alertActive) {
          alertActive = true
          alertText = label
        }
      }

      // All lookups failed (e.g. transient OWM error) but alerts were reported active.
      if (!alertActive) {
        alertActive = true
        alertText = 'Alert'
      }
    }

    const current = {
      temp: Math.round(cur.temp),
      feelsLike: Math.round(cur.feels_like),
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
      alertDetails,
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
        feelsLike: Math.round(h.feels_like),
        conditionCode: cond,
        precip: Math.round(h.pop * 100),
        wind: Math.round(h.wind_speed * 3.6), // m/s → km/h
        windDir: windDirShort(h.wind_deg),
        humidity: h.humidity,
        aqi: nearestAqi(h.dt, aqiForecastRes.list),
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
        feelsLikeLow: Math.round(d.feels_like.night),
        feelsLikeHigh: Math.round(d.feels_like.day),
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
        feelsLike: Math.round(item.main.feels_like),
        conditionCode: cond,
        precip: Math.round(item.pop * 100),
        wind: Math.round(item.wind.speed * 3.6), // m/s → km/h
        windDir: windDirShort(item.wind.deg),
        humidity: item.main.humidity,
        aqi: nearestAqi(item.dt, aqiForecastRes.list),
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
