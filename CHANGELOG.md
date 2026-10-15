# Changelog

All notable changes to Plain Week are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] - 2026-10-15

### Added

- **Recurring tasks.** Repeat a task weekly on any weekdays or monthly on a day (the last day in shorter months), with
  an optional end date, from the new Repeat button in the task dialog. Recurring tasks show a repeat icon with the rule
  in a tooltip. Changing one asks "Only this task" or "This and all future" (once per dialog for typing), and so does
  changing its repeat from any but the first occurrence ("Only this task" starts a series of its own); completing or
  moving one only ever affects that one.
- **Undo for quick moves.** Tomorrow, Next week and Someday, from the context menu or the task dialog, say where the
  task went ("Moved to Tue 13 Oct.") with an Undo.
- **Recurring tasks: sync.** Tasks carry `recurrence`, `series_id` and `occurrence_date`, validated and synced by the
  server so recurring tasks and their per-day changes reach every device.
- **Guest onboarding.** A first-time guest finds a few demo tasks in the current week that show how the planner works.
  They stay on the device: the untouched ones are dropped when the guest creates an account or logs in, the ones the
  guest changed are kept and synced. They never come back once seeded.
- **Task context menu.** Right click a task (or press Shift+F10 / the context menu key on it) to change its color, move
  it to tomorrow, next week or Someday, duplicate it or delete it with undo. On touch screens, press and hold still to
  open it; press, hold and move still drags the task.

### Changed

- The guest "save your tasks" button uses a cloud upload icon instead of a download icon.

## [0.0.1] - 2026-10-15

The first release: a minimal, offline-first weekly planner you can use as a guest or with an account that syncs
between devices.

### Added

- **Week view.** Monday to Friday side by side, Saturday stacked over Sunday, and three Someday columns below for
  everything without a date. ISO week number in the header, today highlighted, a single-column layout on phones.
- **Fast task entry.** Type in any empty row and press Enter to keep going. A leading time becomes the task's time
  ("17:30 Gym"); timed tasks are listed first in their day.
- **Complete and reopen tasks** from the row's check button.
- **Task dialog.** Edit the title, date (calendar), time, color (nine colors), plain-text notes and subtasks. Move a
  task to tomorrow, next week or Someday, duplicate it, or delete it with undo. Everything saves as you type.
- **Drag and drop.** Reorder tasks within a day, move them across days and Someday columns, or drop them on the screen
  edges to move them to the previous or next week. Works with mouse, touch (long press) and keyboard.
- **Keyboard shortcuts.** ← / → for the previous and next week (mirrored in RTL), T for the current week; clicking the
  title also returns to today.
- **Offline-first.** Tasks live in the browser (IndexedDB). The app renders and every action applies instantly without
  waiting for the network.
- **Installable PWA.** A service worker keeps the app shell available offline after the first visit, with an "Update
  available" prompt on new deploys.
- **Accounts and sync.** Use it as a guest with no account. Register to sync between devices: guest work is uploaded,
  changes sync in the background (last write wins), and logging out wipes the local copy. Login, registration, password
  reset, optional email verification, two-factor authentication and passkeys via Laravel Fortify.
- **Look and feel.** shadcn/ui (radix-luma, stone, Inter), light and dark mode, RTL support.
- **Self-hostable.** A plain Laravel 13 app with SQLite and no external services; email verification never blocks the
  app, so an instance without mail works.
- **Documentation** for contributors and coding agents in `docs/` and `AGENTS.md`.

[Unreleased]: https://github.com/victor-falcon/plain-week/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/victor-falcon/plain-week/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/victor-falcon/plain-week/releases/tag/v0.0.1
