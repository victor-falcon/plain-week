import type { DayPickerProps } from 'react-day-picker';
import { currentLocale, t } from '@/lib/i18n';
import { dateFormat } from '@/lib/planner/format';

/**
 * react-day-picker speaks English through date-fns. In another language its
 * month caption, weekday names and screen-reader labels come from `Intl` in
 * the active locale instead, so no date-fns locale has to be bundled for the
 * languages an instance adds. English keeps the library's own output.
 */
export function calendarLocaleProps(): Pick<
    DayPickerProps,
    'formatters' | 'labels'
> {
    if (currentLocale() === 'en') {
        return {};
    }

    return {
        formatters: {
            formatCaption: (month) =>
                dateFormat({ month: 'long', year: 'numeric' }).format(month),
            formatMonthDropdown: (month) =>
                dateFormat({ month: 'short' }).format(month),
            formatWeekdayName: (weekday) =>
                dateFormat({ weekday: 'short' }).format(weekday),
        },
        labels: {
            labelNext: () => t('app.calendarNextMonth'),
            labelPrevious: () => t('app.calendarPreviousMonth'),
            labelDayButton: (date) =>
                dateFormat({ dateStyle: 'full' }).format(date),
            labelWeekday: (weekday) =>
                dateFormat({ weekday: 'long' }).format(weekday),
            labelGrid: (month) =>
                dateFormat({ month: 'long', year: 'numeric' }).format(month),
        },
    };
}
