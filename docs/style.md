# Visual style

Plain Week's look comes entirely from the shadcn preset `b3E9gactBi`. From Tweek we copy layout, measurements,
behaviour and the nine task colors, never its palette, fonts, logo or copy.

## The preset

Configured in `components.json` and `resources/css/app.css`:

| Setting      | Value                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Style        | `radix-luma` (Radix primitives via the `radix-ui` package)                                                 |
| Base color   | `stone` (warm neutrals for background, border, muted, accent)                                              |
| Primary      | blue (`--primary: oklch(0.488 0.243 264.376)` in light mode)                                               |
| Sans font    | Inter (`@fontsource-variable/inter`, `--font-sans: 'Inter Variable'`)                                      |
| Heading font | JetBrains Mono (`@fontsource-variable/jetbrains-mono`, `--font-heading`, used by card/dialog/sheet titles) |
| Radius       | `--radius: 0.625rem`; `rounded-sm` to `rounded-4xl` are derived from it (`× 0.6` … `× 2.6`)                |
| Icons        | lucide (`lucide-react`)                                                                                    |
| Menus        | `menuColor: default-translucent`, `menuAccent: subtle`                                                     |
| RTL          | enabled (`"rtl": true`)                                                                                    |

Fonts are bundled with the app (fontsource), so they work offline. Do not add remote font providers.

## Tokens

All colors are CSS variables defined in `:root` (light) and `.dark` (dark) in `resources/css/app.css`, and exposed to
Tailwind in the `@theme inline` block. Use the Tailwind utilities, never raw color values:

| Purpose         | Utilities                                                                              |
| --------------- | -------------------------------------------------------------------------------------- |
| Page            | `bg-background`, `text-foreground`                                                     |
| Surfaces        | `bg-card` / `text-card-foreground`, `bg-popover` / `text-popover-foreground`           |
| Emphasis        | `bg-primary` / `text-primary-foreground`, `bg-secondary` / `text-secondary-foreground` |
| Subtle          | `bg-muted`, `text-muted-foreground`, `bg-accent` / `text-accent-foreground`            |
| Danger          | `bg-destructive`, `text-destructive`                                                   |
| Lines and focus | `border-border`, `border-input`, `ring-ring`                                           |
| Sidebar         | `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, …                        |
| Charts          | `chart-1` … `chart-5`                                                                  |

To change the look, change the tokens, not individual components.

## Dark mode

Dark mode is class based (`@custom-variant dark (&:is(.dark *))`). The user's choice (light, dark, system) is stored by
`resources/js/hooks/use-appearance.tsx` (localStorage + cookie) and applied before first paint by the inline script in
`resources/views/app.blade.php`, so there is no flash. That file also hard-codes the light and dark `--background`
values for the pre-hydration page background; keep them in sync when the tokens change. Use `dark:` variants only when
a token does not already cover the case.

## RTL

The `<html>` element gets `dir="rtl"` for the locales listed in `config('app.rtl_locales')` (`ar`, `fa`, `he`, `ur`)
and `dir="ltr"` otherwise. `resources/js/app.tsx` reads that attribute and passes it to shadcn's `DirectionProvider`,
which hands the direction to Radix components.

Always use logical utilities so layouts mirror correctly:

| Use                                                  | Instead of                                           |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `ms-*`, `me-*`                                       | `ml-*`, `mr-*`                                       |
| `ps-*`, `pe-*`                                       | `pl-*`, `pr-*`                                       |
| `start-*`, `end-*`                                   | `left-*`, `right-*`                                  |
| `text-start`, `text-end`                             | `text-left`, `text-right`                            |
| `border-s`, `border-e`, `rounded-s-*`, `rounded-e-*` | `border-l`, `border-r`, `rounded-l-*`, `rounded-r-*` |

Use `rtl:` variants (for example `rtl:rotate-180` on directional icons) when a logical utility is not enough.

## Components: shadcn only

- Use existing shadcn components. Add missing ones with `bunx --bun shadcn@latest add <component>` (see
  [stack.md](./stack.md#adding-a-shadcn-component)).
- Compose, don't reinvent: build app components in `resources/js/components/` out of shadcn components and style them
  with tokens and Tailwind classes. Do not hand-roll a primitive that shadcn already provides. The one exception is drag
  and drop (`@dnd-kit`), because shadcn has none.
- The whole app is wrapped in `DirectionProvider` and `TooltipProvider` and renders a single `<AppToaster />`
  (`resources/js/app.tsx`; Sonner, bottom right, it also turns Laravel flash toasts into Sonner
  toasts). Don't add more providers or toasters per page.
- Keep app behaviour out of `resources/js/components/ui/*` so components can be re-added with the CLI; put wrappers in
  `resources/js/components/` (see `app-toaster.tsx`).

### Inventory

Installed in `resources/js/components/ui/` and where they are used:

| Component                                                          | Used in                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `button`                                                           | Everywhere: planner header, task rows, task dialog toolbar, auth and settings pages    |
| `input`                                                            | Empty task rows (`new-task-row.tsx`), subtasks, time picker, auth and settings forms   |
| `textarea`                                                         | Task dialog title and notes                                                            |
| `checkbox`                                                         | Subtasks, "Remember me" on login                                                       |
| `dialog`                                                           | Task dialog, `FloatingCard`; account deletion, passkeys and 2FA setup in settings      |
| `radio-group`                                                      | Plan choice (`/plans`)                                                                 |
| `alert-dialog`                                                     | Scope prompt of recurring tasks (`scope-prompt.tsx`), import preview (Settings › Data) |
| `progress`                                                         | Import progress (Settings › Data)                                                      |
| `popover`                                                          | Task dialog date, time, repeat and color pickers                                       |
| `calendar`                                                         | Task dialog date picker, repeat end date                                               |
| `toggle-group` (+ `toggle`)                                        | Task color picker, repeat picker (kind and weekdays)                                   |
| `select`                                                           | Repeat picker (day of the month)                                                       |
| `input`                                                            | Repeat picker ("every N days"), settings forms                                         |
| `dropdown-menu`                                                    | Task dialog "More" menu, planner account menu, app header user menu                    |
| `context-menu`                                                     | Task row context menu (`task-context-menu.tsx`)                                        |
| `tooltip`                                                          | Planner header buttons, account button, task dialog toolbar (`toolbar-tooltip.tsx`)    |
| `sonner`                                                           | `AppToaster`; planner code calls `toast` from the `sonner` package                     |
| `avatar`                                                           | Account button, app header, user info                                                  |
| `direction`                                                        | `app.tsx` (RTL)                                                                        |
| `alert`, `card`, `label`, `spinner`, `input-otp`, `separator`      | Auth cards and settings pages (from the Laravel starter kit)                           |
| `sidebar` (+ `skeleton`), `sheet`, `navigation-menu`, `breadcrumb` | Starter kit app shell around the settings pages                                        |
| `badge`                                                            | Launch discount on the plan choice and Settings › Billing                              |
| `collapsible`                                                      | Installed, not used yet                                                                |

`icon.tsx` and `placeholder-pattern.tsx` in the same folder are starter kit helpers, not shadcn components.

### Patterns

- **Icon buttons.** `Button variant="ghost"` with `size="icon"`/`"icon-sm"`, `rounded-full`, an `aria-label`, and a
  `Tooltip` with the same text (for example the planner header and the task dialog toolbar). The header's previous and
  next buttons are 40px (`size-10`) and filled (`bg-foreground text-background`); the account button is 40px and round.
- **Popovers.** `Popover` + `PopoverTrigger asChild` around a toolbar `Button`, content aligned to the trigger's start
  (`align="start"`); the trigger is filled while open (`aria-expanded:bg-foreground aria-expanded:text-background`).
  Selecting a value writes to the local database at once.
- **Dialogs.** `Dialog` + `DialogContent` with an `sr-only` `DialogTitle`. Edits save as they happen (no save button);
  focus goes to the dialog on open and back to the originating row on close (`onCloseAutoFocus`).
- **Context menus.** `ContextMenu` with `ContextMenuTrigger asChild` around the element (see
  [Task context menu](#task-context-menu)). The component takes the subject and one callback prop per action, so the
  caller decides what each action does; items are `ContextMenuItem` with a trailing icon (`ms-auto`, directional icons
  `rtl:rotate-180`), the destructive one last after a separator with `variant="destructive"`.
- **Toasts.** `toast()` from `sonner`. Destructive actions do not ask for confirmation: they act and offer an "Undo"
  action in the toast (delete, drop on an edge zone, quick moves: "Moved to Tue 13 Oct."). Write failures use
  `toast.error`. Toasts stay clickable over a modal dialog (`AppToaster` gives them `pointer-events-auto`), and a click
  on one does not close the task dialog.
- **Scope prompt.** The one question the planner asks: on a recurring task, an `AlertDialog` with "Only this task" /
  "This and all future" (and Cancel). It is a choice, not a confirmation; see
  [Recurring tasks](#recurring-tasks).
- **Drag and drop.** dnd-kit (`PlannerDnd`, `useSortable` per row); visuals are in [Planner layout](#planner-layout) and
  behaviour in [architecture.md](./architecture.md#drag-and-drop).
- **Responsive.** One breakpoint matters: `lg` (1024px) switches between the desktop grid and the stacked mobile
  layout; `sm` (640px) is used inside the dialog. Mouse-only affordances (show on hover) use `pointer-fine:`.

### Building a new component

1. Search the shadcn registry first (<https://ui.shadcn.com/docs/components>) and the inventory above. If a component
   fits, use it.
2. Missing? `bunx --bun shadcn@latest add <component>`; check the generated imports and do not overwrite existing files.
3. Compose it in `resources/js/components/` (planner pieces in `components/planner/`); keep `components/ui/` untouched.
4. Style with tokens only (`bg-background`, `text-muted-foreground`, `border-border`, `bg-task-*` through
   `TASK_COLOR_STYLES`, …), never raw colors, and with logical classes (`ms-`, `pe-`, `start-`, `text-start`, …).
5. Data comes from the live hooks and writes go through the repository in `lib/db/tasks.ts`, never through `fetch`
   (see [architecture.md](./architecture.md#offline-first-permanent-rule)).
6. Accessible by default: labels on icon buttons, keyboard operable, focus visible, works in RTL and dark mode.
7. Test it: a Testing Library test (`*.test.tsx`, happy-dom, real local database) and a headless browser check on a
   phone and a desktop viewport, light and dark (see [stack.md](./stack.md#testing)).
8. Update this document (measurements, inventory, patterns) in the same pull request.

## Floating card

`resources/js/components/floating-card.tsx`: the card that floats over the planner for log in, sign up, the password
pages and the plan choice (and, next, the landing card). It is a shadcn `Dialog` that is always open while mounted;
a page renders it and leaving the page closes it.

```tsx
<FloatingCard
    title="Welcome back" // the heading; names the dialog
    description="Log in to sync your week." // optional; describes the dialog
    onClose={closeToPlanner} // optional: close button + Esc; without it the card cannot be dismissed
    onBack={...} // optional: back button at the start of the top bar
    toolbar={<span>Step 1 of 2</span>} // optional: between the back and close buttons
    icon={<AppLogoIcon className="size-9" />} // optional: above the title
>
    {/* the form */}
</FloatingCard>
```

| Part     | Desktop and tablet (≥640px, `sm:`)                                                          | Phone (<640px)                                                                          |
| -------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Surface  | Centered, 480px wide, 24px radius, 32px padding, `bg-background`, `shadow-2xl`              | Bottom sheet from 48px below the top, rounded top corners, 20px side padding, slides up |
| Overflow | Scrolls inside, at most the viewport height minus 32px                                      | Scrolls inside the sheet                                                                |
| Overlay  | The dialog's translucent dark overlay over the planner                                      | Same                                                                                    |
| Top bar  | 36px round `secondary` icon buttons: Back (`rtl:rotate-180`) at the start, Close at the end | Same                                                                                    |
| Title    | `text-3xl font-bold tracking-tight` (Inter), description `text-muted-foreground`            | Same                                                                                    |

Focus moves into the card (the first field when it has `autoFocus`) and stays there; Esc closes it when `onClose` is
set; a click outside never does, so a half-filled form is not lost.

The auth cards build on it with `components/auth/auth-form.tsx`: `AuthField` (label row with an optional aside such as
"Forgot it?", the input, the error), `authInputClass` (44px inputs), `AuthSubmit` (the 48px `bg-foreground` pill),
`AuthFootnote`, `AuthStatus` and `closeToPlanner()`.

### Auth cards over the planner

The planner is a persistent Inertia layout (`layouts/planner-layout.tsx`, chosen in `app.tsx`) for the `planner`,
`auth/*` and `billing/plans` pages: the planner page renders nothing on top, the others render their `FloatingCard`.
Moving between `/`, `/login`, `/register` and `/plans` keeps the planner mounted (same week, no reload), and every page
keeps its own URL, so Fortify redirects, validation errors and the intended URL work as before. Closing a card visits
`/`, replacing the card's history entry. Password confirmation is the exception: it is reached from Settings ›
Security, so its card floats over the settings layout and closing it opens Settings › Profile.

| Page               | Top bar                           | Copy and fields                                                                                                                                             |
| ------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/register`        | Back, "Step 1 of 2" (SaaS), Close | Logo, "Create your account", name, email, password (asked once), Continue ("Create account" self-hosted), log in link, Terms and Privacy line (SaaS)        |
| `/login`           | Logo, Close                       | "Welcome back", passkey, email, password with "Forgot it?", Remember me (on), Log in, "No account yet? Sync your week" ("Sign up" self-hosted)              |
| `/forgot-password` | Back (to log in), Close           | Email, "Email reset link"                                                                                                                                   |
| `/reset-password`  | Close                             | Email (read only), new password and confirmation                                                                                                            |
| `/plans` (SaaS)    | "Step 2 of 2", Log out            | Lifetime and Weekly as `RadioGroup` cards, "Due today, VAT included", "Continue to payment", Stripe note, "Not now?" note with the export link, legal links |

The plan cards show the prices `GET /plans` formats from Stripe: Lifetime (selected by default) with the discounted
price, the regular one struck through and a "Launch −75%" `Badge` while `SAAS_LAUNCH_COUPON` is set, otherwise the full
price and no badge; Weekly with "per week". The selected card has a 2px `border-foreground`. The plan card cannot be
dismissed (no close button, Esc does nothing): an account without a plan pays or logs out.

## Planner layout

Built in `resources/js/pages/planner.tsx` from the components in `resources/js/components/planner/`. Measurements
follow Tweek; colors, radius and font come from the tokens.

| Element         | Desktop (≥1024px, `lg:`)                                                                                                                                                            | Mobile/tablet (<1024px)                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Page            | 24px side padding (`px-6`), 24px between columns (`gap-x-6`)                                                                                                                        | 16px side padding (`px-4`)                                                 |
| Header          | "October 2026" `text-4xl font-bold tracking-tighter` + "W42" `text-muted-foreground/50`; 40px round buttons (account, previous, next)                                               | Sticky, translucent background; abbreviated title ("Oct 2026", `text-3xl`) |
| Title           | `text-planner-accent` when the shown week is not the current one; clicking it returns to today                                                                                      | Same                                                                       |
| Week grid       | 6 equal columns: Monday to Friday, then Saturday stacked directly over Sunday; Sunday's header takes one row slot, so the column ends level with the weekdays (5 + 1 + 4 = 10 rows) | One column, days one after another (40px apart)                            |
| Day header      | Date (`font-bold tracking-tight`) at the start, weekday (`text-muted-foreground/70`) at the end, `pb-3`, 2px `border-foreground` bottom                                             | Same                                                                       |
| Today           | Header text and border `planner-accent`, weekday `planner-accent-muted`; whole day on a `bg-planner-accent/6` tint (`/10` dark), `rounded-t-lg`, 10px bleed (start, end, top)       | Same                                                                       |
| Rows            | `h-row` (42px, `--spacing-row`), 1px `border-border` bottom                                                                                                                         | Same                                                                       |
| Empty rows      | Always filled up to 10 per weekday, 5 for Saturday, 4 for Sunday, 2 per Someday column (and at least one after the last task)                                                       | Only one empty row after the tasks                                         |
| Someday         | Below the week, full width, 3 columns of ruled rows; the "Someday" title sits above them                                                                                            | The three columns stacked                                                  |
| Task text       | `text-sm`                                                                                                                                                                           | `text-base`                                                                |
| Complete button | Check icon at the row end, shown on hover or keyboard focus with a mouse (always on touch screens and when done)                                                                    | Always shown                                                               |

Row behaviour:

- Every empty row is an `Input` that adds a task: Enter creates it and keeps focus on the first empty row (right below
  the new task), Esc cancels and leaves the list (blurs, also right after an Enter), leaving the row with text also
  creates it. A leading 24-hour time becomes the task time
  ("17:30 Gym" → time `17:30`, text "Gym"; `lib/planner/smart-time.ts`).
- The row being typed in lifts with `shadow-md`, a background and extra horizontal padding.
- A task row holds sibling `Button`s: the text (click, Enter or Space opens the task through `onOpen(taskId)`, the
  seam for the task dialog), the move button for keyboard drag and drop (hidden until focused) and the complete check.
- Empty rows are keyed by their slot, so saving a task never unmounts the row the user moved to.
- The keyboard focus ring of a task row spans the whole row (drawn by an `after:` overlay of the text button), not just
  the text.
- Done tasks are `text-muted-foreground` and `line-through`; a colored pill fades to 50 %.
- A task with a time shows it first in a small outlined pill (`border-current`, `text-xs`, tabular numbers), and timed
  tasks are listed first in their day, earliest first.

Drag and drop (behaviour in [architecture.md](./architecture.md#drag-and-drop)):

- The dragged task follows the pointer as its pill on a lifted row (`bg-background`, `shadow-lg`, `ring-1 ring-border`,
  `rounded-md`); the source row stays in place at 40 % opacity.
- Where it will land is a 2px `bg-primary` line between rows. Layers: edge zones (5) < drag overlay (10) < insertion
  line (11) < sticky mobile header (20), so the line shows through the dragged task.
- While dragging, `bg-muted` zones (208px tall, `rounded-e-3xl` / `rounded-s-3xl`, 24px wide on desktop, 16px on
  mobile) sit vertically centered on the start and end screen edges; a hovered zone darkens. Their hit area is the full
  screen height, and 32px wide on mobile so a finger does not have to reach the system back-gesture edge.
- Rows are `select-none` and suppress the iOS callout (`[-webkit-touch-callout:none]`), so a long press neither
  selects text nor shows the system menu. The move button that starts a keyboard drag is visually hidden until it has
  keyboard focus.

Keyboard shortcuts (only when focus is not in a text field, no dialog or menu is open and no task is being dragged): ← / → previous / next week
(mirrored in RTL), T current week. Held keys do not repeat.

## Task dialog

Opened by clicking a task row (or Enter / Space on it); built in `resources/js/components/planner/task-dialog/` and
mounted once by the planner page with the open task id. Layout and behaviour follow Tweek; every surface comes from the
tokens. Every edit is written to the local database as it happens (no save button, nothing waits on the network); Esc or
a click outside closes it.

| Part     | Components                                        | Behaviour                                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface  | `Dialog` (`DialogContent`)                        | `bg-secondary`, `sm:max-w-lg` (512px), the preset's `rounded-4xl`; 64px from the top on desktop, 16px on mobile, full width minus the 16px gutters on phones                                                                                                           |
| Date     | `Popover` + `Calendar`                            | "Mon, 12 Oct 2026" ("12 Oct" on phones, plus the year outside the current year) or "Someday"; weeks start on Monday; picking a day moves the task to the end of that day                                                                                               |
| Time     | `Popover` + `Input type="time"` + `Button`        | Clock icon, plus the time once set ('HH:mm', 24-hour in storage); "Clear" (or emptying the field) removes it                                                                                                                                                           |
| Delete   | `Button` + `Tooltip`, Sonner toast                | Deletes at once and closes; the toast's "Undo" puts back everything the delete changed (an `UndoLog`). No confirmation; a recurring task asks the scope first                                                                                                          |
| Repeat   | `Popover` + `ToggleGroup` + `Select` + `Calendar` | Between Delete and Color, like Tweek. See [Recurring tasks](#recurring-tasks)                                                                                                                                                                                          |
| Color    | `Popover` + `ToggleGroup` + `Tooltip`             | The icon is a dot of the current color; the nine swatches come from `TASK_COLOR_STYLES`, the current one checked                                                                                                                                                       |
| More     | `DropdownMenu` + `Tooltip`                        | Tomorrow (day after the task's date), Next week (+7 days), Someday (first column; disabled for a Someday task), Duplicate. For a Someday task, Tomorrow and Next week count from today. Moves show a "Moved to …" toast with Undo                                      |
| Title    | `Textarea` (`field-sizing-content`)               | `text-2xl`, grows with the text, 1px `border-foreground/30` underline; Enter moves to the notes and pasted line breaks become spaces; an emptied title is put back on blur. The check at the end completes the task (done: muted and `line-through`)                   |
| Notes    | `Textarea`                                        | Plain text, "Add some extra notes here…"                                                                                                                                                                                                                               |
| Subtasks | `Checkbox` + `Input` + `Button` per subtask       | Round checkbox, editable text, delete button (shown on hover/focus with a mouse, always on touch); "Add subtask..." adds on Enter and keeps focus, and also adds what was typed when it loses focus or the dialog closes; Enter in a subtask moves to "Add subtask..." |

The toolbar stays on one line at every width. Toolbar icon buttons are `ghost` `icon-sm` round buttons with a tooltip on hover (not on focus: focus returns to a
trigger when its popover closes, and an open tooltip would take the next Esc meant for the dialog); the one whose
popover or menu is open is filled (`aria-expanded:bg-foreground aria-expanded:text-background`), like Tweek's active
icon. Opening the dialog focuses the dialog itself, so no tooltip pops up and touch devices do not open the keyboard;
closing it focuses the task's row again, wherever it moved. A tall dialog scrolls inside the viewport. Reminders,
rich-text notes and attachments are not part of Plain Week yet.

## Task context menu

Built in `resources/js/components/planner/task-context-menu.tsx` (shadcn `ContextMenu`) and wrapped around every task
row, in the days and in Someday. The actions come in as props (`onColorChange`, `onMoveToTomorrow`,
`onMoveToNextWeek`, `onMoveToSomeday`, `onDuplicate`, `onDelete`); `TaskRow` wires them to the shared task actions in
`lib/planner/task-actions.ts`, which the task dialog uses too.

| Part   | Behaviour                                                                                                                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colors | The nine swatches in two rows of five and four (`TaskColorSwatch`, as in the dialog's color picker), `menuitemradio` items with the current color checked; the swatch grid sets the menu's width; arrow keys move through it in order, like the other items |
| Moves  | Tomorrow, Next week and Someday, as in the dialog's More menu, with a "Moved to …" toast and Undo; Someday is hidden for a Someday task                                                                                                                     |
| Copy   | Duplicate (toast "Task duplicated."); the copy of a recurring task is a one-off task                                                                                                                                                                        |
| Delete | After a separator, `variant="destructive"` (the translucent preset menu shows it in the accent color); deletes at once with an "Undo" toast                                                                                                                 |

On a recurring task, a color change and Delete ask the scope first (moves never do: they move only that task).

It opens with a right click, with Shift+F10 or the context menu key while focus is in the row (anchored to the row's
start corner), and with a still touch hold (below). A right click never starts a drag (the mouse sensor ignores the
right button) and never opens the task dialog.

## Recurring tasks

Data rules are in [architecture.md](./architecture.md#recurring-tasks-client); this is how they look and behave.

**Rows.** An occurrence or exception of a series shows a small `Repeat` icon (12px, 70 % opacity) between the time pill
and the text, with a tooltip summarising the rule ("Every Mon, Wed", "Every day", "Monthly on day 31", plus ", until
31 Dec"; `summarizeRecurrence` in `lib/planner/repeat.ts`). Its accessible name gets "(repeats)". An exception whose
series is gone shows no icon. Rows are keyed by `rowKey` (series id and generated date for occurrences and exceptions), so a
row keeps focus when its first change turns the occurrence into an exception row with a new id.

**Repeat picker** (`task-dialog/task-repeat-picker.tsx`). A round toolbar button with the `Repeat` icon, between Delete
and Color; its label is "Repeat" or "Repeat: Every Mon, Wed". Disabled for a Someday task (it cannot repeat). The
popover (320px, `align="end"`) holds a draft that "Apply" writes:

| Part     | Components                       | Behaviour                                                                                                                                                           |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kind     | `ToggleGroup type="single"`      | Never / Daily / Weekly / Monthly, outline segments, the selected one filled                                                                                         |
| Every    | `Input type="number"` (1–365)    | "Every N days"; N starts at 2 (or the stored N); out of range, the note "Enter a number of days from 1 to 365." and Apply is disabled                               |
| Weekdays | `ToggleGroup type="multiple"`    | Seven localized short names from Monday (`aria-label` the long name); the task's own weekday is always selected (see below)                                         |
| Day      | `Select` (1–31)                  | "Monthly on day N"; N starts at the task's day of the month; from 29 on, the note "On the last day in shorter months."                                              |
| Ends     | `Popover` + `Calendar`, `Button` | "Never" or the end date (not before the start); an X button clears it                                                                                               |
| Apply    | `Button`                         | Writes the rule; on the series' first occurrence a note says "Applies to the whole series." ("Stops the whole series." for Never); on a later one it asks the scope |

The rule starts on the task's date (for an occurrence, its own date: the series is split there). If that date did not
match the rule the task would vanish from its own day, so the picker opens with that weekday (weekly) and day of the
month (monthly) chosen, and the weekday cannot be deselected. A monthly day other than the date's moves the task to
the first matching date: the picker says "Starts on Sun, 1 Nov 2026." and the dialog follows the task there. A rule
that would end before its first date cannot be applied.

A new rule or "Never" on an occurrence after the series' first one asks the scope ("Change repeat" / "Stop
repeating"). "Only this task" takes it out of the series: with a rule it starts a new series of its own from its date
(the old series keeps its rule and skips that date), with "Never" it becomes a one-off task. "This and all future" ends
the series the day before and starts the new rule (or a one-off task) there. On the series' first occurrence nothing is
asked: the change is the whole series'.

**Scope prompt** (`scope-prompt.tsx`, `ScopePromptProvider` mounted once by the planner page, `useScopePrompt()` /
`useScopeFor()`). An `AlertDialog` titled after the action ("Edit recurring task", "Delete recurring task", "Change
repeat", "Stop repeating"; in the dialog the edit prompt adds that the answer applies until the task is closed) with Cancel, "This and all future" (outline) and "Only this task" (default, destructive for delete). It is
asked only for an occurrence, or an exception whose series still exists.

| Change                                                  | Asks?                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Title, notes, color, time, subtasks (in the dialog)     | Once per dialog session, on the first change; the answer applies until the dialog closes |
| Delete                                                  | Every time                                                                               |
| A new or changed rule, "Never" in the repeat picker     | Every time, except on the series' first occurrence (the whole series changes)            |
| Done, moves (date picker, More menu, context menu, DnD) | Never: only this task                                                                    |
| Duplicate                                               | Never: the copy is a one-off task                                                        |
| Color from the context menu                             | Every time                                                                               |

The prompt opens on the first keystroke and takes focus; answering returns focus to the field with the typed text kept.
Cancelling puts the field back to the stored value and writes nothing.

**The dialog follows the task.** A change can give the task a new id (an occurrence's first change creates its
exception; "This and all future" starts a new series). The dialog keeps one session per opened task
(`task-dialog/task-editor.tsx`): its writes run one after another on the id the previous write returned, and it shows
the last loaded item while the next id loads, so it never closes or flashes in between.

### Touch gestures on a task row

A press on a task row means three things on a touch screen, told apart by time and movement. The values live in
`planner-dnd.tsx`:

| Gesture                                                               | Result                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Tap                                                                   | Opens the task dialog                                                 |
| Moving more than 5 px (`TOUCH_DRAG_TOLERANCE_PX`) in the first 250 ms | Scrolls the page; nothing is picked up                                |
| Holding 250 ms (`TOUCH_DRAG_DELAY_MS`), then moving more than 8 px    | Drags the task (`TOUCH_HOLD_TOLERANCE_PX`); the menu does not open    |
| Holding still for 500 ms (`TOUCH_MENU_DELAY_MS`)                      | Opens the context menu at the finger; moving afterwards does not drag |

After 250 ms the dnd-kit touch sensor has activated, so the page no longer scrolls under the finger, but the drag stays
invisible ("held": no dragged pill, no dimmed row, no edge zones, no auto-scroll) until the finger moves. Holding
still until 500 ms cancels that drag and dispatches a `contextmenu` event at the touch point, which opens the Radix
menu like a right click. Releasing a held task before it moved does nothing. Radix's own touch long press (700 ms,
cancelled by any movement) stays as a fallback and only ever reopens the same menu; the row ignores `contextmenu` while
it is being dragged, so a browser long-press event cannot open the menu mid-drag.

## Settings › Data

Export and import are for registered users only, on their own settings page (`/settings/data`, `pages/settings/data.tsx`,
listed last in the settings nav); guests and the planner's account menu have no entry for them. The page has three
small `Heading` sections: "Export data" (a filled button), "Import data" (an outline button) and "File format" (a short
description).

"Export data" downloads `plain-week-export-YYYY-MM-DD.json` and confirms with a toast ("Exported 12 tasks", with a
"may be missing changes from other devices" description when the page could not sync first); the button shows a
`Spinner` while the file is built, and an empty planner gets "There are no tasks to export." instead of a file. The
Import button shows a `Spinner` while the chosen file is read. "Import data…" opens the file picker (`.json`), then an `AlertDialog`
previews the file ("12 tasks (2 recurring) will be added. Your existing tasks will stay unchanged.") with Cancel /
Import. While importing, a `Progress` bar fills and the dialog cannot be dismissed; it closes with a toast ("Imported 12
tasks"). The rows are planned when Import is pressed, so positions follow any task added while the preview was open; a
second click does nothing. An invalid file never opens the dialog: a `toast.error` says why ("This is not a Plain Week
export file."). The hook and dialog live in `components/data-transfer.tsx` (`useDataTransfer`); behaviour is in
[architecture.md](./architecture.md#export-format).

## Planner accent

Today's day header and the title of a week other than the current one use `--planner-accent` (text and the 2px
border) and `--planner-accent-muted` (today's weekday), exposed as `text-planner-accent`, `border-planner-accent` and
`text-planner-accent-muted`. They follow the preset's blue but are tuned per theme for contrast (WCAG AA for normal
text, 4.5:1), because the dark-mode `--primary` is only 2.2:1 on the dark background.

Today's whole day (header and rows) also sits on a translucent tint, `bg-planner-accent/6` in light and
`dark:bg-planner-accent/10` in dark (the dark accent is lighter, so it needs more to read the same). It has rounded top
corners (`rounded-t-lg`) and bleeds 10px past the start, end and top (`-mx-2.5 -mt-2.5` with matching `px-2.5 pt-2.5`),
so the header text and row rules stay exactly where the other days have them. On desktop Sunday skips the top bleed
(`lg:not-first:mt-0 lg:not-first:pt-0`), since it sits right under Saturday's last row. The contrast ratios below for
`--planner-accent-muted` are measured on that tint, since today's weekday is the only place it is used.

| Token                    | Light                                           | Dark                                        |
| ------------------------ | ----------------------------------------------- | ------------------------------------------- |
| `--planner-accent`       | `oklch(0.488 0.243 264.376)` (= primary), 6.8:1 | `oklch(0.75 0.14 264.4)`, 8.7:1             |
| `--planner-accent-muted` | `oklch(0.54 0.2 264.4)`, 4.8:1 on the tint      | `oklch(0.62 0.14 264.4)`, 4.7:1 on the tint |

## Task colors

Tasks can carry one of nine colors: `none`, `pink`, `yellow`, `black`, `grey`, `cornflower`, `mango`, `green`, `lilac`
(see [architecture.md](./architecture.md)). They are the only colors not taken from the shadcn preset: they are copied
from Tweek so tasks keep their meaning, and expressed as tokens like everything else.

Each color has a pill background `--task-<color>` and a text color `--task-<color>-foreground`, defined for light
(`:root`) and dark (`.dark`) in `resources/css/app.css` and exposed to Tailwind as `bg-task-<color>` /
`text-task-<color>-foreground`. `none` has no pill (transparent, normal text).

| Color        | Light background           | Light text | Dark background             | Dark text  | Reference (Tweek) |
| ------------ | -------------------------- | ---------- | --------------------------- | ---------- | ----------------- |
| `none`       | transparent                | foreground | transparent                 | foreground | —                 |
| `pink`       | `oklch(0.552 0.196 8.6)`   | light      | `oklch(0.6 0.2 8.6)`        | light      | `#CD2C54`         |
| `yellow`     | `oklch(0.938 0.162 104.6)` | dark       | `oklch(0.9 0.155 104.6)`    | dark       | `#FDEF5D`         |
| `black`      | stone 950                  | light      | near white (inverted)       | dark       | `#000000`         |
| `grey`       | `oklch(0.83 0.004 56.4)`   | dark       | `oklch(0.444 0.011 73.639)` | light      | `#C2C2C2`         |
| `cornflower` | `oklch(0.577 0.21 270.1)`  | light      | `oklch(0.62 0.19 270.1)`    | light      | `#5167F4`         |
| `mango`      | `oklch(0.813 0.164 74.6)`  | dark       | `oklch(0.8 0.16 74.6)`      | dark       | `#FFAF23`         |
| `green`      | `oklch(0.888 0.193 160.4)` | dark       | `oklch(0.85 0.18 160.4)`    | dark       | `#21FFA1`         |
| `lilac`      | `oklch(0.705 0.235 316.3)` | dark       | `oklch(0.72 0.21 316.3)`    | dark       | `#D95CFE`         |

"Dark" text is `oklch(0.147 0.004 49.25)` and "light" text `oklch(0.985 0.001 106.423)` (the preset's foreground and
background), so the pill text is readable on either theme.

Usage rules:

- Never reference the tokens directly in components. `TASK_COLOR_STYLES` in `resources/js/lib/planner/task-colors.ts`
  is the single source of truth: per color it gives a `label`, the `pill` classes (around the task text, `rounded-full
px-1.5`) and the `swatch` classes (for pickers). The color ids themselves live in `lib/db/types.ts` (`TASK_COLORS`).
- To change a color, change its two tokens in both themes and this table.
