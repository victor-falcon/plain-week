# Plain Week for macOS

A native SwiftUI version of the Plain Week planner. Like the web app it is offline-first: the local store is the only
source of truth, every action is a local write, and nothing waits on a network.

## Requirements

- macOS 14 (Sonoma) or later
- Xcode 16 or later (built and tested with Xcode 26)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`), only needed when `project.yml` changes

## Build, run, test

```sh
cd macos
xcodegen generate                      # regenerate PlainWeek.xcodeproj after editing project.yml
open PlainWeek.xcodeproj               # then Run (⌘R) in Xcode

# or from the command line
xcodebuild -project PlainWeek.xcodeproj -scheme PlainWeek -derivedDataPath build build
open "build/Build/Products/Debug/Plain Week.app"
xcodebuild -project PlainWeek.xcodeproj -scheme PlainWeek -derivedDataPath build test
```

`project.yml` is the source of truth for the project. The generated `PlainWeek.xcodeproj` is committed, so you can
build without XcodeGen.

Headless layout check (debug builds only): `PLAINWEEK_SNAPSHOT=light.png` (plus `PLAINWEEK_SNAPSHOT_DARK=1` for the
dark theme) renders the planner with `ImageRenderer` into the app's temporary directory
(`~/Library/Containers/app.plainweek.mac/Data/tmp/`) and quits. `ImageRenderer` draws AppKit-backed controls (text
fields, drop targets) as yellow placeholders, so only the layout, colors and text are meaningful there. It also draws
the seven visible days without their scroll view. To capture the real window instead (scroll views and controls
included), use `PLAINWEEK_WINDOW_SNAPSHOT=strip.png`, optionally with `PLAINWEEK_SNAPSHOT_SHIFT=<days>` to scroll the
strip first, and `PLAINWEEK_DATA_FILE=<name>` to read a sample file from that temporary directory instead of
your tasks.

## Look and layout

A minimal, type-led style in Apple's idiom, rather than the web app's ruled paper planner:

- **Header:** the month in large bold type ("November"), with the year and week number quietly below. A "Today"
  pill appears when you browse away from the current week, next to a capsule of ‹ › week buttons. The title bar is
  hidden, so the header sits under the window controls.
- **Days:** a strip of rounded day cards, at least 400pt wide each, showing as many whole days as fit (up to seven,
  which needs a window about 2,870pt wide), that scrolls through earlier and later days and
  snaps to day edges: swipe sideways on a trackpad, turn the mouse wheel over the days (one day per notch), or click
  and drag a day header or empty space left or right. The header (month, week number) follows the middle visible
  day; ‹ › jump a week, and "Today" (shown when today is off screen) goes back to the current week's Monday. Each
  card shows its day number large with the weekday in small caps; today's number sits in an accent circle, like
  Calendar, and its card is tinted.
- **Rows:** no ruled lines; rows highlight with rounded corners on hover and long titles wrap to two lines. A round
  checkbox starts each row, like Reminders, and carries the task's color on its border (filled with it when done;
  light mode uses darker shades of the pale colors so every ring stands out on a white card)
  instead of a colored background behind the text. The end of the row holds quiet markers and the time: a notes
  icon when the task has a description, a checklist with "done/total" when it has subtasks (accent once all are
  done), then the time. Empty space in a card adds a task, with a "New task" hint on hover.
- **Someday:** a large title over one rounded card of three columns.
- **Task sheet:** a large, bold, Notion-style title with no underline, then notes and subtasks.
- **Focus mode:** the "Focus" pill in the header (or View › Focus on Today, ⇧⌘F) blurs and fades every day but
  today, and Someday, so only today's list stands out. Hovering a blurred card brings it back while the pointer is
  on it. Turning it on jumps to the current week; the setting is remembered between launches.

Colors still come from the web app's tokens (`Theme.swift`), plus a card surface and a hover tint.

## What it shares with the web app

| Area             | Same as the web app                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Data model       | `PlainTask` has exactly the `Task` contract shape (`snake_case`, explicit `null`s), UUID v7 ids, ISO-8601 UTC timestamps with ms          |
| Ordering         | `FractionalIndex` is a port of npm `fractional-indexing` (base 62), so positions sort the same; days show timed tasks first               |
| Someday          | One list ordered by (`someday_column`, `position`, `id`), shown in three columns; done tasks archived after their week                    |
| Recurring tasks  | Series, occurrence and exception rows, expansion, winning exceptions, "only this" / "this and all future" splits (`RecurrenceEngine`)     |
| Smart input      | Leading `HH:mm` time and "DD MMM" date (English or Spanish months), in either order                                                       |
| Carry over       | Unfinished plain tasks from earlier days move to the end of today on launch and at midnight (Settings › "Move unfinished tasks to today") |
| Export / import  | The `plain-week` JSON export, version 1: files move both ways. Import adds tasks with new ids, like the web app                           |
| Colors and theme | The tokens from `resources/css/app.css` (OKLCH converted at runtime in `Theme.swift`), light and dark                                     |

## Using it

- Click an empty row (or ⌘N for today, ⇧⌘N for Someday) and type; Enter adds the task and keeps you in the list, Esc
  leaves. "17:30 Gym" sets a time, "31 Dec Gym" a date.
- Click a task to open its sheet: date, time, delete, repeat, color, more (Tomorrow, Next week, Someday, Duplicate),
  title with the complete check, notes and subtasks. Edits are saved as you type.
- Right-click a task for colors, moves, duplicate and delete. Hover a task to show its complete check.
- Drag a task onto another row (upper or lower half), onto a list's empty rows, or onto the ‹ › week buttons to move
  it a week back or forward.
- ⌘T today, ⌘[ / ⌘] previous / next week, ⇧⌘F focus mode, ⌘Z undo, ⇧⌘E export, ⇧⌘I import, ⌘, settings.

Data lives in `~/Library/Containers/app.plainweek.mac/Data/Library/Application Support/Plain Week/tasks.json`.

## Structure

```
macos/
├── project.yml                 XcodeGen spec (app + unit tests)
├── PlainWeek/
│   ├── PlainWeekApp.swift      App, window, menu commands, export/import panels
│   ├── Model/                  PlainTask (contract), DateKeys (+ Clock, UUID v7), FractionalIndex,
│   │                           RecurrenceEngine, SmartInput (+ Format)
│   ├── Store/                  TaskStore (local repository, undo, carry over, import/export), PlannerModel (UI state)
│   ├── Views/                  PlannerView (header, scrolling day strip, Someday), TaskListView (rows, new-task row, menu, drops), TaskDetailView,
│   │                           RepeatPicker, SettingsView, Theme
│   └── DebugSnapshot.swift     Debug-only headless render
└── PlainWeekTests/             XCTest: fractional index, smart input, dates, recurrence, store behaviour
```

## Not in the macOS app yet

- **Sync and accounts.** The server's `/sync/push` and `/sync/pull` use a browser session with CSRF, which a native
  client cannot use cleanly. Syncing needs token authentication on the server (for example Laravel Sanctum personal
  access tokens) first; the data model and LWW fields are already in place for it.
- The vim-style keyboard cursor and its shortcuts (`h j k l`, `d d`, …), notifications, integrations, guest
  onboarding demo tasks, clickable links in notes, and RTL layout tuning.
