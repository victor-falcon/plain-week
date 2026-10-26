#!/bin/sh
# Prepares the storage volume and the database, then starts the server with
# the scheduler and the queue worker beside it.
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

if [ ! -w storage ] || [ ! -w bootstrap/cache ]; then
    echo "plain-week: /app/storage is not writable by uid $(id -u). If you bind mount a host directory," >&2
    echo "  run: chown -R $(id -u):$(id -g) <that directory>" >&2
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

php artisan migrate --force --no-interaction
php artisan optimize --no-interaction

# Runs a command again whenever it exits (a crash, or the worker's --max-time),
# until the container stops. A command that keeps failing fast is retried
# less often (5 s, doubling up to 60 s).
supervise() {
    delay=5
    while :; do
        started=$(date +%s)
        # `set -e` must not end the loop when the command fails.
        status=0
        "$@" || status=$?
        if [ $(($(date +%s) - started)) -ge 60 ]; then
            delay=5
        fi
        echo "plain-week: \"$*\" exited with status $status, restarting in ${delay} s" >&2
        sleep "$delay"
        delay=$((delay * 2 > 60 ? 60 : delay * 2))
    done
}

# Next to the server: the Laravel scheduler (routes/console.php) and one
# worker for the database queue. tini (PID 1, see the Dockerfile) reaps their
# children and signals the whole group on stop, so they end with the server.
# Other commands (`docker run ... php artisan ...`) run alone.
if [ "${1:-}" = "frankenphp" ]; then
    # A lock left by a scheduled task the last stop killed would block it.
    php artisan schedule:clear-cache --no-interaction > /dev/null
    supervise php artisan schedule:work --no-interaction &
    supervise php artisan queue:work --sleep=5 --max-time=3600 --memory=64 --no-interaction &
fi

exec "$@"
