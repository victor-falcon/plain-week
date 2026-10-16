<?php

namespace App\Http\Controllers\Billing;

use App\Billing\FulfillCheckout;
use App\Billing\Plan;
use App\Billing\StartCheckout;
use App\Billing\StripeCatalog;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Cashier\Cashier;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

class BillingController extends Controller
{
    /**
     * The paywall: an account without a paid plan chooses one here. A plain
     * JSON request (e.g. from a modal) gets the prices only.
     */
    public function plans(Request $request, StripeCatalog $catalog): Response|RedirectResponse|JsonResponse
    {
        if ($this->wantsPlainJson($request)) {
            return response()->json(['plans' => $this->offers($catalog)]);
        }

        if ($this->user($request)->hasAccess()) {
            return to_route('home');
        }

        return Inertia::render('billing/plans', [
            'plans' => $this->offers($catalog),
            // Back from Checkout before Stripe confirmed the payment: the page polls until access starts.
            'processing' => $request->boolean('processing'),
        ]);
    }

    /**
     * Sends the user to Stripe Checkout for a plan. Also reachable with GET, so
     * a guest who picks a plan comes back here after logging in or signing up.
     * A plain JSON request gets `{ url }` (or a 409) instead of a redirect.
     */
    public function checkout(Request $request, Plan $plan, StartCheckout $startCheckout): HttpResponse
    {
        $user = $this->user($request);

        if ($user->hasLifetime() || ($plan === Plan::Weekly && $user->hasAccess())) {
            if ($this->wantsPlainJson($request)) {
                return response()->json(['message' => __('You already have this plan.')], 409);
            }

            Inertia::flash('toast', ['type' => 'info', 'message' => __('You already have this plan.')]);

            return to_route('billing.edit');
        }

        $url = (string) $startCheckout($user, $plan)->asStripeCheckoutSession()->url;

        return $this->wantsPlainJson($request) ? response()->json(['url' => $url]) : Inertia::location($url);
    }

    /**
     * Stripe Checkout redirects here after a payment. The purchase is applied
     * right away instead of waiting for the webhook.
     */
    public function success(Request $request, FulfillCheckout $fulfill): RedirectResponse
    {
        $user = $this->user($request);
        $sessionId = $request->query('session_id');

        if (is_string($sessionId) && $fulfill->forUser($user, $sessionId)) {
            Inertia::flash('toast', ['type' => 'success', 'message' => __('Thanks! Your tasks now sync across your devices.')]);

            return to_route('home');
        }

        return to_route('billing.plans', ['processing' => 1]);
    }

    /**
     * Settings › Billing: the current plan and what can be done with it.
     */
    public function edit(Request $request, StripeCatalog $catalog): Response
    {
        $user = $this->user($request);
        $subscription = $user->subscription('default');
        $plan = $user->plan();

        return Inertia::render('settings/billing', [
            'plan' => $plan?->value,
            'lifetimeSince' => $user->lifetime_purchased_at?->toIso8601String(),
            'subscription' => $plan === Plan::Weekly && $subscription !== null ? [
                'cancelled' => $subscription->onGracePeriod(),
                'endsAt' => $subscription->ends_at?->toIso8601String(),
                'renewsAt' => $subscription->onGracePeriod() ? null : $subscription->currentPeriodEnd()?->toIso8601String(),
            ] : null,
            'hasStripeCustomer' => $user->hasStripeId(),
            'lifetimeOffer' => $plan === Plan::Lifetime ? null : $this->offers($catalog)['lifetime'],
        ]);
    }

    /**
     * Opens the Stripe customer portal (cancel, payment method, invoices).
     */
    public function portal(Request $request): HttpResponse
    {
        $user = $this->user($request);

        abort_unless($user->hasStripeId(), 404);

        return Inertia::location($user->billingPortalUrl(route('billing.edit')));
    }

    /**
     * A fetch from a script, not an Inertia visit.
     */
    private function wantsPlainJson(Request $request): bool
    {
        return $request->expectsJson() && ! $request->inertia();
    }

    private function user(Request $request): User
    {
        /** @var User */
        return $request->user();
    }

    /**
     * Prices shown to the user, formatted from the Stripe prices (Checkout
     * shows the final amount, possibly in the visitor's local currency).
     *
     * @return array{weekly: array<string, mixed>, lifetime: array<string, mixed>}
     */
    private function offers(StripeCatalog $catalog): array
    {
        $weekly = $catalog->price(Plan::Weekly);
        $lifetime = $catalog->price(Plan::Lifetime);
        $discount = $catalog->launchDiscountPercent();
        $lifetimeAmount = $discount === null ? $lifetime['amount'] : (int) round($lifetime['amount'] * (100 - $discount) / 100);

        return [
            'weekly' => [
                'price' => $this->format($weekly['amount'], $weekly['currency']),
            ],
            'lifetime' => [
                'price' => $this->format($lifetimeAmount, $lifetime['currency']),
                'regularPrice' => $discount === null ? null : $this->format($lifetime['amount'], $lifetime['currency']),
                'discountPercent' => $discount,
            ],
        ];
    }

    private function format(int $amount, string $currency): string
    {
        $formatted = Cashier::formatAmount($amount, $currency);

        // Whole amounts read better without cents: "€16", not "€16.00".
        return $amount % 100 === 0 ? (string) preg_replace('/[.,]00(?!\d)/', '', $formatted) : $formatted;
    }
}
