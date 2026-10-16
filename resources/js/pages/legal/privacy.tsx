import { Email, LegalPage } from '@/components/billing/legal-page';
import type { LegalPageProps } from '@/components/billing/legal-page';

export default function Privacy({ seller, appUrl }: LegalPageProps) {
    return (
        <LegalPage title="Privacy Policy" updatedAt="October 16, 2026">
            <section className="space-y-3">
                <h2>1. Who is responsible</h2>
                <p>
                    {seller.name}, based in Spain, is the data controller for
                    Plain Week at {appUrl}. Contact: <Email seller={seller} />.
                </p>
            </section>

            <section className="space-y-3">
                <h2>2. Without an account</h2>
                <p>
                    If you use Plain Week without an account, your tasks are
                    stored only in your browser and are never sent to our
                    servers.
                </p>
            </section>

            <section className="space-y-3">
                <h2>3. What we process with an account</h2>
                <ul>
                    <li>
                        Account data: name, email address and a hashed password
                        (plus passkeys or two-factor settings if you add them).
                    </li>
                    <li>The tasks you sync and their history of changes.</li>
                    <li>
                        Billing data: your plan, and the Stripe customer and
                        payment references. Card details are handled by Stripe
                        and never reach us.
                    </li>
                    <li>
                        Technical data: session cookies and server logs (IP
                        address, browser) kept for security.
                    </li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2>4. Why and on what legal basis</h2>
                <ul>
                    <li>
                        To provide the Service you signed up for: performance of
                        a contract (article 6(1)(b) GDPR).
                    </li>
                    <li>
                        To keep invoices and tax records: legal obligation
                        (article 6(1)(c) GDPR).
                    </li>
                    <li>
                        To protect the Service against abuse: legitimate
                        interest (article 6(1)(f) GDPR).
                    </li>
                </ul>
                <p>
                    We do not sell your data, show ads or use tracking or
                    analytics cookies.
                </p>
            </section>

            <section className="space-y-3">
                <h2>5. Where your data is stored and who processes it</h2>
                <p>
                    Your data is stored on servers in the European Union. We use
                    these processors:
                </p>
                <ul>
                    <li>
                        Stripe (Stripe Payments Europe, Ltd., Ireland) for
                        payments, invoices and tax calculation.
                    </li>
                    <li>Our hosting provider, in the European Union.</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2>6. How long we keep it</h2>
                <p>
                    We keep your account and tasks until you delete your account
                    (Settings › Profile), which removes them from our database.
                    Invoices and payment records are kept for as long as tax law
                    requires.
                </p>
            </section>

            <section className="space-y-3">
                <h2>7. Cookies</h2>
                <p>
                    We only use cookies needed for the Service to work: the
                    session, protection against cross-site request forgery and
                    your appearance preference.
                </p>
            </section>

            <section className="space-y-3">
                <h2>8. Your rights</h2>
                <p>
                    You can ask to access, correct, delete or export your data,
                    and object to or restrict its processing, by writing to{' '}
                    <Email seller={seller} />. You can also complain to the
                    Spanish Data Protection Agency (AEPD, www.aepd.es) or the
                    authority of your country.
                </p>
            </section>

            <section className="space-y-3">
                <h2>9. Prefer to keep it all yourself?</h2>
                <p>
                    Plain Week is open source: you can run it on your own server
                    and no data reaches us at all.
                </p>
            </section>
        </LegalPage>
    );
}
