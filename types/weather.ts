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
}

export interface WeatherHourly {
  label: string      // 'Now' | '14' | '09'
  isNight: boolean
  temp: number
  conditionCode: string
  precip: number     // precipitation probability %
}

export interface WeatherDaily {
  dayLabel: string   // 'Today' | 'Mon' | 'Tue' | …
  conditionCode: string
  precip: number
  low: number
  high: number
}

export interface WeatherData {
  current: WeatherCurrent
  hourly: WeatherHourly[]
  daily: WeatherDaily[]
}

export interface WeatherCache {
  timestamp: number
  data: WeatherData
}
