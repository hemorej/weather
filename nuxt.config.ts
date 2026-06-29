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
        { name: 'theme-color', content: '#ffffff' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Weather' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'preload', href: '/fonts/HankenGrotesk-VariableFont_wght.woff2', as: 'font', type: 'font/woff2', crossorigin: '' },
      ],
    },
  },

  css: ['~/assets/css/global.css'],

  experimental: {
    appManifest: false,
  },

  compatibilityDate: '2024-09-19',
})
