<?php

namespace App\Billing;

use Illuminate\Support\Facades\Cache;
use Laravel\Cashier\Cashier;
use RuntimeException;
use Stripe\Exception\InvalidRequestException;
use Stripe\Price;

/**
 * Stripe prices and the launch coupon, looked up by their configured keys and
 * cached for an hour so the paywall does not call Stripe on every visit.
 */
class StripeCatalog
{
    private const TTL_SECONDS = 3600;

    public function priceId(Plan $plan): string
    {
        return $this->price($plan)['id'];
    }

    /**
     * @return array{id: string, amount: int, currency: string}
     */
    public function price(Plan $plan): array
    {
        $key = $plan->lookupKey();

        /** @var array{id: string, amount: int, currency: string}|null $price */
        $price = Cache::remember("saas.price.{$key}", self::TTL_SECONDS, function () use ($key) {
            /** @var Price|null $price */
            $price = Cashier::stripe()->prices->all(['lookup_keys' => [$key], 'active' => true, 'limit' => 1])->first();

            return $price === null ? null : [
                'id' => $price->id,
                'amount' => (int) $price->unit_amount,
                'currency' => $price->currency,
            ];
        });

        if ($price === null) {
            throw new RuntimeException("No active Stripe price has the lookup key [{$key}].");
        }

        return $price;
    }

    /**
     * Percent off of the launch coupon, or null when there is none.
     */
    public function launchDiscountPercent(): ?float
    {
        $coupon = config('saas.launch_coupon');

        if (! is_string($coupon)) {
            return null;
        }

        // Only percent-off coupons are supported; a missing or expired one means no discount.
        $percent = Cache::remember("saas.coupon.{$coupon}", self::TTL_SECONDS, function () use ($coupon) {
            try {
                $stripeCoupon = Cashier::stripe()->coupons->retrieve($coupon);
            } catch (InvalidRequestException $e) {
                report($e);

                return 0.0;
            }

            return $stripeCoupon->valid ? (float) $stripeCoupon->percent_off : 0.0;
        });

        return $percent > 0 ? (float) $percent : null;
    }
}
