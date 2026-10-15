# Plain Week

A minimal, open-source weekly planner and to-do list. Free forever, MIT licensed, offline-first and easy to self-host.

![Plain Week: the week view in light mode](./docs/images/desktop-light.png)

## Features

- **Your week at a glance.** One column per day, Saturday and Sunday stacked in the last one, and a three-column
  Someday list for everything without a date.
- **Fast entry.** Click any empty row, type, press Enter, keep typing. "17:30 Gym" sets the time for you.
- **Everything about a task in one dialog.** Date, time, nine colors, notes, subtasks, quick moves (tomorrow, next
  week, Someday), duplicate, and delete with undo.
- **Drag and drop.** Reorder within a day, move across days and to Someday, or drop on the screen edge to send a task
  to another week. Mouse, touch and keyboard.
- **Keyboard shortcuts.** ← / → to change weeks, T to jump back to today.
- **Offline-first.** Your planner lives in your browser (IndexedDB). It loads and works without a connection, and
  every action is instant. Install it as an app (PWA).
- **Optional account and sync.** Use it as a guest, fully local. Create an account to sync between devices; your local
  work comes with you.
- **Light and dark mode, RTL support.**
- **Self-hostable.** A plain Laravel app with SQLite. No external services required.
- **Free.** No premium tier; every feature is available to everyone.

| Dark mode                                                     | Task dialog                                        |
| ------------------------------------------------------------- | -------------------------------------------------- |
| ![The week view in dark mode](./docs/images/desktop-dark.png) | ![The task dialog](./docs/images/dialog-light.png) |

| Phone, light                                                              | Phone, dark                                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| <img src="./docs/images/mobile-light.png" alt="Phone, light" width="300"> | <img src="./docs/images/mobile-dark.png" alt="Phone, dark" width="300"> |

## Local development

Requirements: PHP 8.3+ (8.5 recommended), Composer, bun 1.3+, and Node.js 24+.

```sh
git clone https://github.com/victor-falcon/plain-week.git
cd plain-week
composer setup      # install dependencies, create .env, generate key, migrate SQLite, build assets
composer run dev    # serve the app, queue worker, logs and Vite
```

Then open http://127.0.0.1:8000.

Before pushing, run what CI runs:

```sh
composer ci:check   # JS lint/format, TS types, JS tests, Pint, PHPStan, Pest
bun run build       # production assets
```

## Self-hosting

One container, SQLite on a volume, no other services:

```sh
docker run -d -p 8080:8080 -v plainweek-storage:/app/storage \
  -e APP_KEY="base64:$(openssl rand -base64 32)" ghcr.io/victor-falcon/plain-week:latest
```

There is a one-click [Coolify](https://coolify.io) template, a `docker-compose.yml` for any server and a guide for
running it without Docker: see [docs/self-hosting.md](./docs/self-hosting.md).

## Documentation

See [docs/](./docs/README.md) for the architecture (offline-first and the sync contract), the style guide, the stack
and the conventions, and [CHANGELOG.md](./CHANGELOG.md) for what changed in each release.

## License

[MIT](./LICENSE)
