/**
 * Takes the README screenshots (docs/images/*.png) with headless Chromium against a production build, with a fixed
 * clock, a fixed viewport, device scale 2 and a curated week of tasks (nothing personal).
 *
 * Usage: bun run build && bun scripts/screenshots.ts
 * It starts PHP's built-in server on a free port itself, on a throwaway SQLite database (the Settings › Data shot
 * registers a demo account), and needs ImageMagick's `magick` to optimize the PNGs.
 * See docs/stack.md#readme-screenshots.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { optimizePng } from './lib/optimize-png';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Thursday 15 Oct 2026, mid-morning: the week of Monday 12 Oct is on screen and Thursday is today. */
const NOW = new Date('2026-10-15T10:00:00');
type Device = {
    viewport: { width: number; height: number };
    phone: boolean;
};

const DESKTOP: Device = {
    viewport: { width: 1440, height: 900 },
    phone: false,
};
const PHONE: Device = { viewport: { width: 390, height: 844 }, phone: true };

type Theme = 'light' | 'dark';

type SeedTask = {
    text: string;
    date?: string;
    someday?: number;
    done?: boolean;
    color?: string;
    time?: string;
    notes?: string;
    subtasks?: { text: string; done?: boolean }[];
    recurrence?: Record<string, unknown>;
};

/** The curated week. Dates are in the week of Monday 12 Oct 2026. */
const TASKS: SeedTask[] = [
    { text: 'Plan the week', date: '2026-10-12', done: true },
    { text: 'Reply to Ana', date: '2026-10-12', done: true },
    {
        text: 'Water the plants',
        date: '2026-10-12',
        recurrence: { type: 'daily', every: 3 },
    },
    {
        text: 'Groceries',
        date: '2026-10-12',
        subtasks: [{ text: 'Oat milk' }, { text: 'Coffee beans' }],
    },
    {
        text: 'Gym',
        date: '2026-10-13',
        time: '17:30',
        recurrence: { type: 'weekly', weekdays: [2, 4] },
    },
    { text: 'Book flights to Lisbon', date: '2026-10-13', color: 'yellow' },
    { text: 'Call the bank', date: '2026-10-13' },
    { text: 'Dentist', date: '2026-10-14', time: '09:00', color: 'cornflower' },
    {
        text: 'Read 20 pages',
        date: '2026-10-14',
        recurrence: { type: 'weekly', weekdays: [1, 2, 3, 4, 5] },
    },
    {
        text: 'Ship the release',
        date: '2026-10-15',
        color: 'green',
        notes: 'Changelog, tag, then the Docker image.\nAnnounce it once the image is on GHCR.',
        subtasks: [
            { text: 'Update the changelog', done: true },
            { text: 'Tag v1.0.0', done: true },
            { text: 'Check the Docker image' },
            { text: 'Write the announcement' },
        ],
    },
    { text: 'Lunch with Marta', date: '2026-10-15', time: '13:30' },
    {
        text: 'Weekly review',
        date: '2026-10-16',
        recurrence: { type: 'weekly', weekdays: [5] },
    },
    { text: 'Pizza night', date: '2026-10-16', time: '20:00', color: 'pink' },
    {
        text: 'Pay rent',
        date: '2026-10-16',
        recurrence: { type: 'monthly', day: 16 },
    },
    {
        text: 'Farmers market',
        date: '2026-10-17',
        time: '10:00',
        color: 'mango',
    },
    { text: 'Long run', date: '2026-10-18', color: 'lilac' },
    { text: 'Learn Portuguese basics', someday: 0 },
    { text: 'Fix the bike', someday: 0 },
    { text: 'Gift ideas for Leo', someday: 1, color: 'grey' },
    { text: 'Try the ramen place', someday: 2 },
];

/** Full task rows, in the shape of the sync contract (docs/architecture.md). */
function taskRows() {
    const stamp = NOW.toISOString();
    const counters = new Map<string, number>();

    return TASKS.map((task, index) => {
        const slot = task.date ?? `someday-${task.someday}`;
        const order = counters.get(slot) ?? 0;
        counters.set(slot, order + 1);

        return {
            id: `00000000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
            text: task.text,
            date: task.date ?? null,
            someday_column: task.date ? null : (task.someday ?? 0),
            position: `a${order}`,
            done: task.done ?? false,
            done_at: task.done ? stamp : null,
            color: task.color ?? 'none',
            time: task.time ?? null,
            notes: task.notes ?? '',
            subtasks: (task.subtasks ?? []).map((subtask, i) => ({
                id: `00000000-0000-7000-9000-${String(index * 100 + i).padStart(12, '0')}`,
                text: subtask.text,
                done: subtask.done ?? false,
            })),
            created_at: stamp,
            updated_at: stamp,
            deleted_at: null,
            recurrence: task.recurrence
                ? { until: null, ...task.recurrence }
                : null,
            series_id: null,
            occurrence_date: null,
        };
    });
}

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() =>
                resolve(
                    typeof address === 'object' && address ? address.port : 0,
                ),
            );
        });
    });
}

async function waitForServer(url: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            if ((await fetch(`${url}/up`)).ok) {
                return;
            }
        } catch {
            // Not listening yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`The app did not start at ${url}.`);
}

/** A fresh guest with the curated week in IndexedDB, at the fixed clock, on the planner. */
async function openPlanner(
    browser: Browser,
    url: string,
    theme: Theme,
    { viewport, phone }: Device,
): Promise<Page> {
    const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 2,
        colorScheme: theme,
        locale: 'en-GB',
        timezoneId: 'Europe/Madrid',
        reducedMotion: 'reduce',
        hasTouch: phone,
        isMobile: phone,
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(NOW);
    await page.goto(url);
    // Let the guest onboarding finish seeding (its last task is the Someday one) before replacing it.
    await page
        .getByRole('button', {
            name: 'Ideas without a date live here',
            exact: true,
        })
        .waitFor();

    // Replace the onboarding tasks with the curated week, straight in IndexedDB. This mirrors app internals: the
    // database and store names (resources/js/lib/db/database.ts) and the onboarding flag `meta.demo_seeded`
    // (resources/js/lib/db/demo-tasks.ts); update it when they change.
    await page.evaluate(async (rows) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('plain-week');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction(
            ['tasks', 'outbox', 'meta'],
            'readwrite',
        );
        transaction.objectStore('tasks').clear();
        transaction.objectStore('outbox').clear();
        transaction.objectStore('meta').clear();
        transaction.objectStore('meta').put({ key: 'demo_seeded', value: 1 });
        rows.forEach((row) => transaction.objectStore('tasks').put(row));
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
    }, taskRows());

    await page.reload();
    await page
        .getByRole('button', { name: 'Ship the release' })
        .first()
        .waitFor();
    await page.evaluate(() => document.fonts.ready);

    return page;
}

async function save(page: Page, name: string): Promise<void> {
    const out = `${root}docs/images/${name}.png`;
    // Park the pointer in a corner so nothing shows its hover state.
    await page.mouse.move(
        page.viewportSize()!.width - 1,
        page.viewportSize()!.height - 1,
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: out });
    optimizePng(out);
    console.log(`docs/images/${name}.png`);
}

const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const scratch = mkdtempSync(`${tmpdir()}/plain-week-screenshots-`);
// Real environment variables win over .env, so the app runs on its own empty database.
const env = {
    ...process.env,
    DB_CONNECTION: 'sqlite',
    DB_DATABASE: `${scratch}/database.sqlite`,
    APP_NOINDEX: 'false',
};
writeFileSync(env.DB_DATABASE, '');
execFileSync('php', ['artisan', 'migrate', '--force', '--quiet'], {
    cwd: root,
    env,
});
// PHP's built-in server with Laravel's router, as `php artisan serve` runs it, but as a direct child so killing it
// stops the server.
const router = `${root}vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php`;
const server = spawn('php', ['-S', `127.0.0.1:${port}`, router], {
    cwd: `${root}public`,
    env,
    stdio: 'ignore',
});
const browser = await chromium.launch({ headless: true });

try {
    await waitForServer(url);

    for (const theme of ['light', 'dark'] as const) {
        const desktop = await openPlanner(browser, url, theme, DESKTOP);
        await save(desktop, `desktop-${theme}`);

        await desktop
            .getByRole('button', { name: 'Ship the release' })
            .first()
            .click();
        await desktop.getByRole('dialog', { name: 'Edit task' }).waitFor();
        await save(desktop, `dialog-${theme}`);
        await desktop.context().close();

        const phone = await openPlanner(browser, url, theme, PHONE);
        // Scroll today (Thursday) into view, right under the sticky week header.
        // Each day is a region named after it ("Thu 15 Oct").
        await phone.getByRole('region', { name: /15 Oct/ }).evaluate((day) => {
            window.scrollTo(
                0,
                day.getBoundingClientRect().top + window.scrollY - 140,
            );
        });
        await save(phone, `mobile-${theme}`);
        await phone.context().close();
    }

    const menu = await openPlanner(browser, url, 'light', DESKTOP);
    // Open it from the task's bottom edge so the menu sits under the task instead of over it.
    const flights = menu.locator('[data-task-id]').filter({
        has: menu.getByRole('button', {
            name: 'Book flights to Lisbon',
            exact: true,
        }),
    });
    const box = (await flights.boundingBox())!;
    await flights.click({
        button: 'right',
        position: { x: 12, y: box.height - 2 },
    });
    await menu.getByRole('menu').waitFor();
    await save(menu, 'context-menu-light');
    await menu.context().close();

    const repeat = await openPlanner(browser, url, 'light', DESKTOP);
    await repeat
        .getByRole('button', { name: 'Water the plants' })
        .first()
        .click();
    const dialog = repeat.getByRole('dialog', { name: 'Edit task' });
    await dialog.waitFor();
    await dialog
        // The toolbar button is named after the rule ("Repeat: Every 3 days").
        .getByRole('button', { name: /^Repeat/ })
        .click();
    await save(repeat, 'repeat-light');
    await repeat.context().close();

    // Settings › Data needs an account: register a demo one on the throwaway database.
    const settings = await openPlanner(browser, url, 'light', DESKTOP);
    await settings.goto(`${url}/register`);
    await settings.locator('input[name="name"]').fill('Alex Demo');
    await settings.locator('input[name="email"]').fill('alex@example.com');
    await settings.locator('input[name="password"]').fill('plain-week-demo');
    await settings
        .locator('input[name="password_confirmation"]')
        .fill('plain-week-demo');
    await settings.locator('[data-test="register-user-button"]').click();
    await settings.waitForURL(`${url}/`);
    await settings.goto(`${url}/settings/data`);
    await settings.locator('[data-test="export-data"]').waitFor();
    await save(settings, 'settings-data-light');
    await settings.context().close();
} finally {
    await browser.close();
    server.kill();
    rmSync(scratch, { recursive: true, force: true });
}
