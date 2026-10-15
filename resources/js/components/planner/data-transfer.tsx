import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { buildExport } from '@/lib/transfer/export';
import { exportFileName } from '@/lib/transfer/format';
import {
    ImportError,
    applyImport,
    parseImport,
    planImport,
} from '@/lib/transfer/import';
import type { ImportPlan } from '@/lib/transfer/import';

function tasksLabel(count: number): string {
    return count === 1 ? '1 task' : `${count.toLocaleString()} tasks`;
}

function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof ImportError) {
        return error.message;
    }

    console.error(error);

    return fallback;
}

/** Saves the local database as a JSON file (works offline). */
async function exportData(): Promise<void> {
    try {
        const file = await buildExport();
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(file, null, 2)], {
                type: 'application/json',
            }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = exportFileName();
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        toast.success(`Exported ${tasksLabel(file.tasks.length)}`);
    } catch (error) {
        toast.error(errorMessage(error, 'Could not export your data.'));
    }
}

type ImportState =
    | { phase: 'closed' }
    | { phase: 'preview'; plan: ImportPlan }
    | { phase: 'importing'; plan: ImportPlan; written: number };

export type DataTransfer = {
    exportData: () => void;
    /** Opens the file picker; the preview dialog follows. */
    chooseImportFile: () => void;
    /** The hidden file input and the import dialog; render it once. */
    element: ReactNode;
};

/**
 * Export and import of a JSON backup (docs/architecture.md, "Export
 * format"). Everything runs against the local database, so it works offline;
 * imported tasks sync like any other local change.
 */
export function useDataTransfer(): DataTransfer {
    const input = useRef<HTMLInputElement>(null);
    const [state, setState] = useState<ImportState>({ phase: 'closed' });

    async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        try {
            const plan = await planImport(await parseImport(file));

            if (plan.taskCount === 0) {
                toast.info('There are no tasks in this file.');

                return;
            }

            setState({ phase: 'preview', plan });
        } catch (error) {
            toast.error(errorMessage(error, 'Could not read this file.'));
        }
    }

    async function confirmImport(plan: ImportPlan) {
        setState({ phase: 'importing', plan, written: 0 });

        try {
            await applyImport(plan, {
                onProgress: (written) =>
                    setState({ phase: 'importing', plan, written }),
            });
            toast.success(`Imported ${tasksLabel(plan.taskCount)}`);
        } catch (error) {
            toast.error(
                errorMessage(
                    error,
                    'The import stopped before the end. Some tasks may have been added.',
                ),
            );
        } finally {
            setState({ phase: 'closed' });
        }
    }

    const plan = state.phase === 'closed' ? null : state.plan;
    const importing = state.phase === 'importing';

    const element = (
        <>
            <input
                ref={input}
                type="file"
                accept=".json,application/json"
                className="hidden"
                aria-hidden
                tabIndex={-1}
                data-test="import-file-input"
                onChange={onFileChosen}
            />
            <AlertDialog
                open={plan !== null}
                onOpenChange={(open) => {
                    if (!open && !importing) {
                        setState({ phase: 'closed' });
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Import data</AlertDialogTitle>
                        <AlertDialogDescription>
                            {plan &&
                                `${tasksLabel(plan.taskCount)}${plan.recurringCount > 0 ? ` (${plan.recurringCount.toLocaleString()} recurring)` : ''} will be added. Your existing tasks will stay unchanged.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {state.phase === 'importing' && (
                        <Progress
                            value={
                                (state.written / state.plan.tasks.length) * 100
                            }
                            aria-label="Import progress"
                        />
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={importing}>
                            Cancel
                        </AlertDialogCancel>
                        <Button
                            disabled={importing}
                            onClick={() => plan && confirmImport(plan)}
                        >
                            {importing ? 'Importing…' : 'Import'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );

    return {
        exportData: () => void exportData(),
        chooseImportFile: () => input.current?.click(),
        element,
    };
}

/** The "Export data" and "Import data…" entries of the account menu. */
export function DataTransferMenuItems({
    transfer,
}: {
    transfer: DataTransfer;
}) {
    return (
        <>
            <DropdownMenuItem
                className="cursor-pointer"
                onSelect={transfer.exportData}
                data-test="export-data"
            >
                <Download className="me-2" />
                Export data
            </DropdownMenuItem>
            <DropdownMenuItem
                className="cursor-pointer"
                onSelect={transfer.chooseImportFile}
                data-test="import-data"
            >
                <Upload className="me-2" />
                Import data…
            </DropdownMenuItem>
        </>
    );
}
