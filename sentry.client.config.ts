import * as Sentry from '@sentry/nuxt'

const dsn = useRuntimeConfig().public.sentry?.dsn

// No DSN (dev, CI, forks) ⇒ SDK never initialises and nothing is sent.
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Sentry v11 collects cookies, headers, bodies and user info by default;
    // this app handles user-supplied locations, so keep it all off.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
  })
}
