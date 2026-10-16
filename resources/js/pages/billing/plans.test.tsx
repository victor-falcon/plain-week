// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Offers } from '@/components/billing/offers';
import Plans from './plans';

const start = vi.fn();

type HttpOptions = {
    onSuccess?: (response: unknown) => void;
};

/** What the promotion-code endpoint answers, per test. */
let answerCode: (
    url: string,
    code: string,
    options: HttpOptions,
    setError: (message: string) => void,
) => void = () => {};

vi.mock('@inertiajs/react', async () => {
    const { useState } = await import('react');

    return {
        Head: () => null,
        // A minimal stand-in for Inertia's `useHttp` (it posts with XHR).
        useHttp: <T extends Record<string, string>>(initial: T) => {
            const [data, setData] = useState(initial);
            const [errors, setErrors] = useState<Record<string, string>>({});

            return {
                data,
                errors,
                processing: false,
                setData: (key: string, value: string) =>
                    setData((current) => ({ ...current, [key]: value })),
                clearErrors: () => setErrors({}),
                setError: (key: string, value: string) =>
                    setErrors((current) => ({ ...current, [key]: value })),
                post: (url: string, options: HttpOptions) => {
                    answerCode(url, data.code, options, (message) =>
                        setErrors({ code: message }),
                    );

                    return Promise.resolve();
                },
            };
        },
        Link: ({
            children,
            href,
        }: {
            children: React.ReactNode;
            href: string;
        }) => <a href={href}>{children}</a>,
        usePage: () => ({ props: { auth: { user: { id: 7 } } } }),
        usePoll: () => ({ stop: vi.fn() }),
    };
});

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

        expect(start).toHaveBeenCalledWith('weekly', {
            code: undefined,
            onError: expect.any(Function),
        });
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

    it('applies a promotion code to the chosen plan and sends it to checkout', async () => {
        const user = userEvent.setup();

        answerCode = (url, code, options, setError) => {
            if (url.endsWith('/lifetime') && code === 'pwfriends26') {
                options.onSuccess?.({ code: 'PWFRIENDS26', price: '€0' });
            } else {
                setError("This code isn't valid for this plan.");
            }
        };

        render(<Plans plans={launchOffers} processing={false} />);

        await user.click(screen.getByRole('button', { name: 'Have a code?' }));
        await user.type(
            screen.getByRole('textbox', { name: 'Promotion code' }),
            'pwfriends26',
        );
        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(screen.queryByText('PWFRIENDS26 applied.')).not.toBeNull();
        expect(
            document.querySelector('[data-test="due-today"]')?.textContent,
        ).toBe('€0');

        // The code is for lifetime only: weekly checks it again and refuses it.
        await user.click(screen.getByRole('radio', { name: /Weekly/ }));

        expect(
            screen.queryByText("This code isn't valid for this plan."),
        ).not.toBeNull();
        expect(
            document.querySelector('[data-test="due-today"]')?.textContent,
        ).toBe('€2.99');

        await user.click(screen.getByRole('radio', { name: /Lifetime/ }));
        await user.click(
            screen.getByRole('button', { name: 'Continue to payment' }),
        );

        expect(start).toHaveBeenCalledWith(
            'lifetime',
            expect.objectContaining({ code: 'pwfriends26' }),
        );
    });
});
