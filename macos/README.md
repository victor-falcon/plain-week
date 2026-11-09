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
included, or a task's sheet with `PLAINWEEK_SNAPSHOT_OPEN=<task id>`), use `PLAINWEEK_WINDOW_SNAPSHOT=strip.png`, optionally with `PLAINWEEK_SNAPSHOT_SHIFT=<days>` to scroll the
strip first, `PLAINWEEK_SNAPSHOT_SHEET=review|palette|quick` to open those, `PLAINWEEK_SNAPSHOT_SELECT=<day>` to select (and focus) a day, `PLAINWEEK_SNAPSHOT_TIMER=<day>` to
start that day's timer and capture the mini window, and `PLAINWEEK_DATA_FILE=<name>` to read a sample file from that temporary directory instead of
your tasks.

## Look and layout

A minimal, type-led style in Apple's idiom, rather than the web app's ruled paper planner. The interface is
**monochrome**, like Calendar on the Mac: black, white and greys (swapped in dark mode). The nine task colors are the
only color; today, the selected day, done checks and the drop line use the text color. System controls follow
suit: the app's tint is black, the notes caret and selection are black and grey, and popovers use black-and-white parts
(the repeat popover's segmented control, − n + steppers, weekday chips, switch and black Apply button). Popovers,
sheets and the mini timer follow the app's Light / Dark setting, not the system's.

The design system lives in `Theme.swift`, so screens stay consistent:

| Part    | Tokens                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Type    | Eight sizes: display 48, title 32, heading 24, subhead 15, body 14, label 13, caption 12, micro 11; large text tracks tighter        |
| Motion  | `Motion.quick` (hover, press), `Motion.standard` (toggles, selection, folding), `Motion.structural` (strip, sidebar, focus): springs |
| Radii   | Concentric: cards 18, rows and controls 10 (18 minus the 8pt inset), floating panels 20                                              |
| Buttons | One family: `.pressable` (icons, text), `PillButtonStyle`, `MonoPrimaryButtonStyle`, `ToolbarButtonStyle`; all react on press        |

Accessibility: with **Reduce Motion** on, slides and springs become short cross-fades and the mini timer only fades;
with **Reduce Transparency**, the sidebar and floating surfaces turn solid and focus mode fades days instead of
blurring them. Click targets are at least 28pt (the row checkbox and ▶ keep their small look).

- **Header:** the month in large bold type ("November"), with the year and week number quietly below. A "Today"
  pill appears when you browse away from the current week, next to a capsule of ‹ › week buttons. The title bar is
  hidden, so the header sits under the window controls.
- **Days:** a strip of full-height rounded day cards (a long list scrolls inside its card), at least 400pt wide each, showing as many whole days as fit (up to seven,
  which needs a window about 2,870pt wide), that scrolls through earlier and later days and
  snaps to day edges: swipe sideways on a trackpad, turn the mouse wheel over the days (one day per notch), or click
  and drag a day header or empty space left or right. The header (month, week number) follows the middle visible
  day; ‹ › jump a week, and "Today" (shown when today is off screen) goes back to the current week's Monday. Each
  card shows its day number large with the weekday in small caps; today's number sits in a black circle, like
  Calendar. Weekday cards are white and weekend cards light grey.
- **Rows:** no ruled lines; rows highlight with rounded corners on hover and long titles wrap to two lines. A round
  checkbox starts each row, like Reminders, and carries the task's color on its border (filled with it when done;
  light mode uses darker shades of the pale colors so every ring stands out on a white card)
  instead of a colored background behind the text. The end of the row holds quiet markers and the time: a notes
  icon when the task has a description, a checklist with "done/total" when it has subtasks (darker once all are
  done), then the time. Empty space in a card adds a task, with a "New task" hint on hover.
- **Progress and timer:** a thin bar across the top of each day card fills as its tasks get done ("2 of 4 done" on
  hover). The ▶ in a day's header starts a timer on its next unfinished task (timed tasks first); a task row shows its
  own ▶ on hover. Starting a timer minimizes the planner to the Dock and opens a small floating window next to where you clicked,
  fading in (and out the same way); it stays on top of other apps and on every Space: the task's checkbox and title, the running clock (`12:34`, `1:02:03` past an
  hour) with play / pause (Space), a button back to Plain Week and ✕ to stop. Ticking the checkbox completes the task
  and moves the timer to the day's next unfinished task, from zero; after the last one it stops and the planner comes
  back. While a timer runs, a pill in the header shows the task and clock and brings the window back. The timer is not
  saved: it lives while the app runs.
- **Sidebar:** 250pt on the left; the header's sidebar button (or View › Hide Sidebar, ⌃⌘S) closes and opens
  it.
    - **Backlog** (tasks without a date: the web app's Someday; the data is unchanged) and **Done**, as accordion
      sections: click a title to fold it (remembered between launches). Each is as tall as its content, and they
      scroll together.
    - Done shows the completed tasks of the selected day, or with no day selected every completed task, newest first,
      grouped by day (Today, Yesterday, Backlog, Fri 6 Nov, …). Click a day's header (or a calendar date) to select it,
      and click the header again, or the day chip in Done, to go back to all days.
    - A **month calendar** pinned at the bottom, in Apple's style: the month centred between ‹ ›, weekends and other
      months' days in grey, today in a black circle, the selected day ringed. Clicking a date shows that day on the right
      and selects it; clicking the month goes to today. It follows the strip into other months. The grab handle above
      it folds it away (a month button brings it back), remembered between launches.
- **Task sheet:** a large, bold, Notion-style title with no underline, then notes and subtasks. Notes are a small
  Markdown editor (below).
- **Focus mode:** the "Focus" pill in the header (or View › Turn On Focus Mode, ⇧⌘F) blurs and fades every day but one,
  and the Backlog. The focused day is the selected one, or today when none is: click a day's header (or anywhere in a
  blurred card, or a calendar date) to focus it, today included in the blur; click its header again to go back to
  today. Hovering a blurred card brings it back while the pointer is on it. Turning focus mode on shows the focused
  day; the setting is remembered between launches.

Colors still come from the web app's tokens (`Theme.swift`), plus a card surface and a hover tint.

## Beyond the planner window

| Feature            | How it works                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick add          | ⌥Space from any app opens a floating field (Spotlight-style) with the same natural typing as a new-task row; Return adds to today or the day typed. Settings can turn the hotkey off. No permission needed.         |
| Menu bar           | Today's progress and tasks (tick them, ▶ them), the running timer with pause and stop, a quick-add field, Open Plain Week and Weekly Review. The icon shows the clock while a timer runs. Can be hidden.            |
| Reminders          | A notification for tasks with a time in the next week (at the time, or 5 to 60 minutes before; default 5), with Mark as Done and Snooze 10 min. Rescheduled after every change; works offline.                      |
| Calendar events    | Off by default. When on (Settings, asks for Calendar access), each day card lists its events read-only above the tasks: all-day first, then by time, in grey.                                                       |
| Time tracking      | Focus time from the timer is saved per task in `time.json` next to `tasks.json` (local only, not synced). The task sheet shows "1h 20m focused on this task"; the weekly review sums it per day.                    |
| Pomodoro           | Settings › Timer › Pomodoro: focus and break phases (25 and 5 minutes by default) switch on their own with a notification; the mini window and menu bar show FOCUS or BREAK and the time left. Breaks do not count. |
| Weekly review      | Go › Weekly Review (⇧⌘R): done, open and focused time for the week, done per day as bars, and each unfinished task with Today, Next week, Backlog and Mark as Done buttons, or Move All to Next Week. Undoable.     |
| Command palette    | ⌘K (or / in the planner): commands, a day typed like "fri" or "31 dec", and tasks found by title or notes. ↑ ↓ choose, Return runs.                                                                                 |
| Shortcuts and Siri | Add Task (natural typing), Show Today's Tasks and Start Timer on Next Task, with Siri phrases such as "Add a task in Plain Week".                                                                                   |
| Daily backups      | Once a day, a JSON backup in the export format in Application Support › Plain Week › Backups, keeping the last 14. Settings: turn off, Back Up Now, Show Backups.                                                   |
| Vim keys           | j k (↓ ↑) tasks, h l (← →) days, H L weeks, t today, ↩ or o open, x or Space mark as done, d d delete, a i n add, p timer, / palette, Esc hide the cursor. Only while no text field is focused.                     |

Not yet: **widgets** need a development team to sign an App Group (the widget reads the tasks through it); with the
ad-hoc signing used here the app could not launch with that entitlement. **macOS Focus** (Do Not Disturb) has no
public API for apps; pair Pomodoro with a Shortcuts automation that turns on a Focus instead.

## What it shares with the web app

| Area             | Same as the web app                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Data model       | `PlainTask` has exactly the `Task` contract shape (`snake_case`, explicit `null`s), UUID v7 ids, ISO-8601 UTC timestamps with ms          |
| Ordering         | `FractionalIndex` is a port of npm `fractional-indexing` (base 62), so positions sort the same; days show timed tasks first               |
| Backlog          | The web app's Someday: one list ordered by (`someday_column`, `position`, `id`); done tasks archived after their week                     |
| Recurring tasks  | Series, occurrence and exception rows, expansion, winning exceptions, "only this" / "this and all future" splits (`RecurrenceEngine`)     |
| Smart input      | Leading `HH:mm` time and "DD MMM" date (English or Spanish months), in either order                                                       |
| Carry over       | Unfinished plain tasks from earlier days move to the end of today on launch and at midnight (Settings › "Move unfinished tasks to today") |
| Export / import  | The `plain-week` JSON export, version 1: files move both ways. Import adds tasks with new ids, like the web app                           |
| Colors and theme | The tokens from `resources/css/app.css` (OKLCH converted at runtime in `Theme.swift`), light and dark                                     |

## Using it

- Click an empty row (or ⌘N for today, ⇧⌘N for Backlog) and type; Enter adds the task and keeps you in the list,
  ⌘↩ adds it and opens it, Esc leaves. While you type, chips at the end of the row show what was understood:

    | Type                                                                                                                        | Sets                                                                  |
    | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
    | `today`, `tomorrow` (`tmr`), `fri` / `friday`, `next week`, `backlog` (or `someday`)                                        | The date (a weekday is the next one; today counts). The last one wins |
    | `31 Dec`, `5 ene.` at the start (like the web app)                                                                          | The date                                                              |
    | `@11:30`, `@9`, `@9am`, `@5:15pm`, or `17:30` at the start                                                                  | The time                                                              |
    | `#yellow`, `#pink`, `#green`, … also `#red`, `#blue`, `#orange`, `#purple`, `#gray`                                         | The color                                                             |
    | `daily`, `weekly`, `monthly`, `weekdays`, `weekends`, `every 3 days`, `every mon, wed and fri`, `every week`, `every month` | The repeat rule (weekly and monthly follow the task's date)           |

    Example: `tomorrow call Joao @11:30 #yellow daily`. Recognised words leave the title; if nothing else would be
    left, the text stays as typed. A repeating task typed into Backlog starts today.

- Click a task to open its sheet: date, time, delete, repeat, color, more (Tomorrow, Next week, Backlog, Duplicate),
  title with the complete check, notes and subtasks. Edits are saved as you type. Everything works from the keyboard,
  even while typing in a field, and a footer lists the keys:

    | Key        | Action                                                                            |
    | ---------- | --------------------------------------------------------------------------------- |
    | ⌥⌘D        | Date: type `tomorrow`, `fri`, `31 dec`, `backlog` and Return, or use the calendar |
    | ⌥⌘T        | Time: type `9`, `9:30`, `5pm` and Return (⌘⌫ clears it)                           |
    | ⌥⌘R        | Repeat: ⌘0 never, ⌘1 daily, ⌘2 weekly, ⌘3 monthly, Return applies                 |
    | ⌥⌘C        | Color: 1–9 picks one                                                              |
    | ⌘↩ / ⌫     | Mark as done / delete (⇧⌘⌫ while typing)                                          |
    | ⌥⌘→ / ⇧⌥⌘→ | Move to tomorrow / next week                                                      |
    | ⌥⌘L / ⌘D   | Move to Backlog / duplicate                                                       |
    | Esc        | Close                                                                             |

- **Notes** are plain text, as on the web, with light Markdown styled as you type (the markers stay, dimmed). Its keys
  work while the notes have focus, and a hint line lists them:

    | Key  | Writes                                                                      | Key | Writes                             |
    | ---- | --------------------------------------------------------------------------- | --- | ---------------------------------- |
    | ⌘1–4 | Heading `# ` … `#### `                                                      | ⌘B  | Bold `**text**`                    |
    | ⌘T   | Todo line `- [ ] ` (click the box to tick it)                               | ⌘I  | Italic `_text_`                    |
    | ⌘E   | The time (`14:05`)                                                          | ⌘U  | Underline `++text++`               |
    | ⇧⌘E  | The date (`Mon 9 Nov 2026`)                                                 | ⇧⌘X | Strikethrough `~~text~~`           |
    | ⇧⌘C  | Color menu: text `{red}text{/}` or highlight `==text==` / `=={green}text==` | ⌥⌘B | Block caret (Vim style) on and off |

    Each key toggles: pressing it again on formatted text removes the formatting. The web app shows the raw text.

- The **repeat** popover (⌥⌘R) picks Never, Daily, Weekly or Monthly (⌘0–3), then the details: every N days, the
  weekdays (the task's own day always included) or the day of the month, and an optional end date. A line under it
  says what will happen ("Every Mon, Wed, Fri, from Mon 9 Nov"), and Return applies.
- Right-click a task for colors, moves, duplicate and delete. Each row's checkbox completes it.
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
│   ├── Model/                  PlainTask (contract), DateKeys (+ Clock, UUID v7), FractionalIndex, QuickAdd, NoteMarkdown,
│   │                           RecurrenceEngine, SmartInput (+ Format)
│   ├── Store/                  TaskStore (local repository, undo, carry over, import/export), PlannerModel (UI state), AppModel,
│   │                           FocusTimer, TimeLog, Reminders, CalendarEvents, Backups, KeyboardCursor
│   ├── Views/                  PlannerView (sidebar with Backlog and Done, header, day strip), TaskListView (rows, new-task row, menu, drops), TaskDetailView, NotesEditor, MiniTimer, QuickCapture, MenuBar, WeeklyReview, CommandPalette,
│   │                           RepeatPicker, SettingsView, Theme
│   ├── Intents/                PlainWeekIntents (Shortcuts and Siri: Add Task, Today's Tasks, Start Timer)
│   └── DebugSnapshot.swift     Debug-only headless render
└── PlainWeekTests/             XCTest: fractional index, smart input, dates, recurrence, store behaviour
```

## Not in the macOS app yet

- **Sync and accounts.** The server's `/sync/push` and `/sync/pull` use a browser session with CSRF, which a native
  client cannot use cleanly. Syncing needs token authentication on the server (for example Laravel Sanctum personal
  access tokens) first; the data model and LWW fields are already in place for it.
- The vim-style keyboard cursor and its shortcuts (`h j k l`, `d d`, …), notifications, integrations, guest
  onboarding demo tasks, clickable links in notes, and RTL layout tuning.
