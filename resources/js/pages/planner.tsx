import { Head } from '@inertiajs/react';
import { PlannerHeader } from '@/components/planner/planner-header';
import { SomedaySection } from '@/components/planner/someday-section';
import { WeekGrid } from '@/components/planner/week-grid';
import { SyncProvider } from '@/components/sync-provider';
import { usePlannerShortcuts } from '@/hooks/use-planner-shortcuts';
import { useWeekNavigation } from '@/hooks/use-week-navigation';
import { toDateKey } from '@/lib/db/dates';

/**
 * Opens a task. Seam for the task dialog (T5); until it lands, opening a task
 * does nothing.
 */
function openTask(taskId: string): void {
    void taskId;
}

/**
 * The weekly planner. Reads and writes only the local database; sync runs in
 * the background for signed-in users.
 */
export default function Planner() {
    const navigation = useWeekNavigation();

    usePlannerShortcuts(navigation);

    return (
        <SyncProvider>
            <Head title="Planner" />
            <div className="flex min-h-screen flex-col bg-background text-foreground">
                <PlannerHeader
                    weekStart={navigation.weekStart}
                    isCurrentWeek={navigation.isCurrentWeek}
                    onPreviousWeek={navigation.previousWeek}
                    onNextWeek={navigation.nextWeek}
                    onToday={navigation.goToToday}
                />
                <main className="flex flex-col gap-10 px-4 pt-6 pb-12 lg:gap-12 lg:px-6 lg:pt-14">
                    <WeekGrid
                        weekStart={navigation.weekStart}
                        today={toDateKey(new Date())}
                        onOpenTask={openTask}
                    />
                    <SomedaySection onOpenTask={openTask} />
                </main>
            </div>
        </SyncProvider>
    );
}
