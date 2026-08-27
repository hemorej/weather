export interface GeoLocation {
  name: string
  country: string
  state?: string
  lat: number
  lon: number
}

export interface WeatherCurrent {
  temp: number
  feelsLike: number
  conditionCode: string
  isNight: boolean
  rain: number       // precipitation probability %
  wind: number       // km/h
  windDir: string
  humidity: number   // %
  aqi: number        // 1-5 badge scale derived from Open-Meteo's European AQI (1 = Good … 5 = Very Poor); see eaqiToFive() in server/api/weather.get.ts
  aqiLabel: string   // 'Good' | 'Fair' | 'Moderate' | 'Poor' | 'Very Poor'
  alertActive: boolean
  alertText: string  // 'None' or the alert's short name (from Environment Canada)
  alertDetails: WeatherAlertDetail[]  // all concurrently active alerts, not just the first
}

export interface WeatherAlertDetail {
  event: string
  senderName: string
  start: number        // unix timestamp (seconds UTC)
  end: number          // unix timestamp (seconds UTC)
  description: string
}

export interface WeatherHourly {
  dt: number         // unix timestamp (seconds UTC)
  label: string      // 'Now' | '14' | '09'
  isNight: boolean
  temp: number
  feelsLike: number
  conditionCode: string
  precip: number     // precipitation probability %
  wind: number       // km/h
  windDir: string    // 8-point compass, lowercase (e.g. 'w', 'ne')
  humidity: number   // %
  aqi: number        // 1-5 badge scale (see WeatherCurrent.aqi), matched to the nearest hourly air-quality reading
}

export interface WeatherDaily {
  dt: number         // unix timestamp (seconds UTC)
  dayLabel: string   // 'Today' | 'Mon' | 'Tue' | …
  conditionCode: string
  precip: number
  low: number
  high: number
  // From Open-Meteo's daily apparent_temperature_min / _max.
  feelsLikeLow: number
  feelsLikeHigh: number
}

export interface WeatherData {
  current: WeatherCurrent
  hourly: WeatherHourly[]     // 1-hour intervals, next 24 h
  forecast: WeatherHourly[]   // 1-hour intervals beyond the first 24 h (same Open-Meteo hourly series); backs the "future day clicked" view
  daily: WeatherDaily[]       // next 7 days
}

export interface WeatherCache {
  timestamp: number
  data: WeatherData
}
