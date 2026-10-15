import { Head, usePage } from '@inertiajs/react';
import { FileDown, FileUp } from 'lucide-react';
import { useDataTransfer } from '@/components/data-transfer';
import Heading from '@/components/heading';
import { SyncProvider } from '@/components/sync-provider';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { prepareLocalData } from '@/lib/sync';
import { edit as editData } from '@/routes/data';

/**
 * Settings › Data: export and import a JSON backup. The page comes from the
 * server, but both actions run in the browser against IndexedDB (they work
 * offline once the page is loaded); imported tasks sync like any other
 * change.
 */
export default function Data() {
    const { auth } = usePage().props;
    const userId = auth.user.id;
    const transfer = useDataTransfer({
        prepare: () => prepareLocalData(userId),
    });

    return (
        <SyncProvider>
            <Head title="Data settings" />

            <h1 className="sr-only">Data settings</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Export data"
                    description="Download all your tasks, recurring ones included, as a JSON file. Keep it as a backup or move your planner to another Plain Week instance."
                />
                <Button
                    onClick={transfer.exportData}
                    disabled={transfer.exporting}
                    data-test="export-data"
                >
                    {transfer.exporting ? <Spinner /> : <FileDown />}
                    Export data
                </Button>
            </div>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Import data"
                    description="Add the tasks of an export file to your planner. Your existing tasks stay unchanged; importing the same file twice adds its tasks twice."
                />
                <Button
                    variant="outline"
                    onClick={transfer.chooseImportFile}
                    disabled={transfer.reading}
                    data-test="import-data"
                >
                    {transfer.reading ? <Spinner /> : <FileUp />}
                    Import data…
                </Button>
                {transfer.element}
            </div>

            <Heading
                variant="small"
                title="File format"
                description="A plain-week-export-YYYY-MM-DD.json file with a format marker, a version and the list of tasks: text, date or Someday column, position, done state, color, time, notes, subtasks and repeat rules. Deleted tasks are left out."
            />
        </SyncProvider>
    );
}

Data.layout = {
    breadcrumbs: [
        {
            title: 'Data settings',
            href: editData(),
        },
    ],
};
