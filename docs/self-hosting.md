# Self-hosting

Plain Week is one container: a PHP web server (FrankenPHP) with the app and a SQLite database on a volume. No
database server, cache, queue or mail server is required.

The image is `ghcr.io/victor-falcon/plain-week`, built for `linux/amd64` and `linux/arm64` by GitHub Actions
([`.github/workflows/docker.yml`](../.github/workflows/docker.yml)):

| Tag            | What it is                                      |
| -------------- | ----------------------------------------------- |
| `latest`       | The latest release (from v0.0.3 on)             |
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
domain to port 8080 through its proxy, which terminates TLS. Set `APP_NOINDEX=true` in the service's **Environment
Variables** to keep search engines out; to send email, set `MAIL_MAILER=smtp` and fill in the `MAIL_*` variables the
template lists (see [Email](#email)). The optional Google Calendar sync and push notifications are off until you fill in
their variables, which the template already lists empty: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (see
[Google Calendar](#google-calendar)), and `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (see
[Notifications](#notifications)). Redeploy after changing them.

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

| Variable                | Default                                 | Description                                                                                                                                                                                                                                                                 |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_KEY`               | (required)                              | `base64:` plus 32 random bytes in base64. The container refuses to start without a valid key                                                                                                                                                                                |
| `APP_URL`               | `http://localhost`                      | The public URL, for example `https://plan.example.com`. Used in emails, generated links and link previews (og:image)                                                                                                                                                        |
| `APP_NAME`              | `Plain Week`                            | Shown in the page title and emails                                                                                                                                                                                                                                          |
| `APP_NOINDEX`           | `false`                                 | `true` asks search engines not to index the instance (see [Noindex](#noindex))                                                                                                                                                                                              |
| `APP_LOCALE`            | `en`                                    | Language for browsers that ask for none the instance offers, and for push notifications of accounts on "Browser default". Must be `en` or a locale with a translation file (see [Translations](#translations))                                                              |
| `TRANSLATIONS_PATH`     | `/app/storage/translations`             | Directory of `<locale>.json` translation files that add languages or reword English (see [Translations](#translations)). Missing or empty: English only                                                                                                                     |
| `DB_DATABASE`           | `/app/storage/database/database.sqlite` | The SQLite file. Keep it under `/app/storage` so it lives on the volume                                                                                                                                                                                                     |
| `TRUSTED_PROXIES`       | private ranges                          | Proxies whose `X-Forwarded-*` headers are trusted: comma-separated IPs/CIDRs, or `*` (any caller). The default trusts loopback and private networks (`127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1,fc00::/7`), which covers Coolify and a proxy on the same host |
| `SESSION_SECURE_COOKIE` | on when `APP_URL` is `https://`         | Only send the session cookie over HTTPS. Set `false` if `APP_URL` says `https://` but users reach the app over plain HTTP                                                                                                                                                   |
| `MAIL_MAILER`           | `log`                                   | `log` writes emails (verification, password reset) to the logs instead of sending them. `smtp` sends them through the server below                                                                                                                                          |
| `MAIL_SCHEME`           | (empty)                                 | `smtps` for implicit TLS (port 465); empty for `smtp` with STARTTLS (port 587)                                                                                                                                                                                              |
| `MAIL_HOST`             | (empty)                                 | SMTP server, for example `smtp.resend.com`                                                                                                                                                                                                                                  |
| `MAIL_PORT`             | `587`                                   | SMTP port: `587` (STARTTLS) or `465` (with `MAIL_SCHEME=smtps`)                                                                                                                                                                                                             |
| `MAIL_USERNAME`         | (empty)                                 | SMTP user                                                                                                                                                                                                                                                                   |
| `MAIL_PASSWORD`         | (empty)                                 | SMTP password or API key. Keep it secret                                                                                                                                                                                                                                    |
| `MAIL_FROM_ADDRESS`     | `hello@example.com`                     | Sender address of every email; use one your SMTP provider has verified                                                                                                                                                                                                      |
| `MAIL_FROM_NAME`        | `Plain Week`                            | Sender name                                                                                                                                                                                                                                                                 |
| `LOG_CHANNEL`           | `stderr`                                | Logs go to the container output (`docker logs`)                                                                                                                                                                                                                             |
| `LOG_LEVEL`             | `debug`                                 | `warning` keeps the logs quiet                                                                                                                                                                                                                                              |
| `REGISTRATION_ENABLED`  | `true`                                  | `false` closes sign-up on a private instance: only existing users can log in; see [Closing sign-up](#closing-sign-up). Stays open while the instance has no users, for the first account                                                                                    |
| `OIDC_ISSUER`           | (empty)                                 | Single sign-on: the issuer URL of your OpenID Connect IdP (Pocket ID, Authentik, Keycloak...); see [OIDC / single sign-on](#oidc--single-sign-on). Empty hides it                                                                                                           |
| `OIDC_CLIENT_ID`        | (empty)                                 | The client id of Plain Week at the IdP. Empty hides single sign-on                                                                                                                                                                                                          |
| `OIDC_CLIENT_SECRET`    | (empty)                                 | The client secret that goes with it; empty for a public client (PKCE only). Keep it secret                                                                                                                                                                                  |
| `OIDC_LABEL`            | (empty)                                 | The button text, e.g. `Log in with Authentik`. Empty shows "Log in with SSO" (translated)                                                                                                                                                                                   |
| `OIDC_ENABLED`          | on, off with `SAAS_ENABLED=true`        | Kill switch for single sign-on. `false` turns it off (`/auth/oidc/*` answer `404`, no button) even when configured; empty means the default                                                                                                                                 |
| `OIDC_ONLY`             | `false`                                 | `true` makes the IdP the only way in: no password login, sign-up form, password reset or passkey login. Only with an IdP configured                                                                                                                                         |
| `SAAS_ENABLED`          | `false`                                 | Leave it `false`. `true` turns the instance into the paid hosted service (accounts need a Stripe plan to sync); see [saas.md](./saas.md) for it and its `STRIPE_*` and `SAAS_*` variables                                                                                   |
| `GOOGLE_CLIENT_ID`      | (empty)                                 | OAuth client id for the optional Google Calendar sync; see [Google Calendar](#google-calendar). Empty hides the integration                                                                                                                                                 |
| `GOOGLE_CLIENT_SECRET`  | (empty)                                 | OAuth client secret that goes with `GOOGLE_CLIENT_ID`                                                                                                                                                                                                                       |
| `VAPID_PUBLIC_KEY`      | (empty)                                 | VAPID public key (base64url) for the optional push notifications; see [Notifications](#notifications). Empty turns them off                                                                                                                                                 |
| `VAPID_PRIVATE_KEY`     | (empty)                                 | VAPID private key that goes with `VAPID_PUBLIC_KEY`. Keep it secret                                                                                                                                                                                                         |
| `VAPID_SUBJECT`         | (empty)                                 | Contact for the push services, `mailto:you@example.com` or an `https://` URL                                                                                                                                                                                                |
| `MCP_ENABLED`           | `true`                                  | The MCP server for AI agents (`/mcp`); see [AI agents (MCP)](#ai-agents-mcp). `false` removes `/mcp` (`404`); OAuth, the app API and Settings › Agents & apps stay                                                                                                          |
| `MCP_RATE_LIMIT`        | `120`                                   | Requests a minute one user's agents may send to `/mcp`                                                                                                                                                                                                                      |
| `PASSPORT_PRIVATE_KEY`  | (empty)                                 | Optional: the RSA private key (PEM) that signs agent tokens, instead of the file the container creates in the volume. Keep it secret                                                                                                                                        |
| `PASSPORT_PUBLIC_KEY`   | (empty)                                 | The public key (PEM) that goes with `PASSPORT_PRIVATE_KEY`                                                                                                                                                                                                                  |

With `SAAS_ENABLED=false` (the default) accounts are free and sync without limits, there is no billing anywhere and the
billing, terms and privacy routes are `404`; no Stripe variable is needed. Any other Laravel setting (`config/*.php`)
can be set the same way. Email verification never blocks the app, so an
instance without mail works.

On start, the container creates the storage layout and the SQLite file if they are missing, creates the key pair that
signs agent tokens (`storage/oauth-private.key` and `storage/oauth-public.key`, unless `PASSPORT_PRIVATE_KEY` is set),
runs the migrations and
caches the configuration, routes and views. Then FrankenPHP serves the app on port 8080 as the unprivileged user
`plainweek` (uid 1000). `/up` is the health check (the image's `HEALTHCHECK` uses it).

Background work runs in the same container, with nothing to configure: next to the server the entrypoint starts the
Laravel scheduler (`php artisan schedule:work`) and one queue worker (`php artisan queue:work`; the queue is a table in
the SQLite database). Each is restarted if it exits; the worker also restarts every hour to release memory. Their output
goes to the container logs. `tini` runs as PID 1, so their child processes are reaped and `docker stop` ends all three
together (a job cut short by a stop is retried later). The whole container uses about 125 MB of memory at rest.

### Plain Docker

```sh
docker volume create plainweek-storage
docker run -d --name plainweek --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v plainweek-storage:/app/storage \
  -e APP_KEY="base64:..." \
  -e APP_URL="http://localhost:8080" \
  ghcr.io/victor-falcon/plain-week:latest
```

Open http://localhost:8080. To use a host directory instead of a named volume, make it writable by uid 1000 first
(`chown -R 1000:1000 ./storage`).

### Email

Out of the box emails only go to the logs (`MAIL_MAILER=log`), so verification and password reset links never reach
anyone. Any SMTP provider works. With [Resend](https://resend.com), for example:

```sh
MAIL_MAILER=smtp
MAIL_SCHEME=smtps
MAIL_HOST=smtp.resend.com
MAIL_PORT=465
MAIL_USERNAME=resend
MAIL_PASSWORD=re_your_api_key
MAIL_FROM_ADDRESS=plan@example.com   # on a domain verified in Resend
MAIL_FROM_NAME="Plain Week"
```

Both the Coolify template and `deploy/docker-compose.yml` pass these variables to the container: set them in Coolify's
**Environment Variables** or in the `.env` next to the compose file, then redeploy.

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
from loopback and private networks (`TRUSTED_PROXIES`); keep port 8080 reachable only through the proxy (the compose
file binds it to `127.0.0.1`), or set `TRUSTED_PROXIES` to the proxy's address. With an `https://` `APP_URL` the
session cookie is marked secure.

Serve Plain Week from the root of its domain (not a sub-path): the service worker and the offline shell assume `/`.

## Google Calendar

Optional. Signed-in users can show their dated tasks in a "Plain Week" calendar in their Google account (one way:
Plain Week → Google). The integration is hidden, and its routes are `404`, until both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set. Everything else works without it.

To get the credentials, in the [Google Cloud console](https://console.cloud.google.com/):

1. Create (or pick) a project and enable the **Google Calendar API** (APIs & Services › Library).
2. Configure the **OAuth consent screen** (Google Auth Platform › Branding / Audience): app name, support email, and
   your domain under authorized domains. Add the scope `https://www.googleapis.com/auth/calendar.app.created`
   (Data Access). While the app is in **Testing**, only the test users you list can connect, and Google expires
   their access after 7 days; publish it to lift both limits (Google may ask to verify the app first).
3. Create an **OAuth client ID** (Clients › Create client) of type **Web application**, with the authorized redirect
   URI `APP_URL/settings/integrations/google/callback`, for example
   `https://plan.example.com/settings/integrations/google/callback`. `APP_URL` must match the address users reach.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the client and redeploy.

Users then connect from **Settings › Integrations**. Plain Week asks only for the `calendar.app.created` scope (plus
the account email), so it can see and change the calendars it creates and nothing else. Tokens are stored encrypted
with `APP_KEY`; disconnecting deletes the "Plain Week" calendar and revokes the access.

The events are written in the background by the queue worker (a few seconds after a change syncs) and once a day by
the scheduler (`google-calendar:sync`, at 03:00 in `APP_TIMEZONE`), which the Docker image already runs. Without Docker,
run both as described in [Without Docker](#without-docker): without a worker nothing reaches Google.
`php artisan google-calendar:sync [--user=<id>]` queues a full sync by hand.

If connecting fails ("Google did not connect"), the container logs (`docker logs`) have Google's answer. The usual
causes are a redirect URI that does not match `APP_URL` exactly, the Calendar API not enabled in the project, or a
Google account that is not a test user while the consent screen is in Testing.

## Calendar feed (ICS)

Nothing to configure. Signed-in users can turn on a private calendar feed in **Settings › Integrations** and subscribe
to it from Apple Calendar, Outlook or any app that takes a `webcal://` or `.ics` URL (read only). The URL is built from
`APP_URL`, so it must be the address calendar apps can reach: a feed on a private network only works for apps on that
network (iCloud and Outlook.com fetch it from their own servers). The feed is served as the request comes in, so it
needs neither the queue worker nor the scheduler. Rotating `APP_KEY` keeps the feeds working but the settings page can
no longer show their URLs; users then create a new one.

## Notifications

Optional. Signed-in users can get push notifications in their browsers: every morning one listing the pending tasks of
the day without a time (at a time they choose in **Settings › Notifications**, 08:00 by default, in their own time
zone), and a reminder five minutes before every timed task. Clicking one opens its task, or the planner when it lists
several. Notifications are off, their settings page hidden and
their routes `404`, until `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are all set. Everything else
works without them, and no other service is needed: the container's scheduler sends them.

Generate the key pair once and keep it; a new pair invalidates every browser's subscription, so users would have to
turn notifications on again:

```sh
# In the running container (`docker ps` shows its name):
docker exec <container> php artisan tinker --execute 'dump(Minishlink\WebPush\VAPID::createVapidKeys())'
# Or anywhere with Node:
npx web-push generate-vapid-keys
```

Set the two keys and `VAPID_SUBJECT=mailto:<your email>`, and redeploy. Browsers only allow push on `https://`
(or `localhost`). Delivery failures are logged as warnings in the container output; a browser that unsubscribed is
forgotten the next time a notification is sent to it.

## AI agents (MCP)

On by default, nothing to configure. Plain Week is a remote [MCP](https://modelcontextprotocol.io) server at
`APP_URL/mcp`, so AI agents can read and plan a user's week. Each user connects their agents in **Settings › Agents & apps**:

- **claude.ai and Claude Desktop**: add a custom connector with the URL. The connector registers itself and the user
  approves it on a Plain Week consent page (OAuth 2.1 with dynamic client registration); the app is then listed under
  Connected apps, where it can be disconnected.
- **Claude Code and other headless agents**: create a personal token there and send it as
  `Authorization: Bearer <token>`, for example
  `claude mcp add --transport http plain-week https://plan.example.com/mcp --header "Authorization: Bearer <token>"`.

Agents have the same access as the user. Their changes reach the user's devices on the next sync. Each user may send
`MCP_RATE_LIMIT` requests a minute (120 by default). `APP_URL` must be the public URL: the OAuth metadata and the URL
shown in Settings › Agents & apps come from it, and clients like claude.ai need it on `https://`.

Tokens are signed with an RSA key pair. The container creates it in the storage volume on first start
(`storage/oauth-private.key`, `storage/oauth-public.key`; it is never part of the image) and keeps it across updates.
To manage it yourself instead, set `PASSPORT_PRIVATE_KEY` and `PASSPORT_PUBLIC_KEY` to the PEM keys (with their line
breaks). A new key pair invalidates every token: users then reconnect their apps and create new tokens.

`MCP_ENABLED=false` removes it: `/mcp` answers `404` and Settings › Agents & apps hides the MCP part. OAuth (`/oauth`,
`.well-known/oauth-*`) and the [app API](#native-apps) stay, and so do the tokens.

## Native apps

The Plain Week apps (and any other token client) sync through the app API at `APP_URL/api/v1` (`/me`, `/sync/push`,
`/sync/pull`), always on, nothing to configure. They use the same tokens as agents: the user signs in from the app
(OAuth 2.1 with PKCE; the app registers itself and redirects to a loopback address or a `plainweek://` URL) or pastes
a personal token created in Settings › Agents & apps, where every connected app can be disconnected. There is no
email-and-password login for apps. Details in [architecture.md](./architecture.md#app-api).

## Closing sign-up

By default anyone who reaches the instance can create an account. For a private instance, set
`REGISTRATION_ENABLED=false`: `/register` (the page and the form) answers `404` and the sign-up links are gone (the login
page has no "Sign up", and the planner's "Sync your week" leads to the login page). Existing users keep logging in,
resetting their password and using everything else as before.

While the instance has no users at all, sign-up stays open anyway, so a fresh instance can still create its first
account; it closes as soon as that account exists. To add someone later, set `REGISTRATION_ENABLED=true` for as long as
they need to sign up.

## OIDC / single sign-on

Users can log in with an account they already have at an OpenID Connect identity provider (Pocket ID, Authentik,
Keycloak, or any IdP with a discovery document at `<issuer>/.well-known/openid-configuration`), instead of keeping a
separate password. Register Plain Week at the IdP as a web application (authorization code flow) with:

- **Redirect URI:** `APP_URL/auth/oidc/callback`, for example `https://plan.example.com/auth/oidc/callback`.
- **Scopes:** `openid email profile`.
- PKCE (S256) is always used. A client secret is optional (a public client works too).

Then set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and optionally `OIDC_LABEL`, and restart. The login page
(and the sign-up page, while sign-up is open) shows the button; nothing shows until the issuer and the client id are set.

What happens when someone logs in through the IdP:

1. The account already linked to that IdP identity (its issuer and `sub`) logs in.
2. Otherwise, an existing account with the same email is linked to it, **only if the IdP says the email is verified**
   (`email_verified: true`). An unverified address could belong to anyone, so the login is refused with an explanation;
   the user can still log in with their password. An account already linked to another identity at the same IdP is
   never relinked. If the account's own email was never verified in Plain Week, it loses its password, two-factor,
   passkeys, other sessions and app tokens when it is linked, since someone else could have signed up with that
   address; its owner logs in through the IdP and can set a new password.
3. Otherwise a new account is created (name and email from the IdP, the email marked verified when the IdP verified
   it), only while sign-up is open (`REGISTRATION_ENABLED`, see [Closing sign-up](#closing-sign-up)). Accounts created
   this way have no password.

Two-factor authentication still applies: an account with two-factor on gets its code prompt after the IdP. Before
sensitive settings (two-factor, passkeys, deleting the account), an account without a password confirms by logging in
at the IdP again instead of typing a password. Plain Week asks the IdP to log the user in again (`prompt=login`,
`max_age`) and needs a recent `auth_time` in the ID token, which the OpenID Connect spec requires in that case. If
confirming fails with "did not ask you to log in again", the IdP left it out. In Settings › Security it can set a password, to also log in with its
email (unless `OIDC_ONLY` is on). Logging out of Plain Week does not log out of the IdP.

`OIDC_ONLY=true` makes the IdP the only way in: the login page shows only its button, and password login, the sign-up
form, password reset, passkey login and setting a password answer `404`. Existing users log in through the IdP and are
linked by their verified email, so make sure their address is the same and verified there.

`OIDC_ENABLED=false` turns single sign-on off without removing the other variables. It defaults to on, and to off when
`SAAS_ENABLED=true`. When it is off, accounts created through the IdP log in again with "Forgot it?" (a password reset
by email).

Changing to another IdP (another issuer) is fine: users are linked again by their verified email on their first login.

### Pocket ID

In Pocket ID, open **OIDC Clients › Add OIDC Client**, name it Plain Week and set the callback URL to
`https://plan.example.com/auth/oidc/callback`. Pocket ID shows the client id and secret once:

```dotenv
OIDC_ISSUER=https://id.example.com
OIDC_CLIENT_ID=0f1e2d3c-...
OIDC_CLIENT_SECRET=...
OIDC_LABEL="Log in with Pocket ID"
```

### Authentik

In Authentik, create an **OAuth2/OpenID Provider** (client type confidential, redirect URI
`https://plan.example.com/auth/oidc/callback`, the default `openid`, `email` and `profile` scopes) and an
**Application** with the slug `plain-week` that uses it. The issuer is the application's "OpenID Configuration Issuer":

```dotenv
OIDC_ISSUER=https://authentik.example.com/application/o/plain-week/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_LABEL="Log in with Authentik"
```

Linking existing accounts by email needs the IdP to send `email_verified: true`. If yours sends `false` (check the
user's claims at the IdP, e.g. Authentik's email scope mapping), existing users get "has not verified the address" until
it does.

### Keycloak

Create an OpenID Connect client with client authentication on and the valid redirect URI above. The issuer is the
realm URL:

```dotenv
OIDC_ISSUER=https://keycloak.example.com/realms/home
OIDC_CLIENT_ID=plain-week
OIDC_CLIENT_SECRET=...
```

## Translations

Plain Week ships in English only. You can add languages, or reword the English text, without rebuilding the image: put
one JSON file per language in the translations directory (`TRANSLATIONS_PATH`, by default `translations/` in the
storage volume, so `/app/storage/translations`) and reload the page. No restart is needed, for emails and push
notifications either.

```text
/app/storage/translations/
├── de.json      # adds German
├── pt-BR.json   # adds Brazilian Portuguese
└── en.json      # rewords English (optional)
```

The file name is the language: a two- or three-letter code (`de`, `fil`), optionally with a region or script (`pt-BR`,
`zh_Hant`). Each file is a flat JSON object of keys and texts (`"planner.someday": "…"`, not nested objects). A key you leave out
shows in English, so a file can start with a few keys and grow. Entries that are neither a text nor a plural are
skipped and logged.

```json
{
    "planner.someday": "Irgendwann",
    "planner.carriedOver": {
        "one": "{count} offene Aufgabe auf heute verschoben",
        "other": "{count} offene Aufgaben auf heute verschoben"
    },
    "Profile updated.": "Profil gespeichert.",
    "validation.required": "Das Feld :attribute ist erforderlich.",
    "Reset your password": "Passwort zurücksetzen"
}
```

- **App keys** (`planner.someday`, `settings.profile.title`, …) cover every text of the app. They are listed with their
  English text in [`resources/js/lang/en`](../resources/js/lang/en), one file per area. `{name}` is a placeholder
  filled in by the app; keep it. A plural is an object with one text per
  [plural category](https://cldr.unicode.org/index/cldr-spec/plural-rules) of the language (`zero`, `one`, `two`,
  `few`, `many`, `other`; `other` is required), and `{count}` is the number.
- **Server texts** are keyed by their English text: flash messages ("Profile updated."), push notifications ("Today",
  ":count tasks today"), the password reset and verification emails ("Reset your password", …) and the page's
  link preview description. Laravel's own messages use its keys (`validation.required`, `auth.failed`,
  `passwords.reset`, …; see [Laravel's `lang/en`](https://github.com/laravel/framework/tree/13.x/src/Illuminate/Translation/lang/en)).
  `:name` is a placeholder there (the app's keys use `{name}`). A server plural is one string with the forms separated
  by `|` (`":count tasks today": ":count Aufgabe heute|:count Aufgaben heute"`, Laravel's `trans_choice`). Grouped Laravel keys work one by one (`validation.required`), not as nested
  objects, so `validation.attributes.*` and `validation.custom.*` can't be overridden.

**Which language is used.** Settings › Preferences shows a **Language** picker as soon as the instance offers more
than English: "Browser default" (the default) or one of the languages, saved to the account so every device and the
emails and push notifications follow it. Otherwise the browser's preferred languages pick the first language the
instance offers (`de-AT` matches `de`, `pt` matches `pt-BR`), then `APP_LOCALE`, then English. Guests always get the
browser's language. Arabic, Persian, Hebrew and Urdu are laid out right to left.

**Offline.** The page carries the active language's translations, and the offline copy of the planner keeps them, so a
translated planner stays translated offline. After you change a file, open the app once online to pick it up.

**Not translated:** the terms and privacy pages of the hosted service (SaaS mode), the offline fallback page
(`/offline.html`), the founder's welcome email (SaaS mode, English or Spanish), the MCP tool descriptions that AI agents
read, and typed dates in the task input ("tomorrow", "fri"), which stay English words. A file that is not valid JSON
is ignored and logged as a warning, so a typo never takes the instance down.

With Docker Compose, mount a directory there, for example `./translations:/app/storage/translations:ro`. In Coolify,
add a **Directory Mount** (or one **File Mount** per language) to the `plainweek` service at
`/app/storage/translations`.

## Noindex

With `APP_NOINDEX=true`, every response carries `X-Robots-Tag: noindex, nofollow`, the page has
`<meta name="robots" content="noindex, nofollow">` and `/robots.txt` disallows all crawlers. With the default
(`false`), `/robots.txt` allows everything.

## Backups

Everything the server stores (accounts, synced tasks and agent tokens) is in the SQLite file on the volume; the key
pair that signs agent tokens is next to it (`storage/oauth-*.key`), so back up the whole volume to keep agents
connected after a restore. Guest data only lives in
each browser. Back up while the app runs with SQLite's online backup:

```sh
docker exec plainweek php -r '(new SQLite3("/app/storage/database/database.sqlite"))->backup($b = new SQLite3("/app/storage/backup.sqlite")); $b->close();'
docker cp plainweek:/app/storage/backup.sqlite ./plain-week-$(date +%F).sqlite
docker exec plainweek rm /app/storage/backup.sqlite
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

Migrations run automatically on start. Pin a version tag (`0.0.3`) instead of `latest` if you prefer to update
deliberately, and back up first.

On Coolify, a plain restart keeps the image it already has. To get the new `latest`, use **Redeploy**, or the restart
option that pulls the latest images. Through the API, the restart has to ask for the pull:

```sh
curl -fsS -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "$COOLIFY_URL/api/v1/services/$COOLIFY_SERVICE_UUID/restart?latest=true"
```

Without `?latest=true` (or with `/api/v1/deploy?uuid=…`) the service starts again on the cached image (checked on
Coolify 4.6.0). Either way the container restarts, so the app is down for a few seconds; installed clients keep working
offline and sync once it is back.

### Deploying from CI

The `docker` workflow can do that restart itself once a `v*` tag has been published. Add three repository secrets
(**Settings** > **Secrets and variables** > **Actions**):

| Secret                 | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `COOLIFY_URL`          | Your Coolify instance, e.g. `https://coolify.example.com` (a trailing slash is fine)        |
| `COOLIFY_TOKEN`        | An API token from Coolify > **Keys & Tokens** > **API tokens** with the `deploy` permission |
| `COOLIFY_SERVICE_UUID` | The service's UUID: the last part of its URL in Coolify (`…/service/<uuid>`)                |

The step runs only for release tags (`vX.Y.Z`; not pre-releases, and `edge` builds never deploy), fails the workflow
when Coolify answers with an error, and is skipped with a notice when any of the secrets is missing. A green step means
Coolify queued the restart: check the service in Coolify if the new version doesn't show up.

## Without Docker

Plain Week is a regular Laravel app: see [stack.md](./stack.md#self-hosting-without-docker).

## Maintaining the image

- [`Dockerfile`](../Dockerfile): a build stage (FrankenPHP's PHP plus Composer and bun) installs the PHP
  dependencies without dev packages and runs `bun run build` (the Wayfinder Vite plugin needs PHP); the runtime stage
  is `dunglas/frankenphp` with the PHP version CI uses, the `intl`, `bcmath` and `pcntl` extensions, `tini` as PID 1
  and the built app.
- [`docker/`](../docker): the Caddyfile (port 8080, no TLS, cache headers for `sw.js` and hashed assets, `X-Robots-Tag`
  on static files when `APP_NOINDEX` is on), the PHP ini and the entrypoint (storage layout, migrations, then the
  server with the scheduler and the queue worker beside it).
- Build and run it locally:

    ```sh
    docker build -t plain-week .
    docker run --rm -p 127.0.0.1:8080:8080 -e APP_KEY="base64:$(openssl rand -base64 32)" plain-week
    ```

- Releases are published by CI only: pushing a `vX.Y.Z` tag publishes `X.Y.Z`, `X.Y` and `latest`; every push to
  `main` publishes `edge`. Pull requests build both architectures without pushing.
- The GHCR package must be **public** so Coolify and `docker pull` work without credentials. GitHub creates a new
  container package as private: once, after the first publish, open the package
  (github.com/users/victor-falcon/packages/container/plain-week) > **Package settings** > **Change visibility** >
  **Public**. The image's `org.opencontainers.image.source` label links the package to this repository.
- The Coolify template's `# logo:` points at `svgs/plain-week.svg`, the path Coolify uses for its bundled templates;
  submitting the template upstream means adding [`public/favicon.svg`](../public/favicon.svg) there under that name.
