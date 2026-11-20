import { Head, usePage } from '@inertiajs/react';
import { useEffect, useSyncExternalStore } from 'react';
import { LandingCard } from '@/components/landing/landing-card';
import { McpAnnouncementDialog } from '@/components/mcp-announcement/mcp-announcement-card';
import {
    installAppStore,
    isDesktopBrowser,
    isReachableFromPhone,
} from '@/lib/install-app';
import { t } from '@/lib/i18n';
import { landingStore } from '@/lib/landing';
import { mcpAnnouncementStore } from '@/lib/mcp-announcement';

/**
 * The planner itself is the persistent `PlannerLayout` (see `app.tsx`), so
 * the sign-in, sign-up and plan pages can float over it without remounting
 * it; this page sets the title and, in SaaS mode, floats the landing card
 * over a guest's planner until they press "Start now". At most one card opens
 * by itself per page load, in this order: the landing card (guests, SaaS),
 * then the one-time MCP announcement (signed in, MCP on), then the "Install
 * the mobile app" card (a desktop's first visit). A card that loses its turn
 * waits for the next load, and none opens over a task from a `?task=` link.
 */
export default function Planner() {
    const { auth, saas, mcp } = usePage().props;
    const dismissed = useSyncExternalStore(
        landingStore.subscribe,
        landingStore.isDismissed,
        landingStore.isDismissed,
    );
    const signedIn = Boolean(auth.user);
    const mcpEnabled = mcp?.enabled ?? false;
    const showLanding = (saas?.enabled ?? false) && !signedIn && !dismissed;

    useEffect(() => {
        if (showLanding) {
            mcpAnnouncementStore.deferToNextLoad();
            installAppStore.deferToNextLoad();

            return;
        }

        // Runs before the layout's `useTaskLink` effect clears the param.
        const opensTask = new URLSearchParams(window.location.search).has(
            'task',
        );

        if (opensTask) {
            return;
        }

        if (signedIn && mcpEnabled && mcpAnnouncementStore.openOnce()) {
            installAppStore.deferToNextLoad();

            return;
        }

        if (isDesktopBrowser() && isReachableFromPhone()) {
            installAppStore.openOnce();
        }
    }, [showLanding, signedIn, mcpEnabled]);

    return (
        <>
            <Head title={t('planner.pageTitle')} />
            {showLanding && <LandingCard />}
            <McpAnnouncementDialog />
        </>
    );
}
