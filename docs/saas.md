# SaaS mode

Plain Week is also offered as a paid hosted service at plainweek.eu. Everything in this document is active only when
`SAAS_ENABLED=true`. The default is `false` (repository, `.env.example`, Docker image): a self-hosted instance has free
accounts that sync, no billing UI, and every route below answers `404`.

## Product rules

- No free accounts and no trials: an account exists to sync, and syncing needs a paid plan. Guests still use the
  planner locally in the browser, exactly as on a self-hosted instance.
- Two plans, both VAT-inclusive Stripe prices referenced by lookup key:
    - **Weekly**: a Cashier subscription (type `default`) on `STRIPE_PRICE_WEEKLY` (`plainweek_weekly`).
    - **Lifetime**: a one-time Checkout payment on `STRIPE_PRICE_LIFETIME` (`plainweek_lifetime`), with the coupon in
      `SAAS_LAUNCH_COUPON` applied when it is set and valid (`LAUNCH75`: 75% off).
- Flow: register (Fortify) → paywall (`/plans`) → Stripe Checkout → back to the planner.

## Entitlement

`User::hasAccess()` is the single check: always `true` with SaaS mode off; otherwise the account has lifetime access
(`users.lifetime_purchased_at` set) or a `default` subscription that Cashier considers valid (active, or cancelled but
still in its paid period). `User::plan()` returns `Plan::Lifetime`, `Plan::Weekly` or `null`; lifetime wins.

It is used by:

| Where                                 | Effect without access                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `EnsureHasAccess` on `/` and `sync/*` | Pages redirect to `/plans`; JSON requests (sync) get `402 Payment Required`   |
| Inertia shared props                  | `saas.enabled`, `account: { hasAccess, plan } \| null` (null for guests)      |
| `SyncProvider` and the sync engine    | The engine does not start; a `402` stops it, keeps local data, shows `/plans` |

Settings (profile, security, data) stay reachable without a plan, so an account can always export its tasks or be
deleted; the paywall links to the export. A weekly subscription whose payment failed (`past_due`, `incomplete`) gives
no access but blocks a second weekly checkout: Settings › Billing shows it with the portal to fix the card.

## Routes

All behind `EnsureSaasEnabled` (`404` when SaaS mode is off), in `routes/billing.php` and `bootstrap/app.php`:

| Route                                | Name               | Notes                                                                                                                   |
| ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /plans`                         | `billing.plans`    | `auth`. The paywall (Inertia `billing/plans`); `?processing=1` polls until a pending payment is confirmed. JSON: prices |
| `GET\|POST /billing/checkout/{plan}` | `billing.checkout` | `auth`, `weekly` or `lifetime`. Inertia: external redirect to Checkout; plain JSON: `{ url }` (`409` if already owned)  |
| `GET /billing/success`               | `billing.success`  | `auth`. Checkout's success URL: fulfills the session right away (idempotent), then `/` or `/plans?processing=1`         |
| `GET /billing/portal`                | `billing.portal`   | `auth`. Redirects to the Stripe customer portal (cancel, payment method, invoices)                                      |
| `GET /settings/billing`              | `billing.edit`     | `auth`. Settings › Billing: plan, renewal date, portal, "Upgrade to lifetime"                                           |
| `GET /terms`, `GET /privacy`         | `legal.*`          | Public. Terms of Service and Privacy Policy (seller from `SAAS_SELLER_NAME` / `SAAS_CONTACT_EMAIL`)                     |
| `POST /stripe/webhook`               | `cashier.webhook`  | Outside the web group, Stripe signature checked with `STRIPE_WEBHOOK_SECRET`                                            |

`GET` on the checkout route lets a guest pick a plan before having an account: `auth` stores it as the intended URL,
and Fortify sends the user back to it after logging in or registering.

## Checkout

`App\Billing\StartCheckout` builds the session: the Stripe customer (Cashier, prefilled with the account email),
`automatic_tax` (Stripe Tax, `Cashier::calculateTaxes()`), billing address and tax ID collection,
`consent_collection[terms_of_service]=required` with a custom text where the customer asks for immediate access and
waives the EU 14-day withdrawal right, and success/cancel URLs back to the app. Lifetime adds the launch coupon and an
invoice. Prices and the coupon are looked up by `App\Billing\StripeCatalog` and cached for an hour.

The terms-of-service consent needs a Terms of Service URL in the Stripe Dashboard (Settings › Public details).
Checkout passes `managed_payments[enabled]=false`: the owner is the seller and Stripe only the processor (Managed
Payments, on by default on new accounts, would make Stripe the merchant of record and rejects `custom_text`). The
billing address entered in Checkout is saved on the customer (`customer_update[address]=auto`) for Stripe Tax.

## Fulfillment and webhooks

`App\Billing\FulfillCheckout` applies a completed session, both from the success redirect (so the user never waits for
the webhook) and from the webhook (so it also happens when the user never comes back). Webhooks, handled by
`App\Http\Controllers\Billing\WebhookController` (Cashier's controller plus):

| Event                                                                    | Effect                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `checkout.session.completed`, `checkout.session.async_payment_succeeded` | A paid lifetime session grants lifetime (stores the payment intent)      |
| `charge.refunded`                                                        | A full refund of the lifetime payment intent revokes lifetime            |
| `customer.subscription.*`, `customer.*`, `invoice.*`                     | Cashier: stores and updates the weekly subscription; deleted ends access |

Buying lifetime while subscribed weekly cancels the subscription at the end of its paid period (retried with the
webhook if Stripe fails). Not handled automatically: refunds of weekly payments (cancel in the portal or Dashboard),
lost disputes and a second lifetime payment (refund it in the Dashboard; the last payment is the one a refund revokes).

The webhook refuses every event (`503`) while `STRIPE_WEBHOOK_SECRET` is empty, since Cashier would otherwise skip
the signature check.

## Manual grants

```sh
php artisan plainweek:grant-lifetime owner@example.com          # grant without a payment
php artisan plainweek:grant-lifetime owner@example.com --revoke # remove it
```

## Configuration

| Variable                | Default                   | Description                                                         |
| ----------------------- | ------------------------- | ------------------------------------------------------------------- |
| `SAAS_ENABLED`          | `false`                   | Turns SaaS mode on                                                  |
| `SAAS_LAUNCH_COUPON`    | (empty)                   | Stripe coupon id applied to lifetime purchases; empty = no discount |
| `SAAS_SELLER_NAME`      | `the Plain Week operator` | Seller shown in the terms and privacy pages                         |
| `SAAS_CONTACT_EMAIL`    | `MAIL_FROM_ADDRESS`       | Contact shown in the terms and privacy pages                        |
| `STRIPE_KEY`            |                           | Publishable key                                                     |
| `STRIPE_SECRET`         |                           | Secret key                                                          |
| `STRIPE_WEBHOOK_SECRET` |                           | Signing secret of the `/stripe/webhook` endpoint                    |
| `STRIPE_PRICE_WEEKLY`   | `plainweek_weekly`        | Lookup key of the weekly price                                      |
| `STRIPE_PRICE_LIFETIME` | `plainweek_lifetime`      | Lookup key of the lifetime price                                    |

The webhook endpoint must send the events in the table above.

## Local development

Put test keys in `.env` (never commit them), set `SAAS_ENABLED=true`, and forward webhooks with the Stripe CLI:

```sh
stripe listen --api-key "$STRIPE_SECRET" --forward-to http://localhost:8000/stripe/webhook
```

Use the signing secret it prints as `STRIPE_WEBHOOK_SECRET`. Test card: `4242 4242 4242 4242`. Tests never call Stripe:
`Tests\Support\FakeStripe` replaces its HTTP client (`enableSaas()` in `tests/Pest.php`).
