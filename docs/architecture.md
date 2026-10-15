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

| Field             | Type                                                                                                                 | Notes                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `id`              | string (UUID v7)                                                                                                     | Generated on the client                                                                |
| `text`            | string                                                                                                               |                                                                                        |
| `date`            | `'YYYY-MM-DD'` \| `null`                                                                                             | `null` means Someday                                                                   |
| `someday_column`  | `0` \| `1` \| `2` \| `null`                                                                                          | Required when `date` is `null`                                                         |
| `position`        | string                                                                                                               | Fractional index key (npm `fractional-indexing`); order within a day or Someday column |
| `done`            | boolean                                                                                                              |                                                                                        |
| `done_at`         | ISO-8601 string \| `null`                                                                                            |                                                                                        |
| `color`           | `'none'` \| `'pink'` \| `'yellow'` \| `'black'` \| `'grey'` \| `'cornflower'` \| `'mango'` \| `'green'` \| `'lilac'` | Default `'none'`                                                                       |
| `time`            | `'HH:mm'` \| `null`                                                                                                  |                                                                                        |
| `notes`           | string                                                                                                               | Plain text in v0.0.1                                                                   |
| `subtasks`        | array of `{ id: string, text: string, done: boolean }`                                                               | Stored as JSON                                                                         |
| `recurrence`      | `{ type: 'weekly', weekdays: number[], until? }` \| `{ type: 'monthly', day: number, until? }` \| `null`             | Only on a series row; stored as JSON. See [Recurring tasks](#recurring-tasks)          |
| `series_id`       | string \| `null`                                                                                                     | Only on an exception row: id of the series it overrides                                |
| `occurrence_date` | `'YYYY-MM-DD'` \| `null`                                                                                             | Only on an exception row: the original generated date it replaces                      |
| `created_at`      | ISO-8601 string (UTC, ms)                                                                                            | Set by the client                                                                      |
| `updated_at`      | ISO-8601 string (UTC, ms)                                                                                            | Set by the client on every change; drives last-write-wins                              |
| `deleted_at`      | ISO-8601 string \| `null`                                                                                            | Soft delete (tombstone). Never hard-delete through sync                                |

Server-only columns: `user_id` (foreign key) and `version` (unsigned bigint, monotonically increasing, assigned on every
accepted write).

### Recurring tasks

A recurring task is stored as one **series** row plus optional **exception** rows; occurrences are computed on the
client from local data, never fetched. Every row is exactly one of three kinds:

| Kind      | `recurrence` | `series_id` | `occurrence_date` | Notes                                                       |
| --------- | ------------ | ----------- | ----------------- | ----------------------------------------------------------- |
| Plain     | `null`       | `null`      | `null`            | A normal task                                               |
| Series    | set          | `null`      | `null`            | `date` is the start (anchor) date and is never `null`       |
| Exception | `null`       | set         | set               | Overrides one occurrence; its own `date` may differ (moved) |

`recurrence` is `{ "type": "weekly", "weekdays": [1, 3, 5] }` (ISO weekdays, 1 = Monday … 7 = Sunday, unique, sorted,
at least one) or `{ "type": "monthly", "day": 1–31 }`, both with an optional `"until": "YYYY-MM-DD"` (inclusive end, not
before `date`). No other keys are allowed.

Expansion (client, pure function): for a visible date range a series yields a virtual occurrence on every matching date
from its `date` to `until` (if set). Weekly matches the listed ISO weekdays; monthly matches `day`, or the last day of
a shorter month. A virtual occurrence has the id `${series.id}:${YYYY-MM-DD}`, inherits the series' content and
`position`, and is not done. An exception row for `(series_id, occurrence_date)` suppresses that occurrence and is shown
at its own `date` instead, or not at all if it is a tombstone. The series row itself is never rendered, and Someday
never holds series or virtual occurrences. Any change to an occurrence materializes an exception; "this and all future"
edits end the series with `until` = the day before and start a new series. The client data layer owns the details (see
[Client data layer](#client-data-layer)).

The server treats the three fields as plain synced columns (same LWW, same push/pull):

- Push validates the `recurrence` shape and the row kinds (`422` otherwise). Tombstones (`deleted_at` set) skip the
  row-kind and `until` checks, so deleting a row is never refused.
- The three keys are optional on push, all together or none, for clients from before v0.0.2. Such a record is applied
  only to a new or plain row (new rows get `null`); for a stored series or exception it is rejected, since those clients
  cannot represent it. Pull always returns the keys, `null` when unset.
- `series_id` is not a foreign key: an exception may arrive before its series (any order across batches). It is
  indexed with `user_id`. Pull only ever returns the user's own rows, so a `series_id` pointing at someone else's task
  exposes nothing. Uniqueness of `(series_id, occurrence_date)` is not enforced by the server either: the client keeps
  it, and a duplicate from two offline devices must not get the push stuck.

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

### `GET /sync/pull?cursor=<int, default 0>&limit=<int 1–1000, default 500>`

Response `200`: `{ "tasks": [<Task>, ...], "cursor": <version of the last returned row, or the input cursor>, "has_more": bool }`,
with tasks ordered by `version` ascending. Tombstones (`deleted_at` not null) are included. A `limit` outside 1–1000 is
a `422` (it is not clamped).

## Client sync engine

- Every local mutation writes the record and an outbox entry (keyed by the task id) in the same Dexie transaction.
- The engine runs only when `auth.user` (Inertia shared prop) is present and `navigator.onLine` is true.
- Triggers: app start, after local mutations (debounced about 1 s), the `online` event, window focus, and every 30 s.
- Order of a run: push the outbox in batches → clear sent entries whose record did not change in the meantime → pull from
  the stored cursor until `has_more` is false.
- A pulled record is applied only if `remote.updated_at >= local.updated_at` and its id is not pending in the outbox.
  (Client refinement: a pending change that is strictly older than the remote record is dropped and the remote record
  applied, because the server would refuse it anyway. See [Sync lifecycle](#sync-lifecycle-libsync).)
- The cursor is persisted in the Dexie `meta` table (key `cursor`). The `user_id` is stored there too; if a different
  user logs in, the local database is wiped first.
- Guest to account: guest data is already in the outbox, so the first authenticated sync pushes it and guest work is
  kept.
- Logout wipes the local database (privacy on shared devices).
- The engine exposes a sync status for the UI: `idle` | `syncing` | `offline` | `error`.

## Client data layer

Everything lives in `resources/js/lib/db` (local data), `resources/js/lib/sync` (sync engine) and `resources/js/hooks`.
The UI imports the repository functions and the hooks; it never talks to `fetch` or to Dexie tables directly.

### IndexedDB schema (Dexie database `plain-week`, version 1)

| Table    | Primary key | Indexes                                                                 | Content                                                             |
| -------- | ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `tasks`  | `id`        | `date`, `[date+position]`, `someday_column`, `updated_at`, `deleted_at` | `Task` records, tombstones included                                 |
| `outbox` | `task_id`   |                                                                         | `{ task_id, revision, failed_revision? }`: pending changes          |
| `meta`   | `key`       |                                                                         | `cursor` (last pulled version), `user_id` (owner of the local data) |

Types are in `lib/db/types.ts`: `Task` (exactly the contract shape), `TaskColor` and `TASK_COLORS` (colour ids only; the
UI owns the swatches), `SomedayColumn`, `Subtask`. Schema changes need a new `this.version(n)` in
`lib/db/database.ts`; never edit a released version.

### Repository API (`lib/db/tasks.ts`)

All functions are local only and return a promise that resolves once IndexedDB has committed; the UI does not need to
await them (the live hooks re-render on their own). Each mutation reads the current record, computes the new one and
writes it plus its outbox entry in one Dexie read-write transaction, so concurrent mutations of the same task never lose
each other's fields and never resurrect a deleted task. `updated_at` is strictly increasing, so a local change always
beats the version it replaces. After commit the mutation schedules a sync.

| Function                                                                                                         | Notes                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createTask({ text, date, someday_column?, afterPosition?, beforePosition?, color?, time?, notes?, subtasks? })` | `date: null` requires `someday_column`. Without positions it is appended at the end.                                              |
| `updateTask(id, patch)`                                                                                          | Only `text`, `done`, `color`, `time`, `notes`, `subtasks`; `undefined` values are ignored. Changing `done` sets/clears `done_at`. |
| `toggleDone(id)`                                                                                                 |                                                                                                                                   |
| `deleteTask(id)`                                                                                                 | Tombstone (`deleted_at`); the record stays and syncs.                                                                             |
| `restoreTask(id)`                                                                                                | Undo of `deleteTask`: clears `deleted_at` with a newer `updated_at`, so the restore also wins on other devices.                   |
| `updateSubtasks(id, update)`                                                                                     | Replaces `subtasks` with `update(current)` in one transaction, so quick successive subtask edits never overwrite each other.      |
| `moveTask(id, { date, someday_column?, beforeId?, afterId? })`                                                   | Lands right before `beforeId` and/or right after `afterId`; a neighbour not in the target list is ignored; with none, at the end. |
| `duplicateTask(id)`                                                                                              | Copy (content and done state) with new ids for the task and subtasks, right after the original.                                   |
| `listTasksIn({ date } \| { date: null, someday_column })`                                                        | Sorted, non-deleted tasks of one list (useful to compute neighbours).                                                             |

Mutations on a missing or deleted task throw. Order inside a list is `position` (fractional-indexing key), then `id` as a
tie-break (`compareTaskOrder` in `lib/db/position.ts`).

Days are **displayed** in a different order: tasks with a `time` come first, earliest first, then the rest by position
(`compareDayOrder`, applied by `queryWeekTasks` / `useWeekTasks`). The repository (`listTasksIn`, `createTask`,
`moveTask`) keeps working in position order, so a timed task keeps its position and falls back into it if its time is
cleared. Someday columns are shown in position order.

### Hooks

| Hook                            | Returns                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `useWeekTasks(weekStart: Date)` | `Record<'YYYY-MM-DD', Task[]>` for the 7 days from `weekStart` (every day present), timed first |
| `useSomedayTasks()`             | `[Task[], Task[], Task[]]`, the three Someday columns, sorted                                   |
| `useTask(id)`                   | The task, `null` if missing/deleted, `undefined` while loading (also right after `id` changes)  |
| `useSyncStatus()`               | `'idle' \| 'syncing' \| 'offline' \| 'error'` (`idle` for guests)                               |
| `usePendingChangeCount()`       | Number of local changes not accepted by the server yet (outbox size)                            |

`usePendingChangeCount` (query `queryPendingChangeCount`) was added for the planner header: for a guest, a non-zero
count means work that only lives on this device, so the account button turns into a "save" button that leads to
registration. The UI may not read the outbox table itself, hence the query.

The data hooks return `undefined` only during the first local read. Dates are local calendar days
(`toDateKey`/`weekDateKeys` in `lib/db/dates.ts`). The queries behind the hooks are plain async functions in
`lib/db/queries.ts`.

### Sync lifecycle (`lib/sync`)

- `SyncProvider` (`components/sync-provider.tsx`) is mounted once at the planner root. When the Inertia shared prop
  `auth.user` is present it starts the singleton `syncEngine`; when it disappears it stops it. Guests never sync.
- Triggers: start, 1 s after the last local mutation, `online`, window `focus` and every 30 s. Only one run at a time;
  a trigger during a run queues one more run. Runs hold a cross-tab Web Lock (`lib/sync/lock.ts`), so tabs never
  interleave runs or a logout wipe.
- A run:
    1. Claims the database for the user: if `meta.user_id` is a different user, everything is wiped (including that
       user's unsynced changes); if there is no owner, the guest data is kept and pushed.
    2. Pushes the outbox in batches of 500. After each batch it deletes the entries whose `revision` did not change while
       the request was in flight (applied, rejected and stale records alike). The push response `cursor` is not a pull
       position and is ignored.
    3. Pulls from `meta.cursor` with `limit=500` until `has_more` is false, storing the cursor (from pull responses only)
       after each page.
- Pull applies last-write-wins: a remote record replaces the local one if it is newer, or equally new and not pending in
  the outbox. If a pending local change is older than the remote record, the server would refuse it anyway, so the
  remote record is applied and the pending entry dropped: both sides converge.
- Errors:
    - `401` stops the engine quietly; local data stays usable and sync resumes on the next page load with a session.
    - `422`/`413` are permanent: the batch is split until the invalid records are isolated; each is quarantined
      (`failed_revision` = its revision, logged with `console.warn`) and skipped until the task changes again. The rest
      of the outbox and the pull carry on; the status stays `error` while a record is quarantined.
    - `5xx`, timeouts (30 s per request) and network failures are retried with exponential backoff (5 s doubling up to
      5 min). Network failures report `offline`, the others `error`. Runs are cancelled by `stop()` and never write after
      it.
- Status: `syncing` during a run (the UI should debounce any indicator, since runs are frequent and short), then `idle`,
  `offline` or `error`.
- Logout: the logout links use `useLogout()` → `logOut()`. It forces a sync; if changes are still pending (offline,
  errors) it asks before discarding them. Then it ends the server session (`POST /logout`) and only after that wipes
  the local database under the sync lock and tells other tabs (BroadcastChannel) to stop their engines. If the server
  logout fails, nothing is wiped and syncing resumes.
- HTTP: `fetchTransport` calls `/sync/push` and `/sync/pull` (Wayfinder helpers `@/routes/sync`) with `credentials: 'same-origin'`, `Accept:
application/json` and the `X-XSRF-TOKEN` header from Laravel's `XSRF-TOKEN` cookie.

### Adding a new synced entity

1. Add its type to `lib/db/types.ts` and a table in a new Dexie `version(n)` in `lib/db/database.ts`.
2. Extend the outbox to identify the entity (for example an `entity` field next to the id) and write the record plus
   the outbox entry in one transaction from a repository module, with `nextTimestamp()` for `updated_at` and
   `notifyLocalChange()` after commit.
3. Extend the contract here and the push/pull payloads (server and `lib/sync/transport.ts`), then group the outbox by
   entity in `SyncEngine.push` and apply the new collection in `SyncEngine.applyRemote` with the same LWW rule.
4. Add the new table to `allTables()` in `lib/db/database.ts` so every wipe and sync transaction includes it.
5. Cover it with Vitest tests (repository + engine against `test/fake-sync-server.ts`).

## Planner UI

`resources/js/pages/planner.tsx` composes the components in `resources/js/components/planner/` (layout and
measurements in [style.md](./style.md#planner-layout)). It follows the offline-first rule:

- Data comes only from the live hooks (`useWeekTasks`, `useSomedayTasks`, `usePendingChangeCount`); writes go through
  the repository (`createTask`, `toggleDone`, and in the task dialog `updateTask`, `updateSubtasks`, `moveTask`,
  `duplicateTask`, `deleteTask` / `restoreTask`) without awaiting them. Write failures show a toast.
- `SyncProvider` is mounted at the page root.
- The shown week lives in the URL (`?week=YYYY-MM-DD`, the Monday; dropped for the current week), so changing weeks
  needs no server round trip and works offline (`hooks/use-week-navigation.ts`, pure helpers `weekFromUrl` /
  `canonicalWeekUrl` in `lib/planner/week.ts`).
    - On load an invalid or non-Monday value is normalized at once. Inertia records the server URL in history
      asynchronously after the first render, so this one write is an Inertia client visit (`router.replace`, no
      request), which goes through Inertia's history queue and keeps its page URL canonical.
    - Every week change after that uses `history.replaceState` directly (keeping Inertia's history state), never a
      server visit; held arrow keys do not repeat and rate-limit errors are ignored.
- Shortcuts (`hooks/use-planner-shortcuts.ts`) listen on `window` and skip events from text fields or while a dialog
  or menu (`role="dialog" | "alertdialog" | "menu" | "listbox"`) is open, or while a task is dragged
  (`[data-drag-overlay]`).
- "Today" comes from `useToday()`, which rolls over at local midnight and when the tab becomes visible again.
- Pure logic lives in `lib/planner/` with unit tests: ISO week math and the desktop column layout (`week.ts`), smart
  time (`smart-time.ts`), date labels (`format.ts`), task color styles (`task-colors.ts`) and drop resolution
  (`drop.ts`).

### Drag and drop

Built on `@dnd-kit/core` + `@dnd-kit/sortable` (shadcn has no DnD primitive). Like every other action, a drop only
writes the local database (`moveTask`); sync follows in the background.

| Piece                                               | Role                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PlannerDnd` (`components/planner/planner-dnd.tsx`) | The `DndContext` around the week and Someday: sensors, collision detection, edge zones, drag overlay, announcements, the drop write |
| `TaskList`                                          | A droppable per list (`list:<date>` / `list:someday-<n>`) carrying its `placement` and tasks, and a `SortableContext` of its rows   |
| `TaskRow`                                           | A sortable item carrying its task, `placement` and list; dims while dragged                                                         |
| `lib/planner/drop.ts`                               | Pure functions: drop target → `moveTask` input and the insertion line (`resolveDrop`), edge-zone dates (`edgeDropDate`)             |

- Sensors: mouse after 5 px of movement (so a click still opens the task), touch after a 250 ms long press (a swipe
  scrolls), keyboard from the row's move button (Space or Enter, arrows, Space or Enter to drop, Escape to cancel).
  The click that follows a pointer drag (also one cancelled with Escape) is swallowed. Planner shortcuts are
  suspended while a task is dragged.
- Collision detection hit-tests the pointer: edge zones win over task rows, which win over the list they sit in. Over
  a row, the upper half drops above it and the lower half below it; over the rest of a list (its empty rows) the task
  is appended; released anywhere else (gutters, headers) the drag is cancelled. Keyboard drags have no pointer: the
  overlay steps onto a row; within the task's own list it lands below the row when that row is further down than where
  the drag started (so stepping swaps places), in another list above it.
- Days show timed tasks first by time, so only untimed tasks are positional there: the `beforeId`/`afterId` handed to
  `moveTask` are the closest untimed tasks around the drop point, and a timed task keeps its slot by time (moving it
  within its own day is a no-op). Someday columns are positional throughout. A drop that would not change anything
  writes nothing.
- Edge zones (`start` = previous week, `end` = next week, so RTL mirrors) appear only while dragging. Hovering one
  for 600 ms changes the shown week, and keeps doing so while hovered, so the drag continues in the new week. Dropping
  on one moves the task to the same weekday of the week beyond the shown one (a Someday task goes to its Monday),
  appended, and a toast says where it went ("Moved to Wed 21 Oct.") with an Undo that puts it back. The dragged task is
  kept in state, so the drag survives its source row unmounting on a week change.
- A dropped task stays dimmed until its write has committed, so its row does not flash back in its old place.

## Offline app shell

The data layer only helps offline if the app itself loads offline. A service worker (`resources/js/sw.ts`, built by
`vite-plugin-pwa` into `public/sw.js`, scope `/`) keeps the app shell available after the first visit:

| Request                                                                         | Strategy                                                                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Built JS/CSS/fonts/images under `/build/`, the web manifest and `/offline.html` | Precached on install (Workbox precache manifest)                                              |
| Full-page load of `/` (any `?week=`)                                            | NetworkFirst (3 s timeout); the cached shell on network errors and on `5xx`                   |
| Full-page load of any other page (settings, login, ...)                         | Network only; offline it gets `/offline.html`                                                 |
| `/build/` files missing from this worker's precache                             | Any cache first (a waiting worker's precache), then a CacheFirst cache (200 entries, 30 days) |
| Inertia visits (`X-Inertia` fetches), `/sync/*`, non-GET                        | Not handled: always the network                                                               |

- **The shell.** `/` is cached under one key (`plain-week-shell`), whatever its query string. Only plain `200`
  responses are stored, never redirects. The worker also fetches `/` on install, because the very first visit loads
  `/` before the worker controls the page. When the cached shell is served, the worker points its Inertia page `url` at
  the URL being loaded (`withPageUrl` in `lib/pwa/request-matchers.ts`); otherwise Inertia would rewrite the address
  bar to the `?week=` of whichever visit stored it.
- **Session.** The shell embeds the page props of the visit that stored it (`auth.user`). Login and logout are Inertia
  visits, not full page loads, so the page posts `REFRESH_SHELL` to the worker whenever `auth.user` changes between
  Inertia pages, and the worker re-fetches `/` with the new session. An offline reload after a logout therefore shows
  the guest planner, never the previous user.
- **Inertia asset versioning.** Inertia visits are `fetch` requests (never `navigate`), so the worker never answers
  them and the server's `409` version-mismatch reloads keep working. A shell served offline may carry an older asset
  version; the first visit after reconnecting gets a `409` and Inertia does a full reload, which refreshes the shell.
- **Deploys.** All worker versions share the precache storage until the new one activates, and built files the page
  loads outside the precache are cached at runtime, so the cached shell finds the assets it references. A new worker
  waits; the page shows a Sonner toast ("Update available" with "Reload") that activates it (`SKIP_WAITING`) and
  reloads. Open tabs check for a new worker every hour while online. Other tabs still running the old version behave as
  on any deploy: their next Inertia visit gets a `409` and reloads.
- **Registration** happens in `resources/js/lib/pwa/register.ts`, called from `app.tsx`. Under the Vite dev server it
  instead unregisters any worker left over from testing a production build on the same origin.
- **Offline UX.** Nothing extra is shown while offline: the planner works from IndexedDB and the account button's sync
  status covers connectivity. Only server pages need the network. A full-page load of one gets the static
  `/offline.html` page (with a link back to the planner); an in-app Inertia visit to one shows a "You're offline" toast
  (`lib/pwa/offline-visits.ts`). Failed hover prefetches stay silent.

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
same-origin and send the `X-XSRF-TOKEN` header from the `XSRF-TOKEN` cookie. (Laravel 13 also accepts a same-origin
browser request without the token when it carries `Sec-Fetch-Site: same-origin`; send the header anyway so older
browsers work.) Use the Wayfinder helpers
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
`time` `HH:mm` or `null`; `done` and subtask `done` real booleans; `subtasks` a list of `{ id, text, done }` (subtask
`id` a string of at most 255 characters);
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
