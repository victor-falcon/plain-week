// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { useDataTransfer } from '@/components/planner/data-transfer';
import { Toaster } from '@/components/ui/sonner';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { createTask } from '@/lib/db/tasks';
import { buildExport } from '@/lib/transfer/export';
import { makeTask } from '@/test/fixtures';

function Harness() {
    const transfer = useDataTransfer();

    return (
        <>
            <button type="button" onClick={transfer.chooseImportFile}>
                Import
            </button>
            {transfer.element}
            <Toaster />
        </>
    );
}

function jsonFile(content: unknown, name = 'backup.json'): File {
    return new File([JSON.stringify(content)], name, {
        type: 'application/json',
    });
}

async function chooseFile(file: File) {
    const user = userEvent.setup();
    render(<Harness />);
    const input = document.querySelector<HTMLInputElement>(
        '[data-test="import-file-input"]',
    ) as HTMLInputElement;

    await user.upload(input, file);

    return user;
}

beforeEach(async () => {
    await wipeLocalDatabase();
});

afterEach(() => {
    cleanup();
});

describe('import dialog', () => {
    it('previews the file, imports it on confirm and reports it', async () => {
        await createTask({ text: 'Mine', date: '2026-10-12' });
        const file = await buildExport();
        file.tasks.push(
            makeTask({
                text: 'Gym',
                recurrence: { type: 'weekly', weekdays: [1] },
            }),
        );

        const user = await chooseFile(jsonFile(file));
        const dialog = await screen.findByRole('alertdialog', {
            name: 'Import data',
        });

        expect(dialog.textContent).toContain(
            '2 tasks (1 recurring) will be added. Your existing tasks will stay unchanged.',
        );
        expect(await db.tasks.count()).toBe(1);

        await user.click(screen.getByRole('button', { name: 'Import' }));

        expect(await screen.findByText('Imported 2 tasks')).toBeTruthy();
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull(),
        );
        expect(await db.tasks.count()).toBe(3);
    });

    it('adds nothing when cancelled', async () => {
        const user = await chooseFile(
            jsonFile(await buildExportWith(makeTask())),
        );

        await screen.findByText(/1 task will be added/);
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).toBeNull(),
        );
        expect(await db.tasks.count()).toBe(0);
    });

    it('shows why a file cannot be imported', async () => {
        await chooseFile(jsonFile({ format: 'something-else' }));

        expect(
            await screen.findByText('This is not a Plain Week export file.'),
        ).toBeTruthy();
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });
});

async function buildExportWith(...tasks: ReturnType<typeof makeTask>[]) {
    const file = await buildExport();

    return { ...file, tasks };
}
