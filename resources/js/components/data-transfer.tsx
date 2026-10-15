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
import { Progress } from '@/components/ui/progress';
import { buildExport } from '@/lib/transfer/export';
import { exportFileName } from '@/lib/transfer/format';
import type { ExportFile } from '@/lib/transfer/format';
import {
    ImportError,
    applyImport,
    parseImport,
    planImport,
    summarizeImport,
} from '@/lib/transfer/import';
import type { ImportSummary } from '@/lib/transfer/import';

/** How long the export's blob URL lives; some browsers start the download late. */
const DOWNLOAD_URL_LIFETIME_MS = 30_000;

function tasksLabel(count: number): string {
    return count === 1 ? '1 task' : `${count.toLocaleString()} tasks`;
}

function previewText({ taskCount, recurringCount }: ImportSummary): string {
    const recurring =
        recurringCount > 0
            ? ` (${recurringCount.toLocaleString()} recurring)`
            : '';

    return `${tasksLabel(taskCount)}${recurring} will be added. Your existing tasks will stay unchanged.`;
}

function errorMessage(error: unknown, fallback: string): string {
    if (error instanceof ImportError) {
        return error.message;
    }

    console.error(error);

    return fallback;
}

/** Saves the local database as a JSON file (works offline). */
async function exportData(prepare: () => Promise<boolean>): Promise<void> {
    try {
        const upToDate = await prepare();
        const file = await buildExport();
        const { taskCount } = summarizeImport(file);

        if (taskCount === 0) {
            toast.info('There are no tasks to export.');

            return;
        }

        const url = URL.createObjectURL(
            new Blob([JSON.stringify(file, null, 2)], {
                type: 'application/json',
            }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = exportFileName();
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
        toast.success(`Exported ${tasksLabel(taskCount)}`, {
            description: upToDate
                ? undefined
                : 'Not synced with your account right now, so changes made on other devices may be missing.',
        });
    } catch (error) {
        toast.error(errorMessage(error, 'Could not export your data.'));
    }
}

type ImportState =
    | { phase: 'closed' }
    | { phase: 'reading' }
    | { phase: 'preview'; file: ExportFile; summary: ImportSummary }
    | {
          phase: 'importing';
          file: ExportFile;
          summary: ImportSummary;
          progress: number;
      };

export type DataTransfer = {
    exportData: () => void;
    /** True while the export file is being built. */
    exporting: boolean;
    /** True while a chosen file is read, before its preview opens. */
    reading: boolean;
    /** Opens the file picker; the preview dialog follows. */
    chooseImportFile: () => void;
    /** The hidden file input and the import dialog; render it once. */
    element: ReactNode;
};

export type DataTransferOptions = {
    /**
     * Runs before the local database is read or written, to bind it to the
     * signed-in user (`prepareLocalData`). Resolves with whether the local
     * data is up to date with the server.
     */
    prepare: () => Promise<boolean>;
};

/**
 * Export and import of a JSON backup (docs/architecture.md, "Export
 * format"). Everything runs against the local database, so it works offline;
 * imported tasks sync like any other local change.
 */
export function useDataTransfer({
    prepare,
}: DataTransferOptions): DataTransfer {
    const input = useRef<HTMLInputElement>(null);
    const running = useRef(false);
    const exportRunning = useRef(false);
    const [state, setState] = useState<ImportState>({ phase: 'closed' });
    const [exporting, setExporting] = useState(false);

    async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
        const chosen = event.target.files?.[0];
        event.target.value = '';

        if (!chosen) {
            return;
        }

        setState({ phase: 'reading' });

        try {
            await prepare();
            const file = await parseImport(chosen);
            const summary = summarizeImport(file);

            if (summary.taskCount === 0) {
                toast.info('There are no tasks in this file.');
                setState({ phase: 'closed' });

                return;
            }

            setState({ phase: 'preview', file, summary });
        } catch (error) {
            toast.error(errorMessage(error, 'Could not read this file.'));
            setState({ phase: 'closed' });
        }
    }

    async function confirmImport(file: ExportFile, summary: ImportSummary) {
        // A second click (or Enter) before the re-render must not import twice.
        if (running.current) {
            return;
        }

        running.current = true;
        setState({ phase: 'importing', file, summary, progress: 0 });
        let written = 0;
        let total = 0;

        try {
            // Planned now, not at preview time, so positions follow the tasks
            // added in the meantime.
            const plan = await planImport(file);
            total = plan.tasks.length;
            await applyImport(plan, {
                onProgress: (count) => {
                    written = count;
                    setState({
                        phase: 'importing',
                        file,
                        summary,
                        progress: (count / total) * 100,
                    });
                },
            });
            toast.success(`Imported ${tasksLabel(summary.taskCount)}`);
        } catch (error) {
            toast.error(
                written > 0
                    ? `The import stopped after ${written.toLocaleString()} of ${total.toLocaleString()} tasks; those were added.`
                    : errorMessage(error, 'Could not import this file.'),
            );

            if (written > 0) {
                console.error(error);
            }
        } finally {
            running.current = false;
            setState({ phase: 'closed' });
        }
    }

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
                open={state.phase === 'preview' || state.phase === 'importing'}
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
                            {state.phase === 'importing'
                                ? `Importing ${tasksLabel(state.summary.taskCount)}…`
                                : state.phase === 'preview' &&
                                  previewText(state.summary)}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {state.phase === 'importing' && (
                        <Progress
                            value={state.progress}
                            aria-label="Import progress"
                            className="rtl:-scale-x-100"
                        />
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={importing}>
                            Cancel
                        </AlertDialogCancel>
                        <Button
                            disabled={importing}
                            onClick={() => {
                                if (state.phase === 'preview') {
                                    void confirmImport(
                                        state.file,
                                        state.summary,
                                    );
                                }
                            }}
                        >
                            {importing ? 'Importing…' : 'Import'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );

    return {
        exportData: () => {
            if (exportRunning.current) {
                return;
            }

            exportRunning.current = true;
            setExporting(true);
            void exportData(prepare).finally(() => {
                exportRunning.current = false;
                setExporting(false);
            });
        },
        exporting,
        reading: state.phase === 'reading',
        chooseImportFile: () => input.current?.click(),
        element,
    };
}
