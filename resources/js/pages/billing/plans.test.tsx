// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Offers } from '@/components/billing/offers';
import Plans from './plans';

const start = vi.fn();

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
    usePage: () => ({ props: { auth: { user: { id: 7 } } } }),
    usePoll: () => ({ stop: vi.fn() }),
}));

vi.mock('@/hooks/use-checkout', () => ({
    useCheckout: () => ({ start, pending: null }),
}));

const launchOffers: Offers = {
    weekly: { price: '€2.99' },
    lifetime: { price: '€16', regularPrice: '€64', discountPercent: 75 },
};

afterEach(() => {
    cleanup();
    start.mockClear();
});

describe('Plans', () => {
    it('preselects lifetime with the launch discount', () => {
        render(<Plans plans={launchOffers} processing={false} />);

        expect(
            screen
                .getByRole('radio', { name: /Lifetime/ })
                .getAttribute('aria-checked'),
        ).toBe('true');
        expect(screen.queryByText('Launch −75%')).not.toBeNull();
        expect(screen.queryByText('€64')).not.toBeNull();
        expect(
            document.querySelector('[data-test="due-today"]')?.textContent,
        ).toBe('€16');
    });

    it('starts checkout for the chosen plan', async () => {
        const user = userEvent.setup();

        render(<Plans plans={launchOffers} processing={false} />);

        await user.click(screen.getByRole('radio', { name: /Weekly/ }));

        expect(
            document.querySelector('[data-test="due-today"]')?.textContent,
        ).toBe('€2.99');

        await user.click(
            screen.getByRole('button', { name: 'Continue to payment' }),
        );

        expect(start).toHaveBeenCalledWith('weekly');
    });

    it('shows the full price without a badge when there is no launch offer', () => {
        render(
            <Plans
                plans={{
                    weekly: { price: '€2.99' },
                    lifetime: {
                        price: '€64',
                        regularPrice: null,
                        discountPercent: null,
                    },
                }}
                processing={false}
            />,
        );

        expect(screen.queryByText(/Launch/)).toBeNull();
        expect(
            document.querySelector('[data-test="due-today"]')?.textContent,
        ).toBe('€64');
    });
});
