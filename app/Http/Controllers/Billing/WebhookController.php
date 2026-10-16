<?php

namespace App\Http\Controllers\Billing;

use App\Billing\FulfillCheckout;
use App\Billing\LifetimeAccess;
use App\Models\User;
use Laravel\Cashier\Http\Controllers\WebhookController as CashierWebhookController;
use Stripe\Checkout\Session;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cashier's webhook handler (subscriptions, customers) plus the lifetime
 * plan: granted when its Checkout session is paid, revoked on a full refund.
 */
class WebhookController extends CashierWebhookController
{
    /**
     * Stores a subscription the way `customer.subscription.created` does (a
     * no-op if it is already stored).
     *
     * @param  array<string, mixed>  $subscription
     */
    public function storeSubscription(array $subscription): void
    {
        $this->handleCustomerSubscriptionCreated(['data' => ['object' => $subscription]]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    protected function handleCheckoutSessionCompleted(array $payload): Response
    {
        $session = Session::constructFrom($payload['data']['object']);

        if ($session->mode === Session::MODE_PAYMENT && is_string($session->customer)) {
            $user = User::where('stripe_id', $session->customer)->first();

            if ($user !== null) {
                app(FulfillCheckout::class)->fulfill($user, $session);
            }
        }

        return $this->successMethod();
    }

    /**
     * A delayed payment method (e.g. a bank debit) settled after Checkout.
     *
     * @param  array<string, mixed>  $payload
     */
    protected function handleCheckoutSessionAsyncPaymentSucceeded(array $payload): Response
    {
        return $this->handleCheckoutSessionCompleted($payload);
    }

    /**
     * A full refund of the lifetime payment revokes lifetime access.
     *
     * @param  array<string, mixed>  $payload
     */
    protected function handleChargeRefunded(array $payload): Response
    {
        $charge = $payload['data']['object'];
        $paymentIntent = $charge['payment_intent'] ?? null;

        if (($charge['refunded'] ?? false) && is_string($paymentIntent)) {
            $user = User::where('lifetime_payment_id', $paymentIntent)->first();

            if ($user !== null) {
                app(LifetimeAccess::class)->revoke($user);
            }
        }

        return $this->successMethod();
    }
}
