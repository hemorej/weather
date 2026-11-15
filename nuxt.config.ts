export default defineNuxtConfig({
  devtools: { enabled: false },

  modules: ['@sentry/nuxt/module'],

  // Sentry runtime init lives in sentry.{client,server}.config.ts and is a no-op
  // unless SENTRY_DSN is set. Sourcemaps are only generated + uploaded when
  // SENTRY_AUTH_TOKEN is present at build time.
  sentry: {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  },
  sourcemap: { client: process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false },

  // The DSN is write-only by design; the browser SDK needs it.
  // Override at runtime with NUXT_PUBLIC_SENTRY_DSN.
  runtimeConfig: {
    public: { sentry: { dsn: process.env.SENTRY_DSN } },
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

  nitro: {
    sourceMap: process.env.NODE_ENV !== 'production' || Boolean(process.env.SENTRY_AUTH_TOKEN),
    compressPublicAssets: true,
    routeRules: {
      '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
      '/fonts/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    },
  },

  vite: {
    build: {
      cssMinify: true,
    },
  },

  experimental: {
    appManifest: false,
  },

  compatibilityDate: '2026-08-20',
})
