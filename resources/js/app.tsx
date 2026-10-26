import { createInertiaApp } from '@inertiajs/react';
import { AppToaster } from '@/components/app-toaster';
import { DirectionProvider } from '@/components/ui/direction';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import PlannerLayout from '@/layouts/planner-layout';
import { syncSubscriptionWithSession } from '@/lib/notifications/session';
import { registerServiceWorker } from '@/lib/pwa/register';

const appName = import.meta.env.VITE_APP_NAME || 'Plain Week';

void createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            // Reached from Settings › Security: its card floats over the settings.
            case name === 'auth/confirm-password':
                return [AppLayout, SettingsLayout];
            // The same layout instance stays mounted between these pages,
            // so the planner keeps running under their floating cards.
            case name === 'planner':
            case name === 'billing/plans':
            case name.startsWith('auth/'):
                return PlannerLayout;
            case name.startsWith('legal/'):
                return null;
            case name.startsWith('settings/'):
                return [AppLayout, SettingsLayout];
            default:
                return AppLayout;
        }
    },
    strictMode: true,
    withApp(app) {
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

// This will set light / dark mode on load...
initializeTheme();

// Offline app shell: lets the planner load without a network after a visit.
registerServiceWorker();

// Web Push: keep this device's subscription in step with the session.
syncSubscriptionWithSession();
