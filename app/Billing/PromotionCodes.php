<?php

namespace App\Billing;

use App\Models\User;
use Illuminate\Validation\ValidationException;
use Laravel\Cashier\Cashier;
use Stripe\Coupon;
use Stripe\Exception\ApiErrorException;
use Stripe\PromotionCode;

/**
 * Customer-facing promotion codes (created in the Stripe Dashboard), checked
 * against a plan before Checkout. A valid code replaces the launch coupon:
 * Stripe applies one discount per session, never both.
 */
class PromotionCodes
{
    public function __construct(private readonly StripeCatalog $catalog) {}

    /**
     * Looks the code up and checks it can be used for the plan (and the
     * customer) right now.
     *
     * @return array{id: string, code: string, amount: int, currency: string} The code (as created) and the plan's price with it applied.
     *
     * @throws ValidationException When the code does not exist, does not apply, or Stripe could not be asked.
     */
    public function resolve(string $code, Plan $plan, User $user): array
    {
        $price = $this->catalog->price($plan);
        $promotionCode = $this->find(trim($code));
        $coupon = $promotionCode?->promotion?->coupon;

        if (! $promotionCode instanceof PromotionCode || ! $coupon instanceof Coupon
            || ! $this->usable($promotionCode, $coupon, $price, $user)) {
            throw self::invalid();
        }

        return [
            'id' => $promotionCode->id,
            'code' => $promotionCode->code,
            'amount' => $this->discounted($coupon, $price),
            'currency' => $price['currency'],
        ];
    }

    /**
     * The error shown next to the code field.
     */
    public static function invalid(): ValidationException
    {
        return ValidationException::withMessages(['code' => __("This code isn't valid for this plan.")]);
    }

    private function find(string $code): ?PromotionCode
    {
        if ($code === '') {
            return null;
        }

        try {
            /** @var PromotionCode|null */
            return Cashier::stripe()->promotionCodes->all([
                'code' => $code,
                'active' => true,
                'limit' => 1,
                'expand' => ['data.promotion.coupon.applies_to'],
            ])->first();
        } catch (ApiErrorException $e) {
            report($e);

            // Not the code's fault: a good code must not be called invalid while Stripe is unreachable.
            throw ValidationException::withMessages(['code' => __('Could not check the code. Please try again.')]);
        }
    }

    /**
     * @param  array{id: string, amount: int, currency: string, product: string}  $price
     */
    private function usable(PromotionCode $promotionCode, Coupon $coupon, array $price, User $user): bool
    {
        $restrictions = $promotionCode->restrictions;
        $products = $coupon->applies_to->products ?? null;
        $customer = is_string($promotionCode->customer) ? $promotionCode->customer : $promotionCode->customer?->id;

        return $promotionCode->active
            // A code made for one customer only.
            && ($customer === null || $customer === $user->stripe_id)
            && $coupon->valid
            && ($promotionCode->expires_at === null || $promotionCode->expires_at > now()->getTimestamp())
            && ($promotionCode->max_redemptions === null || $promotionCode->times_redeemed < $promotionCode->max_redemptions)
            && ($products === null || in_array($price['product'], $products, true))
            // An amount off in another currency would not apply to this price.
            && ($coupon->amount_off === null || $coupon->currency === $price['currency'])
            && ($restrictions->minimum_amount === null
                || ($restrictions->minimum_amount_currency === $price['currency'] && $price['amount'] >= $restrictions->minimum_amount));
    }

    /**
     * @param  array{id: string, amount: int, currency: string, product: string}  $price
     */
    private function discounted(Coupon $coupon, array $price): int
    {
        if ($coupon->percent_off !== null) {
            return (int) round($price['amount'] * (100 - $coupon->percent_off) / 100);
        }

        return max(0, $price['amount'] - (int) $coupon->amount_off);
    }
}
