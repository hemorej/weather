import type { AlertSeverity, WeatherData, WeatherHourly, WeatherAlertDetail } from '~/types/weather'

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_AQI = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const GEOMET_ALERTS = 'https://api.weather.gc.ca/collections/weather-alerts/items'

// ── Open-Meteo / ECCC response shapes ──────────────────────────────────────────

interface OpenMeteoCurrent {
  time: string
  temperature_2m: number
  apparent_temperature: number
  relative_humidity_2m: number
  weather_code: number
  wind_speed_10m: number
  wind_direction_10m: number
  is_day: number
  precipitation_probability: number
}

interface OpenMeteoHourly {
  time: string[]
  temperature_2m: number[]
  apparent_temperature: number[]
  relative_humidity_2m: number[]
  weather_code: number[]
  wind_speed_10m: number[]
  wind_direction_10m: number[]
  precipitation_probability: number[]
  is_day: number[]
}

interface OpenMeteoDaily {
  time: string[]
  weather_code: number[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  apparent_temperature_max: number[]
  apparent_temperature_min: number[]
  precipitation_probability_max: number[]
}

interface OpenMeteoForecastResponse {
  utc_offset_seconds: number
  current: OpenMeteoCurrent
  hourly: OpenMeteoHourly
  daily: OpenMeteoDaily
}

interface OpenMeteoAQIResponse {
  utc_offset_seconds: number
  current: { european_aqi: number }
  hourly: { time: string[]; european_aqi: number[] }
}

interface GeoMetAlertFeature {
  properties: {
    alert_name_en: string
    alert_short_name_en: string
    alert_text_en: string
    risk_colour_en: string  // ECCC severity palette: 'yellow' | 'orange' | 'red' (occasionally other strings)
    status_en: string   // 'issued' | 'continued' | 'ended' — CAP message lifecycle, not a validity flag
    validity_datetime: string
    expiration_datetime: string
  }
}

interface GeoMetAlertsResponse {
  features: GeoMetAlertFeature[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Open-Meteo's `timezone=auto` returns local, timezone-naive timestamps
 * ("2026-08-25T09:00", or "2026-08-25" for daily entries) rather than unix
 * time. Converting back to true unix UTC lets the rest of this file keep
 * using the same offset-based local*() helpers OWM's shaping used.
 */
function toUnixDt(localTimeStr: string, utcOffsetSeconds: number): number {
  const iso = localTimeStr.includes('T') ? localTimeStr : `${localTimeStr}T00:00:00`
  return Math.round(Date.parse(`${iso}Z`) / 1000) - utcOffsetSeconds
}

/**
 * WMO weather-interpretation codes (the `weather_code` field) collapsed onto
 * this app's existing icon-name vocabulary. WeatherIcon.vue has no dedicated
 * snow icon — matching the previous OWM mapping (whose snow icon '13' also
 * fell into 'rain'), snow codes (71-86) map to 'rain' too.
 */
function conditionFromWMO(code: number): string {
  if (code === 0) return 'clear'
  if (code === 1 || code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 95) return 'storm'
  return 'rain' // drizzle, rain, freezing rain, snow, showers: 51-86
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

function localHour(dt: number, offsetSeconds: number): number {
  return new Date((dt + offsetSeconds) * 1000).getUTCHours()
}

function localDayOfWeek(dt: number, offsetSeconds: number): number {
  return new Date((dt + offsetSeconds) * 1000).getUTCDay()
}

/**
 * European Air Quality Index (0-100+, the EEA's official scale) collapsed
 * onto this app's existing 1-5 badge scale, whose labels (aqiLabel below)
 * already match EAQI's first five band names. EAQI's top two bands ("Very
 * Poor" 80-100 and "Extremely Poor" 100+) both collapse to 5/"Very Poor".
 */
function eaqiToFive(value: number): number {
  if (value < 20) return 1
  if (value < 40) return 2
  if (value < 60) return 3
  if (value < 80) return 4
  return 5
}

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
 * Matches each weather-hour timestamp to the closest available air-quality
 * reading — a safety net in case the two Open-Meteo models don't share an
 * identical hourly time grid for a given location.
 */
function nearestAqi(dt: number, times: number[], values: number[]): number {
  let bestIdx = 0
  let bestDiff = Infinity
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(times[i]! - dt)
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i }
  }
  return eaqiToFive(values[bestIdx] ?? 0)
}

/**
 * Some regional alert sources (e.g. Environment Canada) use a "###" line to
 * separate the actual hazard description from boilerplate reporting/
 * monitoring instructions repeated on every alert. Drop everything from the
 * first "###" onward so only the hazard-specific prose remains, then also
 * strip the "Please continue to monitor alerts…" paragraph, which ECCC often
 * repeats inside the body (before the "###") as well.
 */
function cleanAlertDescription(text: string): string {
  return text
    .split(/^\s*#+\s*$/m)[0]!
    .replace(/^\s*Please continue to monitor.*(\n(?!\n).*)*/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { moderate: 0, severe: 1, extreme: 2 }

/**
 * Map ECCC's risk_colour_en to the app's 3-level severity scale. Orange (the
 * common "warning" colour) and anything unrecognised fall through to 'severe',
 * matching the single accent the UI used before severity was wired in.
 */
function severityFromRiskColour(colour: string | undefined): AlertSeverity {
  switch (colour?.toLowerCase()) {
    case 'yellow': return 'moderate'
    case 'red':    return 'extreme'
    default:       return 'severe'
  }
}

/** Shapes one Open-Meteo hourly array index into the app's WeatherHourly record. */
function buildHourlyEntry(
  h: OpenMeteoHourly,
  idx: number,
  dt: number,
  label: string,
  aqiDts: number[],
  aqiValues: number[],
): WeatherHourly {
  return {
    dt,
    label,
    isNight: h.is_day[idx] === 0,
    temp: Math.round(h.temperature_2m[idx]!),
    feelsLike: Math.round(h.apparent_temperature[idx]!),
    conditionCode: conditionFromWMO(h.weather_code[idx]!),
    precip: Math.round(h.precipitation_probability[idx]!),
    wind: Math.round(h.wind_speed_10m[idx]!),
    windDir: windDirShort(h.wind_direction_10m[idx]!),
    humidity: h.relative_humidity_2m[idx]!,
    aqi: nearestAqi(dt, aqiDts, aqiValues),
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * Fetches current conditions, hourly (16-day model horizon), 7-day daily
 * forecast and air quality from Open-Meteo (no API key required), plus
 * active Canadian weather alerts from Environment Canada's public GeoMet
 * API, then shapes the combined result into the app's internal WeatherData
 * format. International alerts are not yet supported — GeoMet naturally
 * returns nothing outside Canada, so alertActive just stays false there.
 */
export default defineEventHandler(async (event): Promise<WeatherData> => {
  enforceOrigin(event)

  // h3 v2 (Nuxt 3.16+) getQuery fails on relative URLs in dev; parse manually
  const rawUrl = event.node.req.url ?? ''
  const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : ''
  const params = new URLSearchParams(qs)
  const lat = params.get('lat') ?? ''
  const lon = params.get('lon') ?? ''

  if (!lat || !lon) throw createError({ statusCode: 400, message: 'lat and lon required' })

  const forecastUrl = `${OPEN_METEO}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day,precipitation_probability` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation_probability,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=8`
  const aqiUrl = `${OPEN_METEO_AQI}?latitude=${lat}&longitude=${lon}&current=european_aqi&hourly=european_aqi&timezone=auto`

  try {
    const [forecast, aqi] = await Promise.all([
      $fetch<OpenMeteoForecastResponse>(forecastUrl),
      $fetch<OpenMeteoAQIResponse>(aqiUrl),
    ])

    const tzOffset = forecast.utc_offset_seconds
    const aqiDts = aqi.hourly.time.map(t => toUnixDt(t, aqi.utc_offset_seconds))

    // Canada-only for now. A small bbox around the point is enough to catch
    // any alert zone the location falls within (alert polygons are large
    // regional shapes), and the query is inherently empty outside Canada.
    let alertActive = false
    let alertText = 'None'
    let alertSeverity: AlertSeverity = 'severe'
    let alertDetails: WeatherAlertDetail[] = []
    try {
      const eps = 0.05
      const bbox = `${Number(lon) - eps},${Number(lat) - eps},${Number(lon) + eps},${Number(lat) + eps}`
      const alertsRes = await $fetch<GeoMetAlertsResponse>(`${GEOMET_ALERTS}?f=json&bbox=${bbox}`)

      // status_en is CAP message lifecycle (issued/continued/ended), not a
      // validity flag — an 'ended' (cancelled) alert can still carry a
      // future expiration_datetime, so date-range filtering alone is unreliable.
      const active = alertsRes.features.filter(f => f.properties.status_en !== 'ended')
      alertActive = active.length > 0
      alertText = active[0]?.properties.alert_short_name_en ?? 'None'
      alertDetails = active.map(f => ({
        event: f.properties.alert_name_en,
        senderName: 'Environment Canada',
        severity: severityFromRiskColour(f.properties.risk_colour_en),
        start: Math.round(Date.parse(f.properties.validity_datetime) / 1000),
        end: Math.round(Date.parse(f.properties.expiration_datetime) / 1000),
        description: cleanAlertDescription(f.properties.alert_text_en) || 'No further details available.',
      }))
      alertSeverity = alertDetails.reduce<AlertSeverity>(
        (worst, d) => (SEVERITY_RANK[d.severity] > SEVERITY_RANK[worst] ? d.severity : worst),
        'moderate',
      )
    } catch (err) {
      getLogger('weather').warn('weather.geomet_alerts_failed', {
        requestId: event.context.requestId,
        message: (err as Error)?.message,
      })
    }

    const cur = forecast.current
    const curAqiFive = eaqiToFive(aqi.current.european_aqi)

    const current = {
      temp: Math.round(cur.temperature_2m),
      feelsLike: Math.round(cur.apparent_temperature),
      conditionCode: conditionFromWMO(cur.weather_code),
      isNight: cur.is_day === 0,
      rain: Math.round(cur.precipitation_probability),
      wind: Math.round(cur.wind_speed_10m),
      windDir: windDir(cur.wind_direction_10m),
      humidity: cur.relative_humidity_2m,
      aqi: curAqiFive,
      aqiLabel: aqiLabel(curAqiFive),
      alertActive,
      alertText,
      alertSeverity,
      alertDetails,
    }

    // Open-Meteo's hourly array starts at local midnight, not "now" — find
    // the current-hour index so hourly[0] is still "Now", matching the
    // previous OWM-backed behaviour.
    const hourlyDts = forecast.hourly.time.map(t => toUnixDt(t, tzOffset))
    const nowUnix = Math.floor(Date.now() / 1000)
    let nowIdx = 0
    for (let i = 0; i < hourlyDts.length; i++) {
      if (hourlyDts[i]! <= nowUnix) nowIdx = i
      else break
    }

    const hourly = hourlyDts.slice(nowIdx, nowIdx + 24).map((dt, i) => {
      const idx = nowIdx + i
      const label = i === 0 ? 'Now' : String(localHour(dt, tzOffset)).padStart(2, '0')
      return buildHourlyEntry(forecast.hourly, idx, dt, label, aqiDts, aqi.hourly.european_aqi)
    })

    // Open-Meteo's hourly data already extends across the full forecast
    // horizon, so the remaining entries beyond today double as the
    // "future day clicked" detail view — at full hourly resolution, unlike
    // OWM's old 3-hourly 5-day forecast this replaces.
    const forecastArr = hourlyDts.slice(nowIdx + 24).map((dt, i) => {
      const idx = nowIdx + 24 + i
      const label = String(localHour(dt, tzOffset)).padStart(2, '0')
      return buildHourlyEntry(forecast.hourly, idx, dt, label, aqiDts, aqi.hourly.european_aqi)
    })

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const daily = forecast.daily.time.slice(1, 8).map((dateStr, i) => {
      const idx = i + 1
      const dt = toUnixDt(dateStr, tzOffset)
      return {
        dt,
        dayLabel: dayNames[localDayOfWeek(dt, tzOffset)]!,
        conditionCode: conditionFromWMO(forecast.daily.weather_code[idx]!),
        precip: Math.round(forecast.daily.precipitation_probability_max[idx]!),
        low: Math.round(forecast.daily.temperature_2m_min[idx]!),
        high: Math.round(forecast.daily.temperature_2m_max[idx]!),
        feelsLikeLow: Math.round(forecast.daily.apparent_temperature_min[idx]!),
        feelsLikeHigh: Math.round(forecast.daily.apparent_temperature_max[idx]!),
      }
    })

    return { current, hourly, forecast: forecastArr, daily }
  } catch (err: unknown) {
    const e = err as Record<string, any>
    // ofetch exposes status both as err.status (shortcut) and err.response.status
    const status: number | undefined = e?.status ?? e?.response?.status
    // Open-Meteo error bodies are shaped { error: true, reason: string }
    const reason: string = e?.response?._data?.reason ?? e?.data?.reason ?? ''

    getLogger('weather').error('weather.open_meteo_request_failed', {
      requestId: event.context.requestId,
      status,
      reason,
    })

    if (status === 429) throw createError({ statusCode: 429, message: 'Rate limit exceeded — try again later' })
    throw createError({ statusCode: 502, message: reason || 'Weather service unavailable' })
  }
})
