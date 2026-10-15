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
`resources/views/app.blade.php`, so there is no flash. Use `dark:` variants only when a token does not already cover
the case.

## RTL

The `<html>` element gets `dir="rtl"` for RTL locales (`ar`, `fa`, `he`, `ur`) and `dir="ltr"` otherwise, and the app is
wrapped in shadcn's `DirectionProvider` (`resources/js/app.tsx`), which Radix components read.

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
- The whole app is wrapped in `TooltipProvider` and renders a single `<Toaster />` (`resources/js/app.tsx`); don't add
  more providers or toasters per page.

## Task colors

Tasks can carry one of nine colors: `none`, `pink`, `yellow`, `black`, `grey`, `cornflower`, `mango`, `green`, `lilac`
(see [architecture.md](./architecture.md)).

> Placeholder: the week view task (T4) defines the token names, light/dark values and usage rules for these colors here.
