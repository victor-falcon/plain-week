# Self-hosting

Plain Week is one container: a PHP web server (FrankenPHP) with the app and a SQLite database on a volume. No
database server, cache, queue or mail server is required.

The image is `ghcr.io/victor-falcon/plain-week`, built for `linux/amd64` and `linux/arm64` by GitHub Actions
([`.github/workflows/docker.yml`](../.github/workflows/docker.yml)):

| Tag            | What it is                                      |
| -------------- | ----------------------------------------------- |
| `latest`       | The latest release                              |
| `X.Y.Z`, `X.Y` | A release (`0.0.3`) or its latest patch (`0.0`) |
| `edge`         | The latest commit on `main`                     |
| `sha-<short>`  | A specific commit on `main`                     |

## One-click deployment

### Coolify

Plain Week ships a Coolify service template: [`deploy/coolify/plain-week.yaml`](../deploy/coolify/plain-week.yaml).

1. In your project, **+ New** > **Docker Compose Empty**.
2. Paste the contents of `deploy/coolify/plain-week.yaml` and save.
3. Set the domain of the `plainweek` service (for example `https://plan.example.com`), then **Deploy**.

Coolify generates `APP_KEY` (`SERVICE_REALBASE64_32_APPKEY`, 32 random bytes in base64) and `APP_URL`
(`SERVICE_URL_PLAINWEEK`) on the first deploy and keeps them, creates the `plainweek-storage` volume and routes the
domain to port 8080 through its proxy, which terminates TLS. Change the optional variables (`APP_NOINDEX`, mail) in the
service's **Environment Variables** and redeploy.

## Deploy with Docker

### Requirements

- Docker (or any OCI runtime) on a host with about 256 MB of free memory.
- For anything beyond `localhost`: a domain and a reverse proxy that terminates HTTPS (Caddy, Traefik, nginx). The
  offline mode relies on a service worker, and browsers only allow those over HTTPS or on `localhost`.

### Configuration

The only required setting is `APP_KEY`. Generate it once and keep it: it encrypts sessions and cookies, so changing it
signs everyone out.

```sh
echo "base64:$(openssl rand -base64 32)"
```

| Variable                | Default                                 | Description                                                                                                                                                                     |
| ----------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_KEY`               | (required)                              | `base64:` plus 32 random bytes in base64. The container refuses to start without a valid key                                                                                    |
| `APP_URL`               | `http://localhost`                      | The public URL, for example `https://plan.example.com`. Used in emails and generated links                                                                                      |
| `APP_NAME`              | `Plain Week`                            | Shown in the page title and emails                                                                                                                                              |
| `APP_NOINDEX`           | `false`                                 | `true` asks search engines not to index the instance (see [Noindex](#noindex))                                                                                                  |
| `DB_DATABASE`           | `/app/storage/database/database.sqlite` | The SQLite file. Keep it under `/app/storage` so it lives on the volume                                                                                                         |
| `TRUSTED_PROXIES`       | `*`                                     | Proxies whose `X-Forwarded-*` headers are trusted. A comma-separated list of IPs/CIDRs, or `*` (any caller)                                                                     |
| `SESSION_SECURE_COOKIE` | (unset)                                 | `true` when the app is served over HTTPS, so the session cookie is never sent over plain HTTP                                                                                   |
| `MAIL_MAILER`           | `log`                                   | `log` writes emails to the logs. Set `smtp` plus `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS` to send verification and password reset emails |
| `LOG_CHANNEL`           | `stderr`                                | Logs go to the container output (`docker logs`)                                                                                                                                 |
| `LOG_LEVEL`             | `debug`                                 | `warning` keeps the logs quiet                                                                                                                                                  |

Any other Laravel setting (`config/*.php`) can be set the same way. Email verification never blocks the app, so an
instance without mail works.

On start, the container creates the storage layout and the SQLite file if they are missing, runs the migrations and
caches the configuration, routes and views. Then FrankenPHP serves the app on port 8080 as the unprivileged user
`plainweek` (uid 1000). `/up` is the health check (the image's `HEALTHCHECK` uses it).

### Plain Docker

```sh
docker volume create plainweek-storage
docker run -d --name plainweek --restart unless-stopped \
  -p 8080:8080 \
  -v plainweek-storage:/app/storage \
  -e APP_KEY="base64:..." \
  -e APP_URL="http://localhost:8080" \
  ghcr.io/victor-falcon/plain-week:latest
```

Open http://localhost:8080. To use a host directory instead of a named volume, make it writable by uid 1000 first
(`chown -R 1000:1000 ./storage`).

### Docker Compose: local

[`deploy/docker-compose.yml`](../deploy/docker-compose.yml) runs Plain Week on `http://localhost:8080`:

```sh
mkdir plain-week && cd plain-week
curl -fsSLO https://raw.githubusercontent.com/victor-falcon/plain-week/main/deploy/docker-compose.yml
echo "APP_KEY=base64:$(openssl rand -base64 32)" > .env
docker compose up -d
```

### Docker Compose: public server behind a reverse proxy

Use the same file and point `APP_URL` at your domain, then send the domain to `127.0.0.1:8080` from your reverse proxy:

```sh
cat >> .env <<'ENV'
APP_URL=https://plan.example.com
SESSION_SECURE_COOKIE=true
ENV
docker compose up -d
```

With Caddy, for example:

```caddyfile
plan.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

The proxy must pass `X-Forwarded-Proto` and `X-Forwarded-Host` (Caddy and Traefik do by default; with nginx add
`proxy_set_header X-Forwarded-Proto $scheme;` and `proxy_set_header X-Forwarded-Host $host;`). The image trusts them
from any caller (`TRUSTED_PROXIES=*`), which is safe as long as port 8080 is only reachable through the proxy (the
compose file binds it to `127.0.0.1`); otherwise set `TRUSTED_PROXIES` to the proxy's address.

Serve Plain Week from the root of its domain (not a sub-path): the service worker and the offline shell assume `/`.

## Noindex

With `APP_NOINDEX=true`, every response carries `X-Robots-Tag: noindex, nofollow`, the page has
`<meta name="robots" content="noindex, nofollow">` and `/robots.txt` disallows all crawlers. With the default
(`false`), `/robots.txt` allows everything.

## Backups

Everything the server stores (accounts and synced tasks) is in the SQLite file on the volume. Guest data only lives in
each browser. Back up while the app runs with SQLite's online backup:

```sh
docker exec plainweek php -r '(new SQLite3("/app/storage/database/database.sqlite"))->backup($b = new SQLite3("/app/storage/backup.sqlite")); $b->close();'
docker cp plainweek:/app/storage/backup.sqlite ./plain-week-$(date +%F).sqlite
```

Or stop the container and copy the whole volume:

```sh
docker stop plainweek
docker run --rm -v plainweek-storage:/data -v "$PWD":/backup alpine tar czf /backup/plain-week.tgz -C /data .
docker start plainweek
```

To restore, put the file back at `/app/storage/database/database.sqlite` (owned by uid 1000) and restart. On Coolify,
use the service's **Persistent Storage** tab or the same commands on the server.

## Updating

```sh
docker compose pull && docker compose up -d   # or docker pull + recreate the container
```

Migrations run automatically on start. On Coolify, **Redeploy** pulls the new `latest`. Pin a version tag (`0.0.3`)
instead of `latest` if you prefer to update deliberately, and back up first.

## Without Docker

Plain Week is a regular Laravel app: see [stack.md](./stack.md#self-hosting-without-docker).

## Maintaining the image

- [`Dockerfile`](../Dockerfile): a build stage (FrankenPHP's PHP plus Composer and bun) installs the PHP
  dependencies without dev packages and runs `bun run build` (the Wayfinder Vite plugin needs PHP); the runtime stage
  is `dunglas/frankenphp` with the PHP version CI uses, the `intl` extension and the built app.
- [`docker/`](../docker): the Caddyfile (port 8080, no TLS, cache headers for `sw.js` and hashed assets, `X-Robots-Tag`
  on static files when `APP_NOINDEX` is on), the PHP ini and the entrypoint.
- Build and run it locally:

    ```sh
    docker build -t plain-week .
    docker run --rm -p 8080:8080 -e APP_KEY="base64:$(openssl rand -base64 32)" plain-week
    ```

- Releases are published by CI only: pushing a `vX.Y.Z` tag publishes `X.Y.Z`, `X.Y` and `latest`; every push to
  `main` publishes `edge`. Pull requests build both architectures without pushing.
- The GHCR package must be **public** so Coolify and `docker pull` work without credentials. GitHub creates a new
  container package as private: once, after the first publish, open the package
  (github.com/users/victor-falcon/packages/container/plain-week) > **Package settings** > **Change visibility** >
  **Public**. The image's `org.opencontainers.image.source` label links the package to this repository.
- The Coolify template's `# logo:` points at `svgs/plain-week.svg`, the path Coolify uses for its bundled templates;
  submitting the template upstream means adding [`public/favicon.svg`](../public/favicon.svg) there under that name.
