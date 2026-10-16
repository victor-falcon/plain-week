<?php

namespace App\Billing;

enum Plan: string
{
    case Weekly = 'weekly';
    case Lifetime = 'lifetime';

    /**
     * The Stripe lookup key of this plan's price.
     */
    public function lookupKey(): string
    {
        return (string) config("saas.prices.{$this->value}");
    }
}
