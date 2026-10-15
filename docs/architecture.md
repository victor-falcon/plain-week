# Architecture

## Offline-first (permanent rule)

**Plain Week is offline-first. This is a permanent architectural principle, not a feature.**

- The client's source of truth is IndexedDB, accessed through Dexie.
- The UI only reads from and writes to the local database (reactively, via `useLiveQuery`). It never awaits the network
  to render or to apply a user action.
- The Laravel backend is authentication plus a sync service. It is never on the critical path of a user interaction.
- Guests (no account) get the full app, stored locally only.
- Authenticated users additionally get a background sync engine that pushes local mutations (outbox) and pulls remote
  changes.

Any change that makes the UI depend on a server round trip to show or change planner data violates this rule and must
not be merged.

## Data model: Task

Same shape on the client and on the wire. Keys are `snake_case` both on the wire and in Dexie.

| Field            | Type                                                                                                                 | Notes                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `id`             | string (UUID v7)                                                                                                     | Generated on the client                                                                |
| `text`           | string                                                                                                               |                                                                                        |
| `date`           | `'YYYY-MM-DD'` \| `null`                                                                                             | `null` means Someday                                                                   |
| `someday_column` | `0` \| `1` \| `2` \| `null`                                                                                          | Required when `date` is `null`                                                         |
| `position`       | string                                                                                                               | Fractional index key (npm `fractional-indexing`); order within a day or Someday column |
| `done`           | boolean                                                                                                              |                                                                                        |
| `done_at`        | ISO-8601 string \| `null`                                                                                            |                                                                                        |
| `color`          | `'none'` \| `'pink'` \| `'yellow'` \| `'black'` \| `'grey'` \| `'cornflower'` \| `'mango'` \| `'green'` \| `'lilac'` | Default `'none'`                                                                       |
| `time`           | `'HH:mm'` \| `null`                                                                                                  |                                                                                        |
| `notes`          | string                                                                                                               | Plain text in v0.0.1                                                                   |
| `subtasks`       | array of `{ id: string, text: string, done: boolean }`                                                               | Stored as JSON                                                                         |
| `created_at`     | ISO-8601 string (UTC, ms)                                                                                            | Set by the client                                                                      |
| `updated_at`     | ISO-8601 string (UTC, ms)                                                                                            | Set by the client on every change; drives last-write-wins                              |
| `deleted_at`     | ISO-8601 string \| `null`                                                                                            | Soft delete (tombstone). Never hard-delete through sync                                |

Server-only columns: `user_id` (foreign key) and `version` (unsigned bigint, monotonically increasing, assigned on every
accepted write).

## Sync endpoints

Web routes with session auth and CSRF, JSON in and out. All require authentication; guests get `401`.

### `POST /sync/push`

Request: `{ "tasks": [<Task>, ...] }` with full records, at most 500.

For each record the server upserts, scoped to the current user, using last-write-wins: the record is applied only if
there is no stored row or the incoming `updated_at` is greater than or equal to the stored `updated_at`. A record whose
`id` belongs to another user is rejected (ignored and reported). Every applied write gets a new `version`, greater than
every existing version.

Response `200`: `{ "applied": [ids], "rejected": [ids], "cursor": <max version for this user> }`.
Validation errors return `422` in Laravel's standard shape.

### `GET /sync/pull?cursor=<int, default 0>&limit=<int, default 500, max 1000>`

Response `200`: `{ "tasks": [<Task>, ...], "cursor": <version of the last returned row, or the input cursor>, "has_more": bool }`,
with tasks ordered by `version` ascending. Tombstones (`deleted_at` not null) are included.

## Client sync engine

- Every local mutation writes the record and an outbox entry (the task id) in the same Dexie transaction.
- The engine runs only when `auth.user` (Inertia shared prop) is present and `navigator.onLine` is true.
- Triggers: app start, after local mutations (debounced about 1 s), the `online` event, window focus, and every 30 s.
- Order of a run: push the outbox in batches → clear sent entries whose record did not change in the meantime → pull from
  the stored cursor until `has_more` is false.
- A pulled record is applied only if `remote.updated_at >= local.updated_at` and its id is not pending in the outbox.
- The cursor is persisted in the Dexie `meta` table (key `cursor`). The `user_id` is stored there too; if a different
  user logs in, the local database is wiped first.
- Guest to account: guest data is already in the outbox, so the first authenticated sync pushes it and guest work is
  kept.
- Logout wipes the local database (privacy on shared devices).
- The engine exposes a sync status for the UI: `idle` | `syncing` | `offline` | `error`.

## Server side

Laravel provides:

- Authentication and account settings through Fortify (login, registration, password reset, email verification, 2FA,
  passkeys) with Inertia pages.
- The sync endpoints above.
- The HTML shell and built assets. Planner data is never rendered from server props; pages read it from IndexedDB.
