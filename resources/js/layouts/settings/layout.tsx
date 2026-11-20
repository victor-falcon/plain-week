import { Link, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    BookOpen,
    FolderGit2,
    LogOut,
    MessageSquare,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import Heading from '@/components/heading';
import { useFeedbackLink } from '@/components/send-feedback';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { useLogout } from '@/hooks/use-logout';
import { t } from '@/lib/i18n';
import type { TextKey } from '@/lib/i18n';
import { DOCUMENTATION_URL, REPOSITORY_URL } from '@/lib/project';
import { cn, toUrl } from '@/lib/utils';
import { home } from '@/routes';
import { edit as editAgents } from '@/routes/agents';
import { edit as editAppearance } from '@/routes/appearance';
import { edit as editBilling } from '@/routes/billing';
import { edit as editData } from '@/routes/data';
import { edit as editIntegrations } from '@/routes/integrations';
import { edit as editNotifications } from '@/routes/notifications';
import { edit as editPreferences } from '@/routes/preferences';
import { edit } from '@/routes/profile';
import { edit as editSecurity } from '@/routes/security';
import type { NavItem } from '@/types';

type SettingsNavItem = Omit<NavItem, 'title'> & {
    /** Resolved with t() at render: the catalog is not set when this module loads. */
    title: TextKey;
    /** Hidden when false (e.g. a feature this instance doesn't offer). */
    visible?: (props: SharedProps) => boolean;
};

type SharedProps = ReturnType<typeof usePage>['props'];

const sectionNavItems: SettingsNavItem[] = [
    {
        title: 'settings.nav.profile',
        href: edit(),
    },
    {
        title: 'settings.nav.security',
        href: editSecurity(),
    },
    {
        title: 'settings.nav.appearance',
        href: editAppearance(),
    },
    {
        title: 'settings.nav.preferences',
        href: editPreferences(),
    },
    {
        title: 'settings.nav.notifications',
        href: editNotifications(),
        visible: (props) => props.notifications?.enabled ?? false,
    },
    {
        title: 'settings.nav.integrations',
        href: editIntegrations(),
        visible: (props) => props.integrations?.googleCalendar ?? false,
    },
    {
        title: 'settings.nav.agents',
        href: editAgents(),
    },
    {
        title: 'settings.nav.data',
        href: editData(),
    },
    {
        title: 'settings.nav.billing',
        href: editBilling(),
        visible: (props) => props.saas?.enabled ?? false,
    },
];

const projectLinks: { title: TextKey; href: string; icon: typeof BookOpen }[] =
    [
        { title: 'app.repository', href: REPOSITORY_URL, icon: FolderGit2 },
        { title: 'app.documentation', href: DOCUMENTATION_URL, icon: BookOpen },
    ];

/** Leaves the settings for the planner (the home page). */
function BackToPlanner({
    variant,
    testId,
}: {
    variant: 'ghost' | 'outline';
    testId: string;
}) {
    return (
        <Button variant={variant} size="sm" asChild>
            <Link href={home()} prefetch data-test={testId}>
                <ArrowLeft className="rtl:rotate-180" />
                {t('settings.layout.backToPlanner')}
            </Link>
        </Button>
    );
}

/**
 * The settings: a full-screen page with a way back to the planner at the top
 * and at the end, the section nav (a column on desktop, a scrolling row on
 * phones) and the account and project links in the footer.
 */
export default function SettingsLayout({ children }: PropsWithChildren) {
    const { isCurrentOrParentUrl } = useCurrentUrl();
    const { props, url } = usePage();
    const navRef = useRef<HTMLElement>(null);
    const navItems = sectionNavItems.filter(
        (item) => item.visible?.(props) ?? true,
    );
    const feedbackLink = useFeedbackLink();
    const logout = useLogout();

    // On phones the nav is a row that scrolls sideways: keep the current
    // section in view. Only the row scrolls, never the page. It waits for the
    // fonts, which change how wide the buttons are.
    useEffect(() => {
        let cancelled = false;

        void (document.fonts?.ready ?? Promise.resolve()).then(() => {
            const nav = navRef.current;
            const current = nav?.querySelector('[aria-current="page"]');

            if (
                cancelled ||
                !nav ||
                !current ||
                nav.scrollWidth <= nav.clientWidth
            ) {
                return;
            }

            const navBox = nav.getBoundingClientRect();
            const box = current.getBoundingClientRect();

            nav.scrollBy({
                left: box.left - navBox.left - (navBox.width - box.width) / 2,
            });
        });

        return () => {
            cancelled = true;
        };
    }, [url]);

    return (
        <div className="min-h-svh bg-background">
            <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-4 lg:px-8 lg:py-6">
                <div className="-ms-3">
                    <BackToPlanner variant="ghost" testId="settings-back" />
                </div>

                <main className="mt-6 flex-1">
                    <Heading
                        title={t('settings.layout.title')}
                        description={t('settings.layout.description')}
                    />

                    <div className="flex flex-col gap-6 lg:flex-row lg:gap-12">
                        <aside className="lg:w-48 lg:shrink-0">
                            <nav
                                ref={navRef}
                                className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
                                aria-label={t('settings.layout.title')}
                            >
                                {navItems.map((item) => {
                                    const current = isCurrentOrParentUrl(
                                        item.href,
                                    );

                                    return (
                                        <Button
                                            key={toUrl(item.href)}
                                            size="sm"
                                            variant="ghost"
                                            asChild
                                            className={cn(
                                                'shrink-0 lg:w-full lg:justify-start',
                                                { 'bg-muted': current },
                                            )}
                                        >
                                            <Link
                                                href={item.href}
                                                aria-current={
                                                    current ? 'page' : undefined
                                                }
                                            >
                                                {t(item.title)}
                                            </Link>
                                        </Button>
                                    );
                                })}
                            </nav>
                        </aside>

                        <Separator className="lg:hidden" />

                        <section className="max-w-xl min-w-0 flex-1 space-y-12">
                            {children}
                        </section>
                    </div>
                </main>

                <footer className="mt-12">
                    <Separator className="mb-4" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <BackToPlanner
                            variant="outline"
                            testId="settings-back-bottom"
                        />
                        <div className="-me-3 flex flex-wrap items-center gap-1">
                            {feedbackLink && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    asChild
                                    className="text-muted-foreground"
                                >
                                    <a
                                        {...feedbackLink}
                                        data-test="send-feedback"
                                    >
                                        <MessageSquare />
                                        {t('settings.layout.sendFeedback')}
                                    </a>
                                </Button>
                            )}
                            {projectLinks.map((item) => (
                                <Button
                                    key={item.title}
                                    size="sm"
                                    variant="ghost"
                                    asChild
                                    className="text-muted-foreground"
                                >
                                    <a
                                        href={item.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <item.icon />
                                        {t(item.title)}
                                    </a>
                                </Button>
                            ))}
                            {props.auth?.user && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground"
                                    onClick={logout}
                                    data-test="logout-button"
                                >
                                    <LogOut />
                                    {t('auth.logOut')}
                                </Button>
                            )}
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
