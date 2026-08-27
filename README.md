# Weather App

[![Laravel Forge Site Deployment Status](https://img.shields.io/endpoint?url=https%3A%2F%2Fforge.laravel.com%2Fsite-badges%2F18defe55-bea2-4349-8655-0568668b7c0b&style=plastic)](https://forge.laravel.com/jerome-zpm/resilient-bird/3266687)

A minimalist single-page weather app built with **Nuxt 4**, **Vue 3**, and **TypeScript**, powered by [Open-Meteo](https://open-meteo.com/) (weather, air quality, geocoding) and [Environment Canada's MSC GeoMet API](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/) (alerts) — all free and keyless.

## Features

- Current conditions: temperature, rain probability, wind, humidity, air quality, alerts
- Horizontally scrollable 24-hour forecast; background tint shifts to match the displayed hour's temperature
- Vertically scrollable 7-day forecast with animated low→high temperature range bars
- Inline city search with up to 5 geocoded suggestions, ranked by population
- Last selected city persisted in `localStorage` across sessions
- 10-minute client-side cache per location
- Metric units only (°C, km/h)
- Fully responsive from mobile to desktop

## Requirements

- **Node.js 20+** and **pnpm 11+**
- No API keys or accounts — every upstream API used is free and keyless

## Development setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start the dev server
pnpm dev
# → http://localhost:3000
```

## Production build & deployment

### Build

```bash
pnpm build
```

The output is a Node.js server in `.output/`.

### Run the production server

```bash
node .output/server/index.mjs
```

The server listens on port **3000** by default. Set `PORT` to override.

### Deploy to Vercel (zero-config)

```bash
pnpm add -g vercel
vercel
```

### Deploy to a VPS / Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY .output .output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

## Project structure

```
weather-app/
├── server/api/
│   ├── weather.get.ts      # Aggregates Open-Meteo forecast/AQI + ECCC alerts; shapes response into WeatherData
│   └── geocoding.get.ts    # Proxies Open-Meteo Geocoding API; returns up to 5 GeoLocation results
├── composables/
│   ├── useWeather.ts       # localStorage cache (10-min TTL) + location persistence
│   ├── useGeocoding.ts     # City search composable
│   ├── useTemperatureColor.ts  # Temperature → hue mapping for tint and range bars
│   └── useDarkMode.ts      # Auto dark mode: prefers-color-scheme, 7pm–6am fallback
├── components/
│   ├── WeatherApp.vue      # Main UI: header, hourly strip, 7-day list, city search
│   └── WeatherIcon.vue     # Inline SVG icon set (weather conditions + indicators)
├── types/weather.ts        # Shared TypeScript interfaces
├── assets/css/global.css   # Resets and scrollbar hiding
├── app.vue                 # Root — wraps WeatherApp in <ClientOnly>
├── nuxt.config.ts
└── pnpm-workspace.yaml     # pnpm 11 build script allowlist
```

## API endpoints used

| Purpose | Endpoint | Auth |
|---|---|---|
| Current + hourly + daily forecast | `GET api.open-meteo.com/v1/forecast` | None |
| Air quality (European AQI) | `GET air-quality-api.open-meteo.com/v1/air-quality` | None |
| Weather alerts (Canada only) | `GET api.weather.gc.ca/collections/weather-alerts/items` | None |
| City geocoding | `GET geocoding-api.open-meteo.com/v1/search` | None |

AQI uses the EEA's European Air Quality Index, bucketed to a 1–5 Good…Very Poor scale.

## Caching

This app stores each location's weather response in `localStorage` with a 10-minute TTL. On page load:

1. If a fresh cache entry exists for the saved location → data is shown immediately, no API call.
2. If the cache is expired or missing → the weather/AQI/alerts calls are made, the result is cached.
