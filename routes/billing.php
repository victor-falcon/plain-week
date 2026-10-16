<?php

use App\Http\Controllers\Billing\BillingController;
use App\Http\Controllers\LegalController;
use App\Http\Middleware\EnsureSaasEnabled;
use Illuminate\Support\Facades\Route;

// SaaS mode only (SAAS_ENABLED): every route here is a 404 on a self-hosted instance.
Route::middleware(EnsureSaasEnabled::class)->group(function () {
    Route::get('terms', [LegalController::class, 'terms'])->name('legal.terms');
    Route::get('privacy', [LegalController::class, 'privacy'])->name('legal.privacy');

    Route::middleware('auth')->group(function () {
        Route::get('plans', [BillingController::class, 'plans'])->name('billing.plans');
        Route::match(['get', 'post'], 'billing/checkout/{plan}', [BillingController::class, 'checkout'])
            ->middleware('throttle:10,1')
            ->name('billing.checkout');
        Route::post('billing/promotion-code/{plan}', [BillingController::class, 'promotionCode'])
            ->middleware('throttle:20,1')
            ->name('billing.promotion-code');
        Route::get('billing/success', [BillingController::class, 'success'])->name('billing.success');
        Route::get('billing/portal', [BillingController::class, 'portal'])->name('billing.portal');
        Route::get('settings/billing', [BillingController::class, 'edit'])->name('billing.edit');
    });
});
