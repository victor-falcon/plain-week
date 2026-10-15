# Plain Week

A minimal, open-source weekly planner and to-do list. Free forever, MIT licensed, and easy to self-host on Coolify or
any VPS.

> Work in progress.

## What it is

- **A weekly planner.** Your week at a glance, one column per day, plus a Someday list for everything without a date.
- **Offline-first.** Your planner lives in your browser (IndexedDB). It loads and works without a connection, and
  every action is instant.
- **Optional account and sync.** Use it as a guest, fully local. Create an account to sync between devices; your local
  work is kept.
- **Self-hostable.** A plain Laravel app with SQLite. No external services required.
- **Free.** No premium tier; every feature is available to everyone.

## Local development

Requirements: PHP 8.3+ (8.5 recommended), Composer, bun 1.3+, and Node.js 24+.

```sh
git clone https://github.com/victor-falcon/plain-week.git
cd plain-week
composer setup      # install dependencies, create .env, generate key, migrate SQLite, build assets
composer run dev    # serve the app, queue worker, logs and Vite
```

Then open the URL printed by `composer run dev` (by default http://127.0.0.1:8000).

Checks:

```sh
composer test         # Pint, PHPStan and Pest
bun run check         # lint and format (Vite+)
bun run types:check   # TypeScript
bun run build         # production assets
```

See [docs/](./docs/README.md) for the stack, style guide, architecture and conventions.

## License

[MIT](./LICENSE)
