<?php

namespace App\Billing;

use App\Models\User;

class LifetimeAccess
{
    /**
     * Grants lifetime access (idempotent). A weekly subscription still running
     * is cancelled at the end of its paid period: nothing is charged again.
     */
    public function grant(User $user, ?string $paymentId = null): void
    {
        if ($user->hasLifetime() && $user->lifetime_payment_id === $paymentId) {
            return;
        }

        $user->forceFill([
            'lifetime_purchased_at' => $user->lifetime_purchased_at ?? now(),
            'lifetime_payment_id' => $paymentId ?? $user->lifetime_payment_id,
        ])->save();

        $subscription = $user->subscription('default');

        if ($subscription?->active() && ! $subscription->onGracePeriod()) {
            $subscription->cancel();
        }
    }

    public function revoke(User $user): void
    {
        $user->forceFill([
            'lifetime_purchased_at' => null,
            'lifetime_payment_id' => null,
        ])->save();
    }
}
