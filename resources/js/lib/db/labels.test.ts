import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { onLocalChange } from './changes';
import { db, wipeLocalDatabase } from './database';
import { normalizeLabelName, queryLabels, setLabelName } from './labels';

beforeEach(async () => {
    await wipeLocalDatabase();
});

describe('setLabelName', () => {
    it('stores the name with an outbox entry and wakes the sync', async () => {
        const listener = vi.fn();
        const unsubscribe = onLocalChange(listener);

        await setLabelName('pink', 'Deep work');
        unsubscribe();

        expect(await queryLabels()).toEqual([
            {
                color: 'pink',
                name: 'Deep work',
                updated_at: expect.any(String),
            },
        ]);
        expect(await db.outbox.toArray()).toEqual([
            { task_id: 'pink', entity: 'label', revision: 1 },
        ]);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('bumps the revision and updated_at on every change', async () => {
        await setLabelName('pink', 'Deep work');
        const first = await db.labels.get('pink');

        await setLabelName('pink', 'Focus');

        const second = await db.labels.get('pink');

        expect(second?.name).toBe('Focus');
        expect(second!.updated_at > first!.updated_at).toBe(true);
        expect((await db.outbox.get('pink'))?.revision).toBe(2);
    });

    it('gives the default name back with an empty name (synced too)', async () => {
        await setLabelName('green', 'Health');
        await setLabelName('green', '   ');

        expect((await db.labels.get('green'))?.name).toBe('');
        expect((await db.outbox.get('green'))?.revision).toBe(2);
    });

    it('writes nothing when the name does not change', async () => {
        const listener = vi.fn();

        await setLabelName('lilac', ' Home ');

        const unsubscribe = onLocalChange(listener);

        await setLabelName('lilac', 'Home');
        await setLabelName('mango', '');
        unsubscribe();

        expect(listener).not.toHaveBeenCalled();
        expect(await db.labels.count()).toBe(1);
        expect((await db.outbox.get('lilac'))?.revision).toBe(1);
    });

    it('stores the name trimmed, with single spaces', async () => {
        await setLabelName('grey', '  Deep \n  work ');

        expect((await db.labels.get('grey'))?.name).toBe('Deep work');
    });

    it('refuses names that are too long and the colour none', async () => {
        await expect(setLabelName('pink', 'a'.repeat(25))).rejects.toThrow();
        await expect(
            setLabelName('none' as 'pink', 'Nothing'),
        ).rejects.toThrow();
        await setLabelName('pink', ` ${'é'.repeat(24)} `);

        expect((await db.labels.get('pink'))?.name).toBe('é'.repeat(24));
    });
});

describe('normalizeLabelName', () => {
    it('trims and collapses whitespace', () => {
        expect(normalizeLabelName('\t a  b \n')).toBe('a b');
        expect(normalizeLabelName('   ')).toBe('');
    });
});
