export interface GeoLocation {
  name: string
  country: string
  state?: string
  lat: number
  lon: number
}

export interface WeatherCurrent {
  temp: number
  conditionCode: string
  isNight: boolean
  rain: number       // precipitation probability %
  wind: number       // km/h
  windDir: string
  humidity: number   // %
  aqi: number
  aqiLabel: string   // 'Good' | 'Moderate' | 'Poor'
  alertActive: boolean
  alertText: string  // 'None' | 'Heat' | 'Storm' | etc.
  alertDetail: WeatherAlertDetail | null
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
  conditionCode: string
  precip: number     // precipitation probability %
}

export interface WeatherDaily {
  dt: number         // unix timestamp (seconds UTC)
  dayLabel: string   // 'Today' | 'Mon' | 'Tue' | …
  conditionCode: string
  precip: number
  low: number
  high: number
}

export interface WeatherData {
  current: WeatherCurrent
  hourly: WeatherHourly[]   // 1-hour intervals, next 24 h (One Call 4.0)
  forecast: WeatherHourly[] // 3-hour intervals, next 5 days (Forecast 5 API)
  daily: WeatherDaily[]
}

export interface WeatherCache {
  timestamp: number
  data: WeatherData
}
