/**
 * A calendar popover's `onOpenAutoFocus`: focus goes to its day in the tab
 * order (the selected day, else today) instead of its first button (the
 * previous month), so the arrow keys pick a day at once.
 */
export function focusCalendarDay(event: Event): void {
    const day = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
        '[role="grid"] button[tabindex="0"]',
    );

    if (day) {
        event.preventDefault();
        day.focus();
    }
}
