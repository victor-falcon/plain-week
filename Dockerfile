# syntax=docker/dockerfile:1

# Plain Week production image: FrankenPHP (Caddy + PHP) serving the app on
# port 8080 as a non-root user, with SQLite on the /app/storage volume.
# See docs/self-hosting.md.

ARG PHP_VERSION=8.5.12

FROM dunglas/frankenphp:1-php${PHP_VERSION} AS base

# bcmath: Cashier (moneyphp/money) needs it, even with SaaS mode off.
# pcntl: lets the queue worker enforce job timeouts and stop gracefully.
RUN install-php-extensions intl bcmath pcntl

WORKDIR /app

# Build: PHP dependencies, then the front end. The Wayfinder Vite plugin runs
# `php artisan wayfinder:generate`, so this stage needs PHP and the vendor dir.
FROM base AS build

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun

ENV COMPOSER_ALLOW_SUPERUSER=1

RUN install-php-extensions zip

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction --no-progress --prefer-dist

COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile

COPY . .
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative \
    && bun run build \
    && rm -rf node_modules bootstrap/cache/*.php

# Runtime.
FROM base

LABEL org.opencontainers.image.source="https://github.com/victor-falcon/plain-week" \
      org.opencontainers.image.title="Plain Week" \
      org.opencontainers.image.licenses="MIT"

ARG USER=plainweek

ENV SERVER_NAME=:8080 \
    APP_ENV=production \
    APP_DEBUG=false \
    SAAS_ENABLED=false \
    LOG_CHANNEL=stderr \
    DB_CONNECTION=sqlite \
    DB_DATABASE=/app/storage/database/database.sqlite \
    TRUSTED_PROXIES=127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1,fc00::/7

# tini runs as PID 1: it reaps the scheduler's child processes and stops the
# server, the scheduler and the queue worker together (docker/entrypoint.sh).
# Port 8080 needs no privileges: drop the capability so the binary also runs
# with all capabilities dropped (cap_drop: ALL).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 ${USER} \
    && setcap -r /usr/local/bin/frankenphp \
    && chown -R ${USER}:${USER} /config/caddy /data/caddy

COPY docker/php.ini /usr/local/etc/php/conf.d/zz-plain-week.ini
COPY docker/Caddyfile /etc/frankenphp/Caddyfile
COPY docker/entrypoint.sh /usr/local/bin/plain-week-entrypoint
COPY --from=build --chown=${USER}:${USER} /app /app

USER ${USER}

VOLUME /app/storage
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/up > /dev/null || exit 1

# -g: a stop signal reaches the whole process group, not only FrankenPHP.
ENTRYPOINT ["tini", "-g", "--", "plain-week-entrypoint"]
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]
