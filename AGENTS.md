# Plain Week: agent guide

Plain Week is an open-source (MIT), free, self-hostable, offline-first weekly planner built with Laravel 13, Inertia v3,
React 19, TypeScript, Tailwind v4 and shadcn/ui, using bun and SQLite.

## Read first

- [docs/README.md](./docs/README.md): documentation index
- [docs/stack.md](./docs/stack.md): versions, commands, folder layout, shadcn, Wayfinder, Inertia
- [docs/style.md](./docs/style.md): preset, tokens, dark mode, RTL, task colors
- [docs/architecture.md](./docs/architecture.md): offline-first principle and the sync contract (canonical)
- [docs/conventions.md](./docs/conventions.md): code style, naming, tests, commits and PRs

## Non-negotiables

1. **Offline-first.** IndexedDB (Dexie) is the client's source of truth. The UI only reads and writes the local
   database and never waits on the network to render or apply a user action. The backend is auth plus sync.
2. **shadcn components only.** Add them with `bunx --bun shadcn@latest add <component>`, compose them, and style
   through tokens and Tailwind classes. Don't hand-roll primitives shadcn already has. Use logical (RTL-safe) classes:
   `ms-/me-/ps-/pe-/start-/end-`.
3. **English everywhere.** Code, identifiers, comments, docs, commits and pull requests.

## Before you push

```sh
composer ci:check   # JS lint/format, TS types, Pint, PHPStan, Pest
bun run build
```

Keep `docs/` current with what you change. Never commit anything under `docs/research/`.
