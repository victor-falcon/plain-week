import { Head, usePage } from '@inertiajs/react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { LandingCard } from '@/components/landing/landing-card';
import { installAppStore, isDesktopBrowser } from '@/lib/install-app';
import { landingStore } from '@/lib/landing';

/**
 * The planner itself is the persistent `PlannerLayout` (see `app.tsx`), so
 * the sign-in, sign-up and plan pages can float over it without remounting
 * it; this page sets the title and, in SaaS mode, floats the landing card
 * over a guest's planner until they press "Start now". On a desktop's first
 * visit it opens the "Install the mobile app" card once, but never right
 * after the landing card: that waits for the next visit.
 */
export default function Planner() {
    const { auth, saas } = usePage().props;
    const dismissed = useSyncExternalStore(
        landingStore.subscribe,
        landingStore.isDismissed,
        landingStore.isDismissed,
    );
    const showLanding = (saas?.enabled ?? false) && !auth.user && !dismissed;
    const landingShown = useRef(showLanding);

    landingShown.current ||= showLanding;

    useEffect(() => {
        if (!landingShown.current && isDesktopBrowser()) {
            installAppStore.openOnce();
        }
    }, []);

    return (
        <>
            <Head title="Planner" />
            {showLanding && <LandingCard />}
        </>
    );
}
