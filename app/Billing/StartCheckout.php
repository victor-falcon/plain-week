<?php

namespace App\Billing;

use App\Models\User;
use Laravel\Cashier\Checkout;

/**
 * Creates the Stripe Checkout session for a plan. Taxes are calculated by
 * Stripe Tax (prices are VAT-inclusive) and the customer must accept the terms,
 * which include waiving the EU 14-day withdrawal right for immediate access.
 */
class StartCheckout
{
    public function __construct(private readonly StripeCatalog $catalog) {}

    /**
     * @param  string|null  $promotionCodeId  A code checked by `PromotionCodes`; it replaces the launch coupon.
     */
    public function __invoke(User $user, Plan $plan, ?string $promotionCodeId = null): Checkout
    {
        $options = [
            'client_reference_id' => (string) $user->id,
            'success_url' => route('billing.success').'?session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => route('billing.plans'),
            'metadata' => ['plan' => $plan->value],
            // The owner is the seller and Stripe only the processor (see the terms), not the merchant of record.
            'managed_payments' => ['enabled' => false],
            // Stripe Tax needs the billing address entered in Checkout saved on the customer.
            'customer_update' => ['address' => 'auto'],
            'consent_collection' => ['terms_of_service' => 'required'],
            'custom_text' => [
                'terms_of_service_acceptance' => [
                    'message' => sprintf(
                        'I agree to the [Terms of Service](%s) and the [Privacy Policy](%s). I ask for immediate access '
                        .'to Plain Week and acknowledge that I lose my 14-day right of withdrawal once access starts.',
                        route('legal.terms'),
                        route('legal.privacy'),
                    ),
                ],
            ],
        ];

        $priceId = $this->catalog->priceId($plan);

        if ($plan === Plan::Weekly) {
            return $user->newSubscription('default', $priceId)
                ->collectTaxIds()
                ->withPromotionCode($promotionCodeId)
                ->checkout($options);
        }

        // One discount per session: a promotion code wins over the launch coupon.
        if ($promotionCodeId !== null) {
            $options['discounts'] = [['promotion_code' => $promotionCodeId]];
        } elseif ($this->catalog->launchDiscountPercent() !== null) {
            $options['discounts'] = [['coupon' => config('saas.launch_coupon')]];
        }

        return $user->checkout([$priceId => 1], [
            ...$options,
            'invoice_creation' => ['enabled' => true],
            'payment_intent_data' => ['metadata' => ['plan' => $plan->value, 'user_id' => (string) $user->id]],
            'tax_id_collection' => ['enabled' => true],
        ]);
    }
}
