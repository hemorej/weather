import * as Sentry from '@sentry/nuxt'

// Read from process.env: this file is loaded via `node --import` before Nitro
// (and its runtime config) exists. No DSN ⇒ SDK never initialises.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Sentry v11 collects cookies, headers, bodies and user info by default;
    // this app handles user-supplied locations, so keep it all off.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
  })
}
