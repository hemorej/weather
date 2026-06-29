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
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@200;300;400;500;600;700&display=swap',
        },
      ],
    },
  },

  css: ['~/assets/css/global.css'],

  experimental: {
    appManifest: false,
  },

  compatibilityDate: '2024-09-19',
})
