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
and `dir="ltr"` otherwise. The app is wrapped in shadcn's `DirectionProvider` (`resources/js/app.tsx`), which reads that
attribute and passes the direction to Radix components.

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

- Use existing shadcn components (`Button`, `Input`, `Textarea`, `Checkbox`, `Dialog`, `Popover`, `Calendar`,
  `DropdownMenu`, `Tooltip`, `Sonner`, `ToggleGroup`, `Separator`, `Sheet`, …). Add missing ones with
  `bunx --bun shadcn@latest add <component>` (see [stack.md](./stack.md)).
- Compose, don't reinvent: build app components in `resources/js/components/` out of shadcn components and style them
  with tokens and Tailwind classes. Do not hand-roll a primitive that shadcn already provides.
- The whole app is wrapped in `DirectionProvider` and `TooltipProvider` and renders a single `<AppToaster />`
  (`resources/js/app.tsx`; it also turns Laravel flash toasts into Sonner toasts). Don't add more providers or toasters
  per page.
- Keep app behaviour out of `resources/js/components/ui/*` so components can be re-added with the CLI; put wrappers in
  `resources/js/components/` (see `app-toaster.tsx`).

## Planner layout

Built in `resources/js/pages/planner.tsx` from the components in `resources/js/components/planner/`. Measurements
follow Tweek; colors, radius and font come from the tokens.

| Element         | Desktop (≥1024px, `lg:`)                                                                                                                | Mobile/tablet (<1024px)                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Page            | 24px side padding (`px-6`), 24px between columns (`gap-x-6`)                                                                            | 16px side padding (`px-4`)                                                 |
| Header          | "October 2026" `text-4xl font-bold tracking-tighter` + "W42" `text-muted-foreground/50`; 40px round buttons (account, previous, next)   | Sticky, translucent background; abbreviated title ("Oct 2026", `text-3xl`) |
| Title           | `text-planner-accent` when the shown week is not the current one; clicking it returns to today                                          | Same                                                                       |
| Week grid       | 6 equal columns: Monday to Friday, then Saturday stacked over Sunday                                                                    | One column, days one after another                                         |
| Day header      | Date (`font-bold tracking-tight`) at the start, weekday (`text-muted-foreground/70`) at the end, `pb-3`, 2px `border-foreground` bottom | Same                                                                       |
| Today           | Header text and border `planner-accent`, weekday `planner-accent-muted`                                                                 | Same                                                                       |
| Rows            | `h-row` (42px, `--spacing-row`), 1px `border-border` bottom                                                                             | Same                                                                       |
| Empty rows      | Always filled up to 10 per weekday, 5 for Saturday and Sunday, 2 per Someday column (and at least one after the last task)              | Only one empty row after the tasks                                         |
| Someday         | Below the week, full width, 3 columns of ruled rows; the "Someday" title sits above them                                                | The three columns stacked                                                  |
| Task text       | `text-sm`                                                                                                                               | `text-base`                                                                |
| Complete button | Check icon at the row end, shown on hover or keyboard focus with a mouse (always on touch screens and when done)                        | Always shown                                                               |

Row behaviour:

- Every empty row is an `Input` that adds a task: Enter creates it and keeps focus on the first empty row (right below
  the new task), Esc cancels, leaving the row with text also creates it. A leading 24-hour time becomes the task time
  ("17:30 Gym" → time `17:30`, text "Gym"; `lib/planner/smart-time.ts`).
- The row being typed in lifts with `shadow-md`, a background and extra horizontal padding.
- A task row holds two sibling `Button`s: the text (click, Enter or Space opens the task through `onOpen(taskId)`, the
  seam for the task dialog) and the complete check.
- Empty rows are keyed by their slot, so saving a task never unmounts the row the user moved to.
- Done tasks are `text-muted-foreground` and `line-through`; a colored pill fades to 50 %.
- A task with a time shows it first in a small outlined pill (`border-current`, `text-xs`, tabular numbers), and timed
  tasks are listed first in their day, earliest first.

Keyboard shortcuts (only when focus is not in a text field and no dialog or menu is open): ← / → previous / next week
(mirrored in RTL), T current week. Held keys do not repeat.

## Planner accent

Today's day header and the title of a week other than the current one use `--planner-accent` (text and the 2px
border) and `--planner-accent-muted` (today's weekday), exposed as `text-planner-accent`, `border-planner-accent` and
`text-planner-accent-muted`. They follow the preset's blue but are tuned per theme for contrast (WCAG AA for normal
text, 4.5:1), because the dark-mode `--primary` is only 2.2:1 on the dark background.

| Token                    | Light                                           | Dark                            |
| ------------------------ | ----------------------------------------------- | ------------------------------- |
| `--planner-accent`       | `oklch(0.488 0.243 264.376)` (= primary), 6.8:1 | `oklch(0.75 0.14 264.4)`, 8.7:1 |
| `--planner-accent-muted` | `oklch(0.56 0.2 264.4)`, 4.9:1                  | `oklch(0.62 0.14 264.4)`, 5.3:1 |

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
