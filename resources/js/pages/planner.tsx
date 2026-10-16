import { Head, usePage } from '@inertiajs/react';
import { useSyncExternalStore } from 'react';
import { LandingCard } from '@/components/landing/landing-card';
import { landingStore } from '@/lib/landing';

/**
 * The planner itself is the persistent `PlannerLayout` (see `app.tsx`), so
 * the sign-in, sign-up and plan pages can float over it without remounting
 * it; this page sets the title and, in SaaS mode, floats the landing card
 * over a guest's planner until they press "Start now".
 */
export default function Planner() {
    const { auth, saas } = usePage().props;
    const dismissed = useSyncExternalStore(
        landingStore.subscribe,
        landingStore.isDismissed,
        landingStore.isDismissed,
    );
    const showLanding = (saas?.enabled ?? false) && !auth.user && !dismissed;

    return (
        <>
            <Head title="Planner" />
            {showLanding && <LandingCard />}
        </>
    );
}
