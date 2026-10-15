# Conventions

## Language

Everything in the repository is written in English: code, identifiers, comments, docs, commit messages, pull request
titles and descriptions.

## Code style

| Area                  | Tool                                                                                                                  | Command                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| PHP formatting        | Pint (`laravel` preset, `pint.json`)                                                                                  | `composer lint` / `composer lint:check` |
| PHP static analysis   | Larastan, level 7 (`phpstan.neon`)                                                                                    | `composer types:check`                  |
| TS/TSX lint           | Oxlint through Vite+ (`vite.config.ts` → `lint`, type aware, warnings fail)                                           | `bun run check`                         |
| TS/TSX/CSS formatting | Oxfmt through Vite+ (`vite.config.ts` → `fmt`: 4 spaces, single quotes, semicolons, 80 cols, sorted Tailwind classes) | `bun run check:fix`                     |
| TS types              | `tsc --noEmit`                                                                                                        | `bun run types:check`                   |

`resources/js/components/ui/*` (shadcn) and the Wayfinder output are excluded from lint and formatting.
`.editorconfig` sets the basics (UTF-8, LF, 4 spaces, final newline).

## Naming

- PHP: PSR-4, `StudlyCase` classes, `camelCase` methods, `snake_case` database columns and JSON keys on the wire.
- TS/React: files in `kebab-case` (`nav-user.tsx`), components in `PascalCase`, hooks `use-*.ts(x)` exporting `useX`.
- Inertia page names match their file path under `resources/js/pages` (`auth/login`, `settings/profile`).
- Use Wayfinder helpers for URLs instead of string literals.

## Tests

- Tests run with Pest. Backend behaviour gets feature tests in `tests/Feature` (HTTP in, response/DB out); pure logic
  gets unit tests in `tests/Unit`.
- New test files use Pest's functional syntax (`test()` / `it()` with `expect()`). The starter kit's tests are
  PHPUnit-style classes; when adding a case to one of those files, follow the file's existing style.
- Client logic (the Dexie data layer, the sync engine) gets Vitest unit tests next to the code
  (`resources/js/**/*.test.ts`), run with `bun run test:js`. IndexedDB is provided by `fake-indexeddb` and the network
  by a mocked `fetch` (`resources/js/test/fake-sync-server.ts` implements the sync contract in memory). The tests import
  Wayfinder route helpers, so generate them first (`bun run build`, `composer run dev` or
  `php artisan wayfinder:generate --with-form`); CI does this in `composer setup`.
- React components get Testing Library tests in `*.test.tsx` next to them. Those files opt into a DOM with a
  `// @vitest-environment happy-dom` first line (the default environment is `node`) and use the real local database
  (`fake-indexeddb`), so they cover the component and the data layer together.
- Every bug fix comes with a test that fails without the fix.
- Before pushing, run what CI runs: `composer ci:check` (JS lint/format, TS types, JS tests, Pint, PHPStan, Pest). `bun run build`
  must also succeed.
- UI changes are checked in a real (headless) browser, including offline behaviour where relevant.

## Commits and pull requests

- Small, focused commits with imperative English messages (`Add sync pull endpoint`).
- One task per pull request against `main`; title and description in English, describing what changed, why, and how it
  was verified.
- CI must be green before merging.
- Update the docs in `docs/` in the same pull request when a change affects them.
