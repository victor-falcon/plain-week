import { Head, Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { LegalLinks } from '@/components/billing/legal-links';
import { home } from '@/routes';

export type Seller = {
    name: string;
    email: string;
};

export type LegalPageProps = {
    seller: Seller;
    appUrl: string;
};

/** Layout of the Terms of Service and Privacy Policy pages. */
export function LegalPage({
    title,
    updatedAt,
    children,
}: {
    title: string;
    updatedAt: string;
    children: ReactNode;
}) {
    return (
        <div className="min-h-svh bg-background px-4 py-10">
            <Head title={title} />

            <article className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-foreground [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ms-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_ul]:space-y-1 [&_ul]:text-muted-foreground">
                <header className="space-y-4">
                    <Link href={home()} aria-label="Plain Week">
                        <AppLogoIcon className="size-9" />
                    </Link>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {title}
                    </h1>
                    <p>Last updated: {updatedAt}</p>
                </header>

                {children}

                <LegalLinks className="justify-start pt-6" />
            </article>
        </div>
    );
}

export function Email({ seller }: { seller: Seller }) {
    return (
        <a
            className="underline underline-offset-4"
            href={`mailto:${seller.email}`}
        >
            {seller.email}
        </a>
    );
}
