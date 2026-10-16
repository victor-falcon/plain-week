import { router } from '@inertiajs/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { checkout } from '@/routes/billing';
import type { Plan } from '@/types';

export type CheckoutOptions = {
    /** A promotion code; the server checks it again and refuses a bad one. */
    code?: string;
    /** Validation errors (e.g. `code`): the server stayed on the page. */
    onError?: (errors: Record<string, string>) => void;
};

/**
 * Starts Stripe Checkout for a plan. The server answers with an external
 * redirect, so `pending` stays set until the browser leaves the page.
 */
export function useCheckout() {
    const [pending, setPending] = useState<Plan | null>(null);

    const start = (plan: Plan, { code, onError }: CheckoutOptions = {}) => {
        if (pending !== null) {
            return;
        }

        const failed = () => {
            setPending(null);
            toast.error('Could not open the checkout. Please try again.');
        };

        router.post(checkout.url(plan), code ? { code } : {}, {
            // A validation error comes back to the same page: keep what was chosen and typed.
            preserveState: true,
            preserveScroll: true,
            onStart: () => setPending(plan),
            onError: (errors) => {
                setPending(null);
                onError?.(errors);
            },
            // Only when the server stayed in the app (e.g. "you already have this plan").
            onSuccess: () => setPending(null),
            onCancel: () => setPending(null),
            onHttpException: failed,
            onNetworkError: failed,
        });
    };

    return { start, pending };
}
