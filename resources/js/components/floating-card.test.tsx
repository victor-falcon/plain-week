// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { FloatingCard } from './floating-card';

afterEach(cleanup);

describe('FloatingCard', () => {
    it('is a dialog named and described by its heading and text', () => {
        render(
            <FloatingCard title="Welcome back" description="Log in to sync.">
                <input aria-label="Email" />
            </FloatingCard>,
        );

        const dialog = screen.getByRole('dialog', { name: 'Welcome back' });

        const descriptionId = dialog.getAttribute('aria-describedby') ?? '';

        expect(document.getElementById(descriptionId)?.textContent).toBe(
            'Log in to sync.',
        );
    });

    it('closes with the close button and with Esc', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();

        render(<FloatingCard title="Welcome back" onClose={onClose} />);

        await user.click(screen.getByRole('button', { name: 'Close' }));
        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('cannot be dismissed without onClose', async () => {
        const user = userEvent.setup();

        render(<FloatingCard title="Choose your plan" />);

        await user.keyboard('{Escape}');

        expect(
            screen.queryByRole('dialog', { name: 'Choose your plan' }),
        ).not.toBeNull();
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    });

    it('shows a back button and the toolbar', async () => {
        const user = userEvent.setup();
        const onBack = vi.fn();

        render(
            <FloatingCard
                title="Create your account"
                onBack={onBack}
                toolbar={<span>Step 1 of 2</span>}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Back' }));

        expect(onBack).toHaveBeenCalledOnce();
        expect(screen.queryByText('Step 1 of 2')).not.toBeNull();
    });
});
