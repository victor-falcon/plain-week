# Stack

## Versions

| Layer    | Package                     | Version                                                      |
| -------- | --------------------------- | ------------------------------------------------------------ |
| Runtime  | PHP                         | 8.5 (composer requires `^8.3`; CI runs 8.5)                  |
| Runtime  | bun                         | 1.3 (package manager and script runner)                      |
| Runtime  | Node.js                     | 24+ (used by some tooling; CI runs 24)                       |
| Backend  | Laravel                     | 13                                                           |
| Backend  | Laravel Fortify             | 1.x (authentication, 2FA, passkeys)                          |
| Backend  | Inertia (Laravel adapter)   | 3.x                                                          |
| Backend  | Laravel Wayfinder           | 0.1.x                                                        |
| Database | SQLite                      | default for local dev and tests                              |
| Frontend | React                       | 19 (React Compiler enabled)                                  |
| Frontend | Inertia (React adapter)     | 3.x                                                          |
| Frontend | TypeScript                  | 5.x                                                          |
| Frontend | Tailwind CSS                | 4.x                                                          |
| Frontend | shadcn/ui                   | CLI 4.x, style `radix-luma`, Radix primitives via `radix-ui` |
| Frontend | lucide-react                | icons                                                        |
| Tooling  | Vite+ (`vp`)                | build, dev server, lint (Oxlint) and format (Oxfmt)          |
| Frontend | Dexie (+ dexie-react-hooks) | 4.x, IndexedDB: the client's source of truth                 |
| Frontend | fractional-indexing         | 4.x, `position` keys                                         |
| Frontend | uuid                        | v7 ids generated on the client                               |
| Frontend | vite-plugin-pwa (+ Workbox) | 2.x / 7.x, service worker and web manifest (offline shell)   |
| Tooling  | Vitest (through `vp test`)  | 4.x, JS unit tests with `fake-indexeddb`                     |
| Tooling  | Testing Library + happy-dom | React component tests (`*.test.tsx`)                         |
| Tooling  | Pest                        | 5.x                                                          |
| Tooling  | Pint                        | PHP formatter (`laravel` preset)                             |
| Tooling  | Larastan                    | PHPStan level 7                                              |

Exact versions are pinned by `composer.lock` and `bun.lock`.

## Commands

| Task                                          | Command                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| First-time setup                              | `composer setup` (installs deps, creates `.env`, key, migrates, builds) |
| Dev server (Laravel, queue, logs, Vite)       | `composer run dev`                                                      |
| Production build                              | `bun run build`                                                         |
| SSR build                                     | `bun run build:ssr`                                                     |
| Lint + format check (JS/TS)                   | `bun run check`                                                         |
| Lint + format fix (JS/TS)                     | `bun run check:fix`                                                     |
| Type check (TS)                               | `bun run types:check`                                                   |
| JS unit tests (Vitest)                        | `bun run test:js`                                                       |
| PHP format                                    | `composer lint` (fix) / `composer lint:check`                           |
| PHP static analysis                           | `composer types:check`                                                  |
| PHP tests (runs Pint check + PHPStan + Pest)  | `composer test`                                                         |
| Everything CI runs (JS checks, JS tests, PHP) | `composer ci:check`                                                     |

CI (`.github/workflows/tests.yml`) runs `composer setup` and `composer ci:check` on every pull request to `main` and on
pushes to `main`.

## Folder layout

```
app/                      Laravel application code (controllers, models, actions, middleware)
bootstrap/                Framework bootstrap
config/                   Configuration
database/                 Migrations, factories, seeders (SQLite file lives here locally)
docs/                     Project documentation (this folder)
public/                   Web root; built assets end up in public/build
resources/css/app.css     Tailwind entry point and design tokens (shadcn preset)
resources/js/
  app.tsx                 Inertia entry point: providers, layout resolution, service worker registration
  sw.ts                   Service worker source (offline app shell), built to public/sw.js
  pages/                  Inertia pages (one file per page component)
  layouts/                App, auth and settings layouts
  components/             App components (composed from shadcn components)
  components/planner/     Week view: header, week grid, day columns, task rows, Someday
  components/ui/          shadcn components; managed by the shadcn CLI
  hooks/                  React hooks
  lib/                    Utilities (`cn`, etc.)
  lib/db/                 Dexie database, task repository and queries (offline-first data layer)
  lib/sync/               Background sync engine and its HTTP transport
  lib/planner/            Pure planner logic: week math, smart time, task color styles
  lib/pwa/                Service worker registration, update toast and request matchers
  test/                   Shared helpers for JS unit tests (fake sync server, fixtures)
  types/                  Shared TypeScript types
  actions/, routes/,      Generated by Wayfinder at build/dev time (gitignored)
  wayfinder/
resources/images/pwa/     Source SVGs of the PWA icons (PNGs live in public/)
resources/views/app.blade.php  Root HTML document
routes/                   web.php, settings.php, console.php
tests/                    Pest tests (Feature and Unit)
```

## PWA (offline shell)

`vite-plugin-pwa` is configured in `vite.config.ts` with the `injectManifest` strategy: Workbox injects the list of
built files into `resources/js/sw.ts` and the result is written to `public/sw.js` (gitignored, like the web manifest
in `public/build/manifest.webmanifest`). How the worker caches requests is described in
[architecture.md](./architecture.md#offline-app-shell).

Deploying:

- `public/sw.js` only exists after `bun run build`, so deploy the build output, not just the repository.
- The app must be served from the domain root: the worker, its scope, the manifest and the cached URLs all assume `/`.
- Serve `sw.js` without long-lived caching (`Cache-Control: no-cache`) so browsers pick up new versions.

Configuration:

- The manifest (name, colors from `--background`, icons) lives in `vite.config.ts`; its `<link>` and the
  `theme-color` metas are in `resources/views/app.blade.php`.
- Icons: `public/pwa-192x192.png`, `public/pwa-512x512.png` and `public/maskable-icon-512x512.png`, rendered from
  `resources/images/pwa/*.svg`. After editing an SVG, regenerate them:

    ```sh
    rsvg-convert -w 192 -h 192 resources/images/pwa/icon.svg -o public/pwa-192x192.png
    rsvg-convert -w 512 -h 512 resources/images/pwa/icon.svg -o public/pwa-512x512.png
    rsvg-convert -w 512 -h 512 resources/images/pwa/icon-maskable.svg -o public/maskable-icon-512x512.png
    ```

- `public/offline.html` is a self-contained page (no build step); its colors mirror the tokens in
  `resources/css/app.css`. The manifest colors and the `theme-color` metas are `--background` as hex (`#ffffff`, and
  `#0c0a09` for dark); keep them in sync if the preset changes.

### Testing offline

The service worker only exists in production builds; `composer run dev` never registers it.

1. `bun run build && php artisan serve`, then open `http://127.0.0.1:8000/` once.
2. In DevTools > Application > Service workers, check that `/sw.js` is activated. Then either tick **Offline**
   (DevTools > Network) or stop `php artisan serve`.
3. Reload: the planner renders from the cache with your tasks, and creating or completing tasks still works. Opening a
   server page (for example `/settings/profile`) shows the offline page.
4. To see the update prompt, change any source file, run `bun run build` again and reload: the "Update available"
   toast appears.

Going back to `composer run dev` on the same origin unregisters the worker on the next page load.

## Adding a shadcn component

Always add components through the CLI so they match the preset (`components.json`):

```sh
bunx --bun shadcn@latest add <component>
```

The files land in `resources/js/components/ui/`. Import them from `@/components/ui/<component>`. Those files are
excluded from lint/format, so keep local edits there to a minimum; prefer composing them in `resources/js/components/`.
If the CLI rewrites an import to something other than `@/lib/utils` (it has emitted `from "cn"` before), fix it, and
remove the unrelated `cn` npm package it installs along with it (`bun remove cn`). When it asks to overwrite an
existing file such as `button.tsx`, answer no.

## Inertia

Laravel controllers return `Inertia::render('<page>', $props)`; the page component lives in
`resources/js/pages/<page>.tsx`. Layouts are assigned in `resources/js/app.tsx` by page name (`planner` → no layout,
`auth/*` → auth layout, `settings/*` → app + settings layouts, everything else → app layout). Shared props (for
example `auth.user`, `name`) come from `app/Http/Middleware/HandleInertiaRequests.php`.

## Wayfinder

Wayfinder generates typed TypeScript helpers for Laravel routes and controller actions into `resources/js/routes`,
`resources/js/actions` and `resources/js/wayfinder`. The Vite plugin regenerates them during `composer run dev` and
`bun run build`; to regenerate manually run `php artisan wayfinder:generate --with-form`. Use them instead of
hard-coded URLs:

```ts
import { login } from '@/routes';
import { update } from '@/actions/App/Http/Controllers/Settings/ProfileController';
```

Note: Wayfinder 0.1.x does not know the `QUERY` HTTP verb that Laravel 13 adds to `Route::any()`/`Route::redirect()`,
and the generated TypeScript fails to type-check for such routes. Register explicit verbs instead (for example
`Route::get('settings', fn () => to_route('profile.edit'))`).
