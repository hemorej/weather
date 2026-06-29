export default defineNuxtConfig({
  devtools: { enabled: true },

  runtimeConfig: {
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY ?? '',
  },

  app: {
    head: {
      title: 'Weather',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preload', href: '/fonts/HankenGrotesk-VariableFont_wght.ttf', as: 'font', type: 'font/ttf', crossorigin: '' },
      ],
    },
  },

  css: ['~/assets/css/global.css'],

  experimental: {
    appManifest: false,
  },

  compatibilityDate: '2024-09-19',
})
