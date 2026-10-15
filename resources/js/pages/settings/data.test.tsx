// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vite-plus/test';
import { Toaster } from '@/components/ui/sonner';
import { db, wipeLocalDatabase } from '@/lib/db/database';
import { buildExport } from '@/lib/transfer/export';
import { makeTask } from '@/test/fixtures';
import Data from './data';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    usePage: () => ({ props: { auth: { user: { id: 7 } } } }),
}));

// The engine would talk to the network; the page only needs it mounted.
vi.mock('@/components/sync-provider', () => ({
    SyncProvider: ({ children }: { children: ReactNode }) => children,
}));

function renderPage() {
    const user = userEvent.setup();

    render(
        <>
            <Data />
            <Toaster />
        </>,
    );

    return user;
}

async function importFile(user: ReturnType<typeof userEvent.setup>) {
    const file = {
        ...(await buildExport()),
        tasks: [makeTask({ text: 'Imported' })],
    };
    const input = document.querySelector<HTMLInputElement>(
        '[data-test="import-file-input"]',
    ) as HTMLInputElement;

    await user.click(screen.getByRole('button', { name: 'Import data…' }));
    await user.upload(
        input,
        new File([JSON.stringify(file)], 'backup.json', {
            type: 'application/json',
        }),
    );
    await screen.findByText(/1 task will be added/);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await screen.findByText('Imported 1 task');
}

beforeEach(async () => {
    await wipeLocalDatabase();
});

afterEach(() => {
    cleanup();
});

describe('Settings › Data', () => {
    it('shows the export, import and format sections', () => {
        renderPage();

        expect(
            screen.getByRole('button', { name: 'Export data' }),
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Import data…' }),
        ).toBeTruthy();
        expect(screen.getByText('File format')).toBeTruthy();
    });

    it('imports into the signed-in user’s local data', async () => {
        await db.tasks.put(makeTask({ text: 'Mine' }));
        await db.meta.put({ key: 'user_id', value: '7' });

        await importFile(renderPage());

        await waitFor(async () =>
            expect(
                (await db.tasks.toArray()).map((task) => task.text).sort(),
            ).toEqual(['Imported', 'Mine']),
        );
        expect(await db.outbox.count()).toBe(1);
    });

    it('claims the database first, so another user’s data never mixes in', async () => {
        await db.tasks.put(makeTask({ text: 'Someone else' }));
        await db.meta.put({ key: 'user_id', value: '3' });

        await importFile(renderPage());

        expect((await db.tasks.toArray()).map((task) => task.text)).toEqual([
            'Imported',
        ]);
        expect(await db.meta.get('user_id')).toEqual({
            key: 'user_id',
            value: '7',
        });
    });

    it('exports after claiming the database', async () => {
        const createObjectURL = vi.fn(() => 'blob:export');
        URL.createObjectURL = createObjectURL;
        URL.revokeObjectURL = vi.fn();
        await db.tasks.put(makeTask({ text: 'Mine' }));
        await db.meta.put({ key: 'user_id', value: '7' });
        const user = renderPage();

        await user.click(screen.getByRole('button', { name: 'Export data' }));

        expect(await screen.findByText('Exported 1 task')).toBeTruthy();
        expect(createObjectURL).toHaveBeenCalledOnce();
    });
});
