import { createInertiaApp } from '@inertiajs/react';
import { AppToaster } from '@/components/app-toaster';
import { DirectionProvider } from '@/components/ui/direction';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import SettingsLayout from '@/layouts/settings/layout';
import PlannerLayout from '@/layouts/planner-layout';
import { configureI18n } from '@/lib/i18n';
import { reloadOnLocaleChange } from '@/lib/i18n/reload-on-change';
import { syncSubscriptionWithSession } from '@/lib/notifications/session';
import { registerServiceWorker } from '@/lib/pwa/register';

const appName = import.meta.env.VITE_APP_NAME || 'Plain Week';

void createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            // Reached from Settings › Security: its card floats over the settings.
            case name === 'auth/confirm-password':
            case name.startsWith('settings/'):
                return SettingsLayout;
            // The same layout instance stays mounted between these pages,
            // so the planner keeps running under their floating cards.
            case name === 'planner':
            case name === 'billing/plans':
            case name.startsWith('auth/'):
            // The OAuth consent card for AI agents, like the auth cards.
            case name.startsWith('oauth/'):
                return PlannerLayout;
            // The legal pages render their own page (LegalPage).
            case name.startsWith('legal/'):
            default:
                return null;
        }
    },
    strictMode: true,
    withApp(app, { page }) {
        // Before the first render: the page (or the cached offline shell)
        // carries the language and the instance's translations.
        configureI18n(page.props.i18n);

        return (
            <DirectionProvider
                dir={document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'}
            >
                <TooltipProvider delayDuration={0}>
                    {app}
                    <AppToaster />
                </TooltipProvider>
            </DirectionProvider>
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// A response in another language reloads the page to render it.
reloadOnLocaleChange();

// This will set light / dark mode on load...
initializeTheme();

// Offline app shell: lets the planner load without a network after a visit.
registerServiceWorker();

// Web Push: keep this device's subscription in step with the session.
syncSubscriptionWithSession();
