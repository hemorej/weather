import type { H3Event } from 'h3'

/**
 * Sites allowed to call our API routes. Not a security boundary — Origin and
 * Referer are ordinary headers a non-browser client can set to anything —
 * but it blocks the common case of another site's JS or a lazy scraper
 * hitting these routes directly and spending a billed OWM request.
 */
const ALLOWED_ORIGINS = [
  'https://weather.jerome-arfouche.ca',
  'http://localhost:3000',
]

/**
 * Rejects requests whose Origin/Referer doesn't match an allowed site, and
 * echoes back Access-Control-Allow-Origin only for matches so cross-site
 * pages can't read the response either. Requests with neither header (e.g.
 * curl, some same-origin navigations) are let through rather than rejected,
 * since failing closed there would also block legitimate direct hits.
 */
export function enforceOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin')
  const referer = getHeader(event, 'referer')

  let candidate = origin
  if (!candidate && referer) {
    try {
      candidate = new URL(referer).origin
    } catch {
      candidate = undefined
    }
  }

  if (candidate && !ALLOWED_ORIGINS.includes(candidate)) {
    getLogger('http').warn('http.origin_rejected', { requestId: event.context.requestId, candidate })
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    setHeader(event, 'Access-Control-Allow-Origin', origin)
  }
}
