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

### Routes and access

| Route             | Name        | Access                                                   |
| ----------------- | ----------- | -------------------------------------------------------- |
| `GET /`           | `home`      | Public. Renders the Inertia page `planner` for everyone. |
| `POST /sync/push` | `sync.push` | `auth` (session + CSRF). `SyncController@push`.          |
| `GET /sync/pull`  | `sync.pull` | `auth` (session). `SyncController@pull`.                 |
| `/settings/*`     |             | `auth`.                                                  |

After login, registration and email verification Fortify redirects to `/` (`config/fortify.php` → `home`).

**Email verification never blocks the app.** Self-hosted instances often have no mail server, so no route uses the
`verified` middleware. The verify-email flow (notice page, resend link, signed verification URL) still works for
instances that do send mail: the "unverified" notice and resend link live on the profile settings page. Keep
`MAIL_MAILER=log` (the default) when there is no mail server, otherwise sending the verification email fails.

Sync routes always answer in JSON, whatever the `Accept` header: guests get `401 {"message": "Unauthenticated."}`
instead of a redirect, validation errors are `422`, and a missing or stale CSRF token is `419`. Requests must be
same-origin and send the `X-XSRF-TOKEN` header from the `XSRF-TOKEN` cookie. Use the Wayfinder helpers
(`@/actions/App/Http/Controllers/SyncController` or `@/routes/sync`) to build the URLs.

The `TrimStrings` and `ConvertEmptyStringsToNull` middleware are skipped for `sync/*`, so strings (empty `notes`,
leading spaces in `text`) round-trip exactly.

### Tables

`tasks`

| Column           | Type                       | Notes                                                       |
| ---------------- | -------------------------- | ----------------------------------------------------------- |
| `id`             | string(36), primary key    | UUID supplied by the client; never generated by the server  |
| `user_id`        | foreign key → `users`      | Cascades on user delete                                     |
| `text`           | text                       |                                                             |
| `date`           | date, nullable             | Returned as `YYYY-MM-DD`                                    |
| `someday_column` | unsigned tinyint, nullable | `0`–`2`                                                     |
| `position`       | string                     | Fractional index key                                        |
| `done`           | boolean                    |                                                             |
| `done_at`        | datetime(3), nullable      | UTC                                                         |
| `color`          | string(16)                 | `App\Enums\TaskColor`                                       |
| `time`           | string(5), nullable        | `HH:mm`                                                     |
| `notes`          | text                       |                                                             |
| `subtasks`       | json                       | List of `{ id, text, done }`                                |
| `created_at`     | datetime(3)                | Client-owned, UTC                                           |
| `updated_at`     | datetime(3)                | Client-owned, UTC; drives last-write-wins                   |
| `deleted_at`     | datetime(3), nullable      | Tombstone. Not Eloquent soft deletes: tombstones are synced |
| `version`        | unsigned bigint            | Indexed with `user_id`                                      |

`sync_versions`: a single row (`id = 1`) holding the last version handed out, seeded by its migration.

The `Task` model disables Eloquent timestamps (the client owns them). Timestamps go through the
`App\Casts\UtcMillisDateTime` cast: they are stored as UTC with milliseconds and returned in the wire format
`Y-m-d\TH:i:s.v\Z` (`2026-10-15T08:35:00.123Z`), so a pushed value comes back byte for byte.

### Versioning

A push runs in one database transaction (`App\Actions\Sync\PushTasks`). Its first statement increments the
`sync_versions` counter by the number of records in the batch, reserving a block of versions. Because that write comes
first, the transaction holds the write lock from the start (the row lock on MySQL/PostgreSQL, the database write lock
on SQLite), so concurrent pushes wait for each other and commit their versions in order. A reader therefore never sees
a version appear behind a cursor it has already passed.

Each applied record takes the next version from the block. Records that are skipped (stale or rejected) leave gaps;
versions only need to increase, not be contiguous. Versions are global across users, so a user's versions are not
consecutive either. The SQLite connection sets `busy_timeout` to 5 s (`DB_BUSY_TIMEOUT`) so concurrent writers wait
instead of failing.

### Push semantics

- Records are processed in request order. A record whose `id` belongs to another user goes to `rejected` and is not
  touched.
- A record older than the stored row (`updated_at` strictly lower) is skipped silently: it is in neither `applied` nor
  `rejected`. Equal `updated_at` is applied.
- `cursor` is the highest version among the user's tasks after the push (`0` if the user has none). It is **not** a
  pull position: other devices may have written versions below it that this client has not pulled yet. Only advance
  the stored pull cursor from `/sync/pull` responses.

Validation (`App\Http\Requests\Sync\PushRequest`) rejects the whole batch with `422` if any record is invalid:
`tasks` must be a list of at most 500 records; every field of the contract must be present; `id` a UUID; `date`
`YYYY-MM-DD` or `null`; `someday_column` `0`–`2` and required when `date` is `null`; `color` one of the nine values;
`time` `HH:mm` or `null`; `done` and subtask `done` real booleans; `subtasks` a list of `{ id, text, done }`;
timestamps exactly `YYYY-MM-DDTHH:mm:ss.sssZ` (what `Date.prototype.toISOString()` produces); `id` must be lowercase
(the primary key is case sensitive). `text`, `notes` and subtask `text` have no length limit; `position` is at most
255 characters.

A `422` is not transient: retrying the same batch fails again. The client should surface it as an error instead of
retrying forever, and must not drop the other records of the batch. `5xx` and network errors are transient (for
example a SQLite lock that outlives `busy_timeout`) and can be retried.

### Examples

```http
POST /sync/push
X-XSRF-TOKEN: …
Content-Type: application/json
Accept: application/json

{
  "tasks": [
    {
      "id": "0199e7a4-6c1e-7a0b-9f3e-2d4c5b6a7e8f",
      "text": "Buy milk",
      "date": "2026-10-15",
      "someday_column": null,
      "position": "a0",
      "done": false,
      "done_at": null,
      "color": "cornflower",
      "time": "09:30",
      "notes": "",
      "subtasks": [{ "id": "s1", "text": "Oat milk", "done": false }],
      "created_at": "2026-10-15T08:35:00.123Z",
      "updated_at": "2026-10-15T08:35:00.123Z",
      "deleted_at": null
    }
  ]
}
```

```json
{
    "applied": ["0199e7a4-6c1e-7a0b-9f3e-2d4c5b6a7e8f"],
    "rejected": [],
    "cursor": 42
}
```

```http
GET /sync/pull?cursor=40&limit=500
Accept: application/json
```

```json
{
    "tasks": [{ "id": "0199e7a4-6c1e-7a0b-9f3e-2d4c5b6a7e8f", "…": "…" }],
    "cursor": 42,
    "has_more": false
}
```
