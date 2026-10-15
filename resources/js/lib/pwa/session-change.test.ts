import { describe, expect, it } from 'vitest';
import { createSessionChangeDetector } from '@/lib/pwa/session-change';

describe('createSessionChangeDetector', () => {
    it('reports login, logout and profile changes, not the first page', () => {
        const changed = createSessionChangeDetector();
        const user = { id: 1, name: 'Ada' };

        expect(changed(null)).toBe(false);
        expect(changed(null)).toBe(false);
        expect(changed(user)).toBe(true);
        expect(changed({ ...user })).toBe(false);
        expect(changed({ ...user, name: 'Ada L.' })).toBe(true);
        expect(changed(undefined)).toBe(true);
    });
});
