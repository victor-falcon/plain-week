import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AccountButton } from '@/components/planner/account-button';
import { ShortcutHint } from '@/components/planner/shortcut-hint';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatMonthTitle, formatWeekNumber } from '@/lib/planner/format';
import { isoWeekNumber, weekThursday } from '@/lib/planner/week';
import type { ShortcutId } from '@/lib/planner/shortcuts';
import { cn } from '@/lib/utils';

type Props = {
    weekStart: Date;
    isCurrentWeek: boolean;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    onToday: () => void;
};

/** A tooltip's text with the keys that do the same (mouse users only). */
function TooltipLabel({
    label,
    action,
}: {
    label: string;
    action: ShortcutId;
}) {
    return (
        <span className="flex items-center gap-2">
            {label}
            <ShortcutHint action={action} all />
        </span>
    );
}

const navButton =
    'size-10 rounded-full bg-foreground text-background hover:bg-foreground/80';

/**
 * "October 2026 W42" with the account button and week navigation. The title
 * turns the planner accent when another week is shown; clicking it returns to
 * today.
 */
export function PlannerHeader({
    weekStart,
    isCurrentWeek,
    onPreviousWeek,
    onNextWeek,
    onToday,
}: Props) {
    // ISO weeks belong to the month and year of their Thursday.
    const thursday = weekThursday(weekStart);
    const week = isoWeekNumber(weekStart);

    return (
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-background/95 px-4 py-3 backdrop-blur-sm lg:static lg:px-6 lg:pt-5 lg:pb-0 lg:backdrop-blur-none">
            <h1 className="flex min-w-0 items-baseline gap-2.5 text-3xl leading-tight font-bold tracking-tighter lg:text-4xl">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            onClick={onToday}
                            disabled={isCurrentWeek}
                            aria-label={
                                isCurrentWeek
                                    ? undefined
                                    : 'Go to the current week (t)'
                            }
                            className={cn(
                                'h-auto min-w-0 truncate rounded-md p-0 font-[inherit] text-3xl leading-[inherit] tracking-[inherit] hover:bg-transparent disabled:opacity-100 lg:text-4xl',
                                !isCurrentWeek &&
                                    'text-planner-accent hover:text-planner-accent/80',
                            )}
                        >
                            <span className="lg:hidden">
                                {formatMonthTitle(thursday, 'short')}
                            </span>
                            <span className="max-lg:hidden">
                                {formatMonthTitle(thursday, 'long')}
                            </span>
                        </Button>
                    </TooltipTrigger>
                    {!isCurrentWeek && (
                        <TooltipContent side="bottom">
                            <TooltipLabel
                                label="Current week"
                                action="week.today"
                            />
                        </TooltipContent>
                    )}
                </Tooltip>
                <span className="shrink-0 text-muted-foreground/50">
                    <abbr title={`Week ${week}`} className="no-underline">
                        {formatWeekNumber(week)}
                    </abbr>
                </span>
            </h1>
            <nav
                aria-label="Week"
                className="flex shrink-0 items-center gap-1.5"
            >
                <AccountButton />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon-lg"
                            className={navButton}
                            onClick={onPreviousWeek}
                            aria-label="Previous week"
                        >
                            <ChevronLeft className="size-5 rtl:rotate-180" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        <TooltipLabel
                            label="Previous week"
                            action="week.previous"
                        />
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon-lg"
                            className={navButton}
                            onClick={onNextWeek}
                            aria-label="Next week"
                        >
                            <ChevronRight className="size-5 rtl:rotate-180" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        <TooltipLabel label="Next week" action="week.next" />
                    </TooltipContent>
                </Tooltip>
            </nav>
        </header>
    );
}
