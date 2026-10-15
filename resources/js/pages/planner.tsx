import { Head } from '@inertiajs/react';
import { useCallback, useState } from 'react';
import { PlannerHeader } from '@/components/planner/planner-header';
import { SomedaySection } from '@/components/planner/someday-section';
import { TaskDialog } from '@/components/planner/task-dialog/task-dialog';
import { WeekGrid } from '@/components/planner/week-grid';
import { SyncProvider } from '@/components/sync-provider';
import { usePlannerShortcuts } from '@/hooks/use-planner-shortcuts';
import { useToday } from '@/hooks/use-today';
import { useWeekNavigation } from '@/hooks/use-week-navigation';

/**
 * The weekly planner. Reads and writes only the local database; sync runs in
 * the background for signed-in users.
 */
export default function Planner() {
    const today = useToday();
    const navigation = useWeekNavigation(today);
    const [openTaskId, setOpenTaskId] = useState<string | null>(null);
    const closeTask = useCallback(() => setOpenTaskId(null), []);

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
                        today={today}
                        onOpenTask={setOpenTaskId}
                    />
                    <SomedaySection onOpenTask={setOpenTaskId} />
                </main>
            </div>
            <TaskDialog taskId={openTaskId} onClose={closeTask} />
        </SyncProvider>
    );
}
