import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AccountButton } from '@/components/planner/account-button';
import { HintedLabel } from '@/components/planner/shortcut-hint';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatMonthTitle, formatWeekNumber } from '@/lib/planner/format';
import { isoWeekNumber, weekThursday } from '@/lib/planner/week';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    weekStart: Date;
    isCurrentWeek: boolean;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    onToday: () => void;
};

const navButton =
    'size-10 rounded-full bg-foreground text-background hover:bg-foreground/80';

/**
 * "October 2026 W42" with the account button and week navigation. The title turns the planner accent when another week is
 * shown; clicking it returns to today.
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
                                    : t('planner.goToCurrentWeek')
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
                            <HintedLabel
                                label={t('planner.currentWeek')}
                                action="week.today"
                                all
                            />
                        </TooltipContent>
                    )}
                </Tooltip>
                <span className="shrink-0 text-muted-foreground/50">
                    <abbr
                        title={t('planner.weekTitle', { week })}
                        className="no-underline"
                    >
                        {formatWeekNumber(week)}
                    </abbr>
                </span>
            </h1>
            <nav
                aria-label={t('planner.weekNav')}
                className="flex shrink-0 items-center gap-1.5"
            >
                <AccountButton />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon-lg"
                            className={navButton}
                            onClick={onPreviousWeek}
                            aria-label={t('planner.previousWeek')}
                        >
                            <ChevronLeft className="size-5 rtl:rotate-180" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        <HintedLabel
                            label={t('planner.previousWeek')}
                            action="week.previous"
                            all
                        />
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon-lg"
                            className={navButton}
                            onClick={onNextWeek}
                            aria-label={t('planner.nextWeek')}
                        >
                            <ChevronRight className="size-5 rtl:rotate-180" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        <HintedLabel
                            label={t('planner.nextWeek')}
                            action="week.next"
                            all
                        />
                    </TooltipContent>
                </Tooltip>
            </nav>
        </header>
    );
}
