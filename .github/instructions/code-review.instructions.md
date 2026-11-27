---
applyTo: "**"
excludeAgent: "cloud-agent"
---

# Code review instructions

This is a weather app: Nuxt 4, Vue 3 and TypeScript, with Nitro routes in `server/` that proxy free, keyless APIs (Open-Meteo and Environment Canada GeoMet). Merging to `main` deploys to production. CI only typechecks and there are no automated tests, so read behaviour changes carefully.

## What to review

In priority order:

1. Security vulnerabilities and data loss.
2. Correctness: bugs, unhandled edge cases, race conditions.
3. Regressions: changed behaviour of existing callers, API shapes or stored data.
4. Performance: repeated or unbounded work, queries, requests or memory use.
5. Documentation that no longer matches the code.
6. Readability that is likely to cause a future mistake.

## What to report

- Report an issue only if you can name the input or sequence of events that triggers it and the resulting wrong behaviour. For documentation, quote the statement and name the code that contradicts it.
- If an issue depends on something you could not verify, say what you assumed.
- State the impact and suggest a concrete fix.
- Skip formatting, naming preferences, style that doesn't hurt readability, and speculative refactors.
- Don't report problems in code the pull request doesn't touch or affect.
- Finding nothing is an acceptable result.

## Documentation alignment

For every behaviour change, check the code comments and `README.md`, `infra/README.md`, `.env.template` and `infra/env.example`. Flag:

- Comments or docs that now describe old behaviour, including in unchanged lines.
- Renamed or removed files, routes, scripts, settings or environment variables still referenced by their old name.
- New environment variables, routes, scripts or scheduled work that are undocumented.
- Changes to `infra/` files that need a matching manual step which the docs don't mention.

Don't ask for comments on self-explanatory code.

## Project rules

Security and upstream APIs:

- Query parameters are untrusted. Validate or encode them before they go into an upstream URL.
- API routes call `enforceOrigin`. It limits casual cross-site use and is not authentication.
- Upstream responses can be missing fields, empty or slow. A failed alerts lookup must not fail the weather request.
- Watch for changes that multiply upstream requests and risk rate limits.
- Never log or send to Sentry request bodies, headers, user info or precise locations.

Data correctness:

- Open-Meteo returns local timestamps without a timezone. Check conversions using the UTC offset, day boundaries and the "Now" hour.
- The first 24 hourly entries are `hourly` and the rest are `forecast`.
- A change to the `WeatherData` shape must bump `CACHE_VERSION` so cached entries aren't read as the new shape.
- Server and client share the types in `types/weather.ts`.
- Units are metric.

Operations and conventions:

- Code that touches `localStorage` or `window` must only run on the client.
- Clean up timers and event listeners.
- Use pnpm. No API keys. Question new dependencies that a small helper could replace.
