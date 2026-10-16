import { router } from '@inertiajs/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { checkout } from '@/routes/billing';
import type { Plan } from '@/types';

/**
 * Starts Stripe Checkout for a plan. The server answers with an external
 * redirect, so `pending` stays set until the browser leaves the page.
 */
export function useCheckout() {
    const [pending, setPending] = useState<Plan | null>(null);

    const start = (plan: Plan) => {
        if (pending !== null) {
            return;
        }

        const failed = () => {
            setPending(null);
            toast.error('Could not open the checkout. Please try again.');
        };

        router.post(
            checkout.url(plan),
            {},
            {
                onStart: () => setPending(plan),
                // Only when the server stayed in the app (e.g. "you already have this plan").
                onSuccess: () => setPending(null),
                onCancel: () => setPending(null),
                onHttpException: failed,
                onNetworkError: failed,
            },
        );
    };

    return { start, pending };
}
