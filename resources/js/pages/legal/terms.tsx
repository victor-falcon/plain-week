import { Email, LegalPage } from '@/components/billing/legal-page';
import type { LegalPageProps } from '@/components/billing/legal-page';

export default function Terms({ seller, appUrl }: LegalPageProps) {
    return (
        <LegalPage title="Terms of Service" updatedAt="October 16, 2026">
            <section className="space-y-3">
                <h2>1. Who we are</h2>
                <p>
                    Plain Week at {appUrl} (the “Service”) is provided by{' '}
                    {seller.name}, based in Spain (“we”). You can reach us at{' '}
                    <Email seller={seller} />.
                </p>
            </section>

            <section className="space-y-3">
                <h2>2. The Service</h2>
                <p>
                    Plain Week is an open-source (MIT) weekly planner. Anyone
                    can use it in the browser without an account, with tasks
                    stored on that device only, or run their own copy for free.
                    A paid account adds syncing your tasks across your devices
                    through our servers.
                </p>
            </section>

            <section className="space-y-3">
                <h2>3. Your account</h2>
                <p>
                    Keep your login details safe and the information in your
                    account accurate. You are responsible for what happens in
                    your account. You must be old enough to enter into a
                    contract in your country.
                </p>
            </section>

            <section className="space-y-3">
                <h2>4. Plans, prices and payment</h2>
                <ul>
                    <li>
                        <strong>Weekly</strong>: a subscription charged every
                        week until you cancel it.
                    </li>
                    <li>
                        <strong>Lifetime</strong>: a one-time payment that
                        includes syncing for as long as we operate the Service.
                    </li>
                </ul>
                <p>
                    Prices are shown before you pay and include VAT. Payments
                    are processed by Stripe; we never see or store your full
                    card details.
                </p>
            </section>

            <section className="space-y-3">
                <h2>5. Cancelling</h2>
                <p>
                    You can cancel the weekly subscription at any time in
                    Settings › Billing. Syncing keeps working until the end of
                    the week you already paid for, and you are not charged
                    again. Partial weeks are not refunded.
                </p>
            </section>

            <section className="space-y-3">
                <h2>6. Right of withdrawal</h2>
                <p>
                    Consumers in the European Union normally have 14 days to
                    withdraw from an online purchase. Access to the Service
                    starts right after payment. At checkout you ask us to start
                    immediately and acknowledge that you lose your right of
                    withdrawal once access starts (article 16(m) of Directive
                    2011/83/EU and article 103(m) of the Spanish General Law for
                    the Defence of Consumers and Users). This does not affect
                    your other legal rights, for example if the Service does not
                    work as described.
                </p>
            </section>

            <section className="space-y-3">
                <h2>7. Lifetime plan and the end of the Service</h2>
                <p>
                    If we ever stop operating the Service, we will tell you at
                    least 90 days in advance so you can export your tasks. Since
                    Plain Week is open source, you can keep using it on your own
                    server.
                </p>
            </section>

            <section className="space-y-3">
                <h2>8. Your content</h2>
                <p>
                    Your tasks belong to you. We only process them to provide
                    the Service, as described in the Privacy Policy. You can
                    export them at any time from Settings › Data and delete your
                    account from Settings › Profile.
                </p>
            </section>

            <section className="space-y-3">
                <h2>9. Acceptable use</h2>
                <p>
                    Do not misuse the Service: no attempts to break, overload or
                    gain unauthorized access to it, and no unlawful content. We
                    may suspend accounts that do so.
                </p>
            </section>

            <section className="space-y-3">
                <h2>10. Liability</h2>
                <p>
                    We work to keep the Service available and your data safe,
                    but we cannot guarantee it will be uninterrupted or
                    error-free. To the extent the law allows, our liability is
                    limited to the amount you paid us in the 12 months before
                    the claim. Nothing in these terms limits rights you have as
                    a consumer that cannot be excluded by contract.
                </p>
            </section>

            <section className="space-y-3">
                <h2>11. Changes to these terms</h2>
                <p>
                    We may update these terms. We will tell you about material
                    changes by email or in the app before they apply. If you do
                    not agree, you can cancel before they take effect.
                </p>
            </section>

            <section className="space-y-3">
                <h2>12. Law and disputes</h2>
                <p>
                    These terms are governed by Spanish law. If you are a
                    consumer, you also keep the protection of the mandatory laws
                    of the country where you live and may bring a claim there.
                    Please contact us first at <Email seller={seller} /> so we
                    can try to solve it.
                </p>
            </section>
        </LegalPage>
    );
}
