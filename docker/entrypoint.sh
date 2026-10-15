#!/bin/sh
# Prepares the storage volume and the database, then starts the server.
set -eu

cd /app

if [ -z "${APP_KEY:-}" ]; then
    echo "plain-week: APP_KEY is not set. Generate one with:" >&2
    echo "  echo \"base64:\$(openssl rand -base64 32)\"" >&2
    exit 1
fi

if ! php -r '
    $key = getenv("APP_KEY");
    if (str_starts_with($key, "base64:")) {
        $key = base64_decode(substr($key, 7), true);
    }
    exit($key !== false && strlen($key) === 32 ? 0 : 1);
'; then
    echo "plain-week: APP_KEY must be 32 bytes: \"base64:\" followed by 32 random bytes in base64," >&2
    echo "  or a plain 32-character string. Generate one with: echo \"base64:\$(openssl rand -base64 32)\"" >&2
    exit 1
fi

# A fresh volume (or a bind mount) starts empty: recreate Laravel's layout.
mkdir -p \
    storage/app/private \
    storage/app/public \
    storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs

if [ "${DB_CONNECTION:-sqlite}" = "sqlite" ]; then
    mkdir -p "$(dirname "$DB_DATABASE")"
    [ -f "$DB_DATABASE" ] || touch "$DB_DATABASE"
fi

if [ ! -w storage/framework ] || [ ! -w bootstrap/cache ]; then
    echo "plain-week: /app/storage is not writable by uid $(id -u). If you bind mount a host directory," >&2
    echo "  run: chown -R $(id -u):$(id -g) <that directory>" >&2
    exit 1
fi

php artisan migrate --force --no-interaction
php artisan optimize --no-interaction

exec "$@"
