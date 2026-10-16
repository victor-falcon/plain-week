<?php

namespace App\Billing;

use App\Http\Controllers\Billing\WebhookController;
use App\Models\User;
use Laravel\Cashier\Cashier;
use Stripe\Checkout\Session;
use Stripe\Exception\ApiErrorException;

/**
 * Applies a completed Checkout session: a paid lifetime purchase grants
 * lifetime access, a weekly one stores the subscription. Idempotent, so it
 * runs both from the success redirect (the user must not wait for the
 * webhook) and from the webhook (the user may never come back).
 */
class FulfillCheckout
{
    public function __construct(
        private readonly LifetimeAccess $lifetime,
        private readonly WebhookController $webhooks,
    ) {}

    /**
     * Retrieves the session from Stripe and fulfills it if it belongs to the
     * user. Returns whether the user has access afterwards.
     */
    public function forUser(User $user, string $sessionId): bool
    {
        try {
            $session = Cashier::stripe()->checkout->sessions->retrieve($sessionId, ['expand' => ['subscription']]);
        } catch (ApiErrorException $e) {
            report($e);

            return $user->hasAccess();
        }

        if ($user->stripe_id === null || $session->customer !== $user->stripe_id) {
            return $user->hasAccess();
        }

        try {
            $this->fulfill($user, $session);
        } catch (ApiErrorException $e) {
            // E.g. cancelling the weekly plan after a lifetime purchase; the webhook retries it.
            report($e);
        }

        return $user->refresh()->hasAccess();
    }

    public function fulfill(User $user, Session $session): void
    {
        if ($session->status !== Session::STATUS_COMPLETE) {
            return;
        }

        if ($session->mode === Session::MODE_PAYMENT) {
            // A 100% promotion code makes a no-cost order: nothing to pay, and no payment intent to refund later.
            if (Plan::tryFrom($session->metadata['plan'] ?? '') === Plan::Lifetime
                && in_array($session->payment_status, [Session::PAYMENT_STATUS_PAID, Session::PAYMENT_STATUS_NO_PAYMENT_REQUIRED], true)) {
                $this->lifetime->grant($user, is_string($session->payment_intent) ? $session->payment_intent : $session->payment_intent?->id);
            }

            return;
        }

        if ($session->mode === Session::MODE_SUBSCRIPTION && $session->subscription !== null) {
            $subscription = is_string($session->subscription)
                ? Cashier::stripe()->subscriptions->retrieve($session->subscription)
                : $session->subscription;

            $this->webhooks->storeSubscription($subscription->toArray());
        }
    }
}
