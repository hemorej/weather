# infra — weather.jerome-arfouche.ca

Production runs on the shared DigitalOcean droplet described in
`~/Code/util/infra/` (OS, nginx globals, backups, restore). This directory is
everything specific to this app. Facts as of 2026-10-23.

## Where it lives

| | |
|---|---|
| Domain | `weather.jerome-arfouche.ca` (`www.` → apex, port 80 → https) |
| Stack | Nuxt 4 / Nitro (`node server/index.mjs`) behind nginx; no database |
| Process | supervisor program `daemon-916152`, `user=forge`, **port 9000**, log `/home/forge/.forge/daemon-916152.log` |
| Site root | `/home/forge/weather.jerome-arfouche.ca/current/` → `releases/<id>/`, 4 releases kept (Forge setting); nginx serves `current/.output/public` and proxies the rest to `0.0.0.0:9000` |
| Forge site id | `3266687` |
| TLS | Let's Encrypt via Forge, renewed Mon 10:28 (`/root/.letsencrypt-renew/3566921`) |
| Runs as | `forge` |

## Files here

| File | Purpose | Applied how |
|---|---|---|
| `forge_deploy.sh` | The deploy script — identical to the one in Forge's *Deploy Script* box | Keep the two in step by hand (it isn't on the server, so `snapshot.sh` can't check it) |
| `nginx.conf` | The vhost (`/etc/nginx/sites-available/weather.jerome-arfouche.ca`) | By hand; `./snapshot.sh` flags drift |
| `supervisord.conf` | The Nitro daemon (`/etc/supervisor/conf.d/daemon-916152.conf`) | Created by Forge's *Daemons* page; `./snapshot.sh` flags drift |
| `forge-conf/` | Forge-generated includes, read-only reference. `site.conf` holds the `proxy_pass http://0.0.0.0:9000`, headers and the `.`-file deny rule | Refreshed by `./snapshot.sh` |
| `env.example` | Names of the variables in the server-side `.env` | — |
| `manifest`, `snapshot.sh` | What to compare with the server, and the script | `./snapshot.sh` |

## Server layout

```
/home/forge/weather.jerome-arfouche.ca/
  .env                       read by the supervisor program (`set -a; source .env`)
  current -> releases/<id>
  releases/<id>/
    .env -> ../../.env
    public/fonts -> /mnt//data-volume/weatherfonts     (note the double slash: VOLUME_NAME has a leading "/")
    .output/                 Nitro bundle
```

The block volume only holds the fonts (`/mnt/data-volume/weatherfonts`, ~120 KB).

## Deploy

1. Push to `main` → `deploy` job in `.github/workflows/ci.yml` (after `checks`, environment `production`) calls
   the Forge deploy-trigger URL (secret `FORGE_DEPLOY_URL`).
2. `forge_deploy.sh`: `$CREATE_RELEASE()`, strip the token from the remote URL, `pnpm install --frozen-lockfile`,
   link the fonts, `pnpm build`, `$ACTIVATE_RELEASE()`, then `sudo supervisorctl stop daemon-916152:…`, wait up to
   15 s for port 9000 to be released, `sudo supervisorctl start …`. (`restart` raced with the old process
   holding the port and crash-looped with `EADDRINUSE`.) Expect a few seconds of 502 per deploy.

`forge` may run `supervisorctl restart|start|stop|status|update` without a password (`util/infra/droplet.md`).

## nginx

`nginx.conf` is the only app with rate limiting switched on: `limit_req zone=weather_api burst=60 nodelay`
(zone declared in `~/Code/util/infra/nginx/conf.d/rate-limits.conf`, 20 req/min per IP) — it exists to blunt
abuse of `/api/*`, each call of which fires several billed upstream requests. It serves `/_nuxt/` and `/fonts/`
with `gzip_static` and `expires 1y; immutable`, and includes `forge-conf/3266687/site.conf` for the proxy.
Bot rules come from `snippets/bot-mitigation.conf`.

## Leaving Forge — what needs a new owner

- **The Forge macros** `$CREATE_RELEASE()` / `$ACTIVATE_RELEASE()`: clone, `current` swap, pruning, the `.env` link.
- **Deploy trigger** — SSH as `forge` replaces the curl in `ci.yml`.
- **vhost includes** — inline `forge-conf/3266687/site.conf` and the redirects, drop the `# FORGE …` lines.
- **The daemon** — `supervisord.conf` is an ordinary supervisor program and stays as is.
- **TLS** — Forge-managed `ssl_certificate` paths (`/etc/nginx/ssl/domains/1768515/<cert-id>/`), rewritten on every
  renewal; keep `/.well-known/acme-challenge/` served from `/home/forge/.letsencrypt/`.
