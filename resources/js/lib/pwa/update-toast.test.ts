import { toast } from 'sonner';
import type { Action } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { showUpdateToast } from '@/lib/pwa/update-toast';

vi.mock('sonner', () => ({ toast: vi.fn() }));

describe('showUpdateToast', () => {
    it('shows a persistent toast whose action applies the update', () => {
        const update = vi.fn(() => Promise.resolve());

        showUpdateToast(update);

        expect(toast).toHaveBeenCalledWith(
            'Update available',
            expect.objectContaining({
                id: 'pwa-update',
                duration: Infinity,
                action: expect.objectContaining({ label: 'Reload' }),
            }),
        );

        const action = vi.mocked(toast).mock.calls[0][1]?.action as Action;
        action.onClick({} as Parameters<Action['onClick']>[0]);

        expect(update).toHaveBeenCalledOnce();
    });
});
