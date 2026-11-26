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

| Field             | Type                                                                                                                                                   | Notes                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `id`              | string (UUID v7)                                                                                                                                       | Generated on the client                                                                |
| `text`            | string                                                                                                                                                 |                                                                                        |
| `date`            | `'YYYY-MM-DD'` \| `null`                                                                                                                               | `null` means Someday                                                                   |
| `someday_column`  | `0` \| `1` \| `2` \| `null`                                                                                                                            | Required when `date` is `null`; only part of the Someday sort key                      |
| `position`        | string                                                                                                                                                 | Fractional index key (npm `fractional-indexing`); order within a day or Someday column |
| `done`            | boolean                                                                                                                                                |                                                                                        |
| `done_at`         | ISO-8601 string \| `null`                                                                                                                              |                                                                                        |
| `color`           | `'none'` \| `'pink'` \| `'yellow'` \| `'black'` \| `'grey'` \| `'cornflower'` \| `'mango'` \| `'green'` \| `'lilac'`                                   | Default `'none'`                                                                       |
| `time`            | `'HH:mm'` \| `null`                                                                                                                                    |                                                                                        |
| `notes`           | string                                                                                                                                                 | Plain text; the UI makes its web links clickable                                       |
| `subtasks`        | array of `{ id: string, text: string, done: boolean }`                                                                                                 | Stored as JSON                                                                         |
| `recurrence`      | `{ type: 'daily', every: number, until? }` \| `{ type: 'weekly', weekdays: number[], until? }` \| `{ type: 'monthly', day: number, until? }` \| `null` | Only on a series row; stored as JSON. See [Recurring tasks](#recurring-tasks)          |
| `series_id`       | string \| `null`                                                                                                                                       | Only on an exception row: id of the series it overrides                                |
| `occurrence_date` | `'YYYY-MM-DD'` \| `null`                                                                                                                               | Only on an exception row: the original generated date it replaces                      |
| `created_at`      | ISO-8601 string (UTC, ms)                                                                                                                              | Set by the client                                                                      |
| `updated_at`      | ISO-8601 string (UTC, ms)                                                                                                                              | Set by the client on every change; drives last-write-wins                              |
| `deleted_at`      | ISO-8601 string \| `null`                                                                                                                              | Soft delete (tombstone). Never hard-delete through sync                                |

Server-only columns: `user_id` (foreign key) and `version` (unsigned bigint, monotonically increasing, assigned on every
accepted write).

## Data model: TaskLabel

The name a user gave a task color, synced with the account (all devices). One record per color and user, keyed by
`color`; there is no id. Tasks keep storing `color` only, so renaming a label never changes a task.

| Field        | Type                                                                                                     | Notes                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `color`      | `'pink'` \| `'yellow'` \| `'black'` \| `'grey'` \| `'cornflower'` \| `'mango'` \| `'green'` \| `'lilac'` | Every task color but `none`                               |
| `name`       | string                                                                                                   | Trimmed, at most 24 characters; `''` is the default name  |
| `updated_at` | ISO-8601 string (UTC, ms)                                                                                | Set by the client on every change; drives last-write-wins |

A color without a record, or with `name: ''`, is shown with its translated default name ("Pink", the
`planner.color<Color>` keys). Resetting a name writes `''` (there are no tombstones: the record is the whole state).
Same server-only columns as a task. Users rename labels in Settings › Labels (`/settings/labels`), and the color
pickers show the effective names.

### Recurring tasks

A recurring task is stored as one **series** row plus optional **exception** rows; occurrences are computed on the
client from local data, never fetched. Every row is exactly one of three kinds:

| Kind      | `recurrence` | `series_id` | `occurrence_date` | Notes                                                       |
| --------- | ------------ | ----------- | ----------------- | ----------------------------------------------------------- |
| Plain     | `null`       | `null`      | `null`            | A normal task                                               |
| Series    | set          | `null`      | `null`            | `date` is the start (anchor) date and is never `null`       |
| Exception | `null`       | set         | set               | Overrides one occurrence; its own `date` may differ (moved) |

`recurrence` is `{ "type": "daily", "every": 1–365 }` (an integer number of days), `{ "type": "weekly", "weekdays":
[1, 3, 5] }` (ISO weekdays, 1 = Monday … 7 = Sunday, unique, sorted, at least one) or `{ "type": "monthly", "day": 1–31 }`,
each with an optional `"until": "YYYY-MM-DD"` (inclusive end, not before `date`). No other keys are allowed.

Expansion (client, pure function): for a visible date range a series yields a virtual occurrence on every matching date
from its `date` to `until` (if set). Daily matches `date` plus a multiple of `every` days (counted in calendar days, so
"every 21 days" from a Monday is always a Monday); weekly matches the listed ISO weekdays; monthly matches `day`, or the
last day of a shorter month. A virtual occurrence has the id `${series.id}:${YYYY-MM-DD}`, inherits the series' content and
`position`, and is not done. An exception row for `(series_id, occurrence_date)` suppresses that occurrence and is shown
at its own `date` instead, or not at all if it is a tombstone. The series row itself is never rendered, and Someday
never holds series or virtual occurrences. Any change to an occurrence materializes an exception; "this and all future"
edits end the series with `until` = the day before and start a new series anchored on that occurrence (so a new daily
`every` counts from there). The client data layer owns the details (see
[Client data layer](#client-data-layer)).

The server treats the three fields as plain synced columns (same LWW, same push/pull):

- Push validates the `recurrence` shape and the row kinds (`422` otherwise). Tombstones (`deleted_at` set) skip the
  row-kind and `until` checks, so deleting a row is never refused.
- The three keys are optional on push, all together or none, for clients from before v0.0.2. Such a record is applied
  only to a new or plain row (new rows get `null`); for a stored series or exception it is rejected, since those clients
  cannot represent it. Pull always returns the keys, `null` when unset.
- Clients from v0.0.3 and older know only weekly and monthly rules. v0.0.3 drops an unknown rule from its planner, but
  it crashes rendering an exception whose series has one (its rule summary reads `weekdays`). So the server tells
  clients apart by the `X-Sync-Format` header (see [Sync endpoints](#sync-endpoints)). A pull without it (or below `2`)
  gets every daily series row as a tombstone (`deleted_at` set to its `updated_at`, in the response only), so it also
  disappears from those clients when a weekly or monthly series they hold turns daily. A push from such a client to a
  stored daily series is rejected, like the pre-v0.0.2 rule above, so it can never overwrite or delete one. The
  exceptions of a daily series still reach those clients, which show them as one-off tasks.
- `series_id` is not a foreign key: an exception may arrive before its series (any order across batches). It is
  indexed with `user_id`. Pull only ever returns the user's own rows, so a `series_id` pointing at someone else's task
  exposes nothing. Uniqueness of `(series_id, occurrence_date)` is not enforced by the server either: the client keeps
  it, and a duplicate from two offline devices must not get the push stuck.

## Sync endpoints

Web routes with session auth and CSRF, JSON in and out. All require authentication; guests get `401`. In SaaS mode an
account without a paid plan gets `402 Payment Required` ([saas.md](./saas.md)); a self-hosted instance never sends it.
Each user may send 120 sync requests a minute (`throttle:sync`, shared with the app API), then `429`. Token clients
(native apps) use the same contract under `/api/v1/sync/*`, see [App API](#app-api).

Both take an optional `X-Sync-Format: <int>` header that says what the client understands: none (or `1`) is a client
up to v0.0.3; `2` adds daily rules; `3` adds label names (`labels` on push and pull). A missing or malformed header
counts as `1`; a higher one as the newest the server knows. The client sends `3` (`SYNC_FORMAT` in
`lib/sync/transport.ts`); the server's side is `App\Actions\Sync\SyncFormat`. What changes for an older format is in
[Recurring tasks](#recurring-tasks) and below: a pull below `3` has no `labels` key at all (its cursor passes over
label versions, so a client that moves to `3` pulls from `0` once, see [Client sync engine](#client-sync-engine)).

Both also take an optional `X-Timezone: <IANA name>` header: the browser's time zone
(`Intl.DateTimeFormat().resolvedOptions().timeZone`, read on every request by `syncHeaders()` in
`lib/sync/transport.ts`). The `RememberTimezone` middleware stores it in `users.timezone` when it differs from the stored
one and is a name PHP knows (`DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC)`, so legacy aliases such as
`Asia/Calcutta` pass); anything else is ignored and never fails the request. This is how the server learns the user's
time zone for background work (scheduled notifications, calendar events) without any user action or extra request.
Server code reads it with `User::timezoneOrDefault()`, which falls back to `config('app.timezone')` (UTC) until the
first sync.

### `POST /sync/push`

Request: `{ "tasks": [<Task>, ...], "labels": [<TaskLabel>, ...] }` with full records, at most 500 tasks. `tasks` is
required (it may be empty); `labels` is optional (clients before format 3 never send it), at most one record per color.

For each record the server upserts, scoped to the current user, using last-write-wins: the record is applied only if
there is no stored row or the incoming `updated_at` is greater than or equal to the stored `updated_at`. A record whose
`id` belongs to another user is rejected (ignored and reported). Every applied write gets a new `version`, greater than
every existing version.

Labels follow the same last-write-wins rule, keyed by the user and `color`, and take their versions from the same block
as the tasks of the push. They are never rejected and are not listed in `applied` or `rejected` (which hold task ids).

Response `200`: `{ "applied": [ids], "rejected": [ids], "cursor": <max version for this user, tasks and labels> }`.
Validation errors return `422` in Laravel's standard shape.

### `GET /sync/pull?cursor=<int, default 0>&limit=<int 1–1000, default 500>`

Response `200`: `{ "tasks": [<Task>, ...], "labels": [<TaskLabel>, ...], "cursor": <version of the last returned row, or
the input cursor>, "has_more": bool }`, each list ordered by `version` ascending. Tombstones (`deleted_at` not null) are
included. A `limit` outside 1–1000 is a `422` (it is not clamped).

Tasks and labels share one version sequence, so a page holds the `limit` rows of either kind with the lowest versions
after the cursor, and `cursor` is the highest of them. `labels` is only in the response for format `3` and up.

## Client sync engine

- Every local mutation writes the record and an outbox entry (keyed by the task id, or the color for a label) in the
  same Dexie transaction.
- The engine runs only when `auth.user` (Inertia shared prop) is present and `navigator.onLine` is true.
- Triggers: app start, after local mutations (debounced about 1 s), the `online` event, window focus, the page becoming
  visible, and every 30 s while it is visible. A failed run is retried on its own with backoff.
- Order of a run: push the outbox in batches → clear sent entries whose record did not change in the meantime → pull from
  the stored cursor until `has_more` is false.
- A pulled record is applied only if `remote.updated_at >= local.updated_at` and its id is not pending in the outbox.
  (Client refinement: a pending change that is strictly older than the remote record is dropped and the remote record
  applied, because the server would refuse it anyway. See [Sync lifecycle](#sync-lifecycle-libsync).)
- The cursor is persisted in the Dexie `meta` table (key `cursor`), with the sync format it was pulled with
  (`cursor_format`). A cursor from another format (or none: v0.0.3 did not store it) is dropped once and the client
  pulls from `0`, because the server sent rows that format could not read as tombstones. Re-applying the rest is harmless (LWW). The `user_id` is stored there too; if a different
  user logs in, the local database is wiped first.
- Guest to account: guest data (label names included) is already in the outbox, so the first authenticated sync pushes
  it and guest work is kept. Untouched demo tasks are deleted first and never pushed ([Guest onboarding](#guest-onboarding-demo-tasks)).
- Leaving a session wipes the local database completely (privacy on shared devices): on logout, when sync finds the
  session gone, and when a guest page finds data a signed-out user left behind. The device is then a first-time guest's,
  so the demo tasks come back. A guest's own data (no `user_id`) is never wiped on load.
- SaaS mode: the engine does not start for an account without a paid plan (`account.hasAccess` shared prop), and a
  `402` stops it without retrying. Local data and the outbox are kept, and the page goes to the paywall (`/plans`);
  after paying, the next start pushes what was kept.
- The engine exposes a sync status for the UI: `idle` | `syncing` | `offline` | `error`. The account button shows it
  as a dot (see [style.md](./style.md#sync-status-dot)), plus `paused` when a SaaS account has no paid plan.

## Client data layer

Everything lives in `resources/js/lib/db` (local data), `resources/js/lib/sync` (sync engine) and `resources/js/hooks`.
The UI imports the repository functions and the hooks; it never talks to `fetch` or to Dexie tables directly.

### IndexedDB schema (Dexie database `plain-week`, version 3)

| Table    | Primary key | Indexes                                                                                                                   | Content                                                                                                                                                            |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tasks`  | `id`        | `date`, `[date+position]`, `someday_column`, `updated_at`, `deleted_at`, `recurrence.type`, `[series_id+occurrence_date]` | `Task` records, tombstones included                                                                                                                                |
| `outbox` | `task_id`   |                                                                                                                           | `{ task_id, entity?, revision, failed_revision? }`: pending changes. `entity: 'label'` marks a label, whose key is its color                                       |
| `meta`   | `key`       |                                                                                                                           | `cursor` (last pulled version), `cursor_format`, `user_id` (owner of the local data), `demo_seeded`, `demo_ids` ([Guest onboarding](#guest-onboarding-demo-tasks)) |
| `labels` | `color`     |                                                                                                                           | `TaskLabel` records ([Data model](#data-model-tasklabel)); a color never renamed has none                                                                          |

IndexedDB leaves a row out of an index when the indexed value is null, so `recurrence.type` lists series rows only and
`[series_id+occurrence_date]` exception rows only. Version 2 added both indexes and an upgrade that sets `recurrence`,
`series_id` and `occurrence_date` to `null` on existing rows. Version 3 added `labels`. The outbox keeps its primary key
(`task_id`) because Dexie cannot change one; an entry without `entity` is a task's, and a color never collides with a
task id (a UUID).

Helpers that run inside a caller's transaction (`clearAllTables`, `purgeDemoTasks`) return Dexie promises, not native
ones from an `async` function: awaiting a native promise from a nested async helper can resume outside the transaction
zone, and Dexie then commits early (`PrematureCommitError`) before the caller's next operation. In the browser this
made the first sync of a fresh login fail.

Types are in `lib/db/types.ts`: `Task` (exactly the contract shape), `Recurrence`, `TaskColor` and `TASK_COLORS`
(colour ids only; the UI owns the swatches), `TaskLabel`, `LabelColor` and `LABEL_COLORS` (every colour but `none`),
`SomedayColumn`, `Subtask`. Schema changes need a new `this.version(n)` in
`lib/db/database.ts`; never edit a released version.

### Repository API (`lib/db/tasks.ts`)

All functions are local only and return a promise that resolves once IndexedDB has committed; the UI does not need to
await them (the live hooks re-render on their own). Each mutation reads the current record, computes the new one and
writes it plus its outbox entry in one Dexie read-write transaction, so concurrent mutations of the same task never lose
each other's fields and never resurrect a deleted task. `updated_at` is strictly increasing, so a local change always
beats the version it replaces. After commit the mutation schedules a sync.

| Function                                                                            | Notes                                                                                                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createTask({ text, date, afterId?, beforeId?, color?, time?, notes?, subtasks? })` | `date: null` is Someday. Placed like `moveTask`: between the given neighbours, or appended at the end.                            |
| `updateTask(id, patch, { scope?, undo? })`                                          | Only `text`, `done`, `color`, `time`, `notes`, `subtasks`; `undefined` values are ignored. Changing `done` sets/clears `done_at`. |
| `toggleDone(id, { undo? })`                                                         | On an occurrence: always only that one.                                                                                           |
| `deleteTask(id, { scope?, undo? })`                                                 | Tombstone (`deleted_at`); the record stays and syncs.                                                                             |
| `restoreTask(id)`                                                                   | Undo of a single-row `deleteTask`: clears `deleted_at` with a newer `updated_at`, so the restore also wins on other devices.      |
| `updateSubtasks(id, update, { scope?, undo? })`                                     | Replaces `subtasks` with `update(current)` in one transaction, so quick successive subtask edits never overwrite each other.      |
| `moveTask(id, { date, beforeId?, afterId? }, { undo? })`                            | Lands right before `beforeId` and/or right after `afterId`; a neighbour not in the target list is ignored; with none, at the end. |
| `duplicateTask(id, { undo? })`                                                      | Copy (content and done state) with new ids for the task and subtasks, right after the original. Always a plain task.              |
| `setRecurrence(id, recurrence \| null, { scope?, undo? })`                          | Makes a task repeat, changes or removes the rule (see [Recurring tasks](#recurring-tasks-client)).                                |
| `createUndoLog()` / `undoChanges(log)`                                              | Pass `{ undo: log }` to mutations, then `undoChanges(log)` puts back every row they overwrote and deletes the rows they created.  |
| `listTasksIn({ date } \| { date: null })`                                           | Sorted, non-deleted items of one list, occurrences included (Someday: archived too); for neighbours.                              |
| `carryOverTasks(today)`                                                             | Moves unfinished plain tasks from earlier days to `today`, after its tasks (see [Carry over](#carry-over-unfinished-tasks)).      |

Every function that takes an `id` also accepts an occurrence id; mutations on a missing or deleted task throw. Order inside a list is `position` (fractional-indexing key), then `id` as a
tie-break (`compareTaskOrder` in `lib/db/position.ts`).

Days are **displayed** in a different order: tasks with a `time` come first, earliest first, then the rest by position
(`compareDayOrder`, applied by `queryWeekTasks` / `useWeekTasks`). The repository (`listTasksIn`, `createTask`,
`moveTask`) keeps working in position order, so a timed task keeps its position and falls back into it if its time is
cleared.

**Someday is one list.** Its order is (`someday_column`, `position`, `id`) (`compareSomedayOrder`), so rows written
when Someday had three separate columns keep the order they were shown in (column 1, then 2, then 3), with no
migration. `someday_column` stays in the schema and the sync contract and is only part of that sort key: a write into
Someday picks a (`someday_column`, `position`) pair that sorts between its neighbours (`somedayKeyBetween`: the
previous neighbour's column with a key after it, or the next neighbour's column with a key before it, or column 0 in
an empty list), so no other row is rewritten. Appending uses the last task's column. On screen it is
one ruled list as well (see [style.md](./style.md#planner-layout)); the three columns it once had were only a layout.

Someday tasks done in an earlier week are **archived**: `querySomedayTasks(firstDay)` (behind `useSomedayTasks`) leaves
out a done task whose `done_at` falls before the start of the viewed week (local time, `isArchivedSomeday`). A task done
during week W still shows, done, in W and in any earlier week, and disappears from W+1 on. While a future week is shown
the cut-off is the current week instead (`somedayArchiveWeek` in `lib/planner/week.ts`), so a task ticked there stays on
screen until its own week is over; `useSomedayTasks(weekStart, today)` re-runs when the week rolls over. A done task
with no readable `done_at` (older data) counts as archived. It is a read filter only: no row changes, nothing syncs, and undoing the task
(`done_at` back to `null`) brings it back. The repository (`listTasksIn`, `moveTask`) still sees archived tasks; they
keep their positions, and inserting between two shown neighbours stays between them.

### Label names (`lib/db/labels.ts`, `lib/planner/task-labels.ts`)

`setLabelName(color, name)` writes the record and its outbox entry (`entity: 'label'`) in one transaction, with
`nextTimestamp(stored updated_at)` for `updated_at` (`writeLabel`, shared with the import), then calls
`notifyLocalChange()`. The name is trimmed with inner whitespace collapsed
(`normalizeLabelName`); `''` gives the color back its default name. It throws for `none` or a name over 24 characters,
and writes nothing when the name does not change. Guests keep names locally; they are pushed on sign-in like guest
tasks, and the wipes (logout, another user) clear them with everything else.

Pure helpers for the UI, in `lib/planner/task-labels.ts`:

| Function                    | What it does                                                                                                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveLabels(stored)`     | Every label color in picker order as `{ color, name, customName, isCustom }`: `name` is the custom name or `defaultLabelName(color)` (`TASK_COLOR_STYLES[c].label`).                                                                                                                   |
| `labelTag(name)`            | The slug typed after `#`: lowercase, whitespace as `-` ("Deep work" → `deep-work`).                                                                                                                                                                                                    |
| `labelKey(value)`           | The matching key: lowercase, without spaces or hyphens.                                                                                                                                                                                                                                |
| `findLabel(query, labels)`  | The label whose color id, else effective name, has the query's `labelKey`; null for none or an empty key. The color id always matches, even after a rename.                                                                                                                            |
| `validateLabelNames(names)` | Per color with a custom name: `tooLong`, `invalid` (empty key, e.g. only hyphens), `reserved` (another color's id or default name: `#green` always means green) or `duplicate` (another custom name). Advisory: the server does not enforce it, so `findLabel` must cope with clashes. |

### Hooks

| Hook                                | Returns                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `useTaskLabels()`                   | `{ labels, isLoading, setLabelName }`: `resolveLabels` of the live records (default names during the first read)              |
| `useTaskColorName()`                | `(color) => string`: the color's effective label name for pickers ("No color" for `none`)                                     |
| `useWeekTasks(weekStart: Date)`     | `Record<'YYYY-MM-DD', PlannerTask[]>` for the 7 days from `weekStart` (every day present), occurrences included, timed first  |
| `useSomedayTasks(weekStart, today)` | `PlannerTask[]`, the Someday list in order, without tasks archived before `weekStart`                                         |
| `useTask(id)`                       | The item (`id` may be an occurrence id), `null` if missing/deleted, `undefined` while loading (also right after `id` changes) |
| `useSeries(item)`                   | The live series of an occurrence or exception (a series: itself), `null` for a plain task                                     |
| `useSyncStatus()`                   | `'idle' \| 'syncing' \| 'offline' \| 'error'` (`idle` for guests)                                                             |

The UI may not read the outbox table itself: `queryPendingChangeCount` counts the local changes the server has not
accepted yet.

The data hooks return `undefined` only during the first local read. Dates are local calendar days
(`toDateKey`/`weekDateKeys` in `lib/db/dates.ts`). The queries behind the hooks are plain async functions in
`lib/db/queries.ts`.

### Recurring tasks (client)

The rows and their invariants (plain, series, exception) are in [Data model](#data-model-task). The client never stores
occurrences: `lib/recurrence/expand.ts` generates them, as pure functions on `'YYYY-MM-DD'` keys with UTC arithmetic
(`lib/recurrence/dates.ts`), so time zones and DST never shift a day.

**View model.** Queries and hooks return `PlannerTask`, a `Task` plus a `kind`:

| `kind`       | What it is                                                                                               | Extra fields                 |
| ------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `task`       | A plain row.                                                                                             |                              |
| `occurrence` | Generated from a series, no row. `id` is `${seriesId}:${YYYY-MM-DD}`; content from the series; not done. | `seriesId`, `occurrenceDate` |
| `exception`  | A row that overrides one occurrence (changed, moved, done). `date` is where it is now.                   | `seriesId`, `occurrenceDate` |
| `series`     | A series row. Never listed by the queries; `useTask(seriesId)` and some mutations return it.             |                              |

`isRecurring(item)` is true for everything but `task`; `getSeries(item)` (and `useSeries`) gives the series.

**Expansion.** `expandSeries(series, exceptions, rangeStart, rangeEnd)` returns the occurrences on every date from
`max(series.date, rangeStart)` to `min(until, rangeEnd)` that matches the rule (daily: a multiple of `every` days after
`series.date`; weekly: ISO weekday in `weekdays`; monthly: day `day`, or the last day of a shorter month), minus the dates an exception row replaces, plus that series'
live exceptions dated in the range. A deleted exception hides its occurrence. `queryRangeItems` combines the rows dated
in the range (plain and exceptions; series rows skipped) with the expansion of every live series that overlaps it
(found through the `recurrence.type` index; their exceptions through `[series_id+occurrence_date]`). Someday holds only
plain tasks and exceptions moved there. An exception whose series is gone (for example, deleted on another device
before this exception synced) still shows, as a plain-looking task.

**Duplicate exceptions.** The server does not keep `(series_id, occurrence_date)` unique, so two offline devices can
each write an exception for the same occurrence. Locally an occurrence id always resolves to its existing exception, so
the repository never writes a second one; duplicates that arrive through sync are settled by `winningException`: the
newest `updated_at` wins, then the greater `id`. Only the winner is shown or resolved (a losing row's own id resolves to
`null`), and a deleted winner hides the occurrence.

**Resolving ids.** `queryTask` / `useTask` accept an occurrence id. Once that occurrence has an exception row, the id
resolves to the row (which has its own id), and to `null` if the exception is deleted, so an id taken from the screen
keeps working after the first change.

**Mutations on an occurrence** (all in one transaction, one outbox entry per written row):

| Change                          | Scope `'this'` (default for edits)                                                                                           | Scope `'future'` (edits, delete, rule)                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `updateTask` / `updateSubtasks` | Writes an exception row (new UUID v7) with the change.                                                                       | Split at the occurrence date D: the series gets `until = D-1`, a new series with the edit starts on D. |
| `toggleDone`, `moveTask`        | Always `'this'`: writes or updates the exception.                                                                            |                                                                                                        |
| `deleteTask`                    | A deleted exception row.                                                                                                     | `until = D-1`; when D is the series' first occurrence, the series and its exceptions are deleted.      |
| `setRecurrence(id, rule)`       | This item starts its own series on D with the new rule; the old series keeps its rule and gets a deleted exception hiding D. | Default. Split at D; the new series has this item's content and the new rule.                          |
| `setRecurrence(id, null)`       | This item becomes a plain task; a deleted exception keeps its date hidden.                                                   | Default. `until = D-1`; this item becomes a plain task (an exception row keeps its id).                |
| `duplicateTask`                 | The copy is a plain task right after the source; the source gets its exception row.                                          |                                                                                                        |

A split also deletes the series' exceptions dated D or later. When D is on or before the series' first occurrence
(`startsSeries`: the anchor, or the first date after it the rule matches) there is nothing to keep, so the series
row itself takes the new content or rule (same id) instead of ending. A rule change with scope `'this'` is a split for
one date only: the occurrence leaves its series and becomes the start of a new, independent series (its content, an
exception's edits included, and the new rule from D on), while the old series goes on with its rule and skips D. Both
series then show on dates they share. `done` never reaches a series: a `'future'` patch applies its other fields; the
new series takes this item's content (an exception's earlier edits included). Scope is ignored for plain tasks.

`setRecurrence` validates the rule and stores it in canonical form (`normalizeRecurrence`: weekdays unique and sorted,
`day` 1–31, `until` not before the anchor) and throws otherwise, so the server never refuses it. The anchor date does
not have to match the rule: the series then starts at the next matching date and the item disappears from the anchor
day, so the UI should preselect the anchor's weekday or day of the month.

On rows: `setRecurrence` on a plain dated task makes it the series (its `date` is the anchor; Someday tasks cannot
repeat). On a series row, `updateTask` edits every occurrence without an exception, `setRecurrence` replaces the rule
(existing exceptions stay; `null` makes it a plain task and deletes its exceptions), `deleteTask` deletes it with its exceptions, and `moveTask`
throws.

**What to show after a change.** The mutations return the item that now stands for what the user acted on: the
exception for a `'this'` edit, the new series' occurrence on D for a `'future'` edit or rule change (the series itself
when its rule skips D), the plain task when repeating stops. The occurrence id the UI held may then resolve to `null`
(its series ended), so a dialog should switch to the returned id. The first change of an occurrence also changes its
`id` (occurrence id to exception row id), which UI keys and drag ids need to tolerate.

Occurrences take the series' `position`, which can tie with a plain task's position in the same day (`compareTaskOrder`
then orders by id). Placing a task between two tied neighbours puts it after both.

**Undo.** `restoreTask(occurrenceId)` restores a deleted occurrence. Changes that touch several rows (`'future'` scope)
are undone with an `UndoLog`: `const undo = createUndoLog(); await deleteTask(id, { scope: 'future', undo });` and later
`undoChanges(undo)`, which writes the previous versions back as newer changes. A row the logged mutations created is
deleted, except an exception: deleting it would hide its occurrence, so it goes back to the series' content instead.

**Sync.** Nothing special: the three fields are columns of the record, pushed and pulled with last-write-wins like the
rest. Every pushed record carries all three keys (`null` when unset; the server refuses partial keys), and `toTask`
defaults them to `null` on pull.

### Sync lifecycle (`lib/sync`)

- `SyncProvider` (`components/sync-provider.tsx`) is mounted once at the planner root. When the Inertia shared prop
  `auth.user` is present it starts the singleton `syncEngine`; when it disappears it stops it. Guests never sync.
- Triggers: start, 1 s after the last local mutation, `online`, window `focus`, `visibilitychange` to visible, and
  every 30 s while the page is visible. Only one run at a time; a trigger during a run queues one more run. Runs hold a
  cross-tab Web Lock (`lib/sync/lock.ts`), so tabs never interleave runs or a logout wipe. The lock is released as soon
  as the run settles, and a run waits at most 60 s for it (another tab's run) before trying again later.
- Nothing waits on the network: every request is aborted after 20 s without an answer (the engine wraps the injected
  transport, so even one that ignores the abort signal cannot hold a run or the lock), and `stop()` aborts the request
  in flight.
- A run:
    1. Claims the database for the user: if `meta.user_id` is a different user, everything is wiped (including that
       user's unsynced changes); if there is no owner, the guest data is kept and pushed. Demo tasks still in
       `meta.demo_ids` are deleted (no tombstones: the server never had them).
    2. Pushes the outbox in batches of 500. After each batch it deletes the entries whose `revision` did not change while
       the request was in flight (applied, rejected and stale records alike). The push response `cursor` is not a pull
       position and is ignored.
    3. Pulls from `meta.cursor` with `limit=500` until `has_more` is false, storing the cursor (from pull responses only)
       after each page.
- Pull applies last-write-wins: a remote record replaces the local one if it is newer, or equally new and not pending in
  the outbox. If a pending local change is older than the remote record, the server would refuse it anyway, so the
  remote record is applied and the pending entry dropped: both sides converge.
- Errors:
    - `401` means the session is gone (expired, logged out elsewhere): the engine wipes the local database under the
      lock, stops, and `onSessionExpired` tells the other tabs and reloads the page as a guest. If changes are still
      pending (edits made offline before the session expired) it asks first, like logout; declining keeps everything
      and only stops the engine, so the changes are pushed when the same user signs in again. A `419` on push (the XSRF token of an ended session) is confirmed first with a `pull` (no token needed):
      a `401` there wipes, a `402` pauses (below); otherwise the session is alive, that pull refreshed the token, and
      the `419` is retried like any transient failure.
    - `422`/`413` are permanent: the batch is split until the invalid records are isolated; each is quarantined
      (`failed_revision` = its revision, logged with `console.warn`) and skipped until the task changes again. The rest
      of the outbox and the pull carry on; the status stays `error` while a record is quarantined.
    - Every other failure is retried on its own: a timer with exponential backoff and "equal" jitter (2 s doubling up
      to 5 min, each delay between half and all of that), never sooner than a `Retry-After` the server sent (`429`,
      `503`; capped at 5 min too). `online`, window focus and the page becoming visible retry at once (but never
      before a `Retry-After`); the failure streak is kept, so the backoff keeps growing while it fails. A success
      resets it. After a timeout the push batch and the pull `limit` are halved (down to 1/64), so a slow uplink still
      gets through; a successful run restores them. Re-pushing after a request that
      timed out is safe: push is idempotent under last-write-wins, and an outbox entry is only cleared by a response.
    - Status while retrying: network failures (`SyncNetworkError`: `fetch` itself failed) and timeouts read as
      `offline`. Other transient failures (`5xx`, `408`, `429`, a `419` with a live session, the lock not granted) read
      as `syncing` until the server has been failing for 2 min (time offline does not count), then `error`. Any other failure (an unexpected `4xx`, a local error) is `error` at once, and still retried.
    - "Retry sync" (account menu, shown on `error`) calls `sync({ force: true })`: it runs at once and resets the
      backoff. Runs are cancelled by `stop()` and never write after it.
- Status: `syncing` during a run, then `idle`, `offline` or `error` (or `syncing` while retrying, see above).
  `useVisibleSyncStatus` debounces it for the UI: a run reads as `syncing` only after 600 ms, and until then the status
  before the run is kept, so a retry while offline never flashes `idle`.
- Logout: the logout links use `useLogout()` → `logOut()`. It forces a sync and waits for it 10 s at most; if changes
  are still pending (offline, errors, a slow connection) it asks before discarding them. Then it ends the server session (`POST /logout`) and only after that wipes
  the local database under the sync lock (every table and meta key, onboarding flags included) and tells other tabs
  (BroadcastChannel `plain-week-session`), which stop their engines and reload into the guest state. If the server
  logout fails, nothing is wiped and syncing resumes.
- Session ended without a logout on this device: on guest pages `SyncProvider` calls `forgetEndedSession()`. If
  `meta.user_id` is set, it asks the server (`GET /sync/pull?limit=1`); only a `401` wipes the database (asking first
  about pending changes), tells other tabs and reloads as a guest. Offline, or when the server still knows the user (a stale offline shell), nothing
  changes. Guest data has no `user_id`, so a guest never triggers it.
- HTTP: `fetchTransport` calls `/sync/push` and `/sync/pull` (Wayfinder helpers `@/routes/sync`) with `credentials: 'same-origin'`, `Accept:
application/json` and the `X-XSRF-TOKEN` header from Laravel's `XSRF-TOKEN` cookie.

### Notifications (client)

Web Push reminders (the server side sends them in the background). The whole feature exists only when the instance has
VAPID keys: the shared Inertia prop `notifications: { enabled, vapidPublicKey }` (base64url) hides Settings ›
Notifications otherwise. `lib/notifications/device.ts` handles this device; nothing in it is on the path of a planner
action.

- **Per device, no local flag.** Notifications are on here while the browser holds a push subscription and the
  permission is `granted` (`deviceState()`). `pushSupport()` is `supported`, `unsupported` (no service worker,
  `PushManager` or `Notification`), or `needs-install` on iOS/iPadOS outside the app added to the Home Screen
  (`navigator.standalone` / `display-mode: standalone`), where Safari has no Web Push (iOS 16.4+ has it in the
  installed app).
- **`enable(key)`** runs from the Settings switch (a user gesture): `Notification.requestPermission()` first, then
  waits for the active service worker (10 s at most; there is none under the Vite dev server), subscribes with
  `{ userVisibleOnly: true, applicationServerKey }` and `POST`s `subscription.toJSON()` plus `content_encoding`
  (`aes128gcm` unless the browser only has `aesgcm`) to `/notifications/subscriptions`. A refused permission resolves
  `false`; if the server can't be told it throws, and a subscription this call made is dropped again. A subscription
  made with another key (the server's keys changed) is replaced. Requests go through the sync transport's `send`
  (session cookie, XSRF header, 20 s timeout).
- **`disable()`** unsubscribes in the browser first (so it works offline), then `DELETE`s the endpoint, best effort.
- **Session** (`lib/notifications/session.ts`, from `app.tsx`, on every Inertia `navigate` and `success`, first page
  included; in the background): signed in on an instance with Web Push, it re-`POST`s an existing subscription once
  per user and page load (push services rotate endpoints; the server upserts by endpoint), resubscribing if the keys
  changed, and again on the next page if the server could not be reached (offline, `5xx`; a `4xx` is final). Signed out (a logout here or in another tab, an expired
  session), it drops the browser subscription without a request, so whoever signs in next on this device never
  inherits it; the push service then reports the endpoint gone and the server forgets it. Signing back in leaves
  notifications off on this device until they are turned on again.
- Requests use the Wayfinder helpers (`@/routes/notifications/subscriptions`) and also send `X-Timezone`, like sync,
  so the server knows the time zone before the first notification is due.

### Guest onboarding: demo tasks

A guest's very first visit gets a few demo tasks in the current week that teach the planner (complete on hover, click to
edit, drag, color, timed tasks first, typing a date first, right click, a weekly series on Friday, Someday). They live
only on this device.

- **Seeding.** `useGuestOnboarding` (planner page, guests only, once the current week is on screen) calls
  `seedDemoTasks` (`lib/db/demo-tasks.ts`). A small transaction claims the onboarding: it sets `meta.demo_seeded` and
  goes on only if the flag was absent, there is no `meta.user_id` and no task at all. The tasks are then created
  through the repository with `{ demo: true }`, so each write puts its rows in `meta.demo_ids` without an outbox entry
  in its own transaction (a seed cut short leaves fewer demo tasks, never something to push). The flag stays
  while the device keeps its data, so the demo never comes back after the guest deletes every demo task. Leaving a
  session (logout, or a session found gone) wipes it with everything else, so the device is a first-time guest again
  and the demo is seeded on the next planner view.
- **Never synced.** A demo row has no outbox entry, so it is never pushed and does not count as pending work (the guest
  "save" button stays off until the guest makes a change).
- **Becoming real.** `write()` in `lib/db/tasks.ts` calls `trackDemoRows` (`lib/db/demo.ts`) in the same transaction.
  Edits, completion, moves, duplicates and repeat changes (`release`) take the rows they write, the id the user acted on
  and their series out of `demo_ids`, together with the whole series family (a series and its exceptions), and queue
  the ones not written in that change. Deletes, restores and undos (`keep`) leave demo rows demo, and add the rows they
  derive from them (for example the deleted exception of a demo occurrence), so deleting a demo task never syncs a
  tombstone.
- **Signing up or in.** `SyncEngine.claimDatabase` runs `purgeDemoTasks` before the first push: the demo rows still in
  `demo_ids` are hard-deleted locally. Edited ones were released, so they are pushed like any guest work. Signed-in
  users never get demo tasks.

### Adding a new synced entity

1. Add its type to `lib/db/types.ts` and a table in a new Dexie `version(n)` in `lib/db/database.ts`.
2. Extend the outbox to identify the entity (for example an `entity` field next to the id) and write the record plus
   the outbox entry in one transaction from a repository module, with `nextTimestamp()` for `updated_at` and
   `notifyLocalChange()` after commit.
3. Extend the contract here and the push/pull payloads (server and `lib/sync/transport.ts`), then group the outbox by
   entity in `SyncEngine.recordsOf` and apply the new collection in `SyncEngine.applyRemote` with the same LWW rule
   (`lastWriteWins`). Labels are the worked example: a new `X-Sync-Format`, so older clients never get the new key and
   an updated client pulls from `0` once.
4. Add the new table to `allTables()` in `lib/db/database.ts` so every wipe and sync transaction includes it.
5. Cover it with Vitest tests (repository + engine against `test/fake-sync-server.ts`).

## Export format

A JSON backup of the local database, for registered users, on the Settings › Data page (`/settings/data`,
[style.md](./style.md#settings--data)). The page is a server-rendered Inertia page, but export and import run entirely on
the client (`lib/transfer`) against IndexedDB, so they work offline once the page is loaded.

The planner's `SyncProvider` is not mounted on settings pages, so the Data page mounts its own, and both actions first
call `prepareLocalData(userId)` (`lib/sync`): it claims the local database for the signed-in user, exactly like a sync
run (`claimDatabaseFor`: another user's data is wiped, guest data kept), so a later run never wipes what the import
wrote (when the database already belongs to that user it skips the lock), then runs one sync (forced, even during
back-off) so an export includes the latest server data, waiting for it 3 s at most. When that sync does not finish in
time (offline, errors, a slow connection) the export still happens, and its toast says changes from other devices may
be missing.
Imported rows are pushed by that page's engine right away, or by the planner's on the next visit. Like any sync run,
the claim wipes another user's leftover local data (which only exists after a session ended without a logout).

```json
{
    "format": "plain-week",
    "version": 1,
    "exported_at": "2026-10-15T08:35:00.123Z",
    "app_version": "0.0.3",
    "tasks": [<Task>, ...],
    "labels": [<TaskLabel>, ...]
}
```

- File name: `plain-week-export-YYYY-MM-DD.json` (local date). `app_version` is `package.json`'s version, injected at
  build time (`__APP_VERSION__`); it is informational only.
- `tasks` holds rows with exactly the [Task](#data-model-task) wire shape, `recurrence`, `series_id` and
  `occurrence_date` included. Left out: tombstones, exceptions of a deleted series, and losing duplicate exceptions
  (only the `winningException` of each occurrence is kept). One kind of tombstone is kept on purpose: the deleted
  exception of a live series, because it is what hides a deleted occurrence; without it the occurrence would come back.
  Demo tasks ([Guest onboarding](#guest-onboarding-demo-tasks), `meta.demo_ids`) are never exported: `buildExport`
  skips them, and `prepareLocalData`'s claim already purges the untouched ones, like the first sync of a new account.
- `labels` holds the renamed colors only, with the [TaskLabel](#data-model-tasklabel) wire shape. It is optional on
  import (files from before label names have none), and an invalid entry is skipped rather than refusing the file.
  Import only names a color that still has its default name, so it never renames one.
- `version` changes only for incompatible changes. A newer version is refused with a message to update Plain Week.

| Function (`lib/transfer`)                      | What it does                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildExport(db)`                              | The file for the local database (`backupRows` selects the rows).                                                                                                                                                                                                                                                                     |
| `parseImport(file \| text)`                    | Parses and validates (at most 50 MB); throws `ImportError` with a message for the user (not JSON, not a Plain Week file, unsupported version, `Task 3: "color" must be one of …`). Every row is checked with the server's push rules (`PushRequest`), so imported rows never get a `422` when they sync. Ids only need to be unique. |
| `summarizeImport(file)`                        | `taskCount` (plain tasks and series) and `recurringCount` (series) for the preview; no database access.                                                                                                                                                                                                                              |
| `planImport(file, db)`                         | The rows to add (reads the database, never writes): see below. Call it right before `applyImport`, so positions are current.                                                                                                                                                                                                         |
| `applyImport(plan, { batchSize, onProgress })` | Writes the rows plus their outbox entries in transactions of 500, series first, yielding to the event loop between batches (10 000 tasks do not freeze the UI) and reporting progress. Batches already written stay if a later one fails.                                                                                            |

Import **adds** tasks; it never changes or removes existing ones (importing the same file twice gives two copies):

- The file's rows go through the same selection as the export (`backupRows`), so a hand-edited file is cleaned up the
  same way (for example, exceptions of a series deleted in the file are dropped).
- Every row gets a new UUID v7 id, series first, so their ids sort (and sync) before their exceptions; an exception's
  `series_id` points at its series' new id. An exception whose series is not in the file becomes a plain task (a
  deleted one is dropped). Duplicate exceptions in the file are settled with
  `winningException` before the ids change, since the new rows all share one `updated_at`.
- Positions are appended after the existing tasks of each day / the Someday list (`generateNKeysBetween` after the
  list's last key), keeping the file's relative order. Imported Someday tasks all take the column of the last Someday
  task (0 when there is none), so they land at the end of the list.
- `created_at` and `updated_at` are now (one `nextTimestamp()`); `done`, `done_at` and subtasks (with their ids) are kept;
  kept exception tombstones get `deleted_at` = now.
- The outbox entries make the sync push the new rows like any other local change.

## Planner UI

`resources/js/pages/planner.tsx` composes the components in `resources/js/components/planner/` (layout and
measurements in [style.md](./style.md#planner-layout)). It follows the offline-first rule:

- Data comes only from the live hooks (`useWeekTasks`, `useSomedayTasks`); writes go through
  the repository (`createTask`, `toggleDone`, and in the task dialog `updateTask`, `updateSubtasks`, `moveTask`,
  `duplicateTask`, `deleteTask`, `setRecurrence`, undone with an `UndoLog`) without awaiting them. Write failures show
  a toast.
- The task dialog writes through a per-dialog queue (`task-dialog/task-editor.tsx`): each write runs after the previous
  one, on the id the previous one returned, and the dialog switches to it. That is how it survives an occurrence
  becoming an exception or a "this and all future" split ending the id it opened with. Scoped edits on a recurring task
  ask "Only this task / This and all future" once per dialog (see [style.md](./style.md#recurring-tasks)).
- `SyncProvider` is mounted at the page root.
- The shown week lives in the URL (`?week=YYYY-MM-DD`, the Monday; dropped for the current week), so changing weeks
  needs no server round trip and works offline (`hooks/use-week-navigation.ts`, pure helpers `weekFromUrl` /
  `canonicalWeekUrl` in `lib/planner/week.ts`).
    - On load an invalid or non-Monday value is normalized at once. Inertia records the server URL in history
      asynchronously after the first render, so this one write is an Inertia client visit (`router.replace`, no
      request), which goes through Inertia's history queue and keeps its page URL canonical.
    - Every week change after that uses `history.replaceState` directly (keeping Inertia's history state), never a
      server visit; held arrow keys do not repeat and rate-limit errors are ignored.
- Task links: `/?task=<id>` (a task id or an occurrence id `${seriesId}:${YYYY-MM-DD}`) opens the planner on that
  task's week (Someday: the current week) with its dialog open. Push notifications and calendar events link here;
  for a recurring task they link to the occurrence id (a series id opens the series' first date).
  `useTaskLink` (`hooks/use-task-link.ts`, helpers in `lib/planner/task-link.ts`) reads the parameter once when the
  planner mounts and looks the task up with a live query, so a task that only arrives with the first sync after the
  load still opens. Once a sync run has finished (at once for guests or offline) and at least 10 s have passed, a task
  still missing is given up silently. Nothing waits on it. `?task=` is dropped from the URL (with `history.replaceState`, keeping `?week=`)
  when the dialog closes or the lookup gives up; a link that resolves while another task's dialog is open is ignored.
- Keyboard shortcuts: see [Keyboard shortcuts](#keyboard-shortcuts).
- "Today" comes from `useToday()`, the only place the planner reads the date: a shared store (`lib/planner/today.ts`)
  that, while the planner is open, re-reads the clock on a timeout to local midnight, every 30 s, and on `focus`,
  `pageshow`, `online` and `visibilitychange` (visible), and re-renders only when the date key changes. The timeout
  alone was not enough: timers stall while a laptop sleeps, and a tab that was visible when the lid closed is still
  visible when it opens, so `visibilitychange` never fires and the planner stayed on yesterday until a reload. When the
  date moves into a new week while the current week is shown, `useWeekNavigation` follows to the new current week; a
  week the user navigated to stays.
- Unfinished tasks of earlier days move to today: see [Carry over](#carry-over-unfinished-tasks).
- Pure logic lives in `lib/planner/` with unit tests: ISO week math (`week.ts`; the desktop week grid itself is CSS,
  see [style.md](./style.md#planner-layout)), smart time and date (`smart-time.ts`,
  `smart-date.ts`, combined with `#label` by `smart-input.ts`, see [Smart input](#smart-input)), date labels (`format.ts`), task color styles (`task-colors.ts`) and
  drop resolution (`drop.ts`).

### Smart input

`parseNewTaskInput(input, today, labels)` (`lib/planner/smart-input.ts`) reads what a new-task row was given and stays
pure: the row passes the live labels (`useTaskLabels()`) and today (`useToday()`), and creates the task with the
result's `text`, `date`, `time` and `color`.

- **Label first.** The first `#word` (a `#` at the start of the text or after whitespace) that `findLabel` resolves
  sets `color` and is taken out of the text with the spaces on one side, so words stay one space apart. It can be
  anywhere ("Gym #pink now", "#pink 31 Dec Gym"); matching ignores case, spaces and hyphens and the color id always
  matches, even after a rename. Later tags and `#words` naming no label stay as text (hashtags keep working). A tag
  that would leave the task without a title ("#pink", "17:30 #pink" keeps the time as text) stays as text too.
- **Then a leading date and time**, in either order, on what is left (see `smart-date.ts` and `smart-time.ts`).
- **Ranges.** `ranges.date`, `ranges.time` and `ranges.label` are `{ start, end }` offsets in the original input, for
  the marks drawn in place (see [style.md](./style.md#smart-title-in-the-new-task-row)).
- **In-progress tag.** `tag` is the `#word` the input ends with (no whitespace after it), with its `query` (possibly
  empty), for the suggestions; once it fully names a label it already applies. It is null when an earlier tag already
  applied, since a second one would stay as text. `suggestLabels(query, labels)` lists the labels whose name (so
  their tag) or color id starts with the query, and `completeTag` swaps the partial tag for `#<labelTag(name)> `.

### Carry over unfinished tasks

The "Move unfinished tasks to today" preference (Settings › Preferences, on by default) moves yesterday's leftovers
forward, like a paper planner rewritten each morning.

- **When.** `useCarryOver(today)` (called by `PlannerLayout`) runs `carryOverTasks(today)` when the planner opens and
  whenever `useToday()` rolls over, while the setting is on. A signed-in device with a started sync engine first waits
  for one sync run, so a task completed on another device since the last sync is pulled before this device moves it
  (with whole-record last-write-wins the newer move would otherwise undo that). The hook relies on parent effects
  running after their children's: `PlannerLayout` renders `SyncProvider`, so the engine has started by then. Offline
  the run returns at once and the move is a local edit like any other.
- **What moves** (`isCarriedOver` in `lib/db/carry-over.ts`): live tasks that are not done, have a date (Someday never
  falls behind) before today, and are plain tasks. Recurring tasks are never carried: a series row only anchors its
  rule, an occurrence or its exception row belongs to its date, and the series comes back on its next date anyway, so
  carrying would show it twice. Demo tasks the guest never touched stay on the day they teach (they are released, and
  carried, once edited).
- **Where.** At the end of today, after its existing tasks (occurrences included), oldest day first and in each day's
  position order. Subtasks are part of the row, so they travel with it. One
  quiet toast per run says how many moved ("Moved 3 unfinished tasks to today"), never one per task; only the tab whose
  transaction moved them shows it.
- **Safety.** The repository reads and writes in one transaction through the usual `write()` (rows plus outbox entries,
  newer `updated_at`), so it is idempotent and two tabs never move a task twice. Two devices doing it converge through
  LWW: a move keeps the id, so it never duplicates; the later move's position wins.
- **Known limits.** Last-write-wins is per record: if another device marks a task done while offline and this device
  moves it before that change is pushed, the newer move wins and the task comes back unfinished on today. It runs only
  at start and on rollover, so a past-dated task that arrives later (pulled from a device with the setting off, or put
  back on a past day by an undo or a drag) waits there until the next start or midnight.
- **Setting storage.** Per device in `localStorage` (`plain-week.carry-over`, only `off` is stored; absent means on), in
  `lib/planner/preferences.ts`, followed across tabs through the `storage` event. Plain Week has no synced preferences,
  and this way it works offline and for guests. Settings pages are for registered users, so guests have no switch and
  always get the default (on).

### Drag and drop

Built on `@dnd-kit/core` + `@dnd-kit/sortable` (shadcn has no DnD primitive). Like every other action, a drop only
writes the local database (`moveTask`); sync follows in the background.

| Piece                                               | Role                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PlannerDnd` (`components/planner/planner-dnd.tsx`) | The `DndContext` around the week and Someday: sensors, collision detection, edge zones, drag overlay, announcements, the drop write |
| `TaskList`                                          | A droppable per list (`list:<date>` / `list:someday`) carrying its `placement` and tasks, and a `SortableContext` of its rows       |
| `TaskRow`                                           | A sortable item carrying its task, `placement` and list; dims while dragged                                                         |
| `lib/planner/drop.ts`                               | Pure functions: drop target → `moveTask` input and the insertion line (`resolveDrop`), edge-zone dates (`edgeDropDate`)             |

- Sensors: mouse after 5 px of movement (so a click still opens the task; the right button never drags), touch with a
  press that holds 250 ms, which picks the task up, and then moves (a swipe scrolls; a long press never opens the
  context menu, which touch users reach from the row's ⋮ button; see
  [style.md](./style.md#touch-gestures-on-a-task-row)), keyboard from the row's move button (Space or Enter, arrows,
  Space or Enter to drop, Escape to cancel).
  The click that follows a pointer drag (also one cancelled with Escape) is swallowed. Planner shortcuts are
  suspended while a task is dragged.
- Collision detection hit-tests the pointer: edge zones win over task rows, which win over the list they sit in. Over
  a row, the upper half drops above it and the lower half below it; over the rest of a list (its empty row and, on
  desktop, the ruled area below it) the task is appended; released anywhere else (gutters, headers) the drag is
  cancelled. On desktop a list scrolls inside its cell, so a task row only counts where the pointer is also inside its
  list (rows scrolled out of view still sit on the page, over the gap or the cell below). Keyboard drags have no pointer: the
  overlay steps onto a row; within the task's own list it lands below the row when that row is further down than where
  the drag started (so stepping swaps places), in another list above it.
- Days show timed tasks first by time, so only untimed tasks are positional there: the `beforeId`/`afterId` handed to
  `moveTask` are the closest untimed tasks around the drop point, and a timed task keeps its slot by time (moving it
  within its own day is a no-op). Someday is one positional list: a drop anywhere in it reorders it. A drop that would
  not change anything writes nothing.
- Edge zones (`start` = previous week, `end` = next week, so RTL mirrors) appear only while dragging. Hovering one
  for 600 ms changes the shown week, and keeps doing so while hovered, so the drag continues in the new week. Dropping
  on one moves the task to the same weekday of the week beyond the shown one (a Someday task goes to its Monday),
  appended, and a toast says where it went ("Moved to Wed 21 Oct.") with an Undo that puts it back. The dragged task is
  kept in state, so the drag survives its source row unmounting on a week change.
- A dropped task stays dimmed until its write has committed, so its row does not flash back in its old place.

### Keyboard shortcuts

| Piece                                                               | Role                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `lib/planner/shortcuts.ts`                                          | The registry (id, keys, label, group, RTL mirror) and the key-sequence matcher; the source for handlers, dialog and hints |
| `hooks/use-planner-shortcuts.ts`                                    | The one `window` keydown listener: guards, sequences, RTL mirroring, held keys                                            |
| `hooks/use-task-dialog-shortcuts.ts`                                | The task dialog's `onKeyDown`: its own keys (the "Task dialog" group)                                                     |
| `hooks/use-menu-shortcuts.ts`                                       | A menu's `onKeyDown`: an item's key picks it (`data-shortcut="<id>"`) while the menu is open                              |
| `ShortcutHint` (`components/planner/shortcut-hint.tsx`)             | The key hint of an action id, for mouse users only (`hooks/use-key-hints.ts`)                                             |
| `lib/planner/cursor.ts`                                             | Pure cursor model: resolve, move, first / last, after a removal, carried to another week                                  |
| `KeyboardCursorProvider` (`components/planner/keyboard-cursor.tsx`) | Cursor state, the lists on screen (each `TaskList` registers its tasks), and what every shortcut does                     |
| `ShortcutsDialog` (`components/planner/shortcuts-dialog.tsx`)       | The `?` dialog, generated from the registry; `shortcutsDialogStore` (`lib/planner/shortcuts-dialog.ts`) opens it          |
| `ShortcutKeys` (`components/planner/shortcut-keys.tsx`)             | The keys of an action id as `Kbd`s, in the current direction (left to right, so `<` / `>` never mirror)                   |
| `lib/planner/undo.ts`                                               | `toastWithUndo` for every "Undo" toast (menu, dialog, drops), and `undoLatest` behind `u`                                 |

- Shortcuts only run when focus is not in a text field, no dialog or menu
  (`role="dialog" | "alertdialog" | "menu" | "listbox"`) is open, no task is being dragged (`[data-drag-overlay]`)
  and no Ctrl, Meta or Alt is held. Keys are case-sensitive (`G` is Shift+G). Sequences (`g g`, `d d`) wait 1 s for
  their second key; a key that does not continue a sequence runs on its own. Held keys repeat cursor motions only and
  never complete a sequence. Enter and Space act on the cursor only when focus is on the page, a task's text button
  or a new-task row stop, so other buttons keep them. A shortcut with nothing to act on (Space without a cursor)
  leaves the key's default alone.
- Keys that point left or right are mirrored in RTL: `h` / `←` / `H` go to the next day or week there. `<` / `>` move a
  task to the previous / next day in either direction.
- The cursor is one task, or one list's new-task row (the last stop of each list). Lists are in visual order: Monday to
  Sunday, then Someday, the reading order of the desktop grid too (Monday to Friday, then Saturday, Sunday and Someday
  in the row below): `l` from Friday goes on to Saturday and from Sunday to Someday. It is stored as list, task id and
  row index: it follows its task when the task moves (an occurrence moved becomes an exception with a new id, taken from
  the move's result), and lands on the same row of its list when the task is gone. `h` / `l` go back to the row the
  cursor was last on in the list they enter (remembered per list until the week changes), or else the same row. `H` /
  `L` / `←` / `→` carry it to the same weekday and row; `t` puts it on today. The first motion with no cursor starts on
  today's first task (the first list in another week), or on the focused row when Tab got there first.
- Focus is real and roving: the cursor's task text button, or the new-task row itself (`tabIndex=-1`, not its input,
  so keys there are still shortcuts; Enter, `a` or `i` focus the input and Esc in it comes back), takes focus when the
  cursor moves by key, so screen readers announce it (the new-task row is a group named "New task for Mon 12 Oct.
  Press Enter to type."). Focus inside the row, in a field or in a dialog is never taken. While shown, the cursor
  follows focus (Tab, the task dialog and context menu handing focus back to their task). The task dialog, the context
  menu and the shortcuts dialog return focus to the cursor's row when they close.
- Actions go through the same local writes as the mouse: `toggleDone`, `moveTask` (`J` / `K` use `resolveListDrop`,
  so timed tasks keep their place by time; `<` / `>` change the week when the task leaves it), and the context menu's
  `moveWithUndo` (`w`, `s`), `duplicateWithToast` (`y`) and `deleteWithUndo` (`d d`, asking the scope of a recurring
  task first). `m` opens the context menu anchored to the row's start, like Shift+F10. `a` / `i` with no cursor
  start a task today. Enter opens a task, or starts typing on a new-task row. With no cursor shown and no row
  focused, Enter and `a` act on the row under the mouse, which is what its hint promises; other keys (deletes, moves)
  never act on a row the mouse merely rests on. While the cursor is shown, only its row shows a hint. While a task's
  move or delete is still being written, further moves or deletes of it are ignored, so a quick second press never acts on its old state. `u` presses the newest "Undo" toast still on screen,
  then the one before it (after a toast closes, undoing could overwrite later edits); `<` / `>` / `J` / `K` keep the
  task in view and show no toast, like a drag. `,` opens Settings (signed-in users only; guests have no settings
  page, so the dialog leaves it out).
- The registry has two contexts: the planner keys (`PLANNER_SHORTCUTS`) and the task dialog's ("Task dialog" group,
  `TASK_DIALOG_SHORTCUTS`); a key is unique within its context only (`d` is the date in the dialog, `d d` deletes on
  the planner). The dialog's keys are plain keys, so they run only while focus is in the dialog but not in a text
  field nor in one of its popovers or menus (portaled outside the dialog's element), nor in a part with keys of its own
  (`data-own-keys`: the subtasks, so Delete on a subtask's button never deletes the task), never with Ctrl, Meta or
  Alt, and never on Enter or Space. Delete deletes the task, Backspace does not (easy to press by reflex). A key for a
  disabled picker (`d` on a series row, `r` on a Someday task) does nothing. Combos inside text fields were left out: `Alt+letter` types characters on macOS and opens
  browser menus on Windows, and `Mod+letter` belongs to the browser; Tab leaves a field, and Esc closes the dialog
  from anywhere. There is no `Mod+Enter`: every edit is already saved as it happens. Which toolbar popover is open
  lives in the dialog (`ToolbarPickerContext`, `task-dialog/toolbar-picker.ts`), so `d`, `t`, `r`, `c` and `m` open
  them; one is open at a time.
- Menus (the task context menu, the dialog's More menu) pick an item when its key is pressed while open; the first key
  of a sequence (`d` of `d d`) is held back from the menu's typeahead.

## Offline app shell

The data layer only helps offline if the app itself loads offline. A service worker (`resources/js/sw.ts`, built by
`vite-plugin-pwa` into `public/sw.js`, scope `/`) keeps the app shell available after the first visit:

| Request                                                                         | Strategy                                                                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Built JS/CSS/fonts/images under `/build/`, the web manifest and `/offline.html` | Precached on install (Workbox precache manifest)                                              |
| Full-page load of `/` (any query: `?week=`, `?task=`)                           | NetworkFirst (3 s timeout); the cached shell on network errors and on `5xx`                   |
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
- **Installing it.** The web manifest makes the planner installable as an app. On desktop, "Install mobile app" in
  the planner's account menu shows a QR code of the instance's `/` and the iPhone and Android steps to add it to the
  home screen (see [style.md](./style.md#install-mobile-app-card)); there is no in-page install prompt.
- **Offline UX.** Nothing extra is shown while offline: the planner works from IndexedDB and the account button's sync
  status dot covers connectivity. Only server pages need the network. A full-page load of one gets the static
  `/offline.html` page (with a link back to the planner); an in-app Inertia visit to one shows a "You're offline" toast
  (`lib/pwa/offline-visits.ts`). Failed hover prefetches stay silent.
- **Web Push.** The worker also shows push notifications (only when the instance has VAPID keys, see
  [Notifications (client)](#notifications-client)). `push` reads the JSON payload `{ title, body, url, tag }` and calls
  `showNotification(title, { body, tag, data: { url }, icon: '/pwa-192x192.png', badge: '/notification-badge.png' })`;
  a malformed payload still shows a plain "Plain Week" notification, because a `userVisibleOnly` push must show one.
  `notificationclick` loads the notification's URL in an open Plain Week window (the focused one, else a visible one;
  a full load of `/?task=<id>`, so the task link opens its dialog) and focuses it, or opens a new window when there is
  none or it can't be navigated. Only same-origin URLs are followed; anything
  else opens `/`. The logic lives in `lib/pwa/push-handlers.ts` (tested without a worker); `sw.ts` only wires the
  events.

## Translations

English is the only bundled language, and every user-facing string goes through a translation lookup, so an instance
can add languages or reword English with JSON files ([self-hosting.md](./self-hosting.md#translations)).

**Client.** An in-house, typed `t()` (`resources/js/lib/i18n`), no library: the catalog is the `as const` object in
`resources/js/lang/en.ts`, merged from one file per area (`lang/en/planner.ts`, `settings.ts`, …), so keys are
`keyof typeof en` and a missing or misspelled key fails `tsc`. Keys are flat, `<area>.<name>`; values are a string with
`{name}` placeholders or a plural `{ one, other, … }` keyed by `Intl.PluralRules` category (plural keys require a
`count`). `tRich(key, { link: (text) => … })` (`lib/i18n/rich.tsx`) renders `<link>…</link>` tags in a message with
React elements, so a sentence with a link stays one message. `t()` reads a module-level catalog that `app.tsx` sets in
`withApp` from the first page's `i18n` props, before the first render; never call it at module top level (labels in
module constants are getters or functions). The bundled English is the fallback for every key the instance does not
translate.

**Dates.** `lib/planner/format.ts` formats with `Intl` in the active locale (`dateLocale()`, `dateFormat(options)`,
cached formatters); English stays `en-GB` ("12 Oct", weeks start on Monday). The shadcn `Calendar` gets `Intl`
captions, weekday names and labels for other languages (`lib/i18n/calendar.ts`), so no date-fns locale is bundled.
Typed dates in the task input (`lib/planner/smart-date.ts`) are English words in every language. The guest demo
tasks are written to IndexedDB in the language active when they are seeded and stay so. The hosted service's terms and
privacy pages (`pages/legal/*`) stay English on purpose.

**Server.** `App\Support\Translations` lists the offered locales (`en`, then each `<locale>.json` in
`config('app.translations_path')`) and reads the files (a file that is not a JSON object is logged and ignored).
`App\Http\Middleware\SetLocale` (web group) sets the request locale: `users.language` when still offered, else the
best match for `Accept-Language` (exact, then same language), else `APP_LOCALE` when offered, else `en`; it adds
`Vary: Accept-Language`. `<html lang dir>` follow it (`dir="rtl"` by language, see [style.md](./style.md#rtl)).
`App\Support\TranslationOverridesLoader` lays the same files over Laravel's JSON translations, so `__('English text')`
and framework keys (`validation.required`) are translated with no `lang/` directory in the repository. Mail and
notifications use `User::preferredLocale()` (`language` while offered; null keeps the request's locale); the push
notification job sets it, or `APP_LOCALE`, around its sends. The queue worker forgets loaded translations before each
job, so edited files reach queued mail and pushes without a restart. (`users.locale`, the sign-up language, only picks
the SaaS welcome email.)

**Delivery and offline.** The shared Inertia prop `i18n` is `{ locale, locales, messages }`: `messages` is the English
overrides plus the active locale's, sent as a once prop keyed by locale and content hash, so visits do not resend it
until a file changes. The full page load embeds it, and so does the cached offline shell, so the planner renders
translated offline with no extra request. A language change (Settings › Preferences, or a login into an account with
another language) arrives as an Inertia response whose `i18n.locale` differs from the running one; the page then
reloads (`lib/i18n/reload-on-change.ts`). The same response changes `auth.user` (`language`), so the shell is
re-cached ([Offline app shell](#offline-app-shell)).

## Server side

Laravel provides:

- Authentication and account settings through Fortify (login, registration, password reset, email verification, 2FA,
  passkeys) with Inertia pages.
- The sync endpoints above.
- The HTML shell and built assets. Planner data is never rendered from server props; pages read it from IndexedDB.
- Optional integrations that work in the background, never on the path of a planner action (see
  [Google Calendar](#google-calendar), the [ICS feed](#ics-feed) and [Push notifications](#push-notifications)).
- Background work: the scheduler (tasks registered in `routes/console.php`) and a worker for the database queue. The
  Docker image runs both next to the server ([self-hosting.md](./self-hosting.md#configuration)), `composer dev` too.
  It never sits between the user and the planner.

### Routes and access

| Route                                        | Name                                  | Access                                                                               |
| -------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /`                                      | `home`                                | Public. Renders the Inertia page `planner` for everyone.¹                            |
| `POST /sync/push`                            | `sync.push`                           | `auth` (session + CSRF). `SyncController@push`.¹                                     |
| `GET /sync/pull`                             | `sync.pull`                           | `auth` (session). `SyncController@pull`.¹                                            |
| `/settings/*`                                |                                       | `auth`.                                                                              |
| `GET /settings/data`                         | `data.edit`                           | `auth`. Inertia page `settings/data` (export / import run client-side).              |
| `GET /settings/preferences`                  | `preferences.edit`                    | `auth`. Inertia page `settings/preferences` (values stored in the browser).          |
| `GET /settings/labels`                       | `labels.edit`                         | `auth`. Inertia page `settings/labels` (names in IndexedDB, synced).                 |
| `PATCH /settings/language`                   | `language.update`                     | `auth`. `{ language: <offered locale> \| null }` (`users.language`); redirects back. |
| `GET /settings/integrations`                 | `integrations.edit`                   | `auth`.² Inertia page `settings/integrations`.                                       |
| `GET /settings/integrations/google/connect`  | `integrations.google.connect`         | `auth`.¹ ² Redirects to Google's consent screen (`throttle:10,1`).                   |
| `GET /settings/integrations/google/callback` | `integrations.google.callback`        | `auth`.¹ ² Google's OAuth redirect URI: stores the connection, creates the calendar. |
| `DELETE /settings/integrations/google`       | `integrations.google.destroy`         | `auth`.² Deletes the calendar, revokes the grant, forgets the connection.            |
| `POST /settings/integrations/ics`            | `integrations.ics.store`              | `auth`.¹ Enables the [ICS feed](#ics-feed), or gives it a new URL (`throttle:10,1`). |
| `DELETE /settings/integrations/ics`          | `integrations.ics.destroy`            | `auth`. Disables the ICS feed (idempotent).                                          |
| `GET /calendar/{token}.ics`                  | `ics-feed.show`                       | Public, no session (the token is the credential). See [ICS feed](#ics-feed).         |
| `GET /settings/notifications`                | `notifications.edit`                  | `auth`.¹ ³ Inertia page `settings/notifications` (`morningTime`, `timezone`).        |
| `PATCH /settings/notifications`              | `notifications.update`                | `auth`.¹ ³ `{ morning_time: 'HH:mm' }`; redirects back.                              |
| `POST /notifications/subscriptions`          | `notifications.subscriptions.store`   | `auth`.¹ ³ This browser's `PushSubscription.toJSON()`; `204`.                        |
| `DELETE /notifications/subscriptions`        | `notifications.subscriptions.destroy` | `auth`.³ `{ endpoint }`; `204`.                                                      |
| `GET /settings/agents`                       | `agents.edit`                         | `auth`.⁴ Inertia page `settings/agents` (`mcpUrl`, `api`, tokens, apps, activity).   |
| `POST /settings/agents/tokens`               | `agents.tokens.store`                 | `auth`.⁴ `{ name }`; flashes `newToken: { name, token }` once (`throttle:10,1`).     |
| `DELETE /settings/agents/tokens/{token}`     | `agents.tokens.destroy`               | `auth`.⁴ Revokes one of the user's personal tokens (idempotent; never another's).    |
| `DELETE /settings/agents/apps/{client}`      | `agents.apps.destroy`                 | `auth`.⁴ Disconnects an OAuth app: deletes the user's tokens and codes for it.       |
| `POST /mcp` and the `/oauth`, `.well-known`  |                                       | See [MCP server](#mcp-server).                                                       |
| `/api/v1/*`                                  | `api.*`                               | Bearer token (`auth:api`). See [App API](#app-api).                                  |

¹ Plus `EnsureHasAccess`: in SaaS mode a signed-in account without a paid plan is redirected to the paywall (pages) or
gets `402` (sync). Billing and legal routes are listed in [saas.md](./saas.md).

² Plus `EnsureGoogleCalendarConfigured`: `404` unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Only
connecting needs a plan in SaaS mode, so an account whose plan lapsed can still see and remove its connection.
`integrations.edit` still has it until the page shows the ICS feed card; the ICS routes never do.

³ Plus `EnsureWebPushConfigured`: `404` unless `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are set.
Unsubscribing needs no plan in SaaS mode, so a browser can always be removed.

⁴ Settings › Agents & apps (the path stays `/settings/agents`). Always there, whatever `MCP_ENABLED` says: with the MCP
server off, `mcpUrl` is `null` and the page hides the MCP URL, the agent snippets and the empty activity log. No plan
is needed in SaaS mode: tokens and apps can always be managed, and the MCP server and the API sync answer with the
paywall.

After login, registration and email verification Fortify redirects to `/` (`config/fortify.php` → `home`).

**Sign-up can be closed.** `REGISTRATION_ENABLED=false` (`config/auth.php` → `registration.enabled`, default `true`)
closes it: `App\Http\Middleware\EnsureRegistrationOpen`, in Fortify's route middleware, answers `404` on `register` and
`register.store`. The routes stay registered so the Wayfinder helpers keep building. `App\Auth\Registration::open()`
is the rule (on, or no users yet, so a fresh instance can create its first account) and is shared with every page as
`canRegister`, which hides the login page's sign-up link and points the planner's "Sync your week" at the login page.

**Single sign-on (OIDC).** An external OpenID Connect IdP can log users in (`config/oidc.php`, `OIDC_*`; operator
guide in [self-hosting.md](./self-hosting.md#oidc--single-sign-on)). `App\Auth\Oidc\Oidc::enabled()` needs the issuer,
the client id and the kill switch `OIDC_ENABLED` (default on, off when `SAAS_ENABLED=true`, an explicit value wins);
otherwise `App\Http\Middleware\EnsureOidcEnabled` answers `404` on `/auth/oidc/redirect` and `/auth/oidc/callback`
(both `throttle:oidc`, 20 a minute per IP), and the shared `oidc` prop (`enabled`, `only`, `label`) hides the button.

- **Protocol.** `App\Auth\Oidc\OidcProvider` is a first-party Socialite driver (`oidc`, registered in
  `OidcServiceProvider`): the authorization code flow with PKCE (S256), Socialite's `state` and a `nonce`, endpoints
  from the discovery document (`OidcDiscovery`, cached an hour; it must name the configured issuer). The ID token is
  verified against the IdP's JWKS (refetched once for an unknown `kid`; `none` and HMAC algorithms are never accepted):
  `iss`, `aud` (and `azp` with several audiences), `exp` and `iat` (required) and `nbf` with a minute of leeway, and the
  session's `nonce`.
  Its `sub` is authoritative; the userinfo response, when the IdP has the endpoint, adds the profile claims and must
  carry the same `sub`. The token request uses `client_secret_basic` (or `client_secret_post` when it is the only one
  the IdP lists), or no secret for a public client.
- **Accounts.** `users.oidc_issuer` + `users.oidc_sub` (unique together) link an account; `users.password` is nullable.
  `App\Auth\Oidc\ResolveOidcUser` finds the account by issuer and `sub`, else links the account with the same email
  only when `email_verified` is `true` (and it is not linked to another `sub` at the same issuer; a link to another
  issuer is replaced), else creates a password-less account while `Registration::open()`. Linking an account whose own
  email was never verified first drops every credential it had (password, two-factor, passkeys, remember token,
  database sessions, Passport tokens and codes): whoever signed up with the address before its owner proved it
  ("pre-hijacking") keeps no way in. A unique-constraint race between two first logins retries the lookup once. Each refusal is an
  `OidcLoginRefused` reason flashed as `oidcError` and explained on the login page (`auth.oidcError.*`).
- **Two-factor.** An account with confirmed two-factor goes through Fortify's challenge after the IdP
  (`login.id`/`login.remember` in the session, like a password login): the IdP replaces the password, not the second
  factor.
- **Password-less accounts.** They never pass a password check (`EloquentUserProvider` refuses a null hash). Where
  Laravel asks to confirm the password (`password.confirm`: Settings › Security, two-factor and passkey setup), the
  confirm page offers "Confirm with single sign-on": `/auth/oidc/redirect?confirm=1` asks the IdP for `prompt=login`
  and `max_age=600`, and the callback marks the password confirmed (`auth.password_confirmed_at`) only for the same
  issuer and `sub`, and only with an ID token `auth_time` from the last ten minutes (an IdP must send it when `max_age`
  is asked; without it the IdP may have reused its session). It returns to the page RequirePassword stored, or to the
  page with the button (the Referer), only when that is a URL of this app. Deleting the account and setting a
  password (no current password for them) need that recent confirmation instead of a password field
  (`App\Auth\PasswordConfirmation`).
- **`OIDC_ONLY`.** `App\Http\Middleware\EnsurePasswordLoginAllowed` (Fortify's route middleware, and on
  `user-password.update`) answers `404` on password login, sign-up, password reset, passkey login and setting a
  password; `canRegister` is false and the login page shows only the IdP button.
- The callback never switches a signed-in browser to another account (only a re-authentication comes back signed in).
- Logout is local; the IdP session is left alone (no RP-initiated logout).

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

The `TrimStrings` and `ConvertEmptyStringsToNull` middleware are skipped for `sync/*` and `api/*/sync/*`, so strings (empty `notes`,
leading spaces in `text`) round-trip exactly.

### Tables

`tasks`

| Column           | Type                       | Notes                                                       |
| ---------------- | -------------------------- | ----------------------------------------------------------- |
| `id`             | string(36), primary key    | UUID supplied by the client; never generated by the server  |
| `user_id`        | foreign key → `users`      | Cascades on user delete                                     |
| `text`           | text                       |                                                             |
| `date`           | date, nullable             | Returned as `YYYY-MM-DD`; indexed with `user_id`            |
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

`users` (the Laravel table, plus):

| Column                      | Type                 | Notes                                                                                                              |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `timezone`                  | string(64), nullable | IANA name the browser last reported on sync (see [Sync endpoints](#sync-endpoints)); null until the first          |
| `notification_morning_time` | string(5)            | `HH:mm`, default `08:00`: when the morning notifications go out, in `timezone`                                     |
| `referral_source`           | string(32), nullable | `App\Enums\ReferralSource`, asked at sign-up in SaaS mode only (see [saas.md](./saas.md#sign-up-answers))          |
| `locale`                    | string(5), nullable  | `en` or `es`, from `Accept-Language` at sign-up; the language of emails (see [saas.md](./saas.md#sign-up-answers)) |
| `language`                  | string(35), nullable | Interface language picked in Settings › Preferences; null follows the browser (see [Translations](#translations))  |
| `welcomed_at`               | timestamp, nullable  | When the welcome email was claimed (SaaS mode, first access; see [saas.md](./saas.md#welcome-email))               |

`task_labels`: the [label names](#data-model-tasklabel), unique on `(user_id, color)`.

| Column       | Type                  | Notes                                                    |
| ------------ | --------------------- | -------------------------------------------------------- |
| `id`         | bigint, primary key   | Server-only; never on the wire                           |
| `user_id`    | foreign key → `users` | Cascades on user delete                                  |
| `color`      | string(16)            | `App\Enums\TaskColor`, never `none`                      |
| `name`       | string(64)            | Trimmed, at most 24 characters; `''` is the default name |
| `updated_at` | datetime(3)           | Client-owned, UTC; drives last-write-wins                |
| `version`    | unsigned bigint       | From `sync_versions`, like tasks; indexed with `user_id` |

`sync_versions`: a single row (`id = 1`) holding the last version handed out, seeded by its migration.

`google_calendar_connections`: at most one per user (see [Google Calendar](#google-calendar)).

| Column                | Type                          | Notes                                                                         |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `user_id`             | foreign key → `users`, unique | Cascades on user delete                                                       |
| `google_email`        | string                        | The connected Google account, from the ID token                               |
| `access_token`        | text                          | `encrypted` cast (`APP_KEY`)                                                  |
| `refresh_token`       | text                          | `encrypted` cast (`APP_KEY`)                                                  |
| `token_expires_at`    | datetime                      | When `access_token` expires                                                   |
| `calendar_id`         | string, nullable              | The "Plain Week" calendar created on connect                                  |
| `connected_at`        | datetime                      | Last successful connect                                                       |
| `last_synced_at`      | datetime, nullable            | Last sync run that finished                                                   |
| `last_error`          | text, nullable                | The last error Google returned (shown on Settings › Integrations)             |
| `disconnected_reason` | string, nullable              | Set (`invalid_grant`) when Google refuses the tokens: the user must reconnect |

`google_calendar_events`: the events Plain Week sent to a connection's calendar (see [Event sync](#event-sync)).

| Column                          | Type                                        | Notes                                                                            |
| ------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| `google_calendar_connection_id` | foreign key → `google_calendar_connections` | Cascades on delete, so disconnecting forgets the events                          |
| `key`                           | string, unique with the connection          | The task id of a plain task, `${series_id}:${occurrence_date}` for an occurrence |
| `google_event_id`               | string                                      | Chosen by Plain Week (32 hex characters) before the event is created             |
| `date`                          | date                                        | The date the event is on                                                         |
| `payload_hash`                  | string(64), nullable                        | SHA-256 of the event last sent; null until Google confirmed it                   |

`ics_feeds`: at most one per user (see [ICS feed](#ics-feed)).

| Column       | Type                          | Notes                                                                  |
| ------------ | ----------------------------- | ---------------------------------------------------------------------- |
| `user_id`    | foreign key → `users`, unique | Cascades on user delete                                                |
| `token_hash` | char(64), unique              | SHA-256 of the token in the feed URL, for the lookup                   |
| `token`      | text                          | `encrypted` cast (`APP_KEY`), so Settings › Integrations shows the URL |

`push_subscriptions`: one per subscribed browser (see [Push notifications](#push-notifications)).

| Column             | Type                  | Notes                                                                                      |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------ |
| `user_id`          | foreign key → `users` | Cascades on user delete                                                                    |
| `endpoint`         | text                  | The push service URL                                                                       |
| `endpoint_hash`    | char(64), unique      | SHA-256 of `endpoint`; a browser that subscribes again, under any account, updates its row |
| `p256dh`, `auth`   | string                | The browser's keys (base64url)                                                             |
| `content_encoding` | string(16)            | `aes128gcm` (default) or `aesgcm`                                                          |
| `user_agent`       | text, nullable        | For telling devices apart                                                                  |
| `last_used_at`     | datetime, nullable    | Last push the push service accepted                                                        |

`sent_notifications`: one row per notification handed to the push services, unique on `(user_id, occurrence_key,
kind, date)`, so no notification goes out twice. `occurrence_key` is `seriesId:occurrenceDate` for an occurrence of a
series, else the task id, for a reminder, and always `day` for the morning one (one per user and day); `kind` is
`morning` or `reminder`; `date` is the local date it was for. Rows older than three days are pruned daily
(`model:prune`).

The `Task` model disables Eloquent timestamps (the client owns them). Timestamps go through the
`App\Casts\UtcMillisDateTime` cast: they are stored as UTC with milliseconds and returned in the wire format
`Y-m-d\TH:i:s.v\Z` (`2026-10-15T08:35:00.123Z`), so a pushed value comes back byte for byte.

### Occurrences on the server

Background features (notifications, calendar sync) need what a user's planner shows on some dates, recurring
occurrences included. `App\Tasks\TaskOccurrences::forUser($user, $from, $to)` returns it as a collection of
`App\Tasks\Occurrence` (`id`, `taskId`, `seriesId`, `occurrenceDate`, `date`, `time`, `text`, `notes`, `done`,
`color`, `position`), sorted by date and then in the planner's day order (timed first by time, then position, then id).
It is a port of the client's expansion (`lib/recurrence/expand.ts` and `queryRangeItems`, see
[Recurring tasks (client)](#recurring-tasks-client)) with the same rules and the same test cases
(`tests/Feature/Tasks/TaskOccurrencesTest.php`), so a change to one side goes into both:

- Live plain tasks and exception rows dated in the range; Someday, tombstones and series rows are never returned.
- Every live series anchored on or before the end of the range (and not ended before its start) generates its
  occurrences there: `id` is `${series_id}:${YYYY-MM-DD}`, `taskId` the series, content from the series, not done.
- The winning exception of an occurrence (newest `updated_at`, then greater id) replaces it, wherever it moved, or
  hides it when deleted. A losing duplicate is never returned, and an exception whose series is gone still is.
- Done items are included. An occurrence keeps its `(seriesId, occurrenceDate)` when it is edited or moved (its `id`
  turns from the occurrence id into the exception row's id), so key anything stored per occurrence on that pair.

`$from` and `$to` are taken as calendar dates (`toDateString()`), so convert them to the user's time zone first. It runs
three queries: the dated rows by `(user_id, date)`, the series rows, and their exceptions by `(user_id, series_id)`.
`rowsForUser($user, $from, $to)` is the same without generating occurrences (live plain tasks and winning exception
rows only), for ranges too long to expand series over.

### Task changes on the server

`App\Tasks\TaskRepository::for($user)` changes a user's tasks on the server with exactly the planner's semantics, for
agents that act on the user's behalf (the MCP connector). It is a port of the client repository
([Repository API](#repository-api-libdbtasksts), [Recurring tasks (client)](#recurring-tasks-client)) with the same
test cases (`tests/Feature/Tasks/TaskRepositoryTest.php`, `TaskRecurrenceMutationsTest.php`, `TaskImportTest.php`),
so a change to one side goes into both. Browsers pick its writes up on their next pull; nothing waits on it.

| Method                                                    | Client counterpart                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `findTask($id)`, `listTasksIn($date \| null)`             | `queryTask`, `listTasksIn`                                            |
| `createTask($input)`, `createTasks($inputs)`              | `createTask` (a batch is placed as if created one after the other)    |
| `updateTask($id, $patch, $scope)`, `toggleDone($id)`      | `updateTask`, `toggleDone`                                            |
| `updateSubtasks($id, $update, $scope)`                    | `updateSubtasks`                                                      |
| `deleteTask($id, $scope)`, `restoreTask($id)`             | `deleteTask`, `restoreTask`                                           |
| `moveTask($id, $date, $beforeId, $afterId)`               | `moveTask`                                                            |
| `duplicateTask($id)`, `setRecurrence($id, $rule, $scope)` | `duplicateTask`, `setRecurrence`                                      |
| `carryOverTasks($today)`                                  | `carryOverTasks`                                                      |
| `import($file)`                                           | `parseImport` + `planImport` + `applyImport` (`App\Tasks\TaskImport`) |
| `materializeOccurrence($id)`                              | (server only) gives an occurrence its unchanged exception row         |

- **Shapes.** Rows are arrays with the sync wire shape (`Task::toRecord()`, also what `TaskResource` returns); items
  are `App\Tasks\PlannerItem` (`kind`: `task`, `series`, `occurrence`, `exception`, plus the record). Reads go
  through `App\Tasks\TaskQueries`, which reuses `TaskOccurrences::expandSeries` and `winningException`. Every `$id`
  also accepts an occurrence id (one with an impossible date, such as `…:2026-02-31`, is not found). `Scope::This` / `Scope::Future` defaults are the client's.
- **Errors.** A missing, deleted or someone else's task throws `TaskNotFound`; a change the planner refuses (an
  invalid rule, a Someday task that should repeat, moving a series row, a row that would not pass the push rules (the
  message lists the field errors), a neighbour whose stored position is not a valid key, a date that is not
  `YYYY-MM-DD`) throws `InvalidTaskChange`; a file that cannot be imported throws `ImportError`. All
  extend `TaskDomainException`, and the message is meant for the user. Nothing is written when one is thrown.
- **Writes.** Each method runs in one transaction whose first statement takes the `sync_versions` write lock
  (`App\Actions\Sync\SyncVersions::lock()`), so it reads and writes as if alone, like a push. Every written row is
  validated with the push rules (`App\Tasks\TaskRecordRules`, shared with `PushRequest`), gets a fresh version
  (`SyncVersions::reserve()`, as in [Versioning](#versioning)) and `updated_at` = max(now, stored `updated_at` + 1 ms,
  the previous timestamp it handed out + 1 ms) in UTC ms, so it wins last-write-wins against what it replaces; new rows
  get `created_at` = `updated_at`. Like a push that applied rows, a write queues the Google Calendar sync.
- **Dates.** "Today" and target dates come from the caller as `YYYY-MM-DD` in the user's time zone; the clock is only
  read for timestamps.
- **Positions.** `App\Tasks\FractionalIndex` is a port of npm `fractional-indexing` v4 (default alphabets) and
  `App\Tasks\TaskOrder` of `lib/db/position.ts`. `tests/fixtures/fractional-indexing.json` holds keys generated by
  the npm library (`resources/js/test/fractional-indexing-fixture.ts`); a Pest test checks the port against it and a
  JS test fails if the file drifts from the library (regenerate with `UPDATE_FIXTURES=1 bun run test:js && bun run check:fix`).
- **Import.** Same rules as the browser's ([Export format](#export-format)): `backupRows` selection, new UUID v7 ids
  with series first, positions appended after each list's last row, one timestamp. Rows are checked with the push
  rules, except that ids only need to be unique strings; the error message names the task (`Task 3: …`) but uses
  Laravel's validation wording. A file is written in one transaction.

### Google Calendar

A one-way sync from Plain Week to Google Calendar, server side and in the background. It exists only when the
instance has Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `config/services.php`; see
[self-hosting.md](./self-hosting.md#google-calendar)); otherwise its routes are `404` and the settings nav hides it
(shared Inertia prop `integrations.googleCalendar`). Code lives in `app/Integrations/GoogleCalendar`, and what it
shares with the [ICS feed](#ics-feed) in `app/Integrations/Calendar`.

- **Connect** (`GoogleOAuth`): authorization code flow with PKCE and a `state` kept in the session. Scopes `openid`,
  `email` and `https://www.googleapis.com/auth/calendar.app.created`, so Plain Week only ever sees calendars it
  created. `access_type=offline` and `prompt=consent` give a refresh token on every connect. The account email comes
  from the ID token. A grant without the calendar scope or the email (Google lets the user untick them) is refused and
  revoked, as is one whose calendar step fails.
- **Calendar** (`ConnectGoogleCalendar`): every connection owns a secondary calendar named "Plain Week", created in
  the user's time zone (`User::timezoneOrDefault()`: `users.timezone` when set, else `APP_TIMEZONE`). A reconnect to the same
  Google account keeps the stored calendar when it still exists (`404`/`410`, or a `403` `forbidden`/`notFound`, mean
  gone; other errors such as rate limits fail the connect) and creates a new one otherwise. Connecting another Google
  account disconnects the previous one first. Nothing is stored when a step fails.
- **API calls** (`GoogleCalendarClient`): Laravel's `Http` client against the Calendar REST API. The access token is
  refreshed when it expires within a minute. A refresh that Google answers with `invalid_grant` marks the connection
  broken (`disconnected_reason`, `last_error`) and throws `GoogleCalendarDisconnected`; Settings › Integrations then
  offers "Reconnect". Other failures throw the HTTP client's exceptions and are transient. Event calls go here too.
- **Disconnect** (`DisconnectGoogleCalendar`): deletes the calendar (nothing would keep it current), revokes the
  grant and deletes the row. If the calendar cannot be deleted right now the connection stays and the user gets an
  error to retry; a failed revoke alone does not block it. A broken connection has no working tokens, so it is only
  deleted and the page tells the user to remove the calendar in Google. Deleting the account runs the same cleanup
  first, best effort: the account is deleted whatever Google answers. The `google_calendar_events` rows go with the
  connection (cascade).

#### Event sync

`SyncGoogleCalendarEvents` keeps one event per planner item in the connection's calendar. It only writes to Google and
never reads it back: an event edited in Google is overwritten the next time its task changes.

- **What gets an event.** The items `TaskOccurrences` returns, in the user's time zone (`User::timezoneOrDefault()`):
  live dated plain tasks and exception rows from 30 days ago on, with no limit ahead (`rowsForUser` past the next 60
  days), and the occurrences series generate from 7 days ago to 60 days ahead, so that window moves forward every day.
  Someday tasks, tombstones and series rows have none, so moving a task to Someday or deleting it deletes its event.
  Events dated before the 30-day window are left alone, so the calendar keeps the past, and so is the event of a
  generated occurrence older than 7 days (kept up to date while it is in the 30 days, never created).
- **The event.** Untimed: all day on `date`. Timed: 20 minutes from `date time`, sent as an RFC 3339 time with its
  offset plus `timeZone`, so DST days are right. Summary `🎯 {text}`, `✅ {text}` when done. Description: the notes,
  a blank line and `Open in Plain Week: APP_URL/?task=<id>` (the [task link](#planner-ui), with the occurrence id for
  a generated occurrence); `source` points at the same link. `reminders.useDefault` is false with no overrides: Plain
  Week sends its own notifications. Every event is a separate one (no `RRULE`).
- **Identity.** Event ids can't contain `:`, so each event has a row in `google_calendar_events`, keyed by the task id
  of a plain task and by `(series_id, occurrence_date)` for an occurrence, which stays the same when an edit turns the
  occurrence into an exception row or moves it. The run computes the wanted events, deletes the events whose key is
  no longer wanted (unless dated before the window), and creates or replaces (`PUT`, so a timed event can become
  all-day) those whose payload hash changed. Nothing is sent for an unchanged event.
- **Recovery.** The row and its event id are stored before the event is created, and each call is saved as it
  succeeds, so a run cut short carries on. A `409` on create means an earlier attempt got through: the event is
  replaced instead. A `404`/`410` on replace means the user deleted the event in Google: it is created again under a
  new id (Google keeps the old id as cancelled).
- **Errors.** A rate limit (`429`, or `403` `rateLimitExceeded`/`userRateLimitExceeded`) puts the job back after
  `Retry-After` or a growing delay, and a job queued meanwhile waits too; what got through is kept. A `401` marks the access token expired, so the retry
  refreshes it. A refused refresh token marks the connection broken and syncing stops until the user reconnects. A
  calendar deleted in Google stops the run with an error asking to disconnect and connect again. Any other `4xx` on one
  event is reported and the run goes on with the rest; other failures fail the job, which retries (30 s, 2 min, 10 min)
  up to 3 times (the user then reads "Google Calendar could not be reached…"; the details go to the logs). The last
  error is stored in `last_error` and shown on Settings › Integrations with `last_synced_at`.
- **Long syncs.** A run stops starting calls after 45 s (the job's timeout is 80 s, below the database queue's 90 s
  `retry_after`) and puts itself back to go on, so a first sync of hundreds of events never holds the single worker for
  long. Notes are cut to 6000 characters and the text to 1000, so Google never refuses an event for its size.
- **One way.** Google is never read, so an event the user deletes or edits in Google stays that way until its task
  changes again (then it is replaced, or created again).
- **When.** The `SyncGoogleCalendar` job (one per user) runs it. A `POST /sync/push` that applied rows queues it for a
  connected, working account 10 s later; while one is waiting another is not queued
  (`ShouldBeUniqueUntilProcessing`), and runs of one user never overlap (`WithoutOverlapping`). Connecting queues it
  too, after forgetting the events of the previous calendar when the connect created a new one, and so does a new time
  zone from `RememberTimezone` (timed events are placed in it). Queuing never fails the request: an error is only
  reported. The scheduler runs
  `google-calendar:sync` (`App\Console\Commands\SyncGoogleCalendars`) daily at 03:00, which queues one for every
  working connection (`GoogleCalendarConnection::syncable()`) to move the occurrence window
  and catch up anything missed. Nothing of this sits on the sync request's path.

### ICS feed

A read-only calendar subscription: a private URL that Apple Calendar, Outlook or any app that subscribes to a
`webcal://` / `.ics` URL fetches. It shows the same events as the [Google Calendar](#google-calendar) sync and needs
nothing configured on the instance. Code lives in `app/Integrations/IcsFeed`; what both calendars share lives in
`app/Integrations/Calendar`: `CalendarWindow` (which items, the window of [Event sync](#event-sync)) and
`PlannerEvent` (summary, description, link, key, start and end, like [Event sync](#event-sync) describes).

- **Turning it on.** Off until the user enables it in Settings › Integrations (`POST /settings/integrations/ics`;
  a plan is needed in SaaS mode). One feed per account (`ics_feeds`). The token is 32 random bytes, base64url (43
  characters); the row stores its SHA-256 for the lookup and an encrypted copy so the page can show the URL again
  (Inertia props `icsFeed: { url } | null` and `canEnableIcsFeed`; shared prop `integrations.icsFeed` is always
  true; `icsFeed` is also null when the token no longer decrypts after an `APP_KEY` change, and enabling again
  fixes it). Enabling again gives a new token, so the old URL answers `404` at once. Disabling (`DELETE`) deletes the
  row; so does deleting the account (cascade). The URL is `APP_URL/calendar/<token>.ics`; `webcal://` is the same URL with
  that scheme.
- **The endpoint.** `GET /calendar/{token}.ics` is registered outside the web group (`bootstrap/app.php`): calendar
  apps send no cookies, so it starts no session and sets none. An unknown, malformed or disabled token is `404`; in
  SaaS mode an account without a plan gets `402`. `throttle:ics-feed` allows 20 fetches a minute per feed and 600 per
  IP (calendar services fetch many feeds from the same addresses). The answer is `text/calendar; charset=utf-8`, with
  an `ETag` over the document without its `DTSTAMP` lines, so an unchanged planner answers `304` to `If-None-Match`.
  It is built on every request from the server's tasks: nothing is queued or stored. `Referrer-Policy: no-referrer`
  and `X-Robots-Tag: noindex, nofollow` keep the secret URL from leaking; it still shows up in access logs.
- **The document** (`IcsCalendar`, written by `IcsWriter`, a small RFC 5545 writer: CRLF lines folded at 75 octets
  without splitting a UTF-8 character, TEXT escaping of `\`, `;`, `,` and line breaks, other control characters
  dropped). `VCALENDAR` with `VERSION:2.0`, `PRODID`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, the name
  `X-WR-CALNAME:Plain Week`, `X-WR-TIMEZONE` (the user's time zone) and a 15-minute refresh hint (`REFRESH-INTERVAL`,
  `X-PUBLISHED-TTL`). One `VEVENT` per item, no `RRULE` and no `VALARM` (Plain Week sends its own notifications):
  `UID` is `<key>@<host>` (the host of `APP_URL`), so an edited or moved occurrence (even one that became an exception
  row) updates the same event; `DTSTAMP` is the time of the request; all day as `DTSTART;VALUE=DATE` /
  `DTEND;VALUE=DATE` (the next day) with `TRANSP:TRANSPARENT` (a task does not make the user busy all day); timed as
  20 minutes in UTC (`…Z`), computed in the user's time zone (`User::timezoneOrDefault()`), so DST days are right and
  no `VTIMEZONE` is needed; `SUMMARY`, `DESCRIPTION` and `URL` as in Google; `STATUS:CONFIRMED`.
- **The window.** The same as Google's, except that a feed keeps no memory: items before the 30-day window, and
  generated occurrences older than 7 days, are not in it, so calendar apps drop them. One event per key, like Google.
  Changing the host of `APP_URL` changes every UID, but also the feed URL, so users subscribe again anyway.

### Push notifications

Web Push to the user's subscribed browsers, sent by the scheduler. It exists only when the instance has a VAPID key
pair and subject (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in `config/services.php`, see
[self-hosting.md](./self-hosting.md#notifications)); otherwise its routes are `404`, the sender does nothing and the
shared Inertia prop `notifications` is `{ enabled: false, vapidPublicKey: null }` (with keys:
`{ enabled: true, vapidPublicKey: '<base64url>' }`, what the client subscribes with). Code lives in `app/Push`.

- **Subscriptions.** The browser posts `PushSubscription.toJSON()` (plus `content_encoding`) to
  `notifications.subscriptions.store` and deletes it by `endpoint`. Rows are keyed by endpoint, so a re-subscribe
  replaces the keys and a browser that signs in to another account moves to it. The request also stores the
  `X-Timezone` header like sync does. Whether _this_ browser is subscribed is only known to the browser.
- **What is due** (`DueNotifications`), in the user's time zone (`User::timezoneOrDefault()`), from
  [`TaskOccurrences`](#occurrences-on-the-server) minus done items:
    - _Morning_: at `notification_morning_time`, one notification for the day covering every pending occurrence of
      that day without a time (Someday never), none when there are none. It goes out once per day: a task added or
      synced after it is not notified that morning. A timed occurrence gets only its reminder.
    - _Reminder_: five minutes before every pending timed occurrence. That may be the previous evening: a task at 00:03
      is reminded at 23:58 the day before, with the task's own date in its tag.
    - A moment is due while it lies in the last 10 minutes, so a late or skipped run catches up, but nothing is sent
      after longer downtime; a reminder is dropped once its task has started. A wall time a DST jump skips is sent when
      the clock reaches it (02:30 → 03:30); a repeated one counts once.
- **Sending** (`notifications:send`, every minute, `withoutOverlapping(5)`): it queues one `SendPushNotifications` job
  per user with at least one subscription (unique per user while queued, so a stopped worker does not pile them up).
  The job skips accounts without access in SaaS mode, claims each due notification in `sent_notifications` (only the
  run that inserts the row sends it) and hands everything to `PushSender` (`WebPushSender` on `minishlink/web-push`:
  aes128gcm encryption, VAPID, one batched flush, `Urgency: high` so Android delivers it while the device dozes
  instead of when it wakes up). The TTL (how long a push service keeps it for an offline device) is per kind
  (`NotificationKind::ttlSeconds()`): four hours for the morning one, one hour for a reminder. A notification that no
  browser accepted for a transient reason (5xx, 429, network) gives its row back, so the next run retries it while it
  is still due.
  Subscriptions answered `404`/`410` are deleted, accepted ones get `last_used_at`; failures are logged as warnings.
- **Payload** (what `resources/js/sw.ts` receives): `{ "title", "body", "url", "tag" }`.
    - _Reminder_: `title` is the task text (cut at 120 characters), `body` is `In 5 minutes · HH:mm`, `url` is
      `/?task=<occurrence id>` (see [Planner UI](#planner-ui)), `tag` is `reminder:<occurrence id>:<date>`.
    - _Morning_ with one task: `title` is its text, `body` is `Today`, `url` is `/?task=<occurrence id>`. With several:
      `title` is `N tasks today`, `body` lists their texts in planner order separated by middle dots (each cut at 60
      characters, the whole at 400, so the encrypted payload stays well under the ~4 KB push services accept), `url`
      is `/`. The `tag` is `morning:<date>` either way.
    - A notification with the same tag replaces the shown one.

### MCP server

A remote [MCP](https://modelcontextprotocol.io) server so AI agents (claude.ai, Claude Desktop, Claude Code, any
Streamable HTTP client) can use the signed-in user's planner. It is `laravel/mcp`, registered in `routes/ai.php`
(loaded by the package, outside the `web` group: no session, no CSRF). It writes to the server database like a sync
push; browsers pick changes up on their next pull. The offline-first rule is untouched: the UI never waits on it.

| Route                                                  | What                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `POST /mcp` (`mcp`)                                    | JSON-RPC over Streamable HTTP. `GET`/`DELETE` answer `405` (no server-sent stream)             |
| `GET /.well-known/oauth-protected-resource[/{path}]`   | Protected resource metadata (RFC 9728) for `/mcp` or `/api/v1`: `resource`, servers, scopes    |
| `GET /.well-known/oauth-authorization-server[/{path}]` | Authorization server metadata (RFC 8414): endpoints, PKCE `S256`, grant types                  |
| `POST /oauth/register`                                 | Dynamic client registration (RFC 7591): a public client (no secret), `201`; 30 a minute per IP |
| `GET /oauth/authorize`                                 | Passport: the consent card (`oauth/authorize`); guests log in first and come back              |
| `POST`/`DELETE /oauth/authorize`                       | Passport: Approve / Deny, a redirect back to the client with a code or `access_denied`         |
| `POST /oauth/token`                                    | Passport: authorization code (PKCE) and refresh token grants                                   |

- **Auth.** `/mcp` uses `auth:api`, a Passport guard (`config/auth.php`). It takes both kinds of Bearer token: OAuth
  access tokens (an MCP client that registered itself and that the user approved) and personal access tokens (created
  in Settings › Agents & apps for headless agents). The same tokens work on the [App API](#app-api). Both are Passport tokens signed with the instance's RSA key pair
  (`storage/oauth-*.key` or `PASSPORT_PRIVATE_KEY`/`PASSPORT_PUBLIC_KEY`), so one guard, one table
  (`oauth_access_tokens`) and one revoke path cover them; Sanctum would have added a second guard and token table for
  the same behaviour. Every token has full access (the single scope `mcp:use`; there is no scopes UI). OAuth access
  tokens last a day and refresh tokens a year; personal tokens ten years. A session cookie never authenticates `/mcp`.
  Without a valid token the answer is `401` with
  `WWW-Authenticate: Bearer realm="mcp", resource_metadata="<APP_URL>/.well-known/oauth-protected-resource/mcp"`, which
  is how a client discovers the OAuth flow.
- **Consent.** Passport's authorization view is `App\Agents\AuthorizationPage`: the Inertia page `oauth/authorize`, a
  floating card over the planner (see [style.md](./style.md#oauth-consent-card)). Approve and Deny are plain form posts
  (with the CSRF token) because Passport answers them with a redirect to the client. An app the user already approved
  skips the card; when that happens on an Inertia visit (right after logging in), `LeaveForOAuthClient` turns the
  redirect into an Inertia location visit. The page is sent with `X-Frame-Options: DENY`.
- **Who may register.** Registration is open and any redirect domain is accepted (`config/mcp.php`): connectors live
  on claude.ai, other hosts and localhost callbacks. The consent card names the client and shows the redirect host
  prominently, so a look-alike client name gives itself away; the user approves every client.
- **Tokens and apps** (`App\Agents\AgentAccess`): personal tokens are the user's tokens of the personal access
  client (created on first use); OAuth apps are the user's other tokens grouped by client, listed while an access token
  is valid or its refresh token can get a new one. Revoking a personal token deletes it; disconnecting an app deletes
  the user's access tokens (and, by foreign key, their refresh tokens) and authorization codes for that client.
  Deleting an account deletes its tokens the same way, so a reused user id can never inherit one.
  `oauth_access_tokens.last_used_at` is set by `TouchAccessToken` on `/mcp` and `/api/v1`, at most once a minute per
  token.
  `passport:purge` runs daily (revoked tokens, and expired ones whose refresh token is dead too).
- **Gating.** `MCP_ENABLED` (`config/mcp.php`, default `true`). When `false`, `routes/ai.php` registers no `/mcp`
  (`404`) and the shared Inertia prop `mcp.enabled` is `false`. OAuth (Passport's `/oauth` routes, the metadata and
  registration) and the App API stay, and so does Settings › Agents & apps, without its MCP part.
- **Paywall.** In SaaS mode a tool call needs the same entitlement as sync (`User::hasAccess()`, the check behind
  `EnsureHasAccess`). `App\Mcp\Methods\CallToolWithAccess` replaces `tools/call`: without a plan it answers a tool
  error (`isError: true`) whose text says a paid plan is needed and gives the `/plans` URL, which MCP clients show to
  the model and the user. Connecting, `tools/list` and tools marked `AvailableWithoutPlan` (`get_profile`, which reports
  `sync_access: false` and `plans_url`) still work, so an agent can explain what is missing. Self-hosted, never.
- **Rate limit.** `throttle:mcp`: `MCP_RATE_LIMIT` requests a minute (default 120) per user.
- **Server** (`App\Mcp\Servers\PlainWeekServer`): name `Plain Week`, version from `package.json`, tools only. Its
  instructions tell agents what Plain Week is, that ids are UUIDs, that a `null` date is Someday, that a recurring
  occurrence is `<series id>:<YYYY-MM-DD>`, that every date is a calendar date in the user's time zone, which tools
  read, how to place a task (`before_id` / `after_id`), that `delete_task` returns a `restore_id`, and that the user
  sees their changes in Settings › Agents & apps › Activity.
- **Tools** (`app/Mcp/Tools`, [catalogue below](#mcp-tools)).
- **Activity log** ([below](#mcp-activity-log)): every successful write, for Settings › Agents & apps.

#### MCP tools

Every planner tool extends `App\Mcp\Tools\PlannerTool`, on top of the task domain (`App\Tasks\TaskRepository`,
`TaskQueries`, `TaskImport`; see [Task changes on the server](#task-changes-on-the-server)), so an agent changes tasks exactly like the
planner would. The base class:

- refuses arguments the schema does not declare (`Unknown argument: date. This tool takes: …`), since the domain
  silently ignores unknown patch keys; the input schemas say `additionalProperties: false` too, nested objects
  included;
- turns the domain's errors (`TaskNotFound`, `InvalidTaskChange`, `ImportError`) and validation errors into tool errors
  (`isError: true`) with their message, never a `500`;
- comes as `ReadTool` (marked `IsReadOnly`, no transaction) or `WriteTool`, which runs in one transaction that takes the
  sync write lock first (the tool reads before the repository writes, and a SQLite read transaction that later writes
  fails if a push committed in between) together with its activity entry, so a refused call changes nothing and logs
  nothing;
- returns structured content (mirrored as JSON text). Tasks come in a compact shape (`App\Mcp\Support\TaskOutput`):
  `id`, `kind` (`task`, `series`, `occurrence`, `exception`), `text`, `date` (null: Someday), `done`, `color`, `time`,
  `notes`, `subtasks`, plus `series_id` and `occurrence_date` for occurrences and exceptions and `recurrence` for a
  series. No positions, timestamps or versions.

"Today" and every default date are the user's (`User::timezoneOrDefault()`, `App\Mcp\Support\Planner`). Every id
argument also takes an occurrence id (`<series id>:<YYYY-MM-DD>`); `scope` (`this` / `future`) only matters for
occurrences. `before_id` / `after_id` must name a task of the target list (the domain would ignore a stray one); the
tool answers an error instead. `tools/list` returns every tool in one page.

| Tool             | Annotations             | What it does                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_profile`    | read-only, idempotent   | `name`, `email`, `timezone`, `today` and `weekday` in it, `app_version`, `sync_access`, `plans_url`. The only tool without a plan (`AvailableWithoutPlan`)                                                                                                                                                                                                                                               |
| `list_tasks`     | read-only, idempotent   | `from`–`to` (inclusive, at most 92 days): every day with its tasks in display order (timed first by time, then position), occurrences and done tasks included, plus `today`                                                                                                                                                                                                                              |
| `list_someday`   | read-only, idempotent   | The Someday list in its order. Tasks done before the current week's Monday (user's midnight) are archived and left out unless `include_archived`, like the client's `isArchivedSomeday`; `archived_hidden` counts them                                                                                                                                                                                   |
| `get_task`       | read-only, idempotent   | One item by id or occurrence id, and for an occurrence or exception its `series` (with the rule)                                                                                                                                                                                                                                                                                                         |
| `search_tasks`   | read-only, idempotent   | `query` in text, notes or subtask texts (case-insensitive) over the live rows: a series is found once as the series, changed occurrences as exceptions, losing duplicates never. Filters `from`/`to` (a series counts while it runs in the range), `done`, `color`, `recurring`. Ordered by date, Someday last; `limit` (20, max 100) and an offset `cursor`                                             |
| `export_tasks`   | read-only, idempotent   | The [export file](#export-format), rows selected by `TaskImport::backupRows` like the client's export                                                                                                                                                                                                                                                                                                    |
| `create_tasks`   | not destructive         | Up to 100 tasks, all or none: `text`, `date` (omitted: today; null: Someday), `before_id`/`after_id`, `color`, `time`, `notes`, `subtasks`, `recurrence`. Created one by one in the transaction; tasks of the batch with the same anchor (date, `after_id`, `before_id`) are chained after each other so they keep their order (the domain alone would reverse them). Errors name the task (`Task 2: …`) |
| `update_task`    | not destructive         | `text`, `done`, `color`, `time`, `notes`, with `scope` (default `this`). `done` with scope `future` on an occurrence is refused (done is per occurrence)                                                                                                                                                                                                                                                 |
| `set_subtasks`   | not destructive         | A list of `add` / `edit` / `toggle` / `remove` / `reorder` operations by subtask id, applied in order inside `updateSubtasks` (one transaction); an unknown subtask id fails the whole call                                                                                                                                                                                                              |
| `move_task`      | not destructive         | To a day or Someday (`date: null`, required), between `before_id` / `after_id`. An occurrence moves alone (it becomes an exception); a series cannot move (the error points at its occurrence ids)                                                                                                                                                                                                       |
| `duplicate_task` | not destructive         | A plain copy right after the original, new ids for it and its subtasks                                                                                                                                                                                                                                                                                                                                   |
| `set_recurrence` | not destructive         | `recurrence` (a rule or null, required) with `scope` (default `future`), as `setRecurrence`. Returns what stands for the task and its `series`                                                                                                                                                                                                                                                           |
| `delete_task`    | destructive             | `scope` (default `this`). Returns the deleted item and a `restore_id` (the occurrence id for a deleted occurrence, the row id otherwise; null when `future` only ended the series, which then comes back as `series`)                                                                                                                                                                                    |
| `restore_task`   | not destructive         | Restores a tombstone by id or occurrence id; refuses a task that is not deleted, and one date of a deleted series before the series. Restoring a series does not restore the exceptions deleted with it (the description says so)                                                                                                                                                                        |
| `carry_over`     | not destructive, idemp. | `carryOverTasks` for the user's today; returns `today`, `moved` and the moved tasks                                                                                                                                                                                                                                                                                                                      |
| `import_tasks`   | not destructive         | `file`: the export file as an object or a JSON string; adds its tasks like the client's import. At most 2000 tasks per call, because the import holds the sync write lock for its whole transaction. Returns `added`, `recurring` and the new ids                                                                                                                                                        |

Every tool also says `openWorldHint: false`.

#### MCP activity log

`mcp_activities` (`App\Models\McpActivity`): one row per successful write tool call, never for reads, errors or a
call that changed nothing (`carry_over` with nothing to move, an empty import).
Columns: `user_id`, `tool`, `client_type` (`token` or `oauth`), `client_id` (the personal token's id or the OAuth
client's id) and `client_name` (its name at the time of the call, so entries stay readable after a revoke; from
`AgentAccess::clientOf()`), `task_ids` (JSON: the ids the call touched, occurrence ids and series ids included, at
most 200),
`summary` (readable English built by the tool, for example "Created 3 tasks on Mon 23 Nov", "Completed “Buy milk”",
"Moved “Call Ana” to Someday", "Set “Gym” to repeat every Mon, Wed") and `created_at`. It is read-only: there is no
revert. Rows older than 90 days go with the daily `model:prune --model=App\Models\McpActivity`
(`routes/console.php`); Settings › Agents & apps also hides them before that. The page lists the user's rows newest first,
20 per page (`?activity_page=`, a simple paginator), see [style.md](./style.md#settings--agents--apps).

Test a running instance with a personal token, for example
`bunx @modelcontextprotocol/inspector --cli <APP_URL>/mcp --transport http --header "Authorization: Bearer <token>" --method tools/list`
(`--method tools/call --tool-name create_tasks --tool-arg 'tasks=[{"text":"Try it"}]'` to call one).

### App API

REST routes for native apps (the Tauri apps, [#98](https://github.com/victor-falcon/plain-week/issues/98)) and other
token clients, in `routes/api.php` (the `api` group under `/api`: no session, cookies or CSRF). They take the same
Passport Bearer tokens as the [MCP server](#mcp-server) through `auth:api` and stay on when `MCP_ENABLED=false`.

| Route                    | Name            | What                                                                                                           |
| ------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/me`         | `api.me`        | `{ user, account: { hasAccess, plan } }`, also without a plan, so an app can show a paywall                    |
| `POST /api/v1/sync/push` | `api.sync.push` | [`POST /sync/push`](#post-syncpush), the same `SyncController@push`                                            |
| `GET /api/v1/sync/pull`  | `api.sync.pull` | [`GET /sync/pull`](#get-syncpullcursorint-default-0limitint-11000-default-500), the same `SyncController@pull` |

- **Getting a token.** Never with email and password. Either the user creates a personal token in Settings › Agents &
  apps and pastes it into the app, or the app runs OAuth 2.1 as a public client: it registers itself
  (`POST /oauth/register`, dynamic client registration) with a loopback redirect (`http://127.0.0.1:<port>/…`) or a
  `plainweek://…` one (`config/mcp.php` `custom_schemes`), sends the user to `/oauth/authorize` with PKCE (`S256`),
  and exchanges the code at `/oauth/token`; it refreshes the day-long access token with the refresh token. The
  endpoints are in `/.well-known/oauth-authorization-server`. The consent card shows a custom-scheme redirect as
  `plainweek://<host>`. The only scope is `mcp:use` (full access); the API does not check scopes.
- **Sync.** The exact web contract: validation, last-write-wins, cursor, `X-Sync-Format`, `X-Timezone`
  (`RememberTimezone`), the 500-record batches and the raw strings (no trimming, no empty-to-null). In SaaS mode an
  account without a plan gets `402` (`EnsureHasAccess`, which never redirects a request without a session).
- **Errors** are always JSON. Without a valid token the answer is `401` with
  `WWW-Authenticate: Bearer realm="plain-week", resource_metadata="<APP_URL>/.well-known/oauth-protected-resource/api/v1"`
  (`AddResourceMetadataHeader`); that metadata names `<APP_URL>/api/v1` as the resource and the instance as its
  authorization server. When a token was sent but refused (invalid, expired, revoked, or its app disconnected) the
  header adds `error="invalid_token"` (RFC 6750), so the app refreshes or signs in again; that happens at once.
- **CORS** (`config/cors.php`): `api/*`, `oauth/token`, `oauth/register` and the `.well-known/oauth-*` metadata answer
  any origin (no credentials; `WWW-Authenticate` exposed), so an app calling from a webview works. Pages, the web sync
  and the consent card stay same-origin.
- **Rate limits** (per user, `AppServiceProvider`): `throttle:sync` 120 a minute for the sync routes, shared with the
  web sync; `throttle:api` 120 a minute for the rest.
- **Last used.** `TouchAccessToken` runs on these routes too, so Settings › Agents & apps shows when an app last
  synced; apps appear there (OAuth apps by the name they registered, personal tokens by theirs) and are revoked there.

Try it with a personal token:

```sh
curl -H "Authorization: Bearer $TOKEN" "$APP_URL/api/v1/me"
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'X-Sync-Format: 2' \
  -d '{"tasks":[]}' "$APP_URL/api/v1/sync/push"
curl -H "Authorization: Bearer $TOKEN" -H 'X-Sync-Format: 2' "$APP_URL/api/v1/sync/pull?cursor=0"
```

### Versioning

A push runs in one database transaction (`App\Actions\Sync\PushTasks`). Its first statement increments the
`sync_versions` counter by the number of records in the batch (tasks and labels), reserving a block of versions. Because that write comes
first, the transaction holds the write lock from the start (the row lock on MySQL/PostgreSQL, the database write lock
on SQLite), so concurrent pushes wait for each other and commit their versions in order. A reader therefore never sees
a version appear behind a cursor it has already passed.

Server-side task changes ([Task changes on the server](#task-changes-on-the-server)) take the same lock first
(`SyncVersions::lock()`) and reserve their block once they know how many rows they write. Each applied record takes the
next version from the block. Records that are skipped (stale or rejected) leave gaps;
versions only need to increase, not be contiguous. Versions are global across users, so a user's versions are not
consecutive either. The SQLite connection sets `busy_timeout` to 5 s (`DB_BUSY_TIMEOUT`) so concurrent writers wait
instead of failing.

### Push semantics

- Records are processed in request order. A record whose `id` belongs to another user goes to `rejected` and is not
  touched.
- A record older than the stored row (`updated_at` strictly lower) is skipped silently: it is in neither `applied` nor
  `rejected`. Equal `updated_at` is applied.
- `cursor` is the highest version among the user's tasks and labels after the push (`0` if the user has none). It is **not** a
  pull position: other devices may have written versions below it that this client has not pulled yet. Only advance
  the stored pull cursor from `/sync/pull` responses.

Validation (`App\Http\Requests\Sync\PushRequest`, with the record rules in `App\Tasks\TaskRecordRules`) rejects the whole batch with `422` if any record is invalid:
`tasks` must be a list of at most 500 records; every field of the contract must be present; `id` a UUID; `date`
`YYYY-MM-DD` or `null`; `someday_column` `0`–`2` and required when `date` is `null`; `color` one of the nine values;
`time` `HH:mm` or `null`; `done` and subtask `done` real booleans; `subtasks` a list of `{ id, text, done }` (subtask
`id` a string of at most 255 characters);
timestamps exactly `YYYY-MM-DDTHH:mm:ss.sssZ` (what `Date.prototype.toISOString()` produces); `id` must be lowercase
(the primary key is case sensitive). `text`, `notes` and subtask `text` have no length limit; `position` is at most
255 characters. `labels`, when present, must be a list of at most 8 records with exactly `color` (one of the eight
label colors, each at most once), `name` (a string of at most 24 characters once trimmed; stored trimmed) and
`updated_at`.

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
