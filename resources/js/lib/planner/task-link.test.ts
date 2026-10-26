import { describe, expect, it } from 'vite-plus/test';
import { taskIdFromUrl, withoutTaskParam } from './task-link';

const ORIGIN = 'https://plainweek.test';

describe('taskIdFromUrl', () => {
    it('reads a task id and an occurrence id', () => {
        expect(taskIdFromUrl(`${ORIGIN}/?task=0199a1b2-c3d4`)).toBe(
            '0199a1b2-c3d4',
        );
        expect(
            taskIdFromUrl(`${ORIGIN}/?week=2026-10-12&task=abc%3A2026-10-14`),
        ).toBe('abc:2026-10-14');
    });

    it('ignores a missing, empty or oversized id', () => {
        expect(taskIdFromUrl(`${ORIGIN}/`)).toBeNull();
        expect(taskIdFromUrl(`${ORIGIN}/?task=`)).toBeNull();
        expect(taskIdFromUrl(`${ORIGIN}/?task=%20`)).toBeNull();
        expect(taskIdFromUrl(`${ORIGIN}/?task=${'x'.repeat(101)}`)).toBeNull();
    });
});

describe('withoutTaskParam', () => {
    it('drops the task and keeps the week, other parameters and the hash', () => {
        expect(
            withoutTaskParam(`${ORIGIN}/?week=2026-10-12&task=abc&x=1#top`),
        ).toBe(`${ORIGIN}/?week=2026-10-12&x=1#top`);
        expect(withoutTaskParam(`${ORIGIN}/?task=abc`)).toBe(`${ORIGIN}/`);
    });
});
