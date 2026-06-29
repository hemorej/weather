# Weather App

A minimalist single-page weather app built with **Nuxt 3**, **Vue 3**, and **TypeScript**, powered by the [OpenWeatherMap One Call API 4.0](https://openweathermap.org/api/one-call-4).

## Features

- Current conditions: temperature, rain probability, wind, humidity, air quality, alerts
- Horizontally scrollable 24-hour forecast; background tint shifts to match the displayed hour's temperature
- Vertically scrollable 7-day forecast with animated low→high temperature range bars
- Inline city search with up to 5 geocoded suggestions
- Last selected city persisted in `localStorage` across sessions
- 10-minute client-side cache per location (matches OWM's data refresh interval)
- Metric units only (°C, km/h)
- Fully responsive from mobile to desktop

## Requirements

- **Node.js 20+**
- An [OpenWeatherMap](https://openweathermap.org/) account with an API key subscribed to **One Call API 4.0**

> One Call API 4.0 is a **paid** subscription, separate from the free tier.
> Geocoding and Air Pollution endpoints are included on all plans.
> Subscribe at https://openweathermap.org/api/one-call-4

New API keys can take **up to 2 hours** to activate.

## Development setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.template .env
# Edit .env and set OPENWEATHER_API_KEY=<your key>

# 3. Start the dev server
npm run dev
# → http://localhost:3000
```

## Production build & deployment

### Build

```bash
npm run build
```

The output is a Node.js server in `.output/`.

### Environment variable — important distinction

`nuxt.config.ts` reads `OPENWEATHER_API_KEY` via `process.env` **at build time**.
This means there are two valid approaches:

| Approach | How it works | When to use |
|---|---|---|
| `OPENWEATHER_API_KEY` | Read at build time, embedded in the output | Build environments that inject secrets (Vercel, Railway, CI) |
| `NUXT_OPEN_WEATHER_API_KEY` | Read at runtime by the Nuxt server, overrides the build-time value | Self-hosted servers where you want to rotate the key without rebuilding |

On most platforms (Vercel, Railway, Render, Fly.io) you set env vars in the dashboard and the build picks them up automatically via `OPENWEATHER_API_KEY`. For self-hosted Node.js deployments where you start the server separately from the build, prefer `NUXT_OPEN_WEATHER_API_KEY`.

### Run the production server

```bash
# With the key set at build time (already embedded):
node .output/server/index.mjs

# With runtime key injection:
NUXT_OPEN_WEATHER_API_KEY=your_key node .output/server/index.mjs
```

The server listens on port **3000** by default. Set `PORT` to override.

### Deploy to Vercel (zero-config)

```bash
npm i -g vercel
vercel
# Set OPENWEATHER_API_KEY in the Vercel dashboard → Settings → Environment Variables
```

### Deploy to a VPS / Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY .output .output
EXPOSE 3000
ENV NUXT_OPEN_WEATHER_API_KEY=""
CMD ["node", ".output/server/index.mjs"]
```

## Project structure

```
weather-app/
├── server/api/
│   ├── weather.get.ts      # Aggregates 4 OWM endpoints; shapes response into WeatherData
│   └── geocoding.get.ts    # Proxies OWM Geocoding API; returns up to 5 GeoLocation results
├── composables/
│   ├── useWeather.ts       # localStorage cache (10-min TTL) + location persistence
│   ├── useGeocoding.ts     # City search composable
│   └── useTemperatureColor.ts  # Temperature → hue mapping for tint and range bars
├── components/
│   ├── WeatherApp.vue      # Main UI: header, hourly strip, 7-day list, city search
│   └── WeatherIcon.vue     # Inline SVG icon set (weather conditions + indicators)
├── types/weather.ts        # Shared TypeScript interfaces
├── assets/css/global.css   # Resets and scrollbar hiding
├── app.vue                 # Root — wraps WeatherApp in <ClientOnly>
└── nuxt.config.ts
```

## API endpoints used

| Purpose | Endpoint | Plan |
|---|---|---|
| Current weather | `GET /data/4.0/onecall/current` | Paid (One Call 4.0) |
| Hourly forecast (up to 24 h) | `GET /data/4.0/onecall/timeline/1h` | Paid (One Call 4.0) |
| Daily forecast (7 days) | `GET /data/4.0/onecall/timeline/1day` | Paid (One Call 4.0) |
| Alert details (when active) | `GET /data/4.0/onecall/alert/{id}` | Paid (One Call 4.0) |
| Air quality / AQI | `GET /data/2.5/air_pollution` | Free |
| City geocoding | `GET /geo/1.0/direct` | Free |

AQI is derived from the PM2.5 concentration using EPA linear breakpoints, giving a 0–200 scale with Good / Moderate / Poor labels.

## Caching

OWM recommends refreshing no more often than every 10 minutes. This app stores each location's response in `localStorage` with a matching TTL. On page load:

1. If a fresh cache entry exists for the saved location → data is shown immediately, no API call.
2. If the cache is expired or missing → four parallel API calls are made, the result is cached.
